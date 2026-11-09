import { computed, signal } from '@preact/signals';
import { CATALOGO, type Entidade, type Ref } from '#mesa';
import { alternarPainel, LAYOUT_PADRAO, lerLayout, type Layout, type PainelId } from '../dominio/layout.ts';
import { ESCOLHAS_VAZIAS, fichaAtiva, fichasDaSessao, lerEscolhas, mapaEscolhido, mapasDaCampanha, personagensComFicha, type EscolhasDaSessao } from '../dominio/sessao.ts';
import { extrairPacoteDeCena, planejarAtivacaoDeCena } from '../dominio/cenas.ts';
import { ehEncontro } from '../dominio/entidades.ts';
import { campanhaAtiva, entidades, ligacoes } from './campanha.ts';
import { barramentoDaMesa } from './barramento.ts';
import { anotar } from './registro.ts';
import { avisar } from './toasts.ts';

const CHAVE_LAYOUT = 'mesa:sessao-layout';
const chaveDasEscolhas = (campanhaId: string) => `mesa:sessao:${campanhaId}`;

function lerJson(chave: string): unknown { try { const t = localStorage.getItem(chave); return t ? JSON.parse(t) : null; } catch { return null; } }
function gravarJson(chave: string, valor: unknown): void { try { localStorage.setItem(chave, JSON.stringify(valor)); } catch { /* sem armazenamento: vale só nesta aba */ } }

/** O layout dos painéis (vale para todas as campanhas: é do jeito de a pessoa jogar, não da campanha). */
export const layout = signal<Layout>(lerLayout(lerJson(CHAVE_LAYOUT)));
/** Muda o layout. `gravar: false` durante um arrasto (grava ao soltar). */
export function mudarLayout(novo: Layout, gravar = true): void { layout.value = novo; if (gravar) gravarJson(CHAVE_LAYOUT, novo); }
export const restaurarLayoutPadrao = (): void => mudarLayout(LAYOUT_PADRAO);

/** O que a sessão lembra de cada campanha: o mapa, as fichas em abas e a aba ativa. */
export const escolhas = signal<EscolhasDaSessao>(ESCOLHAS_VAZIAS);
let campanhaDasEscolhas: string | null = null;
export function carregarEscolhas(campanhaId: string | null): void {
  campanhaDasEscolhas = campanhaId;
  escolhas.value = campanhaId ? lerEscolhas(lerJson(chaveDasEscolhas(campanhaId))) : ESCOLHAS_VAZIAS;
}
export function mudarEscolhas(parcial: Partial<EscolhasDaSessao>): void {
  escolhas.value = { ...escolhas.value, ...parcial };
  if (campanhaDasEscolhas) gravarJson(chaveDasEscolhas(campanhaDasEscolhas), escolhas.value);
}

export const mapas = computed(() => mapasDaCampanha(entidades.value));
export const personagens = computed(() => personagensComFicha(entidades.value));
export const mapaAtual = computed(() => mapaEscolhido(mapas.value, escolhas.value.mapaId));
export const fichasEmAbas = computed(() => fichasDaSessao(personagens.value, escolhas.value.fichas));
export const fichaDaAba = computed(() => fichaAtiva(fichasEmAbas.value, escolhas.value.ativa));

/** Põe ou tira uma ficha das abas (a primeira escolha parte de “todas”). */
export function alternarFicha(fichaId: string): void {
  const atuais = escolhas.value.fichas ?? personagens.value.map(p => p.fichaId);
  const novas = atuais.includes(fichaId) ? atuais.filter(x => x !== fichaId) : [...atuais, fichaId];
  mudarEscolhas({ fichas: novas });
}

/** Antes de abrir uma coisa pelo roteiro: garante que o painel dela está à vista (e, para ficha e mapa, que a aba ou o mapa certo está escolhido). */
export function garantirPainelPara(ref: Ref): void {
  const painel: PainelId | undefined = ref.app === 'atlas' ? 'atlas' : ref.app === 'ficha' ? 'fichas' : ref.app === 'jukebox' ? 'jukebox' : undefined;
  if (painel && !layout.value.find(p => p.id === painel)?.visivel) mudarLayout(alternarPainel(layout.value, painel));
  if (ref.app === 'ficha') {
    const f = personagens.value.find(p => p.fichaId === ref.id);
    if (f) { if (!fichasEmAbas.value.some(x => x.fichaId === f.fichaId)) alternarFicha(f.fichaId); mudarEscolhas({ ativa: f.fichaId }); }
  }
  if (ref.app === 'atlas' && ref.tipo === 'mapa' && mapas.value.some(m => m.mapaId === ref.id)) mudarEscolhas({ mapaId: ref.id });
}

/**
 * Ativa uma Cena ou lança um Encontro de Combate:
 * - Seleciona o mapa da cena no Modo Sessão
 * - Garante que as personagens participantes estejam nas abas
 * - Comanda o Atlas (preparar-cena / focar) e o Jukebox (tocar) via barramento
 * - Registra anotação no Diário da Sessão
 * - Exibe toast amigável
 */
export async function ativarCena(cena: Entidade): Promise<boolean> {
  const todasEntidades = entidades.value;
  const todasLigacoes = ligacoes.value;
  const pacote = extrairPacoteDeCena(cena, todasEntidades, todasLigacoes);

  const catalogoSuportaPrepararCena = 'atlas.preparar-cena' in CATALOGO;
  const plano = planejarAtivacaoDeCena(pacote, catalogoSuportaPrepararCena);

  // 1. Atualiza Modo Sessão com o mapa da cena
  if (plano.mapaId) {
    mudarEscolhas({ mapaId: plano.mapaId });
  }

  // Se houver participantes com ficha, garante-os nas abas da sessão
  if (plano.fichasIds.length > 0) {
    const atuais = escolhas.value.fichas ?? personagens.value.map(p => p.fichaId);
    const combinadas = Array.from(new Set([...atuais, ...plano.fichasIds]));
    mudarEscolhas({
      fichas: combinadas,
      ativa: plano.fichasIds[0] ?? escolhas.value.ativa,
    });
  }

  // 2. Comanda aplicativos abertos via barramento
  const b = barramentoDaMesa();
  if (b) {
    b.campanhaId = campanhaAtiva.value?.id ?? null;
    for (const p of plano.pedidos) {
      try {
        await b.pedir(p.pedido, p.dados);
      } catch (err) {
        console.warn(`Mesa: pedido ${p.pedido} não atendido`, err);
      }
    }
  }

  // 3. Registra evento no Diário da Sessão
  const combate = ehEncontro(cena);
  const textoAnotacao = combate
    ? `⚔ Encontro de combate iniciado: ${cena.nome}`
    : `🎬 Cena ativada: ${cena.nome}`;
  anotar(textoAnotacao);
  if (pacote.momento) {
    anotar(`⚡ Momento de abertura: ${pacote.momento}`);
  }

  // 4. Feedback visual
  avisar(combate ? `Encontro “${cena.nome}” lançado!` : `Cena “${cena.nome}” ativada!`);

  return true;
}

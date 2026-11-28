import { effect, signal } from '@preact/signals';
import type { Entidade } from '#mesa';
import { presetDe, visiveis } from '../dominio/layout.ts';
import { docDeTexto, novaMoldura, novaNotaAdesiva, novaRef, novoTexto, novoQuadro, type Item } from '../dominio/quadro.ts';
import { refDaEntidade } from '../dominio/notas.ts';
import { refParaLigacao } from '../dominio/cenas.ts';
import { LICOES } from '../tutorial/licoes.ts';
import type { EstadoDoTutor } from '../tutorial/condicoes.ts';
import type { Semente } from '../tutorial/semente.ts';
import { criarTutor } from '../tutorial/tutor.ts';
import { alterarEntidade, campanhaAtiva, campanhas, criarCampanha, criarEntidade, entidades, escolherCampanha, ligacoes, ligarRefs, removerCampanha } from './campanha.ts';
import { criarQuadroComItens } from './banco-quadros.ts';
import { modoFocoSessao } from './foco-do-quadro.ts';
import { carregarModelos, todosOsModelos } from './modelos.ts';
import { projetando } from './projecao.ts';
import { ferramentaDoQuadro, modoDoQuadro } from './quadro-ui.ts';
import { abrirQuadro, carregarQuadros, fecharQuadro, itens, quadroAberto, selecao } from './quadros.ts';
import { carregarSessoes, fecharSessao, gravando, linhas, sessaoAtiva } from './registro.ts';
import { navegarParaQuadro, tela } from './rotas.ts';
import { cenaAtivadaNestaVisita, layout } from './sessao.ts';
import { buscaRapidaAberta, menuContexto } from './sobreposicoes.ts';
import { avisar } from './toasts.ts';

/** Quando a lição em curso começou: os modelos criados depois disso contam. */
let inicioDaLicao = Date.now();

/** O estado que as condições leem, montado dos signals reais da Mesa. */
export function estadoDoTutor(): EstadoDoTutor {
  const l = layout.value;
  return {
    tela: tela.value,
    itens: [...itens.value.values()],
    quadroAbertoId: quadroAberto.value?.id ?? null,
    ferramenta: ferramentaDoQuadro.value,
    modoQuadro: modoDoQuadro.value,
    selecao: [...selecao.value],
    entidades: entidades.value,
    ligacoes: ligacoes.value,
    sessaoGravando: gravando.value,
    temSessao: sessaoAtiva.value !== null,
    linhasDoRegistro: linhas.value.length,
    preset: presetDe(l),
    paineisVisiveis: visiveis(l).map(p => p.id),
    modoFoco: modoFocoSessao.value,
    cenaAtivada: cenaAtivadaNestaVisita.value,
    projetando: projetando.value !== null,
    buscaRapidaAberta: buscaRapidaAberta.value,
    menuContextoAberto: menuContexto.value !== null,
    modelosDesde: todosOsModelos.value.filter(m => m.criadoEm >= inicioDaLicao).length,
  };
}

export const tutor = criarTutor({ licoes: LICOES, estado: estadoDoTutor });

// A lição zera o Foco do quadro para o passo dele ter sentido; a preferência da pessoa volta quando a lição acaba.
let focoAntes: typeof modoFocoSessao.value | null = null;
effect(() => {
  void tutor.versao.value;
  if (!tutor.info() && focoAntes !== null) { modoFocoSessao.value = focoAntes; focoAntes = null; }
});

const CHAVE_DO_TREINO = 'mesa-tutoriais-treino-v1';
interface Treino { id: string; nome: string; anterior: string | null }
const lerTreino = (): Treino | null => { try { const v = localStorage.getItem(CHAVE_DO_TREINO); return v ? JSON.parse(v) as Treino : null; } catch { return null; } };
const gravarTreino = (t: Treino | null): void => { try { if (t) localStorage.setItem(CHAVE_DO_TREINO, JSON.stringify(t)); else localStorage.removeItem(CHAVE_DO_TREINO); } catch { /* sem armazenamento: vale só nesta aba */ } };

/** A campanha de treino em curso (sobrevive a recarregar: o cartão de Aprender ainda oferece apagar). */
export const campanhaDeTreino = signal<Treino | null>(lerTreino());

/** Planta a semente na campanha ativa: entidades da Mesa, depois o quadro com os itens (molduras primeiro, para os outros caberem nelas). */
async function plantar(semente: Semente): Promise<string | null> {
  const c = campanhaAtiva.value; if (!c) return null;
  const porNome = new Map<string, string>(), criadas = new Map<string, Entidade>();
  for (const e of semente.entidades ?? []) {
    const criada = await criarEntidade(e.tipo, e.nome, false); if (!criada) continue;
    porNome.set(e.nome, criada.id); criadas.set(e.nome, criada);
    if (e.notas) await alterarEntidade(criada, { notas: e.notas });
  }
  for (const l of semente.ligacoes ?? []) {
    const de = criadas.get(l.de), para = criadas.get(l.para);
    if (de && para) await ligarRefs(refParaLigacao(de), refParaLigacao(para), l.tipo);
  }
  if (!semente.quadro) return null;
  const agora = Date.now(), q = novoQuadro(c.id, semente.quadro.nome, agora, `q-${crypto.randomUUID()}`), lista: Item[] = [], molduras = new Map<string, Item>();
  const dados = semente.quadro.itens ?? [];
  for (const d of dados.filter(i => i.tipo === 'moldura')) {
    const m = novaMoldura({ quadroId: q.id, x: d.x, y: d.y, ...(d.largura ? { largura: d.largura } : {}), ...(d.altura ? { altura: d.altura } : {}), titulo: d.titulo ?? 'Moldura' }, agora, crypto.randomUUID());
    lista.push(m); molduras.set(m.titulo, m);
  }
  for (const d of dados.filter(i => i.tipo !== 'moldura')) {
    const pai = d.molduraDe ? molduras.get(d.molduraDe) : undefined, x = d.x + (pai?.x ?? 0), y = d.y + (pai?.y ?? 0), base = { quadroId: q.id, x, y, ...(d.largura ? { largura: d.largura } : {}), ...(d.altura ? { altura: d.altura } : {}) }, id = crypto.randomUUID();
    let item: Item | null = null;
    if (d.tipo === 'nota') item = novaNotaAdesiva({ ...base, doc: docDeTexto(d.texto ?? '') }, agora, id);
    else if (d.tipo === 'texto') item = novoTexto({ ...base, doc: docDeTexto(d.texto ?? '') }, agora, id);
    else { const eid = d.entidade ? porNome.get(d.entidade) : undefined; if (eid) item = novaRef({ ...base, ref: refDaEntidade(eid) }, agora, id); }
    if (!item) continue;
    lista.push({ ...item, molduraId: pai?.id ?? null, ...(d.revisao ? { revisao: { ...d.revisao, motivos: [...d.revisao.motivos] } } : {}) } as Item);
  }
  await criarQuadroComItens(q, lista);
  await carregarQuadros();
  return q.id;
}

/** Cria `Treino · <título>`, a torna ativa, planta a semente, vai à tela da lição e a começa. A campanha do mestre não é tocada. */
export async function iniciarLicao(id: string, de = 0): Promise<boolean> {
  const licao = LICOES.find(l => l.id === id); if (!licao) return false;
  tutor.parar(); tutor.fecharFim();
  // Um treino de antes (outra lição, ou de antes de recarregar) sai antes do novo, e a campanha a restaurar continua sendo a do mestre.
  if (campanhaDeTreino.peek()) await apagarTreino();
  const anterior = campanhaAtiva.peek()?.id ?? null;
  await fecharQuadro();
  const c = await criarCampanha(`Treino · ${licao.titulo}`, { selecionar: true }); if (!c) return false;
  // Estado global que não é da campanha: uma sessão aberta da campanha de antes não vale aqui, e a cena ativada ou o foco de antes não podem deixar um passo "já feito".
  await carregarSessoes(); cenaAtivadaNestaVisita.value = false;
  if (focoAntes === null) focoAntes = modoFocoSessao.peek();
  modoFocoSessao.value = 'espiar';
  const treino: Treino = { id: c.id, nome: c.nome, anterior };
  gravarTreino(treino); campanhaDeTreino.value = treino;
  const semente = licao.semente;
  let quadroId: string | null = null;
  if (semente) quadroId = await plantar(semente);
  await carregarModelos();
  if (quadroId && semente?.abrirQuadro) await abrirQuadro(quadroId);
  const destino = semente?.tela ?? 'entidades';
  if (destino === 'quadros') navegarParaQuadro(quadroId); else tela.value = destino as typeof tela.value;
  inicioDaLicao = Date.now();
  return tutor.iniciar(id, de);
}

/** Apaga a campanha de treino (com quadros, sessões e modelos dela) e reativa a campanha de antes. */
export async function apagarTreino(): Promise<void> {
  const t = campanhaDeTreino.peek(); if (!t) return;
  if (tutor.info()) tutor.parar();
  tutor.fecharFim();
  campanhaDeTreino.value = null; gravarTreino(null);
  await fecharQuadro();
  if (sessaoAtiva.peek()?.campanhaId === t.id) fecharSessao();
  // Se a de antes sumiu nesse meio-tempo, fica sem campanha ativa.
  await escolherCampanha(campanhas.peek().some(c => c.id === t.anterior) ? t.anterior : null);
  const c = campanhas.peek().find(x => x.id === t.id);
  // `removerCampanha` leva as entidades, ligações e sessões (mesa-core) e os quadros, itens, ajustes e modelos de escopo da campanha (banco-quadros).
  if (c) await removerCampanha(c);
  await Promise.all([carregarSessoes(), carregarQuadros(), carregarModelos()]);
  tela.value = 'aprender';
  try { history.replaceState(null, '', '#/aprender'); } catch { /* ignora */ }
}

/** Só reativa a campanha de antes; o treino fica guardado (o cartão de Aprender ainda oferece apagá-lo). */
export async function voltarACampanha(): Promise<void> {
  const t = campanhaDeTreino.peek(); if (!t) return;
  tutor.fecharFim();
  if (tutor.info()) tutor.parar();
  await fecharQuadro();
  await escolherCampanha(campanhas.peek().some(c => c.id === t.anterior) ? t.anterior : null);
  avisar('Você voltou à sua campanha. O treino continua guardado: apague-o em Aprender.');
}

/** Baixa o relatório dos tutoriais (onde as pessoas travam, pulam e pedem ajuda), guardado só neste navegador. */
export function exportarRelatorioDosTutoriais(): void {
  const blob = new Blob([JSON.stringify(tutor.relatorio(), null, 2)], { type: 'application/json' }), a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'mesa-tutoriais-relatorio.json' });
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

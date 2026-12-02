import { Fragment } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { signal } from '@preact/signals';
import { mesmaRef } from '#mesa';
import { abrirProjetor, ativarCena, carregarEscolhas, cenaAtivadaNestaVisita, controleJogadores, definirControleJogadores, projetorAberto, escolhas, fichaDaAba, fichasEmAbas, layout, mapaAtual, mapas, mudarEscolhas, mudarLayout, personagens, alternarFicha, restaurarLayoutPadrao } from '../app/sessao.ts';
import { baseDoApp, inventario, sondarAplicativos } from '../app/inventario.ts';
import { campanhaAtiva, entidades, ligacoes } from '../app/campanha.ts';
import { enderecoDe } from '../app/aplicativos.ts';
import { ehEncontro } from '../dominio/entidades.ts';
import { alternarEmpilhamentoPainel, alternarPainelLayout, aplicarPresetLayout, escalaDoPainel, LARGURA_LOGICA_MINIMA, moverColuna, moverPainel, PAINEIS, painelVisivel, presetDe, PRESETS, redimensionarColunas, redimensionarPilhaVertical, ROTULO_DO_PAINEL, ROTULO_DO_PRESET, totalPaineisVisiveis, type Layout, type ModoMoverPainel, type PainelId, type PresetId } from '../dominio/layout.ts';
import { enderecoDaFicha, enderecoDoAtlas, filtrarPersonagensSessao, passosDoGuia } from '../dominio/sessao.ts';
import { cx } from './cx.ts';
import { Diario } from './Diario.tsx';
import { carregarSessoes, encerrarSessao, gravando, iniciarSessao, retomarGravacao, sessaoAtiva } from '../app/registro.ts';
import { extrairPacoteDeCena, type PacoteDeCena } from '../dominio/cenas.ts';
import { carregarFatos } from '../app/prontidao.ts';
import { pendenciasDaSessao } from '../dominio/prontidao.ts';
import { DialogoChecagemSessao } from './DialogoChecagemSessao.tsx';
import { PainelDesafios } from './PainelDesafios.tsx';
import { desafioAtivo, iniciarCanalDesafiosMestre, pedidoLockpickObjeto } from '../app/desafios.ts';
import { abrirQuadro, carregarQuadros, criarQuadro, quadroAberto, quadros } from '../app/quadros.ts';
import { modoFocoSessao, type ModoFocoSessao } from '../app/foco-do-quadro.ts';
import { Quadro } from './quadro/Quadro.tsx';
import { registrarAcessoLru, removerDaLru } from '../dominio/lru.ts';
import { modoLeve } from '../app/desempenho.ts';

export const buscaPersonagemSessao = signal('');
const checandoProntidaoSessao = signal(false);
const pendenciasAtivasCount = signal<number | null>(null);
const painelEmTelaCheia = signal<PainelId | null>(null);

const LARGURA_DO_DIVISOR = 8;

/** O app não está ao lado da Mesa: o painel avisa em vez de mostrar um quadro de erro. */
function foraDoAr(app: 'atlas' | 'ficha' | 'jukebox'): boolean { return inventario.value.find(i => i.app === app)?.estado === 'fora-do-ar'; }
const SemApp = ({ nome }: { nome: string }) => <div class="painel-vazio" data-testid="painel-fora-do-ar"><p>{nome} não está ao lado da Mesa.</p><p class="meta">Abra a Mesa pelo atalho do app de desktop, ou rode “npm run mesa-dev” na pasta do Atlas.</p></div>;

/**
 * Desenha o aplicativo numa largura lógica mínima e reduz a escala para caber no painel (ver `LARGURA_LOGICA_MINIMA`). O navegador cuida dos
 * cliques e do foco dentro do `iframe` mesmo com a transformação. Com espaço de sobra, a escala é 1 e nada muda.
 */
function Escalado({ painel, children }: { painel: PainelId; children: preact.ComponentChildren }) {
  const caixa = useRef<HTMLDivElement>(null), [largura, setLargura] = useState(0);
  useEffect(() => {
    const el = caixa.current; if (!el || typeof ResizeObserver === 'undefined') return;
    const observador = new ResizeObserver(() => setLargura(el.clientWidth)); observador.observe(el); setLargura(el.clientWidth);
    return () => observador.disconnect();
  }, []);
  const escala = escalaDoPainel(largura, LARGURA_LOGICA_MINIMA[painel]);
  return (
    <div class="escala-caixa" ref={caixa}>
      <div class="escala" data-testid={`escala-${painel}`} data-escala={escala.toFixed(3)} style={escala === 1 ? undefined : { width: `${100 / escala}%`, height: `${100 / escala}%`, transform: `scale(${escala})` }}>{children}</div>
    </div>
  );
}

function PainelDoAtlas() {
  const m = mapaAtual.value;
  if (foraDoAr('atlas')) return <SemApp nome="O Atlas" />;
  return <Escalado painel="atlas"><iframe class="quadro" data-testid="iframe-atlas" title="Atlas" src={enderecoDoAtlas(baseDoApp('atlas'), m?.mapaId ?? null)} allow="fullscreen; autoplay; clipboard-write" /></Escalado>;
}

function PainelDasFichas() {
  const abas = fichasEmAbas.value, ativa = fichaDaAba.value;
  const limiteIframes = modoLeve.value ? 1 : 2;
  const [vivasLru, setVivasLru] = useState<string[]>(() => (ativa ? [ativa.fichaId] : []));

  useEffect(() => {
    if (!ativa) return;
    setVivasLru((atual) => registrarAcessoLru(atual, ativa.fichaId, limiteIframes).ordem);
  }, [ativa?.fichaId, limiteIframes]);

  useEffect(() => {
    const idsAbas = new Set(abas.map((a) => a.fichaId));
    setVivasLru((atual) => {
      const filtrada = atual.filter((id) => idsAbas.has(id));
      return filtrada.length === atual.length ? atual : filtrada;
    });
  }, [abas]);

  const fecharFicha = (fichaId: string) => {
    setVivasLru((atual) => removerDaLru(atual, fichaId));
    alternarFicha(fichaId);
  };

  if (foraDoAr('ficha')) return <SemApp nome="O Dossiê" />;
  if (!personagens.value.length) return <div class="painel-vazio" data-testid="fichas-vazio"><p>Nenhuma personagem com ficha nesta campanha.</p><p class="meta">Abra o Dossiê com esta campanha ativa: ela publica as personagens aqui.</p></div>;

  const termo = buscaPersonagemSessao.value;
  const abasFiltradas = filtrarPersonagensSessao(abas, termo, ativa?.fichaId);
  const personagensFiltrados = filtrarPersonagensSessao(personagens.value, termo);

  return (
    <>
      <div class="abas-fichas" role="tablist" aria-label="Fichas">
        <input
          type="search"
          class="sessao-busca-personagens"
          data-testid="sessao-busca-personagens"
          placeholder="Buscar personagem…"
          value={termo}
          onInput={ev => { buscaPersonagemSessao.value = (ev.currentTarget as HTMLInputElement).value; }}
        />
        {abasFiltradas.map(f => (
          <span key={f.fichaId} class={cx('ficha-aba-grupo', ativa?.fichaId === f.fichaId && 'ativa')}>
            <button
              type="button"
              role="tab"
              aria-selected={ativa?.fichaId === f.fichaId}
              class={cx('chip', ativa?.fichaId === f.fichaId && 'ativa')}
              data-testid={`ficha-aba-${f.fichaId}`}
              onClick={() => mudarEscolhas({ ativa: f.fichaId })}
            >
              {f.nome}
            </button>
            <button
              type="button"
              class="ficha-aba-fechar"
              title={`Fechar ficha de ${f.nome}`}
              aria-label={`Fechar ficha de ${f.nome}`}
              data-testid={`ficha-aba-fechar-${f.fichaId}`}
              onClick={() => fecharFicha(f.fichaId)}
            >
              ×
            </button>
          </span>
        ))}
        <details class="escolher-fichas">
          <summary class="chip" data-testid="escolher-fichas">Personagens…</summary>
          <ul class="menu-fichas">
            {personagensFiltrados.length === 0 ? (
              <li class="menu-fichas-vazio">Nenhum personagem com “{termo}”.</li>
            ) : (
              personagensFiltrados.map(p => (
                <li key={p.fichaId}>
                  <label>
                    <input
                      type="checkbox"
                      checked={abas.some(a => a.fichaId === p.fichaId)}
                      data-testid={`ficha-escolher-${p.fichaId}`}
                      onChange={() => alternarFicha(p.fichaId)}
                    />{' '}
                    {p.nome}
                  </label>
                </li>
              ))
            )}
          </ul>
        </details>
      </div>
      <div class="painel-corpo-abas">
        {abas.length === 0 && <div class="painel-vazio"><p>Nenhuma ficha em abas. Escolha em “Personagens…”.</p></div>}
        {abas.filter(f => vivasLru.includes(f.fichaId)).map(f => {
          const rota = enderecoDe(f.ref), src = rota ?? enderecoDaFicha(baseDoApp('ficha'), f.fichaId);
          return <iframe key={f.fichaId} class="quadro" data-testid={`iframe-ficha-${f.fichaId}`} title={`Ficha de ${f.nome}`} src={src} hidden={ativa?.fichaId !== f.fichaId} allow="fullscreen; autoplay; clipboard-write" />;
        })}
      </div>
    </>
  );
}

function PainelDoJukebox() {
  if (foraDoAr('jukebox')) return <SemApp nome="O Jukebox" />;
  return <Escalado painel="jukebox"><iframe class="quadro" data-testid="iframe-jukebox" title="Jukebox" src={baseDoApp('jukebox')} allow="fullscreen; autoplay" /></Escalado>;
}

const MODOS_FOCO: { id: ModoFocoSessao; rotulo: string; dica: string }[] = [
  { id: 'desligado', rotulo: 'Quadro parado', dica: 'O quadro ignora o que acontece no mapa.' },
  { id: 'espiar', rotulo: 'Mostrar o que está no mapa', dica: 'Quando algo é inspecionado ou revelado no mapa, mostra as notas ligadas a isso num painel, sem trocar de quadro.' },
  { id: 'seguir', rotulo: 'Acompanhar o mapa', dica: 'Abre o quadro e foca a nota ligada ao que acontece no mapa, inclusive ao abrir um mapa, e aplica as ações da moldura.' },
];

function PainelDoQuadro() {
  const c = campanhaAtiva.value;
  useEffect(() => {
    void (async () => {
      await carregarQuadros();
      if (!quadroAberto.value && quadros.value.length > 0) {
        await abrirQuadro(quadros.value[0]!.id);
      }
    })();
  }, [c?.id]);

  useEffect(() => {
    if (!quadroAberto.value && quadros.value.length > 0) {
      void abrirQuadro(quadros.value[0]!.id);
    }
  }, [quadros.value.length, quadroAberto.value?.id]);

  return (
    <>
      <div class="painel-abas" data-testid="sessao-quadro-barra">
        <select
          data-testid="sessao-quadro-select"
          value={quadroAberto.value?.id ?? ''}
          disabled={quadros.value.length === 0}
          onChange={(ev) => {
            const id = ev.currentTarget.value;
            if (id) void abrirQuadro(id);
          }}
        >
          {quadros.value.length === 0 ? (
            <option value="">Nenhum quadro</option>
          ) : (
            quadros.value.map((q) => (
              <option key={q.id} value={q.id}>
                {q.nome}
              </option>
            ))
          )}
        </select>
        <span class="espaco" />
        <label class="foco-modo">
          <span>Foco:</span>
          <select
            data-testid="sessao-modo-foco"
            aria-label="Modo de foco do quadro"
            value={modoFocoSessao.value}
            onChange={(ev) => {
              modoFocoSessao.value = ev.currentTarget.value as ModoFocoSessao;
            }}
          >
            {MODOS_FOCO.map((m) => (
              <option key={m.id} value={m.id} title={m.dica}>
                {m.rotulo}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div class="painel-corpo-abas" style={{ position: 'relative', display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        {quadroAberto.value ? (
          <Quadro />
        ) : (
          <div class="painel-vazio">
            <p>Nenhum quadro na campanha.</p>
            <button
              type="button"
              class="primario"
              data-testid="sessao-criar-quadro"
              onClick={() => {
                void criarQuadro('Quadro da sessão');
              }}
            >
              + Novo quadro
            </button>
          </div>
        )}
      </div>
    </>
  );
}

const CORPO: Record<PainelId, () => preact.JSX.Element> = { atlas: PainelDoAtlas, fichas: PainelDasFichas, jukebox: PainelDoJukebox, diario: Diario, quadro: PainelDoQuadro };

/** Zona "Sessão" da barra: inicia a sessão (e mostra o Diário) ou mostra o estado dela com Parar/Gravar. */
const CHAVE_GUIA_VISTO = 'mesa:guia-sessao-visto';
function guiaJaVisto(): boolean { try { return localStorage.getItem(CHAVE_GUIA_VISTO) === '1'; } catch { return false; } }
const guiaVisivel = signal(!guiaJaVisto());

/** Faixa fina com os três passos para começar; some quando todos estão feitos ou com “Entendi”. */
function GuiaDaSessao() {
  const passos = passosDoGuia({ temSessao: !!sessaoAtiva.value, cenaAtivada: cenaAtivadaNestaVisita.value, projetorAberto: projetorAberto.value });
  if (!guiaVisivel.value || passos.every(p => p.feito)) return null;
  return (
    <div class="sessao-guia" data-testid="guia-sessao">
      <ol class="sessao-guia-passos">
        {passos.map((p, i) => (
          <li key={p.id} class={cx('sessao-guia-passo', p.feito && 'feito')} data-testid={`guia-passo-${p.id}`}>
            <strong>{p.feito ? '✓' : `${i + 1}.`} {p.titulo}</strong> <span class="meta">{p.dica}</span>
          </li>
        ))}
      </ol>
      <button type="button" class="botao-pilula" data-testid="guia-sessao-entendi" onClick={() => { guiaVisivel.value = false; try { localStorage.setItem(CHAVE_GUIA_VISTO, '1'); } catch { /* sem armazenamento */ } }}>Entendi</button>
    </div>
  );
}

function ControleDaSessao() {
  const [nome, setNome] = useState('');
  const sessao = sessaoAtiva.value;
  if (!sessao) {
    const iniciar = (ev: Event) => {
      ev.preventDefault();
      void iniciarSessao(nome).then(nova => {
        setNome('');
        if (nova && !painelVisivel(layout.value, 'diario')) mudarLayout(alternarPainelLayout(layout.value, 'diario'));
      });
    };
    return (
      <form class="sessao-iniciar" onSubmit={iniciar}>
        <input type="text" placeholder="Nome da sessão" aria-label="Nome da sessão" maxLength={200} value={nome} data-testid="sessao-nome" onInput={ev => setNome(ev.currentTarget.value)} />
        <button type="submit" class="botao-pilula destaque" data-testid="sessao-iniciar">▶ Iniciar sessão</button>
      </form>
    );
  }
  return (
    <div class="sessao-ativa">
      <strong class="sessao-nome-ativa" data-testid="sessao-nome-ativa">{sessao.nome}</strong>
      <span class={cx('selo', gravando.value ? 'selo-achado' : 'selo-sem-manifesto')} data-testid="sessao-estado"><i class="ponto" />{gravando.value ? 'Gravando' : 'Parada'}</span>
      {gravando.value
        ? <button type="button" class="botao-pilula" data-testid="sessao-encerrar" onClick={encerrarSessao}>Parar</button>
        : <button type="button" class="botao-pilula destaque" data-testid="sessao-retomar" onClick={retomarGravacao}>Gravar</button>}
    </div>
  );
}

/** Menu "Painéis ▾": quais painéis aparecem, os arranjos prontos e o layout padrão. Fecha ao clicar fora. */
function MenuDePaineis({ l, preset }: { l: Layout; preset: PresetId | null }) {
  const caixa = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const fora = (ev: PointerEvent) => { const d = caixa.current; if (d?.open && !d.contains(ev.target as Node)) d.open = false; };
    document.addEventListener('pointerdown', fora);
    return () => document.removeEventListener('pointerdown', fora);
  }, []);
  const fechar = () => { if (caixa.current) caixa.current.open = false; };
  return (
    <details class="menu-paineis-caixa" ref={caixa} data-testid="menu-paineis">
      <summary class="botao-pilula" data-testid="abrir-menu-paineis">Painéis ▾</summary>
      <div class="menu-fichas menu-paineis">
        {PAINEIS.map(id => (
          <label key={id} data-testid={`painel-${id}`}>
            <input type="checkbox" checked={painelVisivel(l, id)} onChange={() => mudarLayout(alternarPainelLayout(layout.value, id))} />
            {ROTULO_DO_PAINEL[id]}
          </label>
        ))}
        <hr class="menu-separador" />
        <h4 class="faixa pequena">Arranjos</h4>
        <ul class="menu-arranjos">
          {(Object.keys(PRESETS) as PresetId[]).map(id => (
            <li key={id}><button type="button" class={cx('menu-item', preset === id && 'ativa')} aria-pressed={preset === id} data-testid={`preset-${id}`} onClick={() => { mudarLayout(PRESETS[id]); fechar(); }}>{ROTULO_DO_PRESET[id]}</button></li>
          ))}
        </ul>
        <hr class="menu-separador" />
        <button type="button" class="botao-pilula" data-testid="layout-padrao" onClick={() => { restaurarLayoutPadrao(); fechar(); }}>Restaurar padrão</button>
      </div>
    </details>
  );
}

const ROTULO_ZONA_SOLTAR: Readonly<Record<ModoMoverPainel, string>> = {
  antes: 'Soltar à esquerda',
  depois: 'Soltar à direita',
  empilhar: 'Empilhar aqui',
  'empilhar-acima': 'Empilhar acima',
  'empilhar-abaixo': 'Empilhar abaixo',
  trocar: 'Trocar de lugar',
};

const PRESETS_RAPIDOS: readonly { id: PresetId; rotulo: string }[] = [
  { id: 'padrao', rotulo: 'Lado a lado' },
  { id: 'mapa-lateral', rotulo: 'Mapa + Pilha' },
  { id: 'so-mapa', rotulo: 'Foco no Mapa' },
];

export function ModoSessao() {
  const c = campanhaAtiva.value, area = useRef<HTMLDivElement>(null);
  const [arrastando, setArrastando] = useState<'col' | 'row' | null>(null);
  const [arrastandoPainel, setArrastandoPainel] = useState<PainelId | null>(null);
  const [alvoSoltar, setAlvoSoltar] = useState<{ destino: PainelId; modo: ModoMoverPainel } | null>(null);
  const [desafiosAberto, setDesafiosAberto] = useState(false);
  useEffect(() => { carregarEscolhas(c?.id ?? null); void sondarAplicativos(); void carregarSessoes(); }, [c?.id]);
  useEffect(() => { iniciarCanalDesafiosMestre(); }, []);
  useEffect(() => {
    if (pedidoLockpickObjeto.value) setDesafiosAberto(true);
  }, [pedidoLockpickObjeto.value]);

  if (!c) return <section class="pagina"><div class="vazio"><h2>Escolha uma campanha</h2><p>O modo sessão junta o mapa, as fichas e a música da campanha ativa.</p></div></section>;
  const l = layout.value, colunas = l.colunas, preset = presetDe(l), totalPaineis = totalPaineisVisiveis(l);
  const cenasDisponiveis = entidades.value.filter(e => e.tipo === 'cena');

  const arrastar = (indice: number) => (ev: PointerEvent) => {
    const alvo = ev.currentTarget as HTMLElement, caixa = area.current; if (!caixa) return;
    ev.preventDefault(); alvo.setPointerCapture(ev.pointerId); setArrastando('col');
    const inicio = ev.clientX, original: Layout = layout.value, larguraUtil = caixa.clientWidth - (colunas.length - 1) * LARGURA_DO_DIVISOR;
    const mover = (m: PointerEvent) => mudarLayout(redimensionarColunas(original, indice, m.clientX - inicio, larguraUtil), false);
    const soltar = () => { alvo.removeEventListener('pointermove', mover); alvo.removeEventListener('pointerup', soltar); alvo.removeEventListener('pointercancel', soltar); setArrastando(null); mudarLayout(layout.value); };
    alvo.addEventListener('pointermove', mover); alvo.addEventListener('pointerup', soltar); alvo.addEventListener('pointercancel', soltar);
  };
  const teclar = (indice: number) => (ev: KeyboardEvent) => {
    if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return;
    ev.preventDefault(); const caixa = area.current; if (!caixa) return;
    mudarLayout(redimensionarColunas(layout.value, indice, (ev.key === 'ArrowRight' ? 1 : -1) * 32, caixa.clientWidth - (colunas.length - 1) * LARGURA_DO_DIVISOR));
  };

  const arrastarVertical = (colIdx: number, idxSuperior: number) => (ev: PointerEvent) => {
    const alvo = ev.currentTarget as HTMLElement, colEl = alvo.parentElement; if (!colEl) return;
    const qtdPaineis = colunas[colIdx]?.paineis.length ?? 1;
    ev.preventDefault(); alvo.setPointerCapture(ev.pointerId); setArrastando('row');
    const inicio = ev.clientY, original: Layout = layout.value, alturaUtil = colEl.clientHeight - (qtdPaineis - 1) * LARGURA_DO_DIVISOR;
    const mover = (m: PointerEvent) => mudarLayout(redimensionarPilhaVertical(original, colIdx, idxSuperior, m.clientY - inicio, alturaUtil), false);
    const soltar = () => { alvo.removeEventListener('pointermove', mover); alvo.removeEventListener('pointerup', soltar); alvo.removeEventListener('pointercancel', soltar); setArrastando(null); mudarLayout(layout.value); };
    alvo.addEventListener('pointermove', mover); alvo.addEventListener('pointerup', soltar); alvo.addEventListener('pointercancel', soltar);
  };
  const teclarVertical = (colIdx: number, idxSuperior: number) => (ev: KeyboardEvent) => {
    if (ev.key !== 'ArrowUp' && ev.key !== 'ArrowDown') return;
    const colEl = (ev.currentTarget as HTMLElement).parentElement; if (!colEl) return;
    const qtdPaineis = colunas[colIdx]?.paineis.length ?? 1;
    ev.preventDefault();
    mudarLayout(redimensionarPilhaVertical(layout.value, colIdx, idxSuperior, (ev.key === 'ArrowDown' ? 1 : -1) * 32, colEl.clientHeight - (qtdPaineis - 1) * LARGURA_DO_DIVISOR));
  };

  const detectarAlvoSoltar = (x: number, y: number, origem: PainelId): { destino: PainelId; modo: ModoMoverPainel } | null => {
    const paineisEls = area.current?.querySelectorAll<HTMLElement>('.painel[data-painel]') ?? [];
    for (const el of paineisEls) {
      const id = el.getAttribute('data-painel') as PainelId | null;
      if (!id || id === origem) continue;
      const r = el.getBoundingClientRect();
      if (x < r.left || x > r.right || y < r.top || y > r.bottom) continue;
      const relX = (x - r.left) / Math.max(1, r.width);
      const relY = (y - r.top) / Math.max(1, r.height);
      const modo: ModoMoverPainel =
        relX < 0.22 ? 'antes' :
        relX > 0.78 ? 'depois' :
        relY < 0.28 ? 'empilhar-acima' :
        relY > 0.72 ? 'empilhar-abaixo' :
        'trocar';
      return { destino: id, modo };
    }
    return null;
  };

  const iniciarArrastePainel = (id: PainelId) => (ev: PointerEvent) => {
    if (ev.button !== 0) return;
    if ((ev.target as HTMLElement | null)?.closest('button')) return;
    const inicioX = ev.clientX, inicioY = ev.clientY;
    let ativo = false;
    let ultimoAlvo: { destino: PainelId; modo: ModoMoverPainel } | null = null;

    const mover = (m: PointerEvent) => {
      if (!ativo && Math.hypot(m.clientX - inicioX, m.clientY - inicioY) > 6) {
        ativo = true;
        setArrastandoPainel(id);
      }
      if (!ativo) return;
      ultimoAlvo = detectarAlvoSoltar(m.clientX, m.clientY, id);
      setAlvoSoltar(ultimoAlvo);
    };

    const finalizar = () => {
      window.removeEventListener('pointermove', mover);
      window.removeEventListener('pointerup', finalizar);
      window.removeEventListener('pointercancel', finalizar);
      if (ativo && ultimoAlvo) {
        mudarLayout(moverPainel(layout.value, id, ultimoAlvo.destino, ultimoAlvo.modo));
      }
      setArrastandoPainel(null);
      setAlvoSoltar(null);
    };

    window.addEventListener('pointermove', mover);
    window.addEventListener('pointerup', finalizar);
    window.addEventListener('pointercancel', finalizar);
  };
  const ultimaAssinaturaFatosRef = useRef<string | null>(null);
  useEffect(() => {
    const c = campanhaAtiva.value;
    const s = sessaoAtiva.value;
    if (!c || !s) {
      ultimaAssinaturaFatosRef.current = null;
      pendenciasAtivasCount.value = null;
      return;
    }
    const ents = entidades.value;
    const ligs = ligacoes.value;
    const assinatura = [
      c.id,
      s.id,
      s.roteiro.map(r => `${r.app}:${r.tipo}:${r.id}`).join(','),
      ents.map(e => `${e.id}:${e.atualizadaEm ?? ''}`).join(','),
      ligs.map(l => l.id).join(','),
    ].join('|');
    if (ultimaAssinaturaFatosRef.current === assinatura) return;

    let cancelado = false;
    const atraso = ultimaAssinaturaFatosRef.current === null ? 0 : 500;
    const timer = window.setTimeout(() => {
      void (async () => {
        const pacotes: PacoteDeCena[] = [];
        for (const item of s.roteiro) {
          const ent = ents.find(e => (item.app === 'mesa' && item.tipo === 'entidade' ? e.id === item.id : e.refs.some(r => mesmaRef(r, item))));
          if (ent && ent.tipo === 'cena') {
            pacotes.push(extrairPacoteDeCena(ent, ents, ligs));
          }
        }
        const fatos = await carregarFatos(c, pacotes);
        if (!cancelado) {
          ultimaAssinaturaFatosRef.current = assinatura;
          const pends = pendenciasDaSessao(pacotes, fatos);
          pendenciasAtivasCount.value = pends.length;
        }
      })();
    }, atraso);
    return () => {
      cancelado = true;
      window.clearTimeout(timer);
    };
  }, [sessaoAtiva.value?.id, sessaoAtiva.value?.roteiro, entidades.value, ligacoes.value]);

  useEffect(() => {
    const atualizarTelaCheia = () => {
      const atual = document.fullscreenElement?.getAttribute('data-painel') as PainelId | null;
      painelEmTelaCheia.value = atual ?? null;
    };
    document.addEventListener('fullscreenchange', atualizarTelaCheia);
    atualizarTelaCheia();
    return () => document.removeEventListener('fullscreenchange', atualizarTelaCheia);
  }, []);

  const alternarTelaCheia = async (id: PainelId) => {
    const el = area.current?.querySelector<HTMLElement>(`[data-painel="${id}"]`);
    const fs = document.fullscreenElement;
    if (fs) {
      const pertenceAoPainel = el ? (fs === el || el.contains(fs)) : false;
      await document.exitFullscreen?.().catch(() => undefined);
      if (pertenceAoPainel) return;
    }
    await el?.requestFullscreen?.().catch(() => undefined);
  };

  return (
    <section class="sessao" data-testid="tela-sessao">
      <div class="sessao-barra">
        <div class="sessao-zona" data-testid="sessao-zona-esquerda">
          <ControleDaSessao />
          <label class="linha-campanha">Cena
            <select
              data-testid="sessao-cena"
              value=""
              disabled={cenasDisponiveis.length === 0}
              onChange={ev => {
                const id = ev.currentTarget.value;
                if (!id) return;
                const cenaSel = entidades.value.find(x => x.id === id);
                if (cenaSel) void ativarCena(cenaSel);
                ev.currentTarget.value = '';
              }}
            >
              <option value="">{cenasDisponiveis.length === 0 ? 'Nenhuma cena criada' : '▶ Ativar Cena…'}</option>
              {cenasDisponiveis.map(cs => (
                <option key={cs.id} value={cs.id}>
                  {ehEncontro(cs) ? '⚔ ' : '🎬 '}{cs.nome}
                </option>
              ))}
            </select>
          </label>
          <label class="linha-campanha">Mapa
            <select data-testid="sessao-mapa" value={mapaAtual.value?.mapaId ?? ''} disabled={mapas.value.length === 0} onChange={ev => mudarEscolhas({ mapaId: ev.currentTarget.value || null })}>
              {mapas.value.length === 0 ? <option value="">Nenhum mapa na campanha</option> : mapas.value.map(m => <option key={m.mapaId} value={m.mapaId}>{m.nome}</option>)}
            </select>
          </label>
        </div>
        <div class="sessao-zona sessao-zona-direita">
          <div class="sessao-controle-jogadores" role="group" aria-label="Controle dos jogadores" data-testid="sessao-controle-jogadores">
            <button
              type="button"
              class={cx('sessao-controle-btn', controleJogadores.value === 'livres' && 'ativo')}
              aria-pressed={controleJogadores.value === 'livres'}
              data-testid="sessao-controle-livres"
              title="Jogadores podem mover suas peças e controlar a câmera da activity"
              onClick={() => definirControleJogadores('livres')}
            >
              Jogadores livres
            </button>
            <button
              type="button"
              class={cx('sessao-controle-btn', controleJogadores.value === 'mestre' && 'ativo')}
              aria-pressed={controleJogadores.value === 'mestre'}
              data-testid="sessao-controle-mestre"
              title="Apenas o mestre move peças e controla a câmera da activity"
              onClick={() => definirControleJogadores('mestre')}
            >
              Controle do mestre
            </button>
          </div>
          {sessaoAtiva.value && (
            <button
              type="button"
              class="selo"
              style={{ cursor: 'pointer', border: '1px solid var(--linha)' }}
              data-testid="selo-prontidao-sessao"
              title="Checagem de prontidão da sessão"
              onClick={() => { checandoProntidaoSessao.value = true; }}
            >
              {pendenciasAtivasCount.value === null
                ? 'Prontidão'
                : pendenciasAtivasCount.value === 0
                ? '✓ Pronta'
                : `⚠️ ${pendenciasAtivasCount.value} ${pendenciasAtivasCount.value === 1 ? 'pendência' : 'pendências'}`}
            </button>
          )}
          <button
            type="button"
            class={cx('botao-pilula', desafioAtivo.value !== null && 'botao-desafios-ativo')}
            title="Abrir painel de Desafios de Cena (Fechadura, Equilíbrio, Furtividade, Perseguição, Escalar)"
            data-testid="sessao-abrir-desafios"
            onClick={() => setDesafiosAberto(true)}
          >
            ⚔ Desafios
            {desafioAtivo.value !== null && <span class="botao-desafios-selo" aria-label="Desafio ativo" />}
          </button>
          <button
            type="button"
            class="botao-pilula"
            title="Abrir visão do projetor para os jogadores na TV ou 2º monitor"
            data-testid="sessao-abrir-projetor"
            onClick={() => abrirProjetor(mapaAtual.value?.mapaId ?? null)}
          >
            📽 Projetor
          </button>
          <div class="sessao-presets-rapidos" role="group" aria-label="Arranjos rápidos" data-testid="sessao-presets-rapidos">
            {PRESETS_RAPIDOS.map(pr => (
              <button
                key={pr.id}
                type="button"
                class={cx('sessao-controle-btn', preset === pr.id && 'ativo')}
                aria-pressed={preset === pr.id}
                data-testid={`preset-rapido-${pr.id}`}
                onClick={() => mudarLayout(aplicarPresetLayout(pr.id))}
              >
                {pr.rotulo}
              </button>
            ))}
          </div>
          <button type="button" class="botao-icone-texto" data-testid="guia-sessao-abrir" title="Como usar o modo sessão" aria-label="Como usar o modo sessão" onClick={() => { guiaVisivel.value = true; }}>?</button>
          <MenuDePaineis l={l} preset={preset} />
        </div>
      </div>
      <GuiaDaSessao />
      <div class={cx('sessao-paineis', arrastando === 'col' && 'arrastando', arrastando === 'row' && 'arrastando-vertical', arrastandoPainel && 'arrastando-painel')} ref={area} data-testid="sessao-paineis">
        {colunas.map((col, colIdx) => (
          <Fragment key={colIdx}>
            <div class="sessao-coluna" data-coluna={colIdx} style={{ flex: `${col.peso} 1 0` }}>
              {col.paineis.map((pId, pIdx) => {
                const Corpo = CORPO[pId];
                const emTelaCheia = painelEmTelaCheia.value === pId;
                const estaEmPilha = col.paineis.length > 1;
                const ehOrigemArraste = arrastandoPainel === pId;
                const zonaAlvo = alvoSoltar?.destino === pId ? alvoSoltar.modo : null;
                return (
                  <Fragment key={pId}>
                    <section
                      class={cx('painel', ehOrigemArraste && 'painel-arrastando', zonaAlvo && 'painel-alvo-soltar')}
                      data-painel={pId}
                      data-testid={`painel-corpo-${pId}`}
                      style={{ flex: `${col.alturas[pId] ?? 1} 1 0` }}
                    >
                      <header class="painel-topo" onPointerDown={iniciarArrastePainel(pId)} title="Arraste para mover ou empilhar este painel">
                        <h3>{ROTULO_DO_PAINEL[pId]}</h3>
                        <span class="espaco" />
                        <div class="painel-acoes">
                          <button
                            type="button"
                            class="botao-icone-texto"
                            disabled={colIdx === 0}
                            title="Mover coluna para a esquerda"
                            aria-label={`Mover ${ROTULO_DO_PAINEL[pId]} para a esquerda`}
                            data-testid={`mover-esq-${pId}`}
                            onClick={() => mudarLayout(moverColuna(layout.value, pId, -1))}
                          >
                            ←
                          </button>
                          <button
                            type="button"
                            class="botao-icone-texto"
                            disabled={colIdx === colunas.length - 1}
                            title="Mover coluna para a direita"
                            aria-label={`Mover ${ROTULO_DO_PAINEL[pId]} para a direita`}
                            data-testid={`mover-dir-${pId}`}
                            onClick={() => mudarLayout(moverColuna(layout.value, pId, 1))}
                          >
                            →
                          </button>
                          <button
                            type="button"
                            class="botao-icone-texto"
                            disabled={!estaEmPilha && colunas.length <= 1}
                            title={estaEmPilha ? 'Separar em coluna própria' : 'Empilhar na coluna vizinha'}
                            aria-label={estaEmPilha ? `Separar ${ROTULO_DO_PAINEL[pId]} em coluna própria` : `Empilhar ${ROTULO_DO_PAINEL[pId]} na coluna vizinha`}
                            data-testid={`empilhar-${pId}`}
                            onClick={() => mudarLayout(alternarEmpilhamentoPainel(layout.value, pId))}
                          >
                            ⬓
                          </button>
                          <button
                            type="button"
                            class="botao-icone-texto"
                            title={emTelaCheia ? 'Sair da tela cheia' : 'Tela cheia (Esc volta)'}
                            aria-label={emTelaCheia ? 'Sair da tela cheia' : 'Tela cheia'}
                            aria-pressed={emTelaCheia}
                            data-testid={`tela-cheia-${pId}`}
                            onClick={() => { void alternarTelaCheia(pId); }}
                          >
                            {emTelaCheia ? '✕' : '⛶'}
                          </button>
                          <button
                            type="button"
                            class="botao-icone-texto"
                            disabled={totalPaineis <= 1}
                            title="Fechar painel"
                            aria-label={`Fechar ${ROTULO_DO_PAINEL[pId]}`}
                            data-testid={`fechar-painel-${pId}`}
                            onClick={() => mudarLayout(alternarPainelLayout(layout.value, pId))}
                          >
                            ×
                          </button>
                        </div>
                      </header>
                      <div class="painel-corpo">
                        <Corpo />
                        {zonaAlvo && (
                          <div class={cx('zona-soltar-sobreposicao', `zona-soltar-${zonaAlvo}`)} data-testid={`zona-soltar-${pId}`}>
                            <span>{ROTULO_ZONA_SOLTAR[zonaAlvo]}</span>
                          </div>
                        )}
                      </div>
                    </section>
                    {pIdx < col.paineis.length - 1 && (
                      <div
                        class="divisor-vertical"
                        role="separator"
                        aria-orientation="horizontal"
                        aria-label={`Altura: ${ROTULO_DO_PAINEL[pId]} e ${ROTULO_DO_PAINEL[col.paineis[pIdx + 1]!]}`}
                        tabIndex={0}
                        data-testid={`divisor-vertical-${colIdx}-${pIdx}`}
                        onPointerDown={arrastarVertical(colIdx, pIdx)}
                        onKeyDown={teclarVertical(colIdx, pIdx)}
                      />
                    )}
                  </Fragment>
                );
              })}
            </div>
            {colIdx < colunas.length - 1 && (
              <div
                class="divisor"
                role="separator"
                aria-orientation="vertical"
                aria-label={`Largura da coluna ${colIdx + 1} e ${colIdx + 2}`}
                tabIndex={0}
                data-testid={`divisor-${colIdx}`}
                onPointerDown={arrastar(colIdx)}
                onKeyDown={teclar(colIdx)}
              />
            )}
          </Fragment>
        ))}
      </div>
      {checandoProntidaoSessao.value && (
        <DialogoChecagemSessao aoFechar={() => { checandoProntidaoSessao.value = false; }} />
      )}
      <PainelDesafios aberto={desafiosAberto} aoFechar={() => setDesafiosAberto(false)} />
    </section>
  );
}

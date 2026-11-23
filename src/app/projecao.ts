import { effect, signal } from '@preact/signals';
import { normalizarEstadoDoMundo } from '../dominio/estado-do-mundo.ts';
import {
  CANAL_DA_PROJECAO,
  itensParaJogadores,
  lerMensagemDeProjecao,
  type ItemParaJogadores,
  type MensagemDeProjecao,
} from '../dominio/projecao.ts';
import type { Quadro } from '../dominio/quadro.ts';
import { abrirJanelaNoSegundoMonitor } from './desktop.ts';
import { lerAjustesQuadro, listarItens, obterQuadro } from './banco-quadros.ts';
import { descarregarPendentes, estadoDoMundo, itens, quadroAberto } from './quadros.ts';

/** Última moldura projetada (para a janela que abre depois da mensagem, ou que é recarregada). */
const CHAVE_ATUAL = 'mesa:projecao-atual';
const NOME_DA_JANELA = 'mesa-projecao';
const INTERVALO_ATUALIZAR_MS = 500;
const ATRASO_DA_JANELA_MS = 120;

// ---------------------------------------------------------------------------
// Lado do mestre
// ---------------------------------------------------------------------------

export const projetando = signal<{ quadroId: string; molduraId: string; titulo: string } | null>(null);

let canal: BroadcastChannel | null = null;
function enviar(m: MensagemDeProjecao): void {
  if (typeof BroadcastChannel === 'undefined') return;
  canal ??= new BroadcastChannel(CANAL_DA_PROJECAO);
  canal.postMessage(m);
}

function guardarAtual(v: { quadroId: string; molduraId: string } | null): void {
  try {
    if (v) localStorage.setItem(CHAVE_ATUAL, JSON.stringify({ quadroId: v.quadroId, molduraId: v.molduraId }));
    else localStorage.removeItem(CHAVE_ATUAL);
  } catch { /* sem armazenamento: a mensagem do canal basta */ }
}

function lerAtual(): { quadroId: string; molduraId: string } | null {
  try {
    const bruto = localStorage.getItem(CHAVE_ATUAL);
    const m = lerMensagemDeProjecao(bruto ? { tipo: 'mostrar', ...JSON.parse(bruto) } : null);
    return m?.tipo === 'mostrar' ? { quadroId: m.quadroId, molduraId: m.molduraId } : null;
  } catch {
    return null;
  }
}

let ultimoEnvio = 0;
let timerEnvio: ReturnType<typeof setTimeout> | null = null;
let observando = false;

async function enviarAtualizacao(): Promise<void> {
  timerEnvio = null;
  ultimoEnvio = Date.now();
  await descarregarPendentes(); // a janela lê do banco: o que está só em memória ainda não existe para ela
  if (projetando.value) enviar({ tipo: 'atualizar' });
}

/** No máximo um `atualizar` a cada 500 ms (o último pedido sempre sai). */
function agendarAtualizacao(): void {
  const resto = INTERVALO_ATUALIZAR_MS - (Date.now() - ultimoEnvio);
  if (resto <= 0) void enviarAtualizacao();
  else timerEnvio ??= setTimeout(() => void enviarAtualizacao(), resto);
}

function observarMudancas(): void {
  if (observando) return;
  observando = true;
  effect(() => {
    itens.value;
    estadoDoMundo.value;
    const p = projetando.peek();
    if (p && quadroAberto.peek()?.id === p.quadroId) agendarAtualizacao();
  });
}

/** Abre (ou reaproveita) a janela de projeção e manda a moldura. */
export function mostrarAosJogadores(quadroId: string, molduraId: string, titulo: string): void {
  observarMudancas();
  projetando.value = { quadroId, molduraId, titulo };
  guardarAtual({ quadroId, molduraId });
  // No app de desktop a página não é http(s) (tauri://…): o Tauri quer o caminho relativo ao app.
  const rota = `#/projecao/${encodeURIComponent(quadroId)}`;
  const url = /^https?:$/.test(location.protocol)
    ? `${location.href.split('#')[0]}${rota}`
    : `${location.pathname.replace(/^\/+/, '')}${rota}`;
  // O `window.open` vem primeiro, ainda dentro do gesto do clique (senão o navegador bloqueia o popup).
  const aberta = abrirJanelaNoSegundoMonitor(url, NOME_DA_JANELA);
  void aberta.then(async () => {
    await descarregarPendentes();
    enviar({ tipo: 'mostrar', quadroId, molduraId });
  });
}

/** "Parar": a janela fica preta (e continua aberta para a próxima moldura). */
export function pararProjecao(): void {
  projetando.value = null;
  guardarAtual(null);
  enviar({ tipo: 'parar' });
}

// ---------------------------------------------------------------------------
// Lado da janela de projeção
// ---------------------------------------------------------------------------

export interface VistaDaProjecao {
  quadro: Quadro;
  molduraId: string;
  /** Só o que `itensParaJogadores` devolveu. Os itens brutos do banco nunca saem de `carregarVista`. */
  itens: ItemParaJogadores[];
}

export const vistaDaProjecao = signal<VistaDaProjecao | null>(null);

/** Lê o banco e o estado do mundo e passa tudo por `itensParaJogadores`. `null` = tela preta. */
export async function carregarVista(quadroId: string, molduraId: string | null): Promise<VistaDaProjecao | null> {
  if (!molduraId) return null;
  const quadro = await obterQuadro(quadroId);
  if (!quadro) return null;
  const [lista, ajustes] = await Promise.all([listarItens(quadroId), lerAjustesQuadro(quadro.campanhaId)]);
  const estado = normalizarEstadoDoMundo(ajustes?.estado);
  const visiveis = itensParaJogadores(new Map(lista.map((i) => [i.id, i])), molduraId, estado);
  if (!visiveis.some((i) => i.id === molduraId)) return null;
  return { quadro, molduraId, itens: visiveis };
}

/**
 * Liga a janela: lê a rota (`quadroId`), a última moldura guardada e escuta o canal.
 * `quadroId()` é lido a cada mensagem porque a janela é reaproveitada (a rota muda).
 */
export function iniciarJanelaDeProjecao(quadroId: () => string | null): () => void {
  let alvo: { quadroId: string; molduraId: string | null } | null = null;
  let sequencia = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const recarregar = async () => {
    const minha = ++sequencia;
    const atual = alvo;
    const vista = atual ? await carregarVista(atual.quadroId, atual.molduraId).catch(() => null) : null;
    if (minha === sequencia) vistaDaProjecao.value = vista;
  };
  const sincronizarComARota = () => {
    const id = quadroId();
    const guardada = lerAtual();
    alvo = id && guardada && guardada.quadroId === id ? { quadroId: id, molduraId: guardada.molduraId } : id ? { quadroId: id, molduraId: null } : null;
    void recarregar();
  };

  const canal = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CANAL_DA_PROJECAO) : null;
  if (canal) {
    canal.onmessage = (e: MessageEvent) => {
      const m = lerMensagemDeProjecao(e.data);
      if (!m) return;
      if (m.tipo === 'mostrar') {
        alvo = { quadroId: m.quadroId, molduraId: m.molduraId };
        void recarregar();
      } else if (m.tipo === 'parar') {
        alvo = alvo ? { quadroId: alvo.quadroId, molduraId: null } : null;
        sequencia++;
        vistaDaProjecao.value = null;
      } else if (alvo?.molduraId) {
        // o mestre pode ter acabado de gravar o estado do mundo: dá um instante antes de reler
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => void recarregar(), ATRASO_DA_JANELA_MS);
      }
    };
  }
  window.addEventListener('hashchange', sincronizarComARota);
  sincronizarComARota();
  return () => {
    canal?.close();
    if (timer) clearTimeout(timer);
    window.removeEventListener('hashchange', sincronizarComARota);
  };
}

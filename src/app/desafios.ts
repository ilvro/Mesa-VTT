import { effect, signal } from '@preact/signals';
import {
  aplicarAcaoDesafio,
  ehDesafioAtivo,
  sanitizarDesafioPara,
  type AcaoDesafio,
  type DesafioAtivo,
  type ObjetoAlvoLockpick,
} from '../dominio/desafios.ts';
import {
  CANAL_PROJETOR_REMOTO,
  conexaoOnline,
  desafioDaSala,
  desafioDaSalaVersao,
  enviarParaSala,
  salaSemSuporteDesafios,
} from './online.ts';

export const CANAL_DESAFIOS_LOCAL = 'mesa:desafios';
export const CHAVE_DESAFIO_LOCAL = 'mesa:desafio-ativo';

export const desafioAtivo = signal<DesafioAtivo | null>(null);
export const pedidoLockpickObjeto = signal<ObjetoAlvoLockpick | null>(null);

export function limparPedidoLockpickObjeto(): void {
  pedidoLockpickObjeto.value = null;
}

let canalLocal: BroadcastChannel | null = null;
let canalMestreIniciado = false;
const portasDestrancadasPorDesafio = new Set<string>();

function ehObjetoAlvoLockpick(v: unknown): v is ObjetoAlvoLockpick {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.mapaId === 'string' &&
    o.mapaId.length > 0 &&
    (o.colecao === 'openings' || o.colecao === 'props') &&
    typeof o.id === 'string' &&
    o.id.length > 0 &&
    typeof o.nome === 'string' &&
    o.nome.length > 0
  );
}

function obterCanalLocal(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null;
  if (!canalLocal) canalLocal = new BroadcastChannel(CANAL_DESAFIOS_LOCAL);
  return canalLocal;
}

export function iniciarCanalDesafiosMestre(): void {
  if (canalMestreIniciado) return;
  const canal = obterCanalLocal();
  if (!canal) return;
  canalMestreIniciado = true;
  canal.onmessage = (ev: MessageEvent) => {
    const data = ev.data as { tipo?: unknown; objeto?: unknown } | null;
    if (!data || typeof data !== 'object') return;
    if (data.tipo === 'desafio.abrir-lockpick' && ehObjetoAlvoLockpick(data.objeto)) {
      pedidoLockpickObjeto.value = { ...data.objeto };
    }
  };
}

function notificarDestrancarPortaSeAberto(d: DesafioAtivo | null): void {
  if (
    !d ||
    d.tipo !== 'lockpick' ||
    d.status !== 'aberto' ||
    !d.objetoAlvo ||
    d.objetoAlvo.colecao !== 'openings'
  ) {
    return;
  }
  if (portasDestrancadasPorDesafio.has(d.id)) return;
  portasDestrancadasPorDesafio.add(d.id);
  try {
    obterCanalLocal()?.postMessage({
      tipo: 'atlas.destrancar-porta',
      mapaId: d.objetoAlvo.mapaId,
      id: d.objetoAlvo.id,
    });
  } catch {
    // sem BroadcastChannel
  }
}

effect(() => {
  notificarDestrancarPortaSeAberto(desafioAtivo.value);
});

function propagarDesafioLocal(d: DesafioAtivo | null): void {
  const sanitizadoJogador = d ? sanitizarDesafioPara(d, 'jogador') : null;
  try {
    if (typeof localStorage !== 'undefined') {
      if (sanitizadoJogador === null) localStorage.removeItem(CHAVE_DESAFIO_LOCAL);
      else localStorage.setItem(CHAVE_DESAFIO_LOCAL, JSON.stringify(sanitizadoJogador));
    }
  } catch {
    // sem armazenamento local
  }
  try {
    obterCanalLocal()?.postMessage({ tipo: 'desafio.estado', desafio: sanitizadoJogador });
  } catch {
    // sem BroadcastChannel
  }
}

function lerDesafioDoTexto(texto: string | null): DesafioAtivo | null {
  if (!texto) return null;
  try {
    const parsed: unknown = JSON.parse(texto);
    return ehDesafioAtivo(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function enviarFallbackCanalRemoto(d: DesafioAtivo | null): void {
  enviarParaSala({
    tipo: 'canal',
    nome: CANAL_PROJETOR_REMOTO,
    msg: {
      tipo: 'desafio-estado',
      desafio: d ? sanitizarDesafioPara(d, 'jogador') : null,
    },
  });
}

let ultimaVersaoAplicada = 0;
let ultimoDaSala: DesafioAtivo | null = desafioDaSala.peek();

// Sincroniza atualizações reais vindas da sala online para o estado local e para o telão local.
effect(() => {
  const conectado = conexaoOnline.value === 'aberta';
  const daSala = desafioDaSala.value;
  const versao = desafioDaSalaVersao.value;
  if (!conectado) return;
  if (versao === ultimaVersaoAplicada && daSala === ultimoDaSala) return;
  ultimaVersaoAplicada = versao;
  ultimoDaSala = daSala;
  desafioAtivo.value = daSala;
  propagarDesafioLocal(daSala);
});

export function definirDesafioAtivo(d: DesafioAtivo | null): void {
  desafioAtivo.value = d;
  propagarDesafioLocal(d);
  enviarParaSala({ tipo: 'desafio.definir', desafio: d });
  enviarFallbackCanalRemoto(d);
}

export function despacharAcaoDesafio(acao: AcaoDesafio): void {
  if (!salaSemSuporteDesafios.peek() && enviarParaSala({ tipo: 'desafio.acao', acao })) return;
  const atual = desafioAtivo.value;
  if (!atual) return;
  const proximo = aplicarAcaoDesafio(atual, acao);
  desafioAtivo.value = proximo;
  propagarDesafioLocal(proximo);
  if (salaSemSuporteDesafios.peek()) {
    enviarFallbackCanalRemoto(proximo);
  }
}

export function encerrarDesafioAtivo(): void {
  definirDesafioAtivo(null);
}

/** Usado pela janela do telão local (`#/telao`) para acompanhar o desafio ativo (já sanitizado para jogador). */
export function iniciarOuvinteDesafioLocal(cb: (d: DesafioAtivo | null) => void): () => void {
  try {
    const inicial = typeof localStorage !== 'undefined'
      ? lerDesafioDoTexto(localStorage.getItem(CHAVE_DESAFIO_LOCAL))
      : null;
    cb(inicial);
  } catch {
    cb(null);
  }

  let canal: BroadcastChannel | null = null;
  if (typeof BroadcastChannel !== 'undefined') {
    canal = new BroadcastChannel(CANAL_DESAFIOS_LOCAL);
    canal.onmessage = (ev: MessageEvent) => {
      const data = ev.data as { tipo?: unknown; desafio?: unknown } | null;
      if (!data || typeof data !== 'object' || data.tipo !== 'desafio.estado') return;
      if (data.desafio === null) {
        cb(null);
        return;
      }
      if (ehDesafioAtivo(data.desafio)) cb(data.desafio);
    };
  }

  const aoStorage = (ev: StorageEvent): void => {
    if (ev.key !== CHAVE_DESAFIO_LOCAL) return;
    cb(lerDesafioDoTexto(ev.newValue));
  };
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', aoStorage);
  }

  return () => {
    if (canal) {
      canal.onmessage = null;
      canal.close();
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('storage', aoStorage);
    }
  };
}

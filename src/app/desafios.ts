import { effect, signal } from '@preact/signals';
import {
  aplicarAcaoDesafio,
  ehDesafioAtivo,
  sanitizarDesafioPara,
  type AcaoDesafio,
  type DesafioAtivo,
} from '../dominio/desafios.ts';
import { conexaoOnline, desafioDaSala, enviarParaSala } from './online.ts';

export const CANAL_DESAFIOS_LOCAL = 'mesa:desafios';
export const CHAVE_DESAFIO_LOCAL = 'mesa:desafio-ativo';

export const desafioAtivo = signal<DesafioAtivo | null>(null);

let canalLocal: BroadcastChannel | null = null;

function obterCanalLocal(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null;
  if (!canalLocal) canalLocal = new BroadcastChannel(CANAL_DESAFIOS_LOCAL);
  return canalLocal;
}

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

// Sincroniza atualizações vindas da sala online para o estado local e para o telão local.
effect(() => {
  const conectado = conexaoOnline.value === 'aberta';
  const daSala = desafioDaSala.value;
  if (!conectado) return;
  desafioAtivo.value = daSala;
  propagarDesafioLocal(daSala);
});

export function definirDesafioAtivo(d: DesafioAtivo | null): void {
  desafioAtivo.value = d;
  propagarDesafioLocal(d);
  enviarParaSala({ tipo: 'desafio.definir', desafio: d });
}

export function despacharAcaoDesafio(acao: AcaoDesafio): void {
  if (enviarParaSala({ tipo: 'desafio.acao', acao })) return;
  const atual = desafioAtivo.value;
  if (!atual) return;
  const proximo = aplicarAcaoDesafio(atual, acao);
  desafioAtivo.value = proximo;
  propagarDesafioLocal(proximo);
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

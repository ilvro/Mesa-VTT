/** Mensagens de identificação da sala (a R3 as leva para src/online/protocolo.ts). Puro. */
import type { Papel } from './sessao.ts';

export interface MsgOla {
  tipo: 'ola';
  sessao: string;
}

export interface Eu {
  discordId: string;
  nome: string;
  papel: Papel;
}

export interface MsgBemVindo {
  tipo: 'bem-vindo';
  eu: Eu;
}

/** Devolve a sessão (ainda não verificada) se a mensagem for um `ola` bem formado. */
export function lerOla(texto: string): string | null {
  try {
    const m = JSON.parse(texto) as Record<string, unknown> | null;
    if (m && typeof m === 'object' && m.tipo === 'ola' && typeof m.sessao === 'string') return m.sessao;
  } catch {
    // não é JSON
  }
  return null;
}

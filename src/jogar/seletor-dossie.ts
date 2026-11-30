/** Mensagens do seletor de fichas do Dossiê (`?modo=seletor`, iframe no Saguão): validação pura, sem DOM. */
import type { FichaDaSala } from '../online/protocolo.ts';

export type MensagemDoSeletor =
  | { tipo: 'pronto' }
  | { tipo: 'nova' }
  | { tipo: 'importar-json' }
  | { tipo: 'escolheu'; ficha: FichaDaSala };

export const enderecoDoSeletor = (base: string): string => `${base}${base.includes('?') ? '&' : '?'}modo=seletor`;

/** Só vale vindo do `contentWindow` do iframe do seletor, na mesma origem e bem formado. */
export function mensagemDoSeletor(ev: { source: unknown; origin: string; data: unknown }, janelaDoSeletor: unknown, origemLocal: string): MensagemDoSeletor | null {
  if (!janelaDoSeletor || ev.source !== janelaDoSeletor || ev.origin !== origemLocal) return null;
  const d = ev.data as { tipo?: unknown; ficha?: unknown } | null;
  if (!d || typeof d !== 'object') return null;
  switch (d.tipo) {
    case 'dossie.seletor-pronto': return { tipo: 'pronto' };
    case 'dossie.seletor-nova': return { tipo: 'nova' };
    case 'dossie.seletor-importar-json': return { tipo: 'importar-json' };
    case 'dossie.seletor-escolheu': {
      const f = d.ficha as { id?: unknown } | null;
      if (!f || typeof f !== 'object' || Array.isArray(f) || typeof f.id !== 'string' || !f.id) return null;
      return { tipo: 'escolheu', ficha: f as FichaDaSala };
    }
    default: return null;
  }
}

/** A ficha escolhida já está na sala (do jogador)? Então só seleciona; senão entra como nova, com id novo. */
export function resolverEscolha(ficha: FichaDaSala, existentes: readonly { id: string }[]): { acao: 'escolher'; id: string } | { acao: 'importar' } {
  return existentes.some(f => f.id === ficha.id) ? { acao: 'escolher', id: ficha.id } : { acao: 'importar' };
}

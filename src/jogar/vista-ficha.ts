/**
 * Vistas da ficha na casca do jogador (R12): lógica pura, sem DOM. O `iframe` do Dossiê é um só e nunca remonta:
 * a casca só decide qual vista ele mostra (`card` no painel, `completa` na tela toda) e quem pode pedir a troca.
 */
export type VistaDaFicha = 'card' | 'completa';
export type AbaDaCasca = 'mapa' | 'ficha';

export const ehVista = (v: unknown): v is VistaDaFicha => v === 'card' || v === 'completa';

/** Um pedido `postMessage` do Dossiê só vale vindo do `contentWindow` do `iframe` da ficha e da mesma origem. Devolve a vista pedida, ou `null`. */
export function vistaPedidaPeloDossie(ev: { source: unknown; origin: string; data: unknown }, janelaDoIframe: unknown, origemLocal: string): VistaDaFicha | null {
  if (!janelaDoIframe || ev.source !== janelaDoIframe || ev.origin !== origemLocal) return null;
  const d = ev.data as { tipo?: unknown; vista?: unknown } | null;
  if (!d || typeof d !== 'object' || d.tipo !== 'dossie.pedir-vista' || !ehVista(d.vista)) return null;
  return d.vista;
}

/** A vista que o Dossiê mostra. No celular na vertical, as abas decidem (Ficha = completa); fora dele, vale o pedido (`aberta`). */
export function vistaDaFicha(o: { celularVertical: boolean; aba: AbaDaCasca; aberta: boolean }): VistaDaFicha {
  return o.celularVertical ? (o.aba === 'ficha' ? 'completa' : 'card') : (o.aberta ? 'completa' : 'card');
}

/** A ficha completa cobre o mapa (tela toda)? Só fora do celular; lá, a aba Ficha ocupa a área das abas. */
export const fichaCobreOMapa = (o: { celularVertical: boolean; aberta: boolean }): boolean => !o.celularVertical && o.aberta;

/** A mensagem que a casca manda ao `iframe` quando a vista muda. */
export const mensagemDeVista = (vista: VistaDaFicha) => ({ tipo: 'dossie.vista' as const, vista });

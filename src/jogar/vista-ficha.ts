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

/** Um aviso `postMessage` do projetor remoto indicando que ele já montou e pode receber a lista de fichas do jogador. */
export function projetorPronto(ev: { source: unknown; origin: string; data: unknown }, janelaDoProjetor: unknown, origemLocal: string): boolean {
  if (!janelaDoProjetor || ev.source !== janelaDoProjetor || ev.origin !== origemLocal) return false;
  const d = ev.data as { tipo?: unknown } | null;
  return !!d && typeof d === 'object' && d.tipo === 'projetor.pronto';
}

/** Um aviso `postMessage` do Dossiê indicando que já carregou as fichas e registrou os ouvintes de mensagem. */
export function dossiePronto(ev: { source: unknown; origin: string; data: unknown }, janelaDoDossie: unknown, origemLocal: string): boolean {
  if (!janelaDoDossie || ev.source !== janelaDoDossie || ev.origin !== origemLocal) return false;
  const d = ev.data as { tipo?: unknown } | null;
  return !!d && typeof d === 'object' && d.tipo === 'dossie.pronto';
}

/** Um aviso `postMessage` do Dossiê indicando que já aplicou a vista ou a projeção pedida (a casca então pode revelar o `iframe`). */
export function vistaAplicada(ev: { source: unknown; origin: string; data: unknown }, janelaDoDossie: unknown, origemLocal: string): boolean {
  if (!janelaDoDossie || ev.source !== janelaDoDossie || ev.origin !== origemLocal) return false;
  const d = ev.data as { tipo?: unknown } | null;
  return !!d && typeof d === 'object' && d.tipo === 'dossie.vista-aplicada';
}

/** A vista que o Dossiê mostra. Na projeção do mestre ou no celular na vertical (aba Ficha), é `completa`; fora disso, vale o pedido (`aberta`). */
export function vistaDaFicha(o: { celularVertical: boolean; aba: AbaDaCasca; aberta: boolean; projetando?: boolean }): VistaDaFicha {
  if (o.projetando) return 'completa';
  return o.celularVertical ? (o.aba === 'ficha' ? 'completa' : 'card') : (o.aberta ? 'completa' : 'card');
}

/** A ficha completa cobre o mapa (tela toda)? Quando projetada pelo mestre ou fora do celular com `aberta`. */
export const fichaCobreOMapa = (o: { celularVertical: boolean; aberta: boolean; projetando?: boolean }): boolean =>
  Boolean(o.projetando) || (!o.celularVertical && o.aberta);

/** A mensagem que a casca manda ao `iframe` quando a vista muda. */
export const mensagemDeVista = (vista: VistaDaFicha) => ({ tipo: 'dossie.vista' as const, vista });

/** A mensagem que a casca manda ao `iframe` do projetor remoto com os ids das fichas do jogador (R14). */
export const mensagemDoJogador = (fichas: readonly string[]) => ({ tipo: 'jogador' as const, fichas: [...fichas] });

/** A vista que o aviso `dossie.vista-aplicada` diz ter aplicado (`null` se o Dossiê não informou, como nas versões antigas). */
export function vistaDoAviso(data: unknown): VistaDaFicha | null {
  const v = (data as { vista?: unknown } | null)?.vista;
  return ehVista(v) ? v : null;
}

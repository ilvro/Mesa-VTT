/** Configuração da mesa online no navegador do mestre. Sem DOM obrigatório: tudo recebe `location`/`storage` por parâmetro para os testes. */

/** Id público do app no Discord Developer Portal (não é segredo). */
export const DISCORD_CLIENT_ID = '1573405277389197415';

/** URL do Worker da sala em produção. */
export const URL_SALA_PRODUCAO = 'https://mesa-sala.ilvro-ermes.workers.dev';

export const CHAVE_URL_DA_SALA = 'mesa:sala-url';
export const URL_SALA_LOCAL = 'http://127.0.0.1:8787';
export const REDIRECT_PAGES = 'https://ilvro.github.io/Mesa-VTT/';
export const REDIRECT_DEV = 'http://127.0.0.1:5100/Mesa/';

type Armazem = Pick<Storage, 'getItem'>;
type Lugar = { hostname: string };

function lerArmazem(storage: Armazem | undefined, chave: string): string | null {
  try { return storage?.getItem(chave) ?? null; } catch { return null; }
}

function armazemPadrao(): Storage | undefined {
  try { return typeof localStorage === 'undefined' ? undefined : localStorage; } catch { return undefined; }
}

function lugarPadrao(): Lugar | undefined {
  return typeof location === 'undefined' ? undefined : location;
}

/** Detecta se a Mesa está rodando no build/app Desktop (`VITE_DESKTOP=1` ou User-Agent `MesaVTT/`). Seguro fora do navegador. */
export function ehDesktopMesa(): boolean {
  try {
    if (import.meta.env?.VITE_DESKTOP === '1') return true;
  } catch { /* fora do Vite */ }
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.userAgent === 'string' && navigator.userAgent.includes('MesaVTT/')) {
      return true;
    }
  } catch { /* fora do navegador */ }
  return false;
}

/** A sala: `localStorage['mesa:sala-url']`, senão produção no Desktop, senão `wrangler dev` em localhost, senão produção. */
export function urlDaSala(
  lugar: Lugar | undefined = lugarPadrao(),
  storage: Armazem | undefined = armazemPadrao(),
  desktop: boolean = ehDesktopMesa(),
): string {
  const guardada = lerArmazem(storage, CHAVE_URL_DA_SALA);
  if (guardada) return guardada.replace(/\/+$/, '');
  if (desktop) return URL_SALA_PRODUCAO;
  if (lugar && (lugar.hostname === '127.0.0.1' || lugar.hostname === 'localhost')) return URL_SALA_LOCAL;
  return URL_SALA_PRODUCAO;
}

/** Link web compartilhável para um jogador entrar na sala fora do Discord. */
export function urlDeConviteDaSala(salaId: string): string {
  return `${REDIRECT_PAGES}#/jogar/${encodeURIComponent(salaId)}`;
}

/** O `redirect_uri` do OAuth2 web: o do Pages, ou o do `mesa-dev` (porta 5100) fora do Pages. O Worker só aceita estes dois. */
export function redirectUri(lugar: Lugar | undefined = lugarPadrao()): string {
  return lugar?.hostname === 'ilvro.github.io' ? REDIRECT_PAGES : REDIRECT_DEV;
}

/** `wss://…/sala/<id>/ws` (ou `ws://` com `http`). */
export function urlDoWebSocket(salaId: string, base: string = urlDaSala()): string {
  return `${base.replace(/^http/, 'ws')}/sala/${encodeURIComponent(salaId)}/ws`;
}

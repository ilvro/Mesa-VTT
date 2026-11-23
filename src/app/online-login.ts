/** Login pelo Discord no navegador (OAuth2 web) e a sessão guardada no `localStorage`. Plano: `Atlas/docs/plano/mesa-online.md` (R5). */
import { signal } from '@preact/signals';
import { DISCORD_CLIENT_ID, redirectUri, urlDaSala } from '../online/config.ts';

export const CHAVE_SESSAO = 'mesa:online-sessao';
export const CHAVE_STATE = 'mesa:online-state';
/** O hash para onde voltar depois do login do jogador (`#/jogar/<sala>`), guardado no `sessionStorage` antes de ir ao Discord. */
export const CHAVE_VOLTA = 'mesa:online-volta';
const HASH_DE_VOLTA = /^#\/jogar\/[A-Za-z0-9_-]{1,64}$/;
export const URL_AUTORIZACAO = 'https://discord.com/oauth2/authorize';

export interface EuOnline { discordId: string; nome: string; avatar: string | null; podeMestrar: boolean }
export interface SessaoOnline { sessao: string; eu: EuOnline }

type Armazem = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** A sessão que o navegador guardou, ou `null` (e apaga) se venceu ou está estragada. `exp` é lido do corpo, sem verificar a assinatura (quem verifica é a sala). */
export function lerSessaoGuardada(storage: Armazem | undefined, agora: number = Date.now()): SessaoOnline | null {
  try {
    const bruto = storage?.getItem(CHAVE_SESSAO);
    if (!bruto) return null;
    const s = JSON.parse(bruto) as Partial<SessaoOnline> | null;
    if (!s || typeof s.sessao !== 'string' || !s.eu || typeof s.eu.discordId !== 'string') { storage?.removeItem(CHAVE_SESSAO); return null; }
    const exp = expDaSessao(s.sessao);
    if (exp === null || exp <= agora) { storage?.removeItem(CHAVE_SESSAO); return null; }
    return s as SessaoOnline;
  } catch { return null; }
}

/** O vencimento (ms) dentro do token `base64url(json).assinatura`, ou `null`. */
export function expDaSessao(token: string): number | null {
  try {
    const corpo = token.split('.')[0] ?? '';
    const b64 = corpo.replace(/-/g, '+').replace(/_/g, '/');
    const bytes = Uint8Array.from(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4)), c => c.charCodeAt(0));
    const d = JSON.parse(new TextDecoder().decode(bytes)) as { exp?: unknown };
    return typeof d.exp === 'number' ? d.exp : null;
  } catch { return null; }
}

function armazemLocal(): Storage | undefined {
  try { return typeof localStorage === 'undefined' ? undefined : localStorage; } catch { return undefined; }
}
function armazemDaAba(): Storage | undefined {
  try { return typeof sessionStorage === 'undefined' ? undefined : sessionStorage; } catch { return undefined; }
}

/** A sessão da tela `#/online`; `null` = não conectado. */
export const sessaoOnline = signal<SessaoOnline | null>(null);

export function carregarSessaoOnline(storage: Armazem | undefined = armazemLocal(), agora: number = Date.now()): SessaoOnline | null {
  sessaoOnline.value = lerSessaoGuardada(storage, agora);
  return sessaoOnline.value;
}

export function sairDoOnline(storage: Armazem | undefined = armazemLocal()): void {
  try { storage?.removeItem(CHAVE_SESSAO); } catch { /* ignora */ }
  sessaoOnline.value = null;
}

/** A URL de `discord.com/oauth2/authorize` para este `state`. */
export function urlDeAutorizacao(state: string, redirect: string = redirectUri(), scope: string = 'identify guilds'): string {
  const p = new URLSearchParams({ client_id: DISCORD_CLIENT_ID, response_type: 'code', scope, redirect_uri: redirect, state });
  return `${URL_AUTORIZACAO}?${p.toString()}`;
}

export function novoState(): string {
  const b = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
}

/** Guarda um `state` novo no `sessionStorage` e devolve a URL para onde mandar o navegador. */
export function iniciarLogin(opcoes: { sessionStorage?: Armazem | undefined; redirect?: string; state?: string; scope?: string; voltarPara?: string } = {}): string {
  const state = opcoes.state ?? novoState();
  const aba = opcoes.sessionStorage ?? armazemDaAba();
  try { aba?.setItem(CHAVE_STATE, state); } catch { /* sem sessionStorage o retorno falha na conferência */ }
  try { if (opcoes.voltarPara && HASH_DE_VOLTA.test(opcoes.voltarPara)) aba?.setItem(CHAVE_VOLTA, opcoes.voltarPara); else aba?.removeItem(CHAVE_VOLTA); } catch { /* volta para #/online */ }
  return urlDeAutorizacao(state, opcoes.redirect, opcoes.scope);
}

/** O hash para onde o login volta: o guardado por `iniciarLogin({ voltarPara })` (e apagado), ou `#/online`. */
export function hashDeVolta(storage: Armazem | undefined = armazemDaAba()): string {
  try {
    const h = storage?.getItem(CHAVE_VOLTA) ?? null;
    storage?.removeItem(CHAVE_VOLTA);
    return h && HASH_DE_VOLTA.test(h) ? h : '#/online';
  } catch { return '#/online'; }
}

export type ResultadoDoRetorno = 'sem-codigo' | 'ok' | 'state-invalido' | 'recusado' | 'erro';

export interface OpcoesDoRetorno {
  /** `location.search`. */
  search: string;
  fetch?: typeof fetch;
  localStorage?: Armazem | undefined;
  sessionStorage?: Armazem | undefined;
  urlSala?: string;
  redirect?: string;
}

/** Remove `code`, `state` e os erros do Discord da query, mantendo o resto. */
export function queryLimpa(search: string): string {
  const p = new URLSearchParams(search);
  for (const k of ['code', 'state', 'error', 'error_description']) p.delete(k);
  const s = p.toString();
  return s ? `?${s}` : '';
}

/**
 * Na volta do Discord (`?code=&state=`): confere o `state` com o do `sessionStorage`, troca o `code` por uma sessão em `POST /sala/token`
 * e a guarda. Quem chama limpa a query e abre `#/online`. Sem `code` na URL, não faz nada.
 */
export async function concluirLogin(o: OpcoesDoRetorno): Promise<ResultadoDoRetorno> {
  const p = new URLSearchParams(o.search);
  const code = p.get('code');
  if (!code) return p.get('error') ? 'recusado' : 'sem-codigo';
  const aba = o.sessionStorage ?? armazemDaAba();
  let esperado: string | null = null;
  try { esperado = aba?.getItem(CHAVE_STATE) ?? null; aba?.removeItem(CHAVE_STATE); } catch { /* ignora */ }
  const state = p.get('state');
  if (!esperado || !state || state !== esperado) return 'state-invalido';
  try {
    const f = o.fetch ?? fetch;
    const r = await f(`${o.urlSala ?? urlDaSala()}/sala/token`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, redirectUri: o.redirect ?? redirectUri() }),
    });
    if (!r.ok) return 'erro';
    const d = await r.json() as { sessao?: unknown; eu?: EuOnline };
    if (typeof d.sessao !== 'string' || !d.eu) return 'erro';
    const guardada: SessaoOnline = { sessao: d.sessao, eu: d.eu };
    try { (o.localStorage ?? armazemLocal())?.setItem(CHAVE_SESSAO, JSON.stringify(guardada)); } catch { /* a sessão vale só nesta aba */ }
    sessaoOnline.value = guardada;
    return 'ok';
  } catch { return 'erro'; }
}

/** Chamado pelo `main.tsx` ao abrir: trata a volta do Discord (se houver) e carrega a sessão guardada. */
export async function iniciarOnline(): Promise<void> {
  carregarSessaoOnline();
  const search = location.search;
  if (!new URLSearchParams(search).has('code') && !new URLSearchParams(search).has('error')) return;
  const r = await concluirLogin({ search });
  try { history.replaceState(null, '', `${location.pathname}${queryLimpa(search)}${hashDeVolta()}`); } catch { /* ignora */ }
  erroDoLogin.value = r === 'ok' || r === 'sem-codigo' ? null : MENSAGEM_DO_ERRO[r];
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

export const erroDoLogin = signal<string | null>(null);
const MENSAGEM_DO_ERRO: Record<Exclude<ResultadoDoRetorno, 'ok' | 'sem-codigo'>, string> = {
  'state-invalido': 'A volta do Discord não confere com o pedido (state diferente). Tente entrar de novo.',
  recusado: 'O Discord não autorizou a entrada.',
  erro: 'A sala não aceitou o login. Confira o servidor da sala e tente de novo.',
};

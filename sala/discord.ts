/** Chamadas ao Discord (OAuth2): `fetch` injetável, sem tipos do Workers. */

export type FetchLike = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

export interface UsuarioDiscord {
  discordId: string;
  nome: string;
  avatar: string | null;
}

export interface GuildaDiscord {
  id: string;
  name: string;
  icon: string | null;
}

export class ErroDiscord extends Error {}

export const URL_TOKEN = 'https://discord.com/api/oauth2/token';
export const URL_USUARIO = 'https://discord.com/api/users/@me';
export const URL_GUILDAS = 'https://discord.com/api/users/@me/guilds';

async function motivo(resp: { status: number; json(): Promise<unknown> }): Promise<string> {
  let detalhe = '';
  try {
    const j = (await resp.json()) as Record<string, unknown>;
    const texto = j.error_description ?? j.message ?? j.error;
    if (typeof texto === 'string') detalhe = `: ${texto}`;
  } catch {
    // corpo que não é JSON
  }
  return `HTTP ${resp.status}${detalhe}`;
}

export interface PedidoTroca {
  code: string;
  redirectUri?: string;
  clientId: string;
  clientSecret: string;
  fetch: FetchLike;
}

/** Troca o `code` do OAuth2 pelo access token. */
export async function trocarCodigo(p: PedidoTroca): Promise<string> {
  const corpo = new URLSearchParams({
    client_id: p.clientId,
    client_secret: p.clientSecret,
    grant_type: 'authorization_code',
    code: p.code,
  });
  if (p.redirectUri) corpo.set('redirect_uri', p.redirectUri);
  let resp;
  try {
    resp = await p.fetch(URL_TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: corpo.toString(),
    });
  } catch {
    throw new ErroDiscord('não consegui falar com o Discord para trocar o código');
  }
  if (!resp.ok) throw new ErroDiscord(`o Discord recusou o código (${await motivo(resp)})`);
  const j = (await resp.json().catch(() => null)) as Record<string, unknown> | null;
  if (!j || typeof j.access_token !== 'string' || !j.access_token) {
    throw new ErroDiscord('o Discord não devolveu access_token');
  }
  return j.access_token;
}

/** Lê o usuário dono do access token. */
export async function lerUsuario(accessToken: string, fetch: FetchLike): Promise<UsuarioDiscord> {
  let resp;
  try {
    resp = await fetch(URL_USUARIO, { headers: { Authorization: `Bearer ${accessToken}` } });
  } catch {
    throw new ErroDiscord('não consegui falar com o Discord para ler o usuário');
  }
  if (!resp.ok) throw new ErroDiscord(`o Discord recusou o token (${await motivo(resp)})`);
  const j = (await resp.json().catch(() => null)) as Record<string, unknown> | null;
  if (!j || typeof j.id !== 'string' || typeof j.username !== 'string') {
    throw new ErroDiscord('resposta inesperada do Discord em /users/@me');
  }
  const global = typeof j.global_name === 'string' && j.global_name ? j.global_name : null;
  return {
    discordId: j.id,
    nome: global ?? j.username,
    avatar: typeof j.avatar === 'string' && j.avatar ? j.avatar : null,
  };
}

/** Lista os servidores em que o usuário está (`GET /users/@me/guilds`, exige escopo `guilds`). */
export async function lerGuildas(accessToken: string, fetch: FetchLike): Promise<GuildaDiscord[]> {
  let resp;
  try {
    resp = await fetch(URL_GUILDAS, { headers: { Authorization: `Bearer ${accessToken}` } });
  } catch {
    throw new ErroDiscord('não consegui falar com o Discord para listar os servidores');
  }
  if (!resp.ok) throw new ErroDiscord(`o Discord recusou a leitura dos servidores (${await motivo(resp)})`);
  const j = await resp.json().catch(() => null);
  if (!Array.isArray(j)) {
    throw new ErroDiscord('resposta inesperada do Discord em /users/@me/guilds');
  }
  const saida: GuildaDiscord[] = [];
  for (const item of j) {
    if (!item || typeof item !== 'object') continue;
    const g = item as Record<string, unknown>;
    if (typeof g.id !== 'string' || typeof g.name !== 'string') continue;
    saida.push({
      id: g.id,
      name: g.name,
      icon: typeof g.icon === 'string' && g.icon ? g.icon : null,
    });
  }
  return saida;
}

/** Mantém apenas os servidores do usuário em que o app já foi visto pela atividade. */
export function filtrarGuildasInstaladas(guildas: readonly GuildaDiscord[], vistas: readonly string[]): GuildaDiscord[] {
  const conjunto = new Set(vistas);
  return guildas.filter(g => conjunto.has(g.id));
}

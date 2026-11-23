import { ErroDiscord, lerUsuario, trocarCodigo } from './discord.ts';
import { origemPermitida } from './retransmitir.ts';
import { assinarSessao, papelDe, venceEm } from './sessao.ts';

export { Sala } from './sala.ts';

interface Env {
  SALA: DurableObjectNamespace;
  DISCORD_CLIENT_ID: string;
  DISCORD_CLIENT_SECRET: string;
  MESTRE_DISCORD_ID: string;
  SEGREDO_SESSAO: string;
}

/** `redirect_uri` aceitos no fluxo web (o da atividade do Discord não leva `redirect_uri`). */
const REDIRECTS_PERMITIDOS = ['https://ilvro.github.io/Mesa/', 'http://127.0.0.1:5100/Mesa/'];

function json(corpo: unknown, status: number, cabecalhos: Record<string, string>): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...cabecalhos, 'Content-Type': 'application/json' },
  });
}

async function rotaToken(request: Request, env: Env, cabecalhos: Record<string, string>): Promise<Response> {
  if (!env.DISCORD_CLIENT_ID || !env.DISCORD_CLIENT_SECRET || !env.SEGREDO_SESSAO) {
    return json({ erro: 'sala sem configuração de login' }, 500, cabecalhos);
  }
  let corpo: { code?: unknown; redirectUri?: unknown } | null;
  try {
    corpo = (await request.json()) as typeof corpo;
  } catch {
    corpo = null;
  }
  if (!corpo || typeof corpo.code !== 'string' || !corpo.code) {
    return json({ erro: 'faltou o code' }, 400, cabecalhos);
  }
  let redirectUri: string | undefined;
  if (corpo.redirectUri !== undefined) {
    if (typeof corpo.redirectUri !== 'string' || !REDIRECTS_PERMITIDOS.includes(corpo.redirectUri)) {
      return json({ erro: 'redirectUri não permitido' }, 400, cabecalhos);
    }
    redirectUri = corpo.redirectUri;
  }
  try {
    const accessToken = await trocarCodigo({
      code: corpo.code,
      redirectUri,
      clientId: env.DISCORD_CLIENT_ID,
      clientSecret: env.DISCORD_CLIENT_SECRET,
      fetch: (u, i) => fetch(u, i),
    });
    const u = await lerUsuario(accessToken, (url, i) => fetch(url, i));
    const papel = papelDe(u.discordId, env.MESTRE_DISCORD_ID);
    const sessao = await assinarSessao({ ...u, papel, exp: venceEm(Date.now()) }, env.SEGREDO_SESSAO);
    return json(
      { access_token: accessToken, sessao, eu: { discordId: u.discordId, nome: u.nome, avatar: u.avatar, papel } },
      200,
      cabecalhos,
    );
  } catch (e) {
    if (e instanceof ErroDiscord) return json({ erro: e.message }, 401, cabecalhos);
    return json({ erro: 'falha ao entrar' }, 500, cabecalhos);
  }
}

function cors(origem: string | null): Record<string, string> {
  if (!origemPermitida(origem)) return {};
  return {
    'Access-Control-Allow-Origin': origem as string,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    Vary: 'Origin',
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const cabecalhos = cors(request.headers.get('Origin'));

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cabecalhos });
    }

    if (request.method === 'GET' && url.pathname === '/sala/saude') {
      return new Response('ok', { headers: cabecalhos });
    }

    if (request.method === 'POST' && url.pathname === '/sala/token') {
      return rotaToken(request, env, cabecalhos);
    }

    const m = /^\/sala\/([^/]+)\/ws$/.exec(url.pathname);
    if (request.method === 'GET' && m) {
      if (request.headers.get('Upgrade') !== 'websocket') {
        return new Response('esperava WebSocket', { status: 426, headers: cabecalhos });
      }
      // o navegador não aplica CORS a WebSocket: quem manda Origin precisa estar na lista
      const origem = request.headers.get('Origin');
      if (origem && !origemPermitida(origem)) {
        return new Response('origem não permitida', { status: 403 });
      }
      const id = decodeURIComponent(m[1] as string);
      return env.SALA.get(env.SALA.idFromName(id)).fetch(request);
    }

    return new Response('não encontrado', { status: 404, headers: cabecalhos });
  },
} satisfies ExportedHandler<Env>;

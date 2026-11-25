import { ErroDiscord, filtrarGuildasInstaladas, lerGuildas, lerUsuario, trocarCodigo } from './discord.ts';
import { origemPermitida } from './retransmitir.ts';
import { assinarSessao, podeMestrar, venceEm, verificarSessao, type Sessao } from './sessao.ts';

export { Sala } from './sala.ts';
export { Diretorio } from './diretorio.ts';

interface Env {
  SALA: DurableObjectNamespace;
  DIRETORIO: DurableObjectNamespace;
  DISCORD_CLIENT_ID: string;
  DISCORD_CLIENT_SECRET: string;
  MESTRES_DISCORD_IDS: string;
  SEGREDO_SESSAO: string;
}

/** `redirect_uri` aceitos no fluxo web (o da atividade do Discord não leva `redirect_uri`). */
const REDIRECTS_PERMITIDOS = ['https://ilvro.github.io/Mesa-VTT/', 'http://127.0.0.1:5100/Mesa/'];

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
    const pode = podeMestrar(u.discordId, env.MESTRES_DISCORD_IDS);
    const sessao = await assinarSessao(
      { ...u, podeMestrar: pode, ...(pode ? { discordToken: accessToken } : {}), exp: venceEm(Date.now()) },
      env.SEGREDO_SESSAO,
    );
    return json(
      { access_token: accessToken, sessao, eu: { discordId: u.discordId, nome: u.nome, avatar: u.avatar, podeMestrar: pode } },
      200,
      cabecalhos,
    );
  } catch (e) {
    if (e instanceof ErroDiscord) return json({ erro: e.message }, 401, cabecalhos);
    return json({ erro: 'falha ao entrar' }, 500, cabecalhos);
  }
}

/** Sessão do cabeçalho `Authorization: Bearer <sessao>`, ou null. */
async function autenticar(request: Request, env: Env): Promise<Sessao | null> {
  const m = /^Bearer (.+)$/.exec(request.headers.get('Authorization') ?? '');
  return m ? verificarSessao(m[1], env.SEGREDO_SESSAO, Date.now()) : null;
}

/** Fala com o Durable Object do diretório em nome de `discordId` (já autenticado). */
function diretorio(env: Env, caminho: string, discordId: string, corpo?: unknown): Promise<Response> {
  const stub = env.DIRETORIO.get(env.DIRETORIO.idFromName('diretorio'));
  return stub.fetch(`https://diretorio${caminho}`, {
    method: corpo === undefined ? 'GET' : 'POST',
    headers: { 'X-Discord-Id': discordId, 'Content-Type': 'application/json' },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
}

async function repassar(r: Response, cabecalhos: Record<string, string>): Promise<Response> {
  return json(await r.json().catch(() => ({})), r.status, cabecalhos);
}

async function rotaNova(request: Request, env: Env, cabecalhos: Record<string, string>): Promise<Response> {
  const sessao = await autenticar(request, env);
  if (!sessao) return json({ erro: 'sessão inválida' }, 401, cabecalhos);
  if (!sessao.podeMestrar) return json({ erro: 'só mestres criam salas' }, 403, cabecalhos);
  const corpo = (await request.json().catch(() => null)) as { nome?: unknown; campanhaId?: unknown } | null;
  const nome = typeof corpo?.nome === 'string' && corpo.nome.trim() ? corpo.nome.trim().slice(0, 80) : 'Nova campanha';
  const campanhaId = typeof corpo?.campanhaId === 'string' ? corpo.campanhaId : undefined;
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const salaId = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  const iniciada = await env.SALA.get(env.SALA.idFromName(salaId)).fetch('https://sala/iniciar', {
    method: 'POST',
    body: JSON.stringify({ dono: sessao.discordId, nome, campanhaId }),
  });
  if (!iniciada.ok) return json({ erro: 'não foi possível criar a sala' }, 500, cabecalhos);
  await diretorio(env, '/registrar', sessao.discordId, { salaId, nome });
  return json({ salaId, nome }, 200, cabecalhos);
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

    if (request.method === 'POST' && url.pathname === '/sala/nova') {
      return rotaNova(request, env, cabecalhos);
    }

    if (request.method === 'GET' && url.pathname === '/sala/servidores') {
      const sessao = await autenticar(request, env);
      if (!sessao) return json({ erro: 'sessão inválida' }, 401, cabecalhos);
      if (!sessao.podeMestrar) return json({ erro: 'só mestres listam servidores' }, 403, cabecalhos);
      if (!sessao.discordToken) return json({ servidores: [], precisaRelogar: true }, 200, cabecalhos);
      try {
        const [guildas, dirResp] = await Promise.all([
          lerGuildas(sessao.discordToken, (u, i) => fetch(u, i)),
          diretorio(env, '/guildas', sessao.discordId),
        ]);
        const dirDados = (await dirResp.json().catch(() => ({}))) as { guildIds?: unknown };
        const vistas = Array.isArray(dirDados.guildIds) ? dirDados.guildIds.filter((x): x is string => typeof x === 'string') : [];
        return json({ servidores: filtrarGuildasInstaladas(guildas, vistas) }, 200, cabecalhos);
      } catch (e) {
        if (e instanceof ErroDiscord) return json({ erro: e.message }, 401, cabecalhos);
        return json({ erro: 'falha ao listar servidores' }, 500, cabecalhos);
      }
    }

    if (url.pathname.startsWith('/sala/diretorio/') || url.pathname === '/sala/minhas' || url.pathname === '/sala/remover') {
      const sessao = await autenticar(request, env);
      if (!sessao) return json({ erro: 'sessão inválida' }, 401, cabecalhos);
      if (request.method === 'POST' && url.pathname === '/sala/remover') {
        const corpo = (await request.json().catch(() => null)) as { salaId?: unknown } | null;
        if (!corpo || typeof corpo.salaId !== 'string' || !corpo.salaId) return json({ erro: 'faltou salaId' }, 400, cabecalhos);
        const r = await diretorio(env, '/remover', sessao.discordId, { salaId: corpo.salaId });
        if (r.ok) {
          await env.SALA.get(env.SALA.idFromName(corpo.salaId)).fetch('https://sala/encerrar', { method: 'POST' });
        }
        return repassar(r, cabecalhos);
      }
      if (request.method === 'POST' && url.pathname === '/sala/diretorio/ligar') {
        const corpo = (await request.json().catch(() => null)) as { guildId?: unknown; salaId?: unknown } | null;
        if (!corpo || typeof corpo.guildId !== 'string' || typeof corpo.salaId !== 'string') return json({ erro: 'faltou guildId ou salaId' }, 400, cabecalhos);
        return repassar(await diretorio(env, '/ligar', sessao.discordId, { guildId: corpo.guildId, salaId: corpo.salaId }), cabecalhos);
      }
      const g = /^\/sala\/diretorio\/([^/]+)$/.exec(url.pathname);
      if (request.method === 'GET' && g) {
        return repassar(await diretorio(env, `/guild/${g[1]}`, sessao.discordId), cabecalhos);
      }
      if (request.method === 'GET' && url.pathname === '/sala/minhas') {
        return repassar(await diretorio(env, '/minhas', sessao.discordId), cabecalhos);
      }
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

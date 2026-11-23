import { origemPermitida } from './retransmitir.ts';

export { Sala } from './sala.ts';

interface Env {
  SALA: DurableObjectNamespace;
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

    const m = /^\/sala\/([^/]+)\/ws$/.exec(url.pathname);
    if (request.method === 'GET' && m) {
      if (request.headers.get('Upgrade') !== 'websocket') {
        return new Response('esperava WebSocket', { status: 426, headers: cabecalhos });
      }
      const id = decodeURIComponent(m[1] as string);
      return env.SALA.get(env.SALA.idFromName(id)).fetch(request);
    }

    return new Response('não encontrado', { status: 404, headers: cabecalhos });
  },
} satisfies ExportedHandler<Env>;

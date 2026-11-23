/**
 * Durable Object `Diretorio` (`idFromName('diretorio')`): traduz HTTP para o `registro.ts`. Quem autentica é o
 * Worker (`index.ts`), que manda o `discordId` já verificado em `X-Discord-Id`; este objeto não é alcançável de fora.
 */

import { criarDiretorio, type RegistroDiretorio } from './registro.ts';

const resposta = (corpo: unknown, status = 200): Response =>
  new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });

export class Diretorio implements DurableObject {
  private dir: RegistroDiretorio;

  constructor(ctx: DurableObjectState) {
    this.dir = criarDiretorio(ctx.storage.sql);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const discordId = request.headers.get('X-Discord-Id') ?? '';
    let corpo: Record<string, unknown> = {};
    if (request.method === 'POST') {
      try {
        corpo = (await request.json()) as Record<string, unknown>;
      } catch {
        return resposta({ erro: 'corpo inválido' }, 400);
      }
    }
    if (request.method === 'POST' && url.pathname === '/registrar') {
      if (typeof corpo.salaId !== 'string' || typeof corpo.nome !== 'string' || !discordId) return resposta({ erro: 'pedido inválido' }, 400);
      this.dir.registrarSala(corpo.salaId, discordId, corpo.nome, Date.now());
      return resposta({ ok: true });
    }
    if (request.method === 'POST' && url.pathname === '/ligar') {
      if (typeof corpo.guildId !== 'string' || !corpo.guildId || typeof corpo.salaId !== 'string' || !discordId) return resposta({ erro: 'pedido inválido' }, 400);
      const r = this.dir.ligar(corpo.guildId, corpo.salaId, discordId);
      if (r === 'desconhecida') return resposta({ erro: 'sala desconhecida' }, 404);
      if (r === 'nao-dono') return resposta({ erro: 'só o dono da sala pode ligá-la' }, 403);
      return resposta({ ok: true });
    }
    const g = /^\/guild\/([^/]+)$/.exec(url.pathname);
    if (request.method === 'GET' && g) {
      const salaId = this.dir.consultar(decodeURIComponent(g[1] as string));
      return salaId === null ? resposta({ erro: 'nenhuma sala ligada' }, 404) : resposta({ salaId });
    }
    if (request.method === 'GET' && url.pathname === '/minhas') {
      return resposta({ salas: this.dir.salasDoMestre(discordId) });
    }
    return resposta({ erro: 'não encontrado' }, 404);
  }
}

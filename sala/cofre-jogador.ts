/**
 * Durable Object `CofreJogador` (`idFromName('cofre:<discordId>')`): traduz HTTP para o `cofre.ts`. Quem autentica é o Worker
 * (`index.ts`); este objeto não é alcançável de fora.
 */
import { criarCofre, idDeFichaValido, type Cofre } from './cofre.ts';

const resposta = (corpo: unknown, status = 200): Response =>
  new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });

export class CofreJogador implements DurableObject {
  private cofre: Cofre;

  constructor(ctx: DurableObjectState) {
    this.cofre = criarCofre(ctx.storage.sql);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/fichas') {
      const fichas = this.cofre.listar().flatMap(f => {
        try { return [{ id: f.id, atualizadaEm: f.atualizadaEm, ficha: JSON.parse(f.json) as unknown }]; } catch { return []; }
      });
      return resposta({ fichas });
    }
    const m = /^\/fichas\/([^/]+)$/.exec(url.pathname);
    const id = m ? decodeURIComponent(m[1] as string) : '';
    if (!m || !idDeFichaValido(id)) return resposta({ erro: 'não encontrado' }, 404);
    if (request.method === 'PUT') {
      const r = this.cofre.salvar(id, await request.text(), Date.now());
      if (r === 'invalida') return resposta({ erro: 'ficha inválida' }, 400);
      if (r === 'grande') return resposta({ erro: 'ficha grande demais' }, 413);
      if (r === 'cheio') return resposta({ erro: 'cofre cheio' }, 409);
      return resposta({ ok: true });
    }
    if (request.method === 'DELETE') {
      this.cofre.remover(id);
      return resposta({ ok: true });
    }
    return resposta({ erro: 'método não permitido' }, 405);
  }
}

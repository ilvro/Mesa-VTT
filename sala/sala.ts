import { lerOla, type Eu } from '../src/online/protocolo.ts';
import { criarEstado, type Estado } from './estado.ts';
import { bemVindo, blobsParaQuemChega, eventosParaQuemChega, papelNaSala, saidaMembros, tratar, tratarBinario, type Destino, type Saida } from './mensagens.ts';
import { criarLimitador } from './permissoes.ts';
import { verificarSessao } from './sessao.ts';

/** Anexo de cada conexão: nulo até o `ola` válido, depois quem ela é (com o papel efetivo nesta sala). */
export type Anexo = Eu | null;

interface Env {
  SEGREDO_SESSAO: string;
}

function anexoDe(ws: WebSocket): Anexo {
  return (ws.deserializeAttachment() as Anexo | undefined) ?? null;
}

export class Sala implements DurableObject {
  private ctx: DurableObjectState;
  private env: Env;
  private estado: Estado;
  private limitador = criarLimitador(60, 1000);

  constructor(ctx: DurableObjectState, env: Env) {
    this.ctx = ctx;
    this.env = env;
    this.estado = criarEstado(ctx.storage.sql);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    // chamada interna do Worker (`POST /sala/nova`): grava o dono e o nome da sala nova, uma vez só
    if (request.method === 'POST' && url.pathname === '/iniciar') {
      const c = (await request.json().catch(() => null)) as { dono?: unknown; nome?: unknown; campanhaId?: unknown } | null;
      if (!c || typeof c.dono !== 'string' || !c.dono || typeof c.nome !== 'string') return new Response('pedido inválido', { status: 400 });
      const ok = this.estado.iniciar(c.dono, c.nome, typeof c.campanhaId === 'string' ? c.campanhaId : undefined);
      return new Response(null, { status: ok ? 204 : 409 });
    }
    if (request.method === 'POST' && url.pathname === '/encerrar') {
      for (const c of this.ctx.getWebSockets()) {
        try { c.close(4004, 'sala encerrada'); } catch { /* já fechada */ }
      }
      await this.ctx.storage.deleteAll();
      return new Response(null, { status: 204 });
    }
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('esperava WebSocket', { status: 426 });
    }
    const par = new WebSocketPair();
    const cliente = par[0];
    const servidor = par[1];
    this.ctx.acceptWebSocket(servidor);
    return new Response(null, { status: 101, webSocket: cliente });
  }

  private conectados(menos?: WebSocket): Eu[] {
    const eus: Eu[] = [];
    for (const c of this.ctx.getWebSockets()) {
      if (c === menos) continue;
      const a = anexoDe(c);
      if (a) eus.push(a);
    }
    return eus;
  }

  private entregar(saidas: Saida[], origem: WebSocket): void {
    const quer = (d: Destino, c: WebSocket, a: Eu): boolean => {
      if (d === 'todos') return true;
      if (d === 'remetente') return c === origem;
      if (d === 'outros') return c !== origem;
      if ('para' in d) return a.discordId === d.para;
      return a.papel === 'mestre' || a.discordId === d.ficha;
    };
    for (const s of saidas) {
      const texto = JSON.stringify(s.msg);
      for (const c of this.ctx.getWebSockets()) {
        const a = anexoDe(c);
        if (!a || !quer(s.destino, c, a)) continue;
        try {
          c.send(texto);
          for (const q of s.quadros ?? []) c.send(q);
        } catch {
          // conexão já fechada: o runtime a remove
        }
      }
    }
  }

  async webSocketMessage(ws: WebSocket, mensagem: string | ArrayBuffer): Promise<void> {
    const eu = anexoDe(ws);
    if (eu) {
      const veredito = this.limitador.tentar(ws, Date.now());
      if (veredito !== 'ok') {
        if (veredito === 'avisar') ws.send(JSON.stringify({ tipo: 'erro', motivo: 'limite' }));
        return;
      }
      if (typeof mensagem !== 'string') {
        const r = tratarBinario(this.estado, eu, mensagem);
        this.entregar(r.saidas, ws);
        if (r.repassar) {
          for (const c of this.ctx.getWebSockets()) {
            if (c !== ws && anexoDe(c)) {
              try { c.send(mensagem); } catch { /* conexão já fechada: o runtime a remove */ }
            }
          }
        }
        return;
      }
      this.entregar(tratar(this.estado, eu, mensagem, Date.now(), this.conectados()), ws);
      return;
    }
    // ainda não identificada: a primeira mensagem precisa ser um `ola` válido
    const token = typeof mensagem === 'string' ? lerOla(mensagem) : null;
    const sessao = token ? await verificarSessao(token, this.env.SEGREDO_SESSAO, Date.now()) : null;
    if (!sessao) {
      ws.close(4001, 'sessão inválida');
      return;
    }
    const config = this.estado.config();
    if (config.dono === undefined) {
      ws.close(4004, 'sala inexistente');
      return;
    }
    const novo: Eu = { discordId: sessao.discordId, nome: sessao.nome, papel: papelNaSala(sessao.discordId, config.dono), avatar: sessao.avatar };
    ws.serializeAttachment(novo satisfies Anexo);
    const todos = this.conectados();
    ws.send(JSON.stringify(bemVindo(this.estado, novo, todos, Date.now())));
    // quem chega depois não viu os blobs que o mestre mandou: manda os citados nos últimos `canal` (o mestre já os tem)
    if (novo.papel !== 'mestre') {
      for (const b of blobsParaQuemChega(this.estado)) {
        ws.send(JSON.stringify(b.anuncio));
        for (const q of b.quadros) ws.send(q);
      }
    }
    // e o último `jukebox.mix`, para o som seguir de onde está (a casca baixa as faixas com `blob.pedir`)
    if (novo.papel !== 'mestre') {
      for (const msg of eventosParaQuemChega(this.estado)) ws.send(JSON.stringify(msg));
    }
    this.entregar([saidaMembros(this.estado, todos)], ws);
  }

  webSocketClose(ws: WebSocket, codigo: number): void {
    // 1005/1006 não podem ser enviados no close
    const ok = codigo >= 1000 && codigo !== 1005 && codigo !== 1006 && codigo < 1016;
    ws.close(ok ? codigo : 1000);
    this.avisarSaida(ws);
  }

  webSocketError(ws: WebSocket): void {
    ws.close(1011);
    this.avisarSaida(ws);
  }

  private avisarSaida(ws: WebSocket): void {
    if (!anexoDe(ws)) return;
    this.entregar([saidaMembros(this.estado, this.conectados(ws))], ws);
  }
}

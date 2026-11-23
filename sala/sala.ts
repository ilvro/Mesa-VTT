import { lerOla, type Eu, type MsgBemVindo } from '../src/online/protocolo.ts';
import { retransmitirIdentificados } from './retransmitir.ts';
import { verificarSessao } from './sessao.ts';

/** Anexo de cada conexão: nulo até o `ola` válido, depois quem ela é. */
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

  constructor(ctx: DurableObjectState, env: Env) {
    this.ctx = ctx;
    this.env = env;
  }

  fetch(request: Request): Response {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('esperava WebSocket', { status: 426 });
    }
    const par = new WebSocketPair();
    const cliente = par[0];
    const servidor = par[1];
    this.ctx.acceptWebSocket(servidor);
    return new Response(null, { status: 101, webSocket: cliente });
  }

  async webSocketMessage(ws: WebSocket, mensagem: string | ArrayBuffer): Promise<void> {
    if (anexoDe(ws)) {
      if (typeof mensagem !== 'string') return;
      retransmitirIdentificados(this.ctx.getWebSockets(), ws, mensagem, (c) => anexoDe(c) !== null);
      return;
    }
    // ainda não identificada: a primeira mensagem precisa ser um `ola` válido
    const token = typeof mensagem === 'string' ? lerOla(mensagem) : null;
    const sessao = token ? await verificarSessao(token, this.env.SEGREDO_SESSAO, Date.now()) : null;
    if (!sessao) {
      ws.close(4001, 'sessão inválida');
      return;
    }
    const eu: Eu = { discordId: sessao.discordId, nome: sessao.nome, papel: sessao.papel };
    ws.serializeAttachment(eu satisfies Anexo);
    ws.send(JSON.stringify({ tipo: 'bem-vindo', eu, membros: [], fichas: [], ultimoEstado: {} } satisfies MsgBemVindo));
  }

  webSocketClose(ws: WebSocket, codigo: number): void {
    // 1005/1006 não podem ser enviados no close
    const ok = codigo >= 1000 && codigo !== 1005 && codigo !== 1006 && codigo < 1016;
    ws.close(ok ? codigo : 1000);
  }

  webSocketError(ws: WebSocket): void {
    ws.close(1011);
  }
}

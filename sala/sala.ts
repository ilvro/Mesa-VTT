import { retransmitir } from './retransmitir.ts';

/** Anexo de cada conexão (preenchido na R2: { discordId, papel }). */
export type Anexo = Record<string, never>;

export class Sala implements DurableObject {
  private ctx: DurableObjectState;

  constructor(ctx: DurableObjectState, _env: unknown) {
    this.ctx = ctx;
  }

  fetch(request: Request): Response {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('esperava WebSocket', { status: 426 });
    }
    const par = new WebSocketPair();
    const cliente = par[0];
    const servidor = par[1];
    this.ctx.acceptWebSocket(servidor);
    servidor.serializeAttachment({} satisfies Anexo);
    return new Response(null, { status: 101, webSocket: cliente });
  }

  webSocketMessage(ws: WebSocket, mensagem: string | ArrayBuffer): void {
    if (typeof mensagem !== 'string') return;
    retransmitir(this.ctx.getWebSockets(), ws, mensagem);
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

/** Cliente da sala (mesa online): igual para a Mesa do mestre e para a casca do jogador. Sem dependências de interface. */
import {
  TAMANHO_PEDACO, codificarPedaco, decodificarPedaco, lerMensagemDaSala,
  type MensagemDaSala, type MensagemParaSala,
} from './protocolo.ts';

export type EstadoDaSala = 'conectando' | 'aberta' | 'caiu';

/** O pedaço do `WebSocket` que o cliente usa; permite injetar um falso nos testes. */
export interface WebSocketLike {
  readyState: number;
  binaryType: string;
  onopen: ((e: unknown) => void) | null;
  onmessage: ((e: { data: unknown }) => void) | null;
  onclose: ((e: { code?: number }) => void) | null;
  onerror: ((e: unknown) => void) | null;
  send(dados: string | ArrayBuffer): void;
  close(codigo?: number, motivo?: string): void;
}
export type WebSocketCtor = new (url: string) => WebSocketLike;

export interface OpcoesDoCliente {
  url: string;
  sessao: string;
  /** Padrão: o `WebSocket` global. */
  WebSocket?: WebSocketCtor;
  /** Agenda uma espera e devolve o cancelamento. Padrão: `setTimeout`. Para testes. */
  agendar?: (f: () => void, ms: number) => () => void;
}

type Tipo = MensagemDaSala['tipo'];
type Da<T extends Tipo> = Extract<MensagemDaSala, { tipo: T }>;

export interface ClienteDaSala {
  readonly estado: EstadoDaSala;
  /** `false` se a sala não está aberta (a mensagem é descartada). */
  enviar(msg: MensagemParaSala): boolean;
  ouvir<T extends Tipo>(tipo: T, f: (msg: Da<T>) => void): () => void;
  aoMudarEstado(f: (estado: EstadoDaSala) => void): () => void;
  /** Anuncia o blob e o envia em quadros binários de 512 KB. `false` se a sala não está aberta. */
  enviarBlob(id: string, blob: Blob): Promise<boolean>;
  /** Recebe blobs remontados. */
  ouvirBlob(f: (id: string, blob: Blob) => void): () => void;
  fechar(): void;
}

export const ESPERA_INICIAL_MS = 1000;
export const ESPERA_MAXIMA_MS = 30_000;
const ABERTO = 1;
/** A sala fecha com 4001 se a sessão é inválida; reconectar não adianta. */
const FECHAMENTO_SESSAO_INVALIDA = 4001;

export function conectarSala(opcoes: OpcoesDoCliente): ClienteDaSala {
  const Ctor = opcoes.WebSocket ?? (globalThis.WebSocket as unknown as WebSocketCtor);
  const agendar = opcoes.agendar ?? ((f, ms) => { const t = setTimeout(f, ms); return () => clearTimeout(t); });
  const ouvintes = new Map<string, Set<(m: never) => void>>();
  const ouvintesEstado = new Set<(e: EstadoDaSala) => void>();
  const ouvintesBlob = new Set<(id: string, b: Blob) => void>();
  const montando = new Map<string, { tipo: string; n: number; partes: Array<Uint8Array | undefined>; recebidos: number }>();

  let estado: EstadoDaSala = 'conectando';
  let ws: WebSocketLike | null = null;
  let espera = ESPERA_INICIAL_MS;
  let cancelarEspera: (() => void) | null = null;
  let encerrado = false;

  const mudar = (e: EstadoDaSala) => {
    if (estado === e) return;
    estado = e;
    for (const f of [...ouvintesEstado]) f(e);
  };

  function emitir(m: MensagemDaSala): void {
    for (const f of [...(ouvintes.get(m.tipo) ?? [])]) (f as (m: MensagemDaSala) => void)(m);
  }

  function remontar(quadro: ArrayBuffer): void {
    const p = decodificarPedaco(quadro);
    if (!p) return;
    const { cab, dados } = p;
    let a = montando.get(cab.id);
    if (!a || a.n !== cab.n) { a = { tipo: cab.tipo, n: cab.n, partes: new Array(cab.n), recebidos: 0 }; montando.set(cab.id, a); }
    if (!a.partes[cab.i]) { a.partes[cab.i] = dados; a.recebidos++; }
    if (a.recebidos < a.n) return;
    montando.delete(cab.id);
    const blob = new Blob(a.partes as BlobPart[], { type: a.tipo });
    for (const f of [...ouvintesBlob]) f(cab.id, blob);
  }

  function conectar(): void {
    mudar('conectando');
    const socket = new Ctor(opcoes.url);
    ws = socket;
    socket.binaryType = 'arraybuffer';
    socket.onopen = () => {
      if (ws !== socket) return;
      socket.send(JSON.stringify({ tipo: 'ola', sessao: opcoes.sessao } satisfies MensagemParaSala));
    };
    socket.onmessage = ({ data }) => {
      if (ws !== socket) return;
      if (typeof data === 'string') {
        const m = lerMensagemDaSala(data);
        if (!m) return;
        if (m.tipo === 'bem-vindo') { espera = ESPERA_INICIAL_MS; mudar('aberta'); }
        emitir(m);
      } else if (data instanceof ArrayBuffer) remontar(data);
      else if (ArrayBuffer.isView(data)) remontar(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer);
    };
    socket.onerror = () => { /* o `onclose` vem em seguida */ };
    socket.onclose = (e) => {
      if (ws !== socket) return;
      ws = null;
      montando.clear();
      mudar('caiu');
      if (encerrado || e.code === FECHAMENTO_SESSAO_INVALIDA) return;
      const ms = espera;
      espera = Math.min(espera * 2, ESPERA_MAXIMA_MS);
      cancelarEspera = agendar(() => { cancelarEspera = null; if (!encerrado) conectar(); }, ms);
    };
  }

  conectar();

  return {
    get estado() { return estado; },
    enviar(msg) {
      if (estado !== 'aberta' || !ws || ws.readyState !== ABERTO) return false;
      ws.send(JSON.stringify(msg));
      return true;
    },
    ouvir(tipo, f) {
      const g = ouvintes.get(tipo) ?? new Set(); g.add(f as (m: never) => void); ouvintes.set(tipo, g);
      return () => { g.delete(f as (m: never) => void); };
    },
    aoMudarEstado(f) { ouvintesEstado.add(f); return () => { ouvintesEstado.delete(f); }; },
    async enviarBlob(id, blob) {
      const socket = ws;
      if (estado !== 'aberta' || !socket) return false;
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const n = Math.max(1, Math.ceil(bytes.length / TAMANHO_PEDACO));
      const tipo = blob.type;
      socket.send(JSON.stringify({ tipo: 'blob', id, tipoMime: tipo } satisfies MensagemParaSala));
      for (let i = 0; i < n; i++) {
        if (ws !== socket || socket.readyState !== ABERTO) return false;
        socket.send(codificarPedaco({ id, i, n, tipo }, bytes.subarray(i * TAMANHO_PEDACO, (i + 1) * TAMANHO_PEDACO)));
      }
      return true;
    },
    ouvirBlob(f) { ouvintesBlob.add(f); return () => { ouvintesBlob.delete(f); }; },
    fechar() {
      encerrado = true;
      cancelarEspera?.();
      const socket = ws;
      ws = null;
      if (socket) { try { socket.close(1000); } catch { /* já fechado */ } }
      mudar('caiu');
    },
  };
}

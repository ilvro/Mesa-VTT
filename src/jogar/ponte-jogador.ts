/**
 * Ponte do jogador: traz da sala (Cloudflare) para o `BroadcastChannel` local o que o mestre projeta, e leva à sala os eventos permitidos.
 * Plano: `Atlas/docs/plano/mesa-online.md` (R7, decisões 5 e 8). O cliente da sala e o `BroadcastChannel` entram por parâmetro, para os testes.
 *
 * Os canais locais têm o prefixo da sala (`sala:<id>:…`) e nunca são os do mestre (`atlas:projetor:*`, `mesa:eventos`): abrir o link do
 * jogador no navegador do mestre não cria eco nem mistura eventos que não passaram pela sala. `abrir` recusa qualquer nome fora do prefixo.
 */
import type { ClienteDaSala } from '../online/cliente.ts';
import { descomprimirEstado } from '../online/estado-comprimido.ts';
import type { Envelope } from '../online/protocolo.ts';

/** Os eventos que o jogador pode mandar à sala (a sala confere de novo e carimba o autor). */
export const EVENTOS_DO_JOGADOR: readonly string[] = ['ficha.rolagem', 'ficha.recursos', 'atlas.mover-peca'];
/** Quanto a ponte espera um blob que ainda não chegou antes de descartar a mensagem que o cita. */
export const PRAZO_DO_BLOB_MS = 15_000;

export const canalProjetorDaSala = (salaId: string): string => `sala:${salaId}:atlas:projetor`;
export const canalEventosDaSala = (salaId: string): string => `sala:${salaId}:mesa:eventos`;

/** O pedaço do `BroadcastChannel` que a ponte usa. */
export interface CanalLocal {
  postMessage(msg: unknown): void;
  onmessage: ((e: { data: unknown }) => void) | null;
  close(): void;
}

export interface OpcoesDaPonteDoJogador {
  cliente: ClienteDaSala;
  salaId: string;
  criarCanal: (nome: string) => CanalLocal;
  /** Agenda uma espera e devolve o cancelamento (padrão: `setTimeout`). Para testes. */
  agendar?: (f: () => void, ms: number) => () => void;
  prazoDoBlobMs?: number;
  /** A primeira vez que um `estado` foi entregue ao projetor local (a sala já tem mapa). */
  aoTerMapa?: () => void;
  aviso?: (texto: string) => void;
}

export interface PonteDoJogador {
  /** Já chegou algum `estado` do mestre? */
  readonly temMapa: boolean;
  /** Resolve quando tudo o que estava na fila de entrada foi tratado. */
  esvaziar(): Promise<void>;
  fechar(): void;
}

type Obj = Record<string, unknown>;
const ehObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const ehRefDeBlob = (v: unknown): v is { blobId: string } => ehObj(v) && typeof v.blobId === 'string' && Object.keys(v).length === 1;

/** O evento local pode ir à sala? Tipo permitido a jogador e sem `autor` (o que tem `autor` veio da sala). */
export function eventoPodeSair(e: unknown): e is Envelope {
  if (!ehObj(e) || typeof e.tipo !== 'string' || typeof e.id !== 'string') return false;
  return EVENTOS_DO_JOGADOR.includes(e.tipo) && !('autor' in e);
}

export function criarPonteDoJogador(o: OpcoesDaPonteDoJogador): PonteDoJogador {
  const { cliente, salaId } = o;
  const prefixo = `sala:${salaId}:`;
  const avisar = o.aviso ?? ((t: string) => { console.warn(t); });
  const agendar = o.agendar ?? ((f, ms) => { const t = setTimeout(f, ms); return () => clearTimeout(t); });
  const prazo = o.prazoDoBlobMs ?? PRAZO_DO_BLOB_MS;
  const abrir = (nome: string): CanalLocal => {
    if (!nome.startsWith(prefixo)) throw new Error(`canal fora da sala: ${nome}`);
    return o.criarCanal(nome);
  };
  const projetor = abrir(canalProjetorDaSala(salaId));
  const eventos = abrir(canalEventosDaSala(salaId));

  const blobs = new Map<string, Blob>();
  const esperando = new Map<string, Set<(b: Blob | null) => void>>();
  let fechada = false, temMapa = false;
  let ultimoEstado: unknown = null, ultimaCamera: unknown = null;

  /** O blob `id`: o que já chegou, ou o que chegar em até `prazo` ms; `null` depois disso. */
  function blob(id: string): Promise<Blob | null> {
    const ja = blobs.get(id);
    if (ja) return Promise.resolve(ja);
    return new Promise(resolver => {
      let cancelar: () => void = () => {};
      const fila = esperando.get(id) ?? new Set();
      esperando.set(id, fila);
      const f = (b: Blob | null) => { cancelar(); fila.delete(f); if (!fila.size) esperando.delete(id); resolver(b); };
      fila.add(f);
      cancelar = agendar(() => { avisar(`Sala: o blob ${id} não chegou em ${prazo / 1000} s; a mensagem foi descartada.`); f(null); }, prazo);
    });
  }

  /** A mensagem do `canal` pronta para o projetor: `{ blobId }` trocado pelo `Blob` e o `estado` comprimido descomprimido; `null` se não deu. */
  async function remontar(msg: unknown): Promise<unknown> {
    if (!ehObj(msg)) return null;
    if (msg.tipo === 'estado' && msg.comprimido === true && typeof msg.blobId === 'string') {
      const b = await blob(msg.blobId);
      if (!b) return null;
      blobs.delete(msg.blobId);
      try { return await descomprimirEstado(b); } catch { avisar(`Sala: o estado ${msg.blobId} não pôde ser descomprimido.`); return null; }
    }
    const saida: Obj = { ...msg };
    for (const [campo, v] of Object.entries(msg)) {
      if (!ehRefDeBlob(v)) continue;
      const b = await blob(v.blobId);
      if (!b) return null;
      saida[campo] = b;
    }
    return saida;
  }

  /** Um de cada vez, na ordem em que chegaram: uma mensagem que espera um blob segura as seguintes (a ordem importa: `estado` antes de `camera`). */
  let fila: Promise<void> = Promise.resolve();
  async function entregar(msg: unknown): Promise<void> {
    const pronta = await remontar(msg);
    if (!pronta || fechada) return;
    const tipo = (pronta as Obj).tipo;
    if (tipo === 'estado') { ultimoEstado = pronta; if (!temMapa) { temMapa = true; o.aoTerMapa?.(); } }
    else if (tipo === 'camera') ultimaCamera = pronta;
    projetor.postMessage(pronta);
  }
  const enfileirar = (msg: unknown): void => { fila = fila.then(() => entregar(msg)).catch(() => { /* uma mensagem ruim não para a fila */ }); };

  // O projetor local fala `ola` enquanto não tem mapa; o `BroadcastChannel` não guarda mensagens, então a ponte reenvia o último estado e a câmera.
  // Nenhuma `MensagemDoProjetor` sai para a sala.
  projetor.onmessage = ({ data }) => {
    if (!ehObj(data) || data.tipo !== 'ola') return;
    if (ultimoEstado) projetor.postMessage(ultimoEstado);
    if (ultimaCamera) projetor.postMessage(ultimaCamera);
  };

  eventos.onmessage = ({ data }) => { if (eventoPodeSair(data)) cliente.enviar({ tipo: 'evento', envelope: data }); };

  const soltar = [
    cliente.ouvir('canal', m => { if (m.nome.startsWith('atlas:projetor:')) enfileirar(m.msg); }),
    cliente.ouvir('evento', m => { if (!fechada) eventos.postMessage(m.envelope); }),
    cliente.ouvir('bem-vindo', m => { for (const [nome, msg] of Object.entries(m.ultimoEstado ?? {})) if (nome.startsWith('atlas:projetor:')) enfileirar(msg); }),
    cliente.ouvirBlob((id, b) => {
      blobs.set(id, b);
      for (const f of [...(esperando.get(id) ?? [])]) f(b);
    }),
  ];

  return {
    get temMapa() { return temMapa; },
    esvaziar: async () => { let atual; do { atual = fila; await atual; } while (atual !== fila); },
    fechar() {
      fechada = true;
      for (const f of soltar) f();
      for (const fs of [...esperando.values()]) for (const f of [...fs]) f(null);
      projetor.onmessage = null; eventos.onmessage = null;
      projetor.close(); eventos.close();
    },
  };
}

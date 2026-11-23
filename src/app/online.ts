/**
 * Ponte do mestre: leva à sala (Cloudflare) o que o Atlas projeta e os eventos permitidos, e traz os pedidos dos jogadores.
 * Plano: `Atlas/docs/plano/mesa-online.md` (R5). O cliente da sala e o `BroadcastChannel` entram por parâmetro, para os testes.
 */
import { signal } from '@preact/signals';
import { conectarSala, type ClienteDaSala, type EstadoDaSala } from '../online/cliente.ts';
import { urlDoWebSocket } from '../online/config.ts';
import { EVENTOS_DO_MESTRE, type Envelope, type Membro } from '../online/protocolo.ts';
import { LIMITE_ESTADO_BYTES, blobIdDoEstado, comprimirEstado, type EstadoComprimidoRef } from '../online/estado-comprimido.ts';
import { CANAL_EVENTOS } from '#mesa';

/** No máximo isto de mensagens de gesto (`emGesto`, `peca-gesto`) por segundo; a última sempre sai. */
export const GESTOS_POR_SEGUNDO = 15;
const INTERVALO_GESTO_MS = Math.ceil(1000 / GESTOS_POR_SEGUNDO);
/** Quanto a ponte espera a resposta do `blob.tem` antes de subir o blob assim mesmo. */
const ESPERA_BLOB_TEM_MS = 5000;

/** O canal do destino remoto do publicador do Atlas (R5b): a projeção remota, só o que os jogadores já viram. */
export const CANAL_PROJETOR_REMOTO = 'atlas:projetor:remoto';
/** A confirmação "mandar assim mesmo" de um mapa sem névoa, lembrada por mapa. */
export const chaveSemNevoa = (mapa: string): string => `mesa:online-sem-nevoa:${mapa}`;

/** O pedaço do `BroadcastChannel` que a ponte usa. */
export interface CanalLocal {
  postMessage(msg: unknown): void;
  onmessage: ((e: { data: unknown }) => void) | null;
  close(): void;
}

/** As mensagens do mestre ao projetor (`MensagemDoMestre` do Atlas). As do projetor (`ola`, `tamanho`, `soltou`, `tchau`) não saem. */
const TIPOS_DO_MESTRE = new Set([
  'estado', 'peca-gesto', 'camera', 'evento', 'relampago', 'retrato', 'tela', 'letreiro', 'letreiro-fim',
  'recursos', 'inspecao', 'inspecao-estado', 'inspecao-fim', 'rolagem',
]);

export interface OpcoesDaPonte {
  cliente: ClienteDaSala;
  criarCanal: (nome: string) => CanalLocal;
  /** Nome da sala, quando já se sabe (o `bem-vindo` traz o definitivo). */
  nomeDaSala?: string;
  /** O mestre já confirmou mandar este mapa sem névoa? (padrão: `localStorage`, com `try/catch`). */
  semNevoaConfirmado?: (mapa: string) => boolean;
  /** Guarda a confirmação (padrão: `localStorage`). */
  lembrarSemNevoa?: (mapa: string) => void;
  /** Relógio em ms (padrão: `Date.now`). Para testes do limite de gestos. */
  agora?: () => number;
  /** Agenda uma espera e devolve o cancelamento (padrão: `setTimeout`). Para testes. */
  agendar?: (f: () => void, ms: number) => () => void;
  /** SHA-256 em hex (padrão: Web Crypto). */
  hash?: (bytes: ArrayBuffer) => Promise<string>;
  aoMudar?: (estado: EstadoDaPonte) => void;
}

export interface EstadoDaPonte {
  membros: Membro[];
  /** Mapas sem névoa à espera da confirmação do mestre: o `estado` deles não sai até lá. */
  semNevoa: { mapa: string; nome: string }[];
  /** Há jogador na sala e a ponte pediu ao publicador do Atlas que trabalhe. */
  publicando: boolean;
}

export interface Ponte {
  readonly estado: EstadoDaPonte;
  /** Resolve quando tudo o que estava na fila de saída foi tratado. */
  esvaziar(): Promise<void>;
  /** "Mandar assim mesmo": libera (e lembra) o mapa sem névoa. */
  confirmarSemNevoa(mapa: string): void;
  fechar(): void;
}

export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(h, b => b.toString(16).padStart(2, '0')).join('');
}

const ehBlob = (v: unknown): v is Blob => typeof Blob !== 'undefined' && v instanceof Blob;

const lerConfirmacao = (mapa: string): boolean => { try { return localStorage.getItem(chaveSemNevoa(mapa)) === '1'; } catch { return false; } };
const gravarConfirmacao = (mapa: string): void => { try { localStorage.setItem(chaveSemNevoa(mapa), '1'); } catch { /* sem armazenamento: pergunta de novo */ } };

export function criarPonte(o: OpcoesDaPonte): Ponte {
  const { cliente } = o;
  const projetor = o.criarCanal(CANAL_PROJETOR_REMOTO);
  const confirmado = o.semNevoaConfirmado ?? lerConfirmacao, lembrar = o.lembrarSemNevoa ?? gravarConfirmacao;
  const eventos = o.criarCanal(CANAL_EVENTOS);
  const hash = o.hash ?? sha256Hex;
  const agora = o.agora ?? Date.now;
  const agendar = o.agendar ?? ((f, ms) => { const t = setTimeout(f, ms); return () => clearTimeout(t); });
  let nome = o.nomeDaSala;
  /** Mapas sem névoa à espera, com o último `estado` retido de cada um. */
  const pendentes = new Map<string, { nome: string; retido: Record<string, unknown> | null }>();
  const enviados = new Set<string>();
  let fila: Promise<void> = Promise.resolve();
  let fechada = false;
  const estado: EstadoDaPonte = { membros: [], semNevoa: [], publicando: false };

  const mudou = () => { estado.semNevoa = [...pendentes].map(([mapa, p]) => ({ mapa, nome: p.nome })); o.aoMudar?.({ ...estado, membros: [...estado.membros] }); };

  /** Perguntas `blob.tem` em andamento, por id. Sem resposta a tempo, vale "não tem" e o blob sobe. */
  const perguntas = new Map<string, Promise<boolean>>();
  const respostas = new Map<string, (tem: boolean) => void>();
  function salaTem(id: string): Promise<boolean> {
    let p = perguntas.get(id);
    if (p) return p;
    p = new Promise<boolean>(resolver => {
      const cancelar = agendar(() => { respostas.delete(id); resolver(false); }, ESPERA_BLOB_TEM_MS);
      respostas.set(id, tem => { cancelar(); respostas.delete(id); resolver(tem); });
      if (!cliente.enviar({ tipo: 'blob.tem', id })) { cancelar(); respostas.delete(id); resolver(false); }
    }).finally(() => { perguntas.delete(id); });
    perguntas.set(id, p);
    return p;
  }

  /** Sobe o blob (uma vez por conexão da ponte, e só se a sala ainda não o tem) e devolve o `{ blobId }` que o substitui. */
  async function subir(blob: Blob): Promise<{ blobId: string } | null> {
    const id = await hash(await blob.arrayBuffer());
    if (!enviados.has(id)) {
      if (!(await salaTem(id))) { if (!(await cliente.enviarBlob(id, blob))) return null; }
      enviados.add(id);
    }
    return { blobId: id };
  }

  /** O `estado` acima do limite vira um blob gzip `estado:<mapa>:<versao>` e o `canal` leva só a referência. */
  async function comprimirSeGrande(msg: Record<string, unknown>): Promise<Record<string, unknown> | null> {
    if (msg.tipo !== 'estado' || msg.emGesto === true) return msg;
    const doc = msg.doc as { id?: unknown } | undefined;
    if (typeof doc?.id !== 'string' || typeof msg.versao !== 'number') return msg;
    if (JSON.stringify(msg).length <= LIMITE_ESTADO_BYTES) return msg;
    const blobId = blobIdDoEstado(doc.id, msg.versao);
    // o id se repete entre sessões (a versão recomeça): sobe sempre, e a sala troca o conteúdo
    if (!(await cliente.enviarBlob(blobId, await comprimirEstado(msg)))) return null;
    return { tipo: 'estado', blobId, versao: msg.versao, comprimido: true } satisfies EstadoComprimidoRef;
  }

  /** Troca os `Blob` da mensagem por `{ blobId }`; `null` se algum não pôde subir. */
  async function semBlobs(msg: Record<string, unknown>): Promise<Record<string, unknown> | null> {
    const saida: Record<string, unknown> = { ...msg };
    for (const campo of ['blob', 'normal', 'uv']) {
      const v = msg[campo];
      if (!ehBlob(v)) continue;
      if (campo === 'blob' && msg.tipo !== 'retrato') continue;
      if ((campo === 'normal' || campo === 'uv') && msg.tipo !== 'inspecao') continue;
      const r = await subir(v);
      if (!r) return null;
      saida[campo] = r;
    }
    return saida;
  }

  async function sairProjetor(data: unknown): Promise<void> {
    if (fechada || !data || typeof data !== 'object') return;
    const msg = data as Record<string, unknown>;
    if (typeof msg.tipo !== 'string' || !TIPOS_DO_MESTRE.has(msg.tipo)) return;
    if (msg.tipo === 'estado') {
      const doc = msg.doc as { id?: unknown; session?: { explored?: unknown } } | undefined;
      const mapa = typeof doc?.id === 'string' ? doc.id : null;
      const p = mapa ? pendentes.get(mapa) : undefined;
      if (mapa && p) {
        // Com névoa de novo, o estado já vem cortado: não há mais o que confirmar.
        if (doc?.session?.explored !== null && doc?.session?.explored !== undefined) { pendentes.delete(mapa); mudou(); }
        else { p.retido = msg; return; }
      }
    }
    const comBlobs = await semBlobs(msg);
    const pronta = comBlobs && await comprimirSeGrande(comBlobs);
    if (!pronta || fechada) return;
    cliente.enviar({ tipo: 'canal', nome: CANAL_PROJETOR_REMOTO, msg: pronta });
  }

  function aoAviso(msg: Record<string, unknown>): void {
    const mapa = msg.mapa;
    if (typeof mapa !== 'string' || confirmado(mapa) || pendentes.has(mapa)) return;
    pendentes.set(mapa, { nome: typeof msg.nome === 'string' ? msg.nome : mapa, retido: null });
    mudou();
  }

  const enfileirar = (data: unknown): void => { fila = fila.then(() => sairProjetor(data)).catch(() => { /* um quadro perdido não para a fila */ }); };

  /** Gestos (`estado` com `emGesto` e `peca-gesto`): no máximo `GESTOS_POR_SEGUNDO` por chave; o que sobra espera e só o último sai. */
  const gestos = new Map<string, { ultimo: number; pendente: unknown; cancelar: (() => void) | null }>();
  const chaveDoGesto = (m: { tipo?: unknown; emGesto?: unknown; id?: unknown }): string | null =>
    m.tipo === 'estado' && m.emGesto === true ? 'estado' : m.tipo === 'peca-gesto' ? `peca:${String(m.id)}` : null;
  function gesto(chave: string, data: unknown): void {
    const g = gestos.get(chave) ?? { ultimo: -Infinity, pendente: undefined, cancelar: null };
    gestos.set(chave, g);
    const espera = g.ultimo + INTERVALO_GESTO_MS - agora();
    if (espera <= 0 && !g.cancelar) { g.ultimo = agora(); enfileirar(data); return; }
    g.pendente = data; // o mais novo substitui o que esperava
    if (g.cancelar) return;
    g.cancelar = agendar(() => {
      g.cancelar = null;
      const p = g.pendente; g.pendente = undefined;
      if (p === undefined || fechada) return;
      g.ultimo = agora();
      enfileirar(p);
    }, Math.max(espera, 0));
  }
  /** Um `estado` firme (fora de gesto) já traz a posição final: o gesto que esperava perde a vez. */
  function largarGestosPendentes(): void { for (const g of gestos.values()) { g.cancelar?.(); g.cancelar = null; g.pendente = undefined; } }

  projetor.onmessage = ({ data }) => {
    if (data && typeof data === 'object' && (data as { tipo?: unknown }).tipo === 'aviso-sem-nevoa') { if (!fechada) aoAviso(data as Record<string, unknown>); return; }
    const m = data as { tipo?: unknown; emGesto?: unknown; id?: unknown } | null;
    const chave = m && typeof m === 'object' ? chaveDoGesto(m) : null;
    if (chave) { if (!fechada) gesto(chave, data); return; }
    if (m && typeof m === 'object' && m.tipo === 'estado') largarGestosPendentes();
    enfileirar(data);
  };

  eventos.onmessage = ({ data }) => {
    if (fechada || !data || typeof data !== 'object') return;
    const e = data as Envelope & { autor?: unknown };
    if (typeof e.tipo !== 'string' || typeof e.id !== 'string') return;
    if (e.autor !== undefined) return; // veio da sala: não volta para ela
    if (!EVENTOS_DO_MESTRE.includes(e.tipo)) return;
    cliente.enviar({ tipo: 'evento', envelope: e });
  };

  // Volta: os pedidos dos jogadores (com o `autor` carimbado pela sala) chegam ao barramento local.
  const soltar = [
    cliente.ouvir('evento', m => { if (!fechada) eventos.postMessage(m.envelope); }),
  ];

  /** Acorda o publicador do Atlas enquanto houver jogador (o `remoto: true` liga o destino remoto do publicador, separado do projetor local). */
  function atualizarPresenca(membros: Membro[], forcar: boolean): void {
    estado.membros = membros;
    const querPublicar = membros.some(m => m.papel === 'jogador');
    if (querPublicar && (!estado.publicando || forcar)) projetor.postMessage({ tipo: 'ola', largura: 1920, altura: 1080, remoto: true });
    else if (!querPublicar && estado.publicando) projetor.postMessage({ tipo: 'tchau' });
    estado.publicando = querPublicar;
    mudou();
  }

  soltar.push(
    cliente.ouvir('bem-vindo', m => {
      if (m.config?.nome) nome = m.config.nome;
      enviados.clear(); // nova conexão: o servidor ainda guarda os blobs, mas confirmamos de novo
      atualizarPresenca(m.membros, true);
    }),
    cliente.ouvir('blob.tem', m => respostas.get(m.id)?.(m.tem)),
    cliente.ouvir('membros', m => atualizarPresenca(m.membros, false)),
    cliente.aoMudarEstado(e => { if (e === 'caiu' && estado.publicando) { estado.publicando = false; } mudou(); }),
  );
  mudou();

  return {
    estado,
    esvaziar: () => fila,
    confirmarSemNevoa(mapa) {
      lembrar(mapa);
      const p = pendentes.get(mapa);
      if (!p) return;
      pendentes.delete(mapa);
      mudou();
      if (p.retido) { const retido = p.retido; fila = fila.then(() => sairProjetor(retido)).catch(() => { /* idem */ }); }
    },
    fechar() {
      if (fechada) return;
      if (estado.publicando) projetor.postMessage({ tipo: 'tchau' });
      fechada = true;
      for (const f of soltar) f();
      largarGestosPendentes();
      projetor.onmessage = null; eventos.onmessage = null;
      projetor.close(); eventos.close();
    },
  };
}

// ---------- ligação com a interface ----------

export type ConexaoOnline = 'desconectada' | EstadoDaSala;
export const conexaoOnline = signal<ConexaoOnline>('desconectada');
export const estadoDaPonte = signal<EstadoDaPonte>({ membros: [], semNevoa: [], publicando: false });
export const salaConectadaId = signal<string | null>(null);

let atual: { cliente: ClienteDaSala; ponte: Ponte } | null = null;

/** "Abrir a mesa online": conecta a sala e liga a ponte. */
export function abrirMesaOnline(sessao: string, salaId: string, nome?: string): void {
  fecharMesaOnline();
  const cliente = conectarSala({ url: urlDoWebSocket(salaId), sessao });
  const ponte = criarPonte({
    cliente,
    criarCanal: n => new BroadcastChannel(n) as unknown as CanalLocal,
    ...(nome !== undefined ? { nomeDaSala: nome } : {}),
    aoMudar: e => { estadoDaPonte.value = e; },
  });
  cliente.aoMudarEstado(e => { conexaoOnline.value = e; });
  atual = { cliente, ponte };
  salaConectadaId.value = salaId;
  conexaoOnline.value = cliente.estado;
}

/** "Mandar assim mesmo" para um mapa sem névoa (a tela da mesa online). */
export function confirmarSemNevoa(mapa: string): void { atual?.ponte.confirmarSemNevoa(mapa); }

export function fecharMesaOnline(): void {
  if (!atual) return;
  atual.ponte.fechar();
  atual.cliente.fechar();
  atual = null;
  salaConectadaId.value = null;
  conexaoOnline.value = 'desconectada';
  estadoDaPonte.value = { membros: [], semNevoa: [], publicando: false };
}

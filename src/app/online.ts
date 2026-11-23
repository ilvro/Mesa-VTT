/**
 * Ponte do mestre: leva à sala (Cloudflare) o que o Atlas projeta e os eventos permitidos, e traz os pedidos dos jogadores.
 * Plano: `Atlas/docs/plano/mesa-online.md` (R5). O cliente da sala e o `BroadcastChannel` entram por parâmetro, para os testes.
 */
import { signal } from '@preact/signals';
import { conectarSala, type ClienteDaSala, type EstadoDaSala } from '../online/cliente.ts';
import { urlDoWebSocket } from '../online/config.ts';
import { EVENTOS_DO_MESTRE, type Envelope, type Membro } from '../online/protocolo.ts';
import { CANAL_EVENTOS } from '#mesa';

export const CANAL_PROJETOR_ATIVO = 'atlas:projetor:ativo';
export const CHAVE_PERMITIR_MAPA_INTEIRO = 'mesa:online-permitir-mapa-inteiro';

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
  /** Lido a cada mensagem. Até a R5b, só `true` libera o mapa inteiro numa sala que não é de teste. */
  permitirMapaInteiro?: () => boolean;
  /** SHA-256 em hex (padrão: Web Crypto). */
  hash?: (bytes: ArrayBuffer) => Promise<string>;
  aoMudar?: (estado: EstadoDaPonte) => void;
}

export interface EstadoDaPonte {
  membros: Membro[];
  /** `true`: a trava da R5 está segurando o mapa (nada de `canal` sai). */
  bloqueada: boolean;
  /** Há jogador na sala e a ponte pediu ao publicador do Atlas que trabalhe. */
  publicando: boolean;
}

export interface Ponte {
  readonly estado: EstadoDaPonte;
  /** Resolve quando tudo o que estava na fila de saída foi tratado. */
  esvaziar(): Promise<void>;
  fechar(): void;
}

export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(h, b => b.toString(16).padStart(2, '0')).join('');
}

const ehBlob = (v: unknown): v is Blob => typeof Blob !== 'undefined' && v instanceof Blob;

/** Salas de teste (nome começando por `teste`) podem receber o mapa inteiro até a R5b. */
export const ehSalaDeTeste = (nome: string | undefined): boolean => (nome ?? '').trim().toLowerCase().startsWith('teste');

export function criarPonte(o: OpcoesDaPonte): Ponte {
  const { cliente } = o;
  const projetor = o.criarCanal(CANAL_PROJETOR_ATIVO);
  const eventos = o.criarCanal(CANAL_EVENTOS);
  const hash = o.hash ?? sha256Hex;
  let nome = o.nomeDaSala;
  const enviados = new Set<string>();
  let fila: Promise<void> = Promise.resolve();
  let fechada = false;
  const estado: EstadoDaPonte = { membros: [], bloqueada: false, publicando: false };

  const bloqueada = () => !(ehSalaDeTeste(nome) || o.permitirMapaInteiro?.() === true);
  const mudou = () => { estado.bloqueada = bloqueada(); o.aoMudar?.({ ...estado, membros: [...estado.membros] }); };

  /** Sobe o blob (uma vez por conexão da ponte) e devolve o `{ blobId }` que o substitui. */
  async function subir(blob: Blob): Promise<{ blobId: string } | null> {
    const id = await hash(await blob.arrayBuffer());
    if (!enviados.has(id)) {
      if (!(await cliente.enviarBlob(id, blob))) return null;
      enviados.add(id);
    }
    return { blobId: id };
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
    if (bloqueada()) return;
    const pronta = await semBlobs(msg);
    if (!pronta || fechada) return;
    cliente.enviar({ tipo: 'canal', nome: CANAL_PROJETOR_ATIVO, msg: pronta });
  }

  projetor.onmessage = ({ data }) => { fila = fila.then(() => sairProjetor(data)).catch(() => { /* um quadro perdido não para a fila */ }); };

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

  /** Acorda o publicador do Atlas enquanto houver jogador (o `remoto` é lido pela R5b; hoje o projetor ignora o campo). */
  function atualizarPresenca(membros: Membro[], forcar: boolean): void {
    estado.membros = membros;
    const querPublicar = membros.some(m => m.papel === 'jogador') && !bloqueada();
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
    cliente.ouvir('membros', m => atualizarPresenca(m.membros, false)),
    cliente.aoMudarEstado(e => { if (e === 'caiu' && estado.publicando) { estado.publicando = false; } mudou(); }),
  );
  mudou();

  return {
    estado,
    esvaziar: () => fila,
    fechar() {
      if (fechada) return;
      if (estado.publicando) projetor.postMessage({ tipo: 'tchau' });
      fechada = true;
      for (const f of soltar) f();
      projetor.onmessage = null; eventos.onmessage = null;
      projetor.close(); eventos.close();
    },
  };
}

// ---------- ligação com a interface ----------

export type ConexaoOnline = 'desconectada' | EstadoDaSala;
export const conexaoOnline = signal<ConexaoOnline>('desconectada');
export const estadoDaPonte = signal<EstadoDaPonte>({ membros: [], bloqueada: false, publicando: false });
export const salaConectadaId = signal<string | null>(null);

let atual: { cliente: ClienteDaSala; ponte: Ponte } | null = null;

function lerPermissao(): boolean {
  try { return localStorage.getItem(CHAVE_PERMITIR_MAPA_INTEIRO) === '1'; } catch { return false; }
}

/** "Abrir a mesa online": conecta a sala e liga a ponte. */
export function abrirMesaOnline(sessao: string, salaId: string, nome?: string): void {
  fecharMesaOnline();
  const cliente = conectarSala({ url: urlDoWebSocket(salaId), sessao });
  const ponte = criarPonte({
    cliente,
    criarCanal: n => new BroadcastChannel(n) as unknown as CanalLocal,
    ...(nome !== undefined ? { nomeDaSala: nome } : {}),
    permitirMapaInteiro: lerPermissao,
    aoMudar: e => { estadoDaPonte.value = e; },
  });
  cliente.aoMudarEstado(e => { conexaoOnline.value = e; });
  atual = { cliente, ponte };
  salaConectadaId.value = salaId;
  conexaoOnline.value = cliente.estado;
}

export function fecharMesaOnline(): void {
  if (!atual) return;
  atual.ponte.fechar();
  atual.cliente.fechar();
  atual = null;
  salaConectadaId.value = null;
  conexaoOnline.value = 'desconectada';
  estadoDaPonte.value = { membros: [], bloqueada: false, publicando: false };
}

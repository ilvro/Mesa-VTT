/**
 * Protocolo da sala (mesa online). Só tipos e funções puras: sem DOM, sem Workers, porque o Worker
 * (`sala/`) e o cliente (`cliente.ts`) importam o mesmo arquivo. Plano em `Atlas/docs/plano/mesa-online.md`.
 */

export type Papel = 'mestre' | 'jogador';

/** Quem fala; o mesmo formato do `autor` carimbado nos eventos (mesa-core). */
export interface Eu {
  discordId: string;
  nome: string;
  papel: Papel;
}

/** O carimbo que a sala põe em tudo o que repassa (o `autor` do mesa-core): quem fez, e as fichas que ele tem. */
export interface Autor extends Eu {
  fichas: string[];
}

/** Um participante conectado, com o personagem escolhido (id de ficha) ou `null`. */
export interface Membro extends Eu {
  personagem: string | null;
}

/** Uma ficha guardada na sala: um objeto com `id`; o resto é do Dossiê. */
export type FichaDaSala = { id: string } & Record<string, unknown>;

/** Envelope de evento do mesa-core (validado por `validarEvento` onde for usado). */
export type Envelope = Record<string, unknown> & { tipo: string; id: string };

export type MsgOla = { tipo: 'ola'; sessao: string };
export type MsgCanalParaSala = { tipo: 'canal'; nome: string; msg: unknown };
export type MsgEventoParaSala = { tipo: 'evento'; envelope: Envelope };
export type MsgFichaSalvar = { tipo: 'ficha.salvar'; ficha: FichaDaSala; rev: number };
export type MsgFichaEntregar = { tipo: 'ficha.entregar'; fichaId: string; dono: string };
export type MsgMembroPersonagem = { tipo: 'membro.personagem'; fichaId: string | null };
export type MsgSalaConfig = { tipo: 'sala.config'; nome: string; capaBlobId?: string };
/** Qualquer membro pede o histórico de rolagens (as 200 da sala); a resposta é `MsgRolagensHistorico`, só ao remetente. */
export type MsgRolagensHistorico = { tipo: 'rolagens.historico' };

/** Anúncio de um blob; os pedaços seguem em quadros binários (ver `codificarPedaco`). */
export interface MsgBlob { tipo: 'blob'; id: string; tipoMime: string }

/** O mestre pergunta se a sala já tem um blob completo (blobs persistem entre sessões); a resposta é `MsgBlobTemResposta`. */
export interface MsgBlobTem { tipo: 'blob.tem'; id: string }
/** `tamanho`: bytes do blob, quando a sala o tem. */
export interface MsgBlobTemResposta { tipo: 'blob.tem'; id: string; tem: boolean; tamanho?: number }

/**
 * Qualquer membro pede um blob; a sala responde com `blob` e os pedaços binários, só ao remetente, se o id está no último
 * `jukebox.mix`, nos efeitos tocados há pouco ou nos blobs citados pelos últimos `canal` (R6). Senão, `erro { motivo: 'permissao' }`.
 */
export interface MsgBlobPedir { tipo: 'blob.pedir'; id: string }

export type MensagemParaSala =
  | MsgOla
  | MsgCanalParaSala
  | MsgEventoParaSala
  | MsgFichaSalvar
  | MsgFichaEntregar
  | MsgBlob
  | MsgBlobTem
  | MsgBlobPedir
  | MsgMembroPersonagem
  | MsgRolagensHistorico
  | MsgSalaConfig;

/** Nome, capa e dono da sala, guardados no `config` dela. */
export interface ConfigSala {
  nome: string;
  capaBlobId?: string;
  /** `discordId` do mestre da sala. */
  dono?: string;
  campanhaId?: string;
}

export interface MsgBemVindo {
  tipo: 'bem-vindo';
  /** Quem é a conexão, com o papel efetivo nesta sala. */
  eu: Eu;
  membros: Membro[];
  /** Todas as fichas, para o mestre; só as do próprio jogador, para os outros. */
  fichas: FichaDaSala[];
  /** Último `estado` de cada canal (`atlas:projetor:*`), pelo nome do canal. */
  ultimoEstado: Record<string, unknown>;
  config?: ConfigSala;
  /** `rev` atual de cada ficha enviada, pelo id; é a base do próximo `ficha.salvar`. */
  revs?: Record<string, number>;
  /** Dono (`discordId`) de cada ficha enviada, pelo id. */
  donos?: Record<string, string>;
  /** As últimas rolagens (`ficha.rolagem` já carimbadas, da mais antiga à mais nova), no máximo `ROLAGENS_NO_BEM_VINDO`. */
  rolagens?: Envelope[];
}

/** Quantas rolagens o `bem-vindo` traz. */
export const ROLAGENS_NO_BEM_VINDO = 50;

export type MensagemDaSala =
  | MsgBemVindo
  | { tipo: 'membros'; membros: Membro[] }
  | { tipo: 'canal'; nome: string; msg: unknown }
  | { tipo: 'evento'; envelope: Envelope }
  /** `autor`: quem gravou (carimbado pela sala, R13): o dono, o mestre, ou o mestre numa entrega. */
  | { tipo: 'ficha.atualizada'; ficha: FichaDaSala; rev: number; autor: Autor; conflito?: boolean; dono?: string }
  /** Só a quem perdeu a ficha numa entrega (R13): a casca a tira da lista. */
  | { tipo: 'ficha.removida'; id: string }
  /** Resposta a `rolagens.historico`: as rolagens da sala (até 200), da mais antiga à mais nova. */
  | { tipo: 'rolagens.historico'; rolagens: Envelope[] }
  | MsgBlob
  | MsgBlobTemResposta
  /** `recusado`: o `tipo` da mensagem recusada (o campo `tipo` já é o discriminante `'erro'`). */
  | { tipo: 'erro'; motivo: string; recusado?: string };

/** O que a ponte do mestre pode repassar à sala (decisão 12). `atlas.cena-aberta` fica de fora. */
export const EVENTOS_DO_MESTRE: readonly string[] = ['ficha.rolagem', 'jukebox.mix', 'jukebox.efeito-tocado'];

// ---------- validação ----------

type Obj = Record<string, unknown>;
const ehObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const txt = (v: unknown): v is string => typeof v === 'string';
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const ehEnvelope = (v: unknown): v is Envelope => ehObj(v) && txt(v.tipo) && txt(v.id);
const ehFicha = (v: unknown): v is FichaDaSala => ehObj(v) && txt(v.id);
const ehEu = (v: unknown): v is Eu => ehObj(v) && txt(v.discordId) && txt(v.nome) && (v.papel === 'mestre' || v.papel === 'jogador');
const ehAutor = (v: unknown): v is Autor => ehObj(v) && ehEu(v) && Array.isArray(v.fichas) && v.fichas.every(txt);
const ehMembro = (v: unknown): v is Membro => ehObj(v) && ehEu(v) && (v.personagem === null || txt(v.personagem));
const listaDe = <T>(v: unknown, ok: (x: unknown) => x is T): v is T[] => Array.isArray(v) && v.every(ok);

function json(texto: string): unknown {
  try { return JSON.parse(texto); } catch { return undefined; }
}

/** Valida um quadro de texto vindo do cliente. `null` se o formato for inválido. */
export function lerMensagemParaSala(texto: string): MensagemParaSala | null {
  const m = json(texto);
  if (!ehObj(m)) return null;
  switch (m.tipo) {
    case 'ola': return txt(m.sessao) ? { tipo: 'ola', sessao: m.sessao } : null;
    case 'canal': return txt(m.nome) && 'msg' in m ? { tipo: 'canal', nome: m.nome, msg: m.msg } : null;
    case 'evento': return ehEnvelope(m.envelope) ? { tipo: 'evento', envelope: m.envelope } : null;
    case 'ficha.salvar': return ehFicha(m.ficha) && num(m.rev) ? { tipo: 'ficha.salvar', ficha: m.ficha, rev: m.rev } : null;
    case 'ficha.entregar': return txt(m.fichaId) && txt(m.dono) ? { tipo: 'ficha.entregar', fichaId: m.fichaId, dono: m.dono } : null;
    case 'blob': return txt(m.id) && m.id && txt(m.tipoMime) ? { tipo: 'blob', id: m.id, tipoMime: m.tipoMime } : null;
    case 'blob.tem': return txt(m.id) && m.id ? { tipo: 'blob.tem', id: m.id } : null;
    case 'blob.pedir': return txt(m.id) && m.id ? { tipo: 'blob.pedir', id: m.id } : null;
    case 'rolagens.historico': return { tipo: 'rolagens.historico' };
    case 'membro.personagem': return m.fichaId === null || txt(m.fichaId) ? { tipo: 'membro.personagem', fichaId: m.fichaId } : null;
    case 'sala.config':
      if (!txt(m.nome) || (m.capaBlobId !== undefined && !txt(m.capaBlobId))) return null;
      return { tipo: 'sala.config', nome: m.nome, ...(m.capaBlobId !== undefined ? { capaBlobId: m.capaBlobId } : {}) };
    default: return null;
  }
}

/** Valida um quadro de texto vindo da sala. `null` se o formato for inválido. */
export function lerMensagemDaSala(texto: string): MensagemDaSala | null {
  const m = json(texto);
  if (!ehObj(m)) return null;
  switch (m.tipo) {
    case 'bem-vindo':
      if (!ehEu(m.eu) || !listaDe(m.membros, ehMembro) || !listaDe(m.fichas, ehFicha) || !ehObj(m.ultimoEstado)) return null;
      if (m.config !== undefined && !(ehObj(m.config) && txt(m.config.nome))) return null;
      if (m.revs !== undefined && !(ehObj(m.revs) && Object.values(m.revs).every(num))) return null;
      if (m.donos !== undefined && !(ehObj(m.donos) && Object.values(m.donos).every(txt))) return null;
      if (m.rolagens !== undefined && !listaDe(m.rolagens, ehEnvelope)) return null;
      return {
        tipo: 'bem-vindo', eu: m.eu, membros: m.membros, fichas: m.fichas, ultimoEstado: m.ultimoEstado,
        ...(m.config !== undefined ? { config: m.config as unknown as ConfigSala } : {}),
        ...(m.revs !== undefined ? { revs: m.revs as Record<string, number> } : {}),
        ...(m.donos !== undefined ? { donos: m.donos as Record<string, string> } : {}),
        ...(m.rolagens !== undefined ? { rolagens: m.rolagens } : {}),
      };
    case 'membros': return listaDe(m.membros, ehMembro) ? { tipo: 'membros', membros: m.membros } : null;
    case 'canal': return txt(m.nome) && 'msg' in m ? { tipo: 'canal', nome: m.nome, msg: m.msg } : null;
    case 'evento': return ehEnvelope(m.envelope) ? { tipo: 'evento', envelope: m.envelope } : null;
    case 'ficha.atualizada':
      if (!ehFicha(m.ficha) || !num(m.rev) || !ehAutor(m.autor) || (m.conflito !== undefined && typeof m.conflito !== 'boolean') || (m.dono !== undefined && !txt(m.dono))) return null;
      return { tipo: 'ficha.atualizada', ficha: m.ficha, rev: m.rev, autor: m.autor, ...(m.conflito !== undefined ? { conflito: m.conflito } : {}), ...(m.dono !== undefined ? { dono: m.dono } : {}) };
    case 'ficha.removida': return txt(m.id) && m.id ? { tipo: 'ficha.removida', id: m.id } : null;
    case 'rolagens.historico': return listaDe(m.rolagens, ehEnvelope) ? { tipo: 'rolagens.historico', rolagens: m.rolagens } : null;
    case 'blob': return txt(m.id) && m.id && txt(m.tipoMime) ? { tipo: 'blob', id: m.id, tipoMime: m.tipoMime } : null;
    case 'blob.tem':
      if (!txt(m.id) || !m.id || typeof m.tem !== 'boolean' || (m.tamanho !== undefined && !num(m.tamanho))) return null;
      return { tipo: 'blob.tem', id: m.id, tem: m.tem, ...(m.tamanho !== undefined ? { tamanho: m.tamanho } : {}) };
    case 'erro': return txt(m.motivo) && (m.recusado === undefined || txt(m.recusado)) ? { tipo: 'erro', motivo: m.motivo, ...(m.recusado !== undefined ? { recusado: m.recusado } : {}) } : null;
    default: return null;
  }
}

/** Devolve a sessão (ainda não verificada) se o texto for um `ola` bem formado. */
export function lerOla(texto: string): string | null {
  const m = lerMensagemParaSala(texto);
  return m?.tipo === 'ola' ? m.sessao : null;
}

// ---------- blobs em pedaços ----------

/** Tamanho de cada pedaço de blob. */
export const TAMANHO_PEDACO = 512 * 1024;

/** Cabeçalho de um quadro binário: o pedaço `i` (de 0) de `n`, do blob `id`, com tipo MIME `tipo`. */
export interface CabecalhoPedaco { id: string; i: number; n: number; tipo: string }

const enc = new TextEncoder();
const dec = new TextDecoder();

/** Quadro binário: 4 bytes (big-endian) com o tamanho do cabeçalho JSON, o cabeçalho e os dados. */
export function codificarPedaco(cab: CabecalhoPedaco, dados: Uint8Array): ArrayBuffer {
  const c = enc.encode(JSON.stringify({ id: cab.id, i: cab.i, n: cab.n, tipo: cab.tipo }));
  const saida = new Uint8Array(4 + c.length + dados.length);
  new DataView(saida.buffer).setUint32(0, c.length);
  saida.set(c, 4);
  saida.set(dados, 4 + c.length);
  return saida.buffer;
}

/** Inverso de `codificarPedaco`. `null` se o quadro for inválido. */
export function decodificarPedaco(quadro: ArrayBuffer | Uint8Array): { cab: CabecalhoPedaco; dados: Uint8Array } | null {
  const b = quadro instanceof Uint8Array ? quadro : new Uint8Array(quadro);
  if (b.length < 4) return null;
  const tam = new DataView(b.buffer, b.byteOffset, b.byteLength).getUint32(0);
  if (tam === 0 || 4 + tam > b.length) return null;
  const c = json(dec.decode(b.subarray(4, 4 + tam)));
  if (!ehObj(c) || !txt(c.id) || !c.id || !txt(c.tipo) || !Number.isInteger(c.i) || !Number.isInteger(c.n)) return null;
  const i = c.i as number, n = c.n as number;
  if (n < 1 || i < 0 || i >= n) return null;
  return { cab: { id: c.id, i, n, tipo: c.tipo }, dados: b.subarray(4 + tam) };
}

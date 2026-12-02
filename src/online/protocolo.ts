/**
 * Protocolo da sala (mesa online). Só tipos e funções puras: sem DOM, sem Workers, porque o Worker
 * (`sala/`) e o cliente (`cliente.ts`) importam o mesmo arquivo. Plano em `Atlas/docs/plano/mesa-online.md`.
 */

import { ehDesafioAtivo, type AcaoDesafio, type DesafioAtivo } from '../dominio/desafios.ts';

export type Papel = 'mestre' | 'jogador';
export type ModoDaSala = 'sessao' | 'construcao';

/** Máximo de comandos em uma única operação colaborativa de construção. */
export const MAX_COMANDOS_POR_OP = 100;
/** Limite em bytes do JSON de `comandos` em uma operação de construção (protege SQLite do Durable Object). */
export const LIMITE_OP_CONSTRUCAO_BYTES = 512 * 1024;
/** Prefixo dos blobs de snapshot da construção colaborativa (`construcao:<rev>`). */
export const PREFIXO_BLOB_CONSTRUCAO = 'construcao:';

/** Um comando serializável do editor do Atlas (validado pelo próprio Atlas). */
export type ComandoConstrucao = { tipo: string } & Record<string, unknown>;

/** Operação já ordenada pela sala e guardada no histórico da construção. */
export interface OpConstrucao {
  rev: number;
  opId: string;
  autor: Autor;
  comandos: ComandoConstrucao[];
  rotulo?: string;
  em?: number;
}

/** Nota rápida/recado da sessão de construção. */
export interface NotaConstrucao {
  id: string;
  autor: Autor;
  texto: string;
  em: number;
}

/** Resumo do mapa em construção entregue no `bem-vindo`. */
export interface ResumoConstrucao {
  temMapa: boolean;
  nome?: string;
  rev: number;
}

/** Quem fala; o mesmo formato do `autor` carimbado nos eventos (mesa-core). */
export interface Eu {
  discordId: string;
  nome: string;
  papel: Papel;
  avatar?: string | null;
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
export type MsgPing = { tipo: 'ping'; em: number };
export type MsgCanalParaSala = { tipo: 'canal'; nome: string; msg: unknown };
export type MsgEventoParaSala = { tipo: 'evento'; envelope: Envelope };
export type MsgFichaSalvar = { tipo: 'ficha.salvar'; ficha: FichaDaSala; rev: number };
export type MsgFichaEntregar = { tipo: 'ficha.entregar'; fichaId: string; dono: string };
export type MsgMembroPersonagem = { tipo: 'membro.personagem'; fichaId: string | null };
export type MsgSalaConfig = { tipo: 'sala.config'; nome: string; capaBlobId?: string };
/** Só o mestre: alterna entre `'sessao'` e `'construcao'`. */
export type MsgSalaModo = { tipo: 'sala.modo'; modo: ModoDaSala };
/** Só o mestre: limpa o mapa projetado e as escolhas de personagem da sessão atual na sala (mantém fichas, blobs e rolagens). */
export type MsgSalaLimparSessao = { tipo: 'sala.limpar-sessao' };
/** Qualquer membro pede o histórico de rolagens (as 200 da sala); a resposta é `MsgRolagensHistorico`, só ao remetente. */
export type MsgRolagensHistorico = { tipo: 'rolagens.historico' };
/** Qualquer membro pede um retrato em falta (a sala devolve se tiver, ou repassa ao mestre). */
export type MsgPedirRetrato = { tipo: 'pedir-retrato'; id: string };
/** Jogador em controle livre pede ao mestre para abrir/fechar uma porta no mapa. */
export type MsgAlternarPorta = { tipo: 'alternar-porta'; id: string };

/** Só o mestre: abre ou substitui o mapa em construção colaborativa (`rev = 0`). */
export type MsgConstrucaoAbrir = { tipo: 'construcao.abrir'; mapa?: Record<string, unknown>; blobId?: string; nome?: string };
/** Só o mestre: encerra e limpa o mapa em construção na sala. */
export type MsgConstrucaoFechar = { tipo: 'construcao.fechar' };
/** Qualquer membro (em modo `'construcao'` com mapa aberto): envia lote de comandos do Atlas. */
export type MsgConstrucaoComando = {
  tipo: 'construcao.comando';
  baseRev: number;
  opId: string;
  comandos: ComandoConstrucao[];
  rotulo?: string;
};
/** Qualquer membro (em modo `'construcao'` com mapa aberto): compacta o histórico até `rev`. */
export type MsgConstrucaoSnapshot = {
  tipo: 'construcao.snapshot';
  rev: number;
  mapa?: Record<string, unknown>;
  blobId?: string;
  nome?: string;
};
/** Qualquer membro (em modo `'construcao'` com mapa aberto): presença efêmera de cursor no editor. */
export type MsgConstrucaoCursor = {
  tipo: 'construcao.cursor';
  x: number;
  y: number;
  levelId: string | null;
  ferramenta: string;
  pintando?: boolean;
};
/** Qualquer membro (em modo `'construcao'`): pede o estado completo atual da construção. */
export type MsgConstrucaoRessincronizar = { tipo: 'construcao.ressincronizar' };
/** Qualquer membro (em modo `'construcao'`): publica uma nota rápida no painel de construção. */
export type MsgConstrucaoNota = { tipo: 'construcao.nota'; id: string; texto: string };

/** Só o mestre: define ou encerra (`null`) o desafio ativo na sala. */
export type MsgDesafioDefinir = { tipo: 'desafio.definir'; desafio: DesafioAtivo | null };
/** Mestre ou jogador: aplica uma ação no desafio ativo na sala. */
export type MsgDesafioAcao = { tipo: 'desafio.acao'; acao: AcaoDesafio };

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
  | MsgPing
  | MsgCanalParaSala
  | MsgEventoParaSala
  | MsgFichaSalvar
  | MsgFichaEntregar
  | MsgBlob
  | MsgBlobTem
  | MsgBlobPedir
  | MsgMembroPersonagem
  | MsgRolagensHistorico
  | MsgPedirRetrato
  | MsgAlternarPorta
  | MsgSalaConfig
  | MsgSalaModo
  | MsgSalaLimparSessao
  | MsgConstrucaoAbrir
  | MsgConstrucaoFechar
  | MsgConstrucaoComando
  | MsgConstrucaoSnapshot
  | MsgConstrucaoCursor
  | MsgConstrucaoRessincronizar
  | MsgConstrucaoNota
  | MsgDesafioDefinir
  | MsgDesafioAcao;

/** Nome, capa, dono e modo da sala, guardados no `config` dela. */
export interface ConfigSala {
  nome: string;
  capaBlobId?: string;
  /** `discordId` do mestre da sala. */
  dono?: string;
  campanhaId?: string;
  modo?: ModoDaSala;
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
  /** Relógio da sala em ms no momento do `bem-vindo` (R23). */
  agora?: number;
  /** Resumo do mapa em construção colaborativa, se houver. */
  construcao?: ResumoConstrucao;
  /** Desafio ativo na sessão (já sanitizado para o papel de `eu`), ou `null`. */
  desafio?: DesafioAtivo | null;
}

/** Quantas rolagens o `bem-vindo` traz. */
export const ROLAGENS_NO_BEM_VINDO = 50;

export type MsgConstrucaoEstado = {
  tipo: 'construcao.estado';
  mapa?: Record<string, unknown>;
  blobId?: string;
  nome?: string;
  rev: number;
  ops: OpConstrucao[];
  notas?: NotaConstrucao[];
};

export type MsgConstrucaoAplicada = {
  tipo: 'construcao.aplicada';
  rev: number;
  opId: string;
  autor: Autor;
  comandos: ComandoConstrucao[];
  rotulo?: string;
};

export type MsgConstrucaoCursorDaSala = {
  tipo: 'construcao.cursor';
  autor: Autor;
  x: number;
  y: number;
  levelId: string | null;
  ferramenta: string;
  pintando?: boolean;
};

export type MsgConstrucaoNotaDaSala = {
  tipo: 'construcao.nota';
  id: string;
  autor: Autor;
  texto: string;
  em: number;
};

export type MsgConstrucaoFechada = { tipo: 'construcao.fechada' };

export type MsgDesafioEstado = { tipo: 'desafio.estado'; desafio: DesafioAtivo | null };

export type MensagemDaSala =
  | MsgBemVindo
  | { tipo: 'pong'; em: number; agora: number }
  | { tipo: 'membros'; membros: Membro[] }
  | { tipo: 'config'; config: ConfigSala }
  | { tipo: 'canal'; nome: string; msg: unknown }
  | { tipo: 'evento'; envelope: Envelope }
  /** `autor`: quem gravou (carimbado pela sala, R13): o dono, o mestre, ou o mestre numa entrega. */
  | { tipo: 'ficha.atualizada'; ficha: FichaDaSala; rev: number; autor: Autor; conflito?: boolean; dono?: string }
  /** Só a quem perdeu a ficha numa entrega (R13): a casca a tira da lista. */
  | { tipo: 'ficha.removida'; id: string }
  /** Resposta a `rolagens.historico`: as rolagens da sala (até 200), da mais antiga à mais nova. */
  | { tipo: 'rolagens.historico'; rolagens: Envelope[] }
  | MsgConstrucaoEstado
  | MsgConstrucaoAplicada
  | MsgConstrucaoCursorDaSala
  | MsgConstrucaoNotaDaSala
  | MsgConstrucaoFechada
  | MsgDesafioEstado
  | MsgBlob
  | MsgBlobTemResposta
  | MsgPedirRetrato
  | MsgAlternarPorta
  /** `recusado`: o `tipo` da mensagem recusada (o campo `tipo` já é o discriminante `'erro'`). */
  | { tipo: 'erro'; motivo: string; recusado?: string };

/** O que a ponte do mestre pode repassar à sala (decisão 12). `atlas.cena-aberta` fica de fora. */
export const EVENTOS_DO_MESTRE: readonly string[] = ['ficha.rolagem', 'jukebox.mix', 'jukebox.efeito-tocado', 'mesa.resposta', 'mesa.ping'];

// ---------- validação ----------

type Obj = Record<string, unknown>;
const ehObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const txt = (v: unknown): v is string => typeof v === 'string';
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const naoNegInt = (v: unknown): v is number => num(v) && Number.isInteger(v) && v >= 0;
const posInt = (v: unknown): v is number => num(v) && Number.isInteger(v) && v >= 1;
const ehModo = (v: unknown): v is ModoDaSala => v === 'sessao' || v === 'construcao';
const ehEnvelope = (v: unknown): v is Envelope => ehObj(v) && txt(v.tipo) && txt(v.id);
const ehFicha = (v: unknown): v is FichaDaSala => ehObj(v) && txt(v.id);
const ehEu = (v: unknown): v is Eu =>
  ehObj(v) && txt(v.discordId) && txt(v.nome) && (v.papel === 'mestre' || v.papel === 'jogador')
  && (v.avatar === undefined || v.avatar === null || txt(v.avatar));
const ehAutor = (v: unknown): v is Autor => ehObj(v) && ehEu(v) && Array.isArray(v.fichas) && v.fichas.every(txt);
const ehMembro = (v: unknown): v is Membro => ehObj(v) && ehEu(v) && (v.personagem === null || txt(v.personagem));
const listaDe = <T>(v: unknown, ok: (x: unknown) => x is T): v is T[] => Array.isArray(v) && v.every(ok);
const ehComandoConstrucao = (v: unknown): v is ComandoConstrucao => ehObj(v) && txt(v.tipo) && v.tipo.length > 0;
const ehOpConstrucao = (v: unknown): v is OpConstrucao =>
  ehObj(v)
  && posInt(v.rev)
  && txt(v.opId) && v.opId.length > 0
  && ehAutor(v.autor)
  && listaDe(v.comandos, ehComandoConstrucao) && v.comandos.length > 0
  && (v.rotulo === undefined || txt(v.rotulo))
  && (v.em === undefined || num(v.em));
const ehNotaConstrucao = (v: unknown): v is NotaConstrucao =>
  ehObj(v) && txt(v.id) && v.id.length > 0 && ehAutor(v.autor) && txt(v.texto) && num(v.em);
const ehResumoConstrucao = (v: unknown): v is ResumoConstrucao =>
  ehObj(v) && typeof v.temMapa === 'boolean' && naoNegInt(v.rev) && (v.nome === undefined || txt(v.nome));
const ehConfigSala = (v: unknown): v is ConfigSala =>
  ehObj(v)
  && txt(v.nome)
  && (v.capaBlobId === undefined || txt(v.capaBlobId))
  && (v.dono === undefined || txt(v.dono))
  && (v.campanhaId === undefined || txt(v.campanhaId))
  && (v.modo === undefined || ehModo(v.modo));

function dentroDoLimiteOp(comandos: readonly ComandoConstrucao[]): boolean {
  if (comandos.length === 0 || comandos.length > MAX_COMANDOS_POR_OP) return false;
  return enc.encode(JSON.stringify(comandos)).length <= LIMITE_OP_CONSTRUCAO_BYTES;
}

function json(texto: string): unknown {
  try { return JSON.parse(texto); } catch { return undefined; }
}

/** Valida um quadro de texto vindo do cliente. `null` se o formato for inválido. */
export function lerMensagemParaSala(texto: string): MensagemParaSala | null {
  const m = json(texto);
  if (!ehObj(m)) return null;
  switch (m.tipo) {
    case 'ola': return txt(m.sessao) ? { tipo: 'ola', sessao: m.sessao } : null;
    case 'ping': return num(m.em) ? { tipo: 'ping', em: m.em } : null;
    case 'canal': return txt(m.nome) && 'msg' in m ? { tipo: 'canal', nome: m.nome, msg: m.msg } : null;
    case 'evento': return ehEnvelope(m.envelope) ? { tipo: 'evento', envelope: m.envelope } : null;
    case 'ficha.salvar': return ehFicha(m.ficha) && num(m.rev) ? { tipo: 'ficha.salvar', ficha: m.ficha, rev: m.rev } : null;
    case 'ficha.entregar': return txt(m.fichaId) && txt(m.dono) ? { tipo: 'ficha.entregar', fichaId: m.fichaId, dono: m.dono } : null;
    case 'blob': return txt(m.id) && m.id && txt(m.tipoMime) ? { tipo: 'blob', id: m.id, tipoMime: m.tipoMime } : null;
    case 'blob.tem': return txt(m.id) && m.id ? { tipo: 'blob.tem', id: m.id } : null;
    case 'blob.pedir': return txt(m.id) && m.id ? { tipo: 'blob.pedir', id: m.id } : null;
    case 'pedir-retrato': return txt(m.id) && m.id ? { tipo: 'pedir-retrato', id: m.id } : null;
    case 'alternar-porta': return txt(m.id) && m.id ? { tipo: 'alternar-porta', id: m.id } : null;
    case 'rolagens.historico': return { tipo: 'rolagens.historico' };
    case 'membro.personagem': return m.fichaId === null || txt(m.fichaId) ? { tipo: 'membro.personagem', fichaId: m.fichaId } : null;
    case 'sala.config':
      if (!txt(m.nome) || (m.capaBlobId !== undefined && !txt(m.capaBlobId))) return null;
      return { tipo: 'sala.config', nome: m.nome, ...(m.capaBlobId !== undefined ? { capaBlobId: m.capaBlobId } : {}) };
    case 'sala.modo': return ehModo(m.modo) ? { tipo: 'sala.modo', modo: m.modo } : null;
    case 'sala.limpar-sessao': return { tipo: 'sala.limpar-sessao' };
    case 'construcao.abrir': {
      const temMapa = m.mapa !== undefined;
      const temBlob = m.blobId !== undefined;
      if (temMapa === temBlob) return null;
      if (temMapa && !ehObj(m.mapa)) return null;
      if (temBlob && (!txt(m.blobId) || !m.blobId)) return null;
      if (m.nome !== undefined && !txt(m.nome)) return null;
      return {
        tipo: 'construcao.abrir',
        ...(temMapa ? { mapa: m.mapa as Record<string, unknown> } : {}),
        ...(temBlob ? { blobId: m.blobId as string } : {}),
        ...(m.nome !== undefined ? { nome: m.nome } : {}),
      };
    }
    case 'construcao.fechar': return { tipo: 'construcao.fechar' };
    case 'construcao.comando':
      if (!naoNegInt(m.baseRev) || !txt(m.opId) || !m.opId) return null;
      if (!listaDe(m.comandos, ehComandoConstrucao) || !dentroDoLimiteOp(m.comandos)) return null;
      if (m.rotulo !== undefined && !txt(m.rotulo)) return null;
      return {
        tipo: 'construcao.comando',
        baseRev: m.baseRev,
        opId: m.opId,
        comandos: m.comandos,
        ...(m.rotulo !== undefined ? { rotulo: m.rotulo } : {}),
      };
    case 'construcao.snapshot': {
      if (!naoNegInt(m.rev)) return null;
      const temMapa = m.mapa !== undefined;
      const temBlob = m.blobId !== undefined;
      if (temMapa === temBlob) return null;
      if (temMapa && !ehObj(m.mapa)) return null;
      if (temBlob && (!txt(m.blobId) || !m.blobId)) return null;
      if (m.nome !== undefined && !txt(m.nome)) return null;
      return {
        tipo: 'construcao.snapshot',
        rev: m.rev,
        ...(temMapa ? { mapa: m.mapa as Record<string, unknown> } : {}),
        ...(temBlob ? { blobId: m.blobId as string } : {}),
        ...(m.nome !== undefined ? { nome: m.nome } : {}),
      };
    }
    case 'construcao.cursor':
      if (!num(m.x) || !num(m.y)) return null;
      if (m.levelId !== null && !txt(m.levelId)) return null;
      if (!txt(m.ferramenta) || !m.ferramenta) return null;
      if (m.pintando !== undefined && typeof m.pintando !== 'boolean') return null;
      return {
        tipo: 'construcao.cursor',
        x: m.x,
        y: m.y,
        levelId: m.levelId,
        ferramenta: m.ferramenta,
        ...(m.pintando !== undefined ? { pintando: m.pintando } : {}),
      };
    case 'construcao.ressincronizar': return { tipo: 'construcao.ressincronizar' };
    case 'construcao.nota':
      if (!txt(m.id) || !m.id || !txt(m.texto) || !m.texto.trim()) return null;
      return { tipo: 'construcao.nota', id: m.id, texto: m.texto };
    case 'desafio.definir':
      if (m.desafio !== null && !ehDesafioAtivo(m.desafio)) return null;
      return { tipo: 'desafio.definir', desafio: m.desafio };
    case 'desafio.acao':
      if (!ehObj(m.acao) || !txt(m.acao.tipo) || !m.acao.tipo) return null;
      return { tipo: 'desafio.acao', acao: m.acao as AcaoDesafio };
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
      if (m.config !== undefined && !ehConfigSala(m.config)) return null;
      if (m.revs !== undefined && !(ehObj(m.revs) && Object.values(m.revs).every(num))) return null;
      if (m.donos !== undefined && !(ehObj(m.donos) && Object.values(m.donos).every(txt))) return null;
      if (m.rolagens !== undefined && !listaDe(m.rolagens, ehEnvelope)) return null;
      if (m.agora !== undefined && !num(m.agora)) return null;
      if (m.construcao !== undefined && !ehResumoConstrucao(m.construcao)) return null;
      if (m.desafio !== undefined && m.desafio !== null && !ehDesafioAtivo(m.desafio)) return null;
      return {
        tipo: 'bem-vindo', eu: m.eu, membros: m.membros, fichas: m.fichas, ultimoEstado: m.ultimoEstado,
        ...(m.config !== undefined ? { config: m.config } : {}),
        ...(m.revs !== undefined ? { revs: m.revs as Record<string, number> } : {}),
        ...(m.donos !== undefined ? { donos: m.donos as Record<string, string> } : {}),
        ...(m.rolagens !== undefined ? { rolagens: m.rolagens } : {}),
        ...(m.agora !== undefined ? { agora: m.agora } : {}),
        ...(m.construcao !== undefined ? { construcao: m.construcao } : {}),
        ...(m.desafio !== undefined ? { desafio: m.desafio } : {}),
      };
    case 'pong': return num(m.em) && num(m.agora) ? { tipo: 'pong', em: m.em, agora: m.agora } : null;
    case 'membros': return listaDe(m.membros, ehMembro) ? { tipo: 'membros', membros: m.membros } : null;
    case 'config':
      if (!ehConfigSala(m.config)) return null;
      return { tipo: 'config', config: m.config };
    case 'canal': return txt(m.nome) && 'msg' in m ? { tipo: 'canal', nome: m.nome, msg: m.msg } : null;
    case 'evento': return ehEnvelope(m.envelope) ? { tipo: 'evento', envelope: m.envelope } : null;
    case 'ficha.atualizada':
      if (!ehFicha(m.ficha) || !num(m.rev) || !ehAutor(m.autor) || (m.conflito !== undefined && typeof m.conflito !== 'boolean') || (m.dono !== undefined && !txt(m.dono))) return null;
      return { tipo: 'ficha.atualizada', ficha: m.ficha, rev: m.rev, autor: m.autor, ...(m.conflito !== undefined ? { conflito: m.conflito } : {}), ...(m.dono !== undefined ? { dono: m.dono } : {}) };
    case 'ficha.removida': return txt(m.id) && m.id ? { tipo: 'ficha.removida', id: m.id } : null;
    case 'rolagens.historico': return listaDe(m.rolagens, ehEnvelope) ? { tipo: 'rolagens.historico', rolagens: m.rolagens } : null;
    case 'construcao.estado': {
      const temMapa = m.mapa !== undefined;
      const temBlob = m.blobId !== undefined;
      if (temMapa === temBlob) return null;
      if (temMapa && !ehObj(m.mapa)) return null;
      if (temBlob && (!txt(m.blobId) || !m.blobId)) return null;
      if (m.nome !== undefined && !txt(m.nome)) return null;
      if (!naoNegInt(m.rev) || !listaDe(m.ops, ehOpConstrucao)) return null;
      if (m.notas !== undefined && !listaDe(m.notas, ehNotaConstrucao)) return null;
      return {
        tipo: 'construcao.estado',
        ...(temMapa ? { mapa: m.mapa as Record<string, unknown> } : {}),
        ...(temBlob ? { blobId: m.blobId as string } : {}),
        ...(m.nome !== undefined ? { nome: m.nome } : {}),
        rev: m.rev,
        ops: m.ops,
        ...(m.notas !== undefined ? { notas: m.notas } : {}),
      };
    }
    case 'construcao.aplicada':
      if (!posInt(m.rev) || !txt(m.opId) || !m.opId || !ehAutor(m.autor)) return null;
      if (!listaDe(m.comandos, ehComandoConstrucao) || m.comandos.length === 0 || m.comandos.length > MAX_COMANDOS_POR_OP) return null;
      if (m.rotulo !== undefined && !txt(m.rotulo)) return null;
      return {
        tipo: 'construcao.aplicada',
        rev: m.rev,
        opId: m.opId,
        autor: m.autor,
        comandos: m.comandos,
        ...(m.rotulo !== undefined ? { rotulo: m.rotulo } : {}),
      };
    case 'construcao.cursor':
      if (!ehAutor(m.autor) || !num(m.x) || !num(m.y)) return null;
      if (m.levelId !== null && !txt(m.levelId)) return null;
      if (!txt(m.ferramenta) || !m.ferramenta) return null;
      if (m.pintando !== undefined && typeof m.pintando !== 'boolean') return null;
      return {
        tipo: 'construcao.cursor',
        autor: m.autor,
        x: m.x,
        y: m.y,
        levelId: m.levelId,
        ferramenta: m.ferramenta,
        ...(m.pintando !== undefined ? { pintando: m.pintando } : {}),
      };
    case 'construcao.nota':
      if (!txt(m.id) || !m.id || !ehAutor(m.autor) || !txt(m.texto) || !num(m.em)) return null;
      return { tipo: 'construcao.nota', id: m.id, autor: m.autor, texto: m.texto, em: m.em };
    case 'construcao.fechada': return { tipo: 'construcao.fechada' };
    case 'desafio.estado':
      if (m.desafio !== null && !ehDesafioAtivo(m.desafio)) return null;
      return { tipo: 'desafio.estado', desafio: m.desafio };
    case 'blob': return txt(m.id) && m.id && txt(m.tipoMime) ? { tipo: 'blob', id: m.id, tipoMime: m.tipoMime } : null;
    case 'blob.tem':
      if (!txt(m.id) || !m.id || typeof m.tem !== 'boolean' || (m.tamanho !== undefined && !num(m.tamanho))) return null;
      return { tipo: 'blob.tem', id: m.id, tem: m.tem, ...(m.tamanho !== undefined ? { tamanho: m.tamanho } : {}) };
    case 'pedir-retrato': return txt(m.id) && m.id ? { tipo: 'pedir-retrato', id: m.id } : null;
    case 'alternar-porta': return txt(m.id) && m.id ? { tipo: 'alternar-porta', id: m.id } : null;
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

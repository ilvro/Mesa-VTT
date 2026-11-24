/**
 * Estado durável da sala (Durable Object com SQLite). Código puro: recebe um `{ exec }`, que no Worker é
 * `ctx.storage.sql` e nos testes é um `node:sqlite` em memória.
 */

import type { ConfigSala, Envelope, FichaDaSala, Membro, Eu } from '../src/online/protocolo.ts';
import { TAMANHO_PEDACO, type CabecalhoPedaco } from '../src/online/protocolo.ts';

/** O mínimo do SQL do Durable Object que o estado usa. */
export interface Sql {
  exec(sql: string, ...params: any[]): Iterable<Record<string, unknown>>;
}

/** Limite do JSON de uma ficha (um valor de SQLite do Durable Object cabe em 2 MB). */
export const LIMITE_FICHA_BYTES = 1.5 * 1024 * 1024;
/** Quantas rolagens a sala lembra. */
export const MAX_ROLAGENS = 200;
/** Quantos efeitos tocados a sala lembra (os arquivos deles continuam pedíveis). */
export const MAX_EFEITOS_LEMBRADOS = 50;
/** Máximo de pedaços de um blob (128 × 512 KB = 64 MB). */
export const MAX_PEDACOS = 128;

export class ErroEstado extends Error {
  codigo: 'ficha-grande' | 'pedaco-invalido';
  constructor(codigo: 'ficha-grande' | 'pedaco-invalido', mensagem: string) {
    super(mensagem);
    this.codigo = codigo;
  }
}

export interface FichaGuardada {
  ficha: FichaDaSala;
  dono: string;
  rev: number;
  atualizadaEm: number;
}

export interface ResultadoSalvar {
  rev: number;
  dono: string;
  /** O cliente tinha uma `rev` mais velha que a da sala: gravou assim mesmo. */
  conflito: boolean;
}

export interface Estado {
  /** Config da sala (`nome`, `capaBlobId`, `dono`, `campanhaId`). */
  config(): ConfigSala;
  /** Grava o dono e o nome de uma sala nova. Falso se a sala já tem dono. */
  iniciar(dono: string, nome: string, campanhaId?: string): boolean;
  definirConfig(nome: string, capaBlobId?: string): void;

  donoDaFicha(id: string): string | null;
  idsDoDono(discordId: string): string[];
  ficha(id: string): FichaGuardada | null;
  /** Todas as fichas, ou só as de um dono. */
  fichas(dono?: string): Array<FichaGuardada & { id: string }>;
  /** `dono` só vale para ficha nova; numa ficha que já existe o dono continua o mesmo. */
  salvarFicha(ficha: FichaDaSala, dono: string, revDoCliente: number, agora: number): ResultadoSalvar;
  entregarFicha(id: string, dono: string): FichaGuardada | null;

  registrarRolagem(envelope: Envelope, autor: string, agora: number): void;
  /** As rolagens, da mais antiga à mais nova; com `ultimas`, só as `ultimas` mais novas. */
  rolagens(ultimas?: number): Envelope[];

  guardarUltimo(canal: string, msg: unknown): void;
  ultimoEstado(): Record<string, unknown>;

  guardarPedaco(cab: CabecalhoPedaco, dados: Uint8Array): void;
  /** O blob existe e todos os pedaços chegaram. */
  temBlob(id: string): boolean;

  /** Apaga um blob (todos os pedaços). */
  apagarBlob(id: string): void;
  /** Apaga os blobs de `prefixo` que não são `manter` (as versões antigas de `estado:<mapa>:`). Devolve quantos ids saíram. */
  apagarBlobsComPrefixo(prefixo: string, manter: string): number;
  /** Os pedaços de um blob completo, em ordem; `null` se não existe ou está incompleto. */
  pedacosDoBlob(id: string): Array<{ cab: CabecalhoPedaco; dados: Uint8Array }> | null;
  /** Guarda os `blobId` citados pela última mensagem `tipo` do `canal` (`estado` comprimido, `retrato`, `inspecao`). */
  guardarCitados(canal: string, tipo: string, ids: string[]): void;
  /** Os blobs citados pelas últimas mensagens guardadas, sem repetir. */
  blobsCitados(): string[];
  /** Bytes de um blob completo; `null` se não existe ou está incompleto. */
  tamanhoDoBlob(id: string): number | null;

  /** Guarda o último `jukebox.mix` (o envelope já carimbado), para quem chega depois. */
  guardarMix(envelope: Envelope): void;
  ultimoMix(): Envelope | null;
  /** Lembra o `faixaId` de um `jukebox.efeito-tocado` (os últimos `MAX_EFEITOS_LEMBRADOS`), para a casca poder pedir o arquivo. */
  lembrarEfeito(faixaId: string): void;
  /** Os blobs que `blob.pedir` entrega: os do último `mix`, os dos efeitos lembrados e os citados nos últimos `canal`. */
  blobsPedidos(): string[];

  personagem(discordId: string): string | null;
  escolherPersonagem(discordId: string, fichaId: string | null): void;
}

const BYTES = new TextEncoder();

export function criarEstado(sql: Sql): Estado {
  const rodar = (q: string, ...p: unknown[]): Array<Record<string, unknown>> => Array.from(sql.exec(q, ...p));
  const um = (q: string, ...p: unknown[]): Record<string, unknown> | null => rodar(q, ...p)[0] ?? null;

  rodar('CREATE TABLE IF NOT EXISTS fichas (id TEXT PRIMARY KEY, dono TEXT NOT NULL, rev INTEGER NOT NULL, json TEXT NOT NULL, atualizada_em INTEGER NOT NULL)');
  rodar('CREATE INDEX IF NOT EXISTS fichas_dono ON fichas (dono)');
  rodar('CREATE TABLE IF NOT EXISTS rolagens (id TEXT PRIMARY KEY, em INTEGER NOT NULL, autor TEXT NOT NULL, json TEXT NOT NULL)');
  rodar('CREATE TABLE IF NOT EXISTS ultimo (canal TEXT PRIMARY KEY, json TEXT NOT NULL)');
  rodar('CREATE TABLE IF NOT EXISTS blobs (id TEXT NOT NULL, i INTEGER NOT NULL, n INTEGER NOT NULL, tipo TEXT NOT NULL, dados BLOB NOT NULL, PRIMARY KEY (id, i))');
  rodar('CREATE TABLE IF NOT EXISTS citados (canal TEXT NOT NULL, tipo TEXT NOT NULL, ids TEXT NOT NULL, PRIMARY KEY (canal, tipo))');
  rodar('CREATE TABLE IF NOT EXISTS ultimo_evento (tipo TEXT PRIMARY KEY, json TEXT NOT NULL)');
  rodar('CREATE TABLE IF NOT EXISTS config (chave TEXT PRIMARY KEY, valor TEXT NOT NULL)');
  rodar('CREATE TABLE IF NOT EXISTS personagens (discord_id TEXT PRIMARY KEY, ficha_id TEXT NOT NULL)');

  const lerChave = (chave: string): string | undefined => {
    const r = um('SELECT valor FROM config WHERE chave = ?', chave);
    return r ? String(r.valor) : undefined;
  };
  const gravarChave = (chave: string, valor: string | undefined): void => {
    if (valor === undefined) rodar('DELETE FROM config WHERE chave = ?', chave);
    else rodar('INSERT OR REPLACE INTO config (chave, valor) VALUES (?, ?)', chave, valor);
  };
  const guardada = (r: Record<string, unknown>): FichaGuardada => ({
    ficha: JSON.parse(String(r.json)) as FichaDaSala,
    dono: String(r.dono),
    rev: Number(r.rev),
    atualizadaEm: Number(r.atualizada_em),
  });

  return {
    config() {
      const c: ConfigSala = { nome: lerChave('nome') ?? '' };
      const capa = lerChave('capaBlobId');
      const dono = lerChave('dono');
      const campanhaId = lerChave('campanhaId');
      if (capa !== undefined) c.capaBlobId = capa;
      if (dono !== undefined) c.dono = dono;
      if (campanhaId !== undefined) c.campanhaId = campanhaId;
      return c;
    },
    iniciar(dono, nome, campanhaId) {
      if (lerChave('dono') !== undefined) return false;
      gravarChave('dono', dono);
      gravarChave('nome', nome);
      if (campanhaId !== undefined) gravarChave('campanhaId', campanhaId);
      return true;
    },
    definirConfig(nome, capaBlobId) {
      gravarChave('nome', nome);
      gravarChave('capaBlobId', capaBlobId);
    },

    donoDaFicha(id) {
      const r = um('SELECT dono FROM fichas WHERE id = ?', id);
      return r ? String(r.dono) : null;
    },
    idsDoDono(discordId) {
      return rodar('SELECT id FROM fichas WHERE dono = ? ORDER BY id', discordId).map(r => String(r.id));
    },
    ficha(id) {
      const r = um('SELECT * FROM fichas WHERE id = ?', id);
      return r ? guardada(r) : null;
    },
    fichas(dono) {
      const linhas = dono === undefined
        ? rodar('SELECT * FROM fichas ORDER BY id')
        : rodar('SELECT * FROM fichas WHERE dono = ? ORDER BY id', dono);
      return linhas.map(r => ({ id: String(r.id), ...guardada(r) }));
    },
    salvarFicha(ficha, dono, revDoCliente, agora) {
      const json = JSON.stringify(ficha);
      if (BYTES.encode(json).length > LIMITE_FICHA_BYTES) {
        throw new ErroEstado('ficha-grande', 'a ficha passa de 1,5 MB');
      }
      const atual = um('SELECT dono, rev FROM fichas WHERE id = ?', ficha.id);
      const revAtual = atual ? Number(atual.rev) : 0;
      const donoFinal = atual ? String(atual.dono) : dono;
      const rev = Math.max(revAtual, revDoCliente) + 1;
      rodar('INSERT OR REPLACE INTO fichas (id, dono, rev, json, atualizada_em) VALUES (?, ?, ?, ?, ?)', ficha.id, donoFinal, rev, json, agora);
      return { rev, dono: donoFinal, conflito: atual !== null && revDoCliente < revAtual };
    },
    entregarFicha(id, dono) {
      if (!um('SELECT 1 AS x FROM fichas WHERE id = ?', id)) return null;
      rodar('UPDATE fichas SET dono = ? WHERE id = ?', dono, id);
      // a ficha entregue deixa de ser o personagem de quem a perdeu
      rodar('DELETE FROM personagens WHERE ficha_id = ? AND discord_id <> ?', id, dono);
      const r = um('SELECT * FROM fichas WHERE id = ?', id);
      return r ? guardada(r) : null;
    },

    registrarRolagem(envelope, autor, agora) {
      rodar('INSERT OR REPLACE INTO rolagens (id, em, autor, json) VALUES (?, ?, ?, ?)', envelope.id, typeof envelope.em === 'number' ? envelope.em : agora, autor, JSON.stringify(envelope));
      rodar('DELETE FROM rolagens WHERE rowid <= (SELECT rowid FROM rolagens ORDER BY rowid DESC LIMIT 1 OFFSET ?)', MAX_ROLAGENS);
    },
    rolagens(ultimas) {
      const linhas = ultimas === undefined
        ? rodar('SELECT json FROM rolagens ORDER BY rowid')
        : rodar('SELECT json FROM (SELECT rowid AS r, json FROM rolagens ORDER BY rowid DESC LIMIT ?) ORDER BY r', ultimas);
      return linhas.map(r => JSON.parse(String(r.json)) as Envelope);
    },

    guardarUltimo(canal, msg) {
      rodar('INSERT OR REPLACE INTO ultimo (canal, json) VALUES (?, ?)', canal, JSON.stringify(msg));
    },
    ultimoEstado() {
      const saida: Record<string, unknown> = {};
      for (const r of rodar('SELECT canal, json FROM ultimo ORDER BY canal')) saida[String(r.canal)] = JSON.parse(String(r.json));
      return saida;
    },

    guardarPedaco(cab, dados) {
      if (dados.length > TAMANHO_PEDACO || cab.n > MAX_PEDACOS) {
        throw new ErroEstado('pedaco-invalido', 'pedaço ou blob grande demais');
      }
      rodar('INSERT OR REPLACE INTO blobs (id, i, n, tipo, dados) VALUES (?, ?, ?, ?, ?)', cab.id, cab.i, cab.n, cab.tipo, dados);
    },
    temBlob(id) {
      const r = um('SELECT COUNT(*) AS c, MAX(n) AS n FROM blobs WHERE id = ?', id);
      return !!r && Number(r.c) > 0 && Number(r.c) === Number(r.n);
    },

    apagarBlob(id) { rodar('DELETE FROM blobs WHERE id = ?', id); },
    apagarBlobsComPrefixo(prefixo, manter) {
      const ids = rodar('SELECT DISTINCT id FROM blobs WHERE substr(id, 1, ?) = ? AND id != ?', prefixo.length, prefixo, manter);
      for (const r of ids) rodar('DELETE FROM blobs WHERE id = ?', String(r.id));
      return ids.length;
    },
    pedacosDoBlob(id) {
      if (!this.temBlob(id)) return null;
      return rodar('SELECT i, n, tipo, dados FROM blobs WHERE id = ? ORDER BY i', id).map(r => ({
        cab: { id, i: Number(r.i), n: Number(r.n), tipo: String(r.tipo) },
        dados: new Uint8Array(r.dados as ArrayBuffer | Uint8Array),
      }));
    },
    guardarCitados(canal, tipo, ids) {
      if (ids.length === 0) rodar('DELETE FROM citados WHERE canal = ? AND tipo = ?', canal, tipo);
      else rodar('INSERT OR REPLACE INTO citados (canal, tipo, ids) VALUES (?, ?, ?)', canal, tipo, JSON.stringify(ids));
    },
    blobsCitados() {
      const todos = new Set<string>();
      for (const r of rodar('SELECT ids FROM citados ORDER BY canal, tipo')) for (const id of JSON.parse(String(r.ids)) as string[]) todos.add(id);
      return [...todos];
    },

    tamanhoDoBlob(id) {
      if (!this.temBlob(id)) return null;
      const r = um('SELECT SUM(LENGTH(dados)) AS t FROM blobs WHERE id = ?', id);
      return r ? Number(r.t) : null;
    },

    guardarMix(envelope) {
      rodar('INSERT OR REPLACE INTO ultimo_evento (tipo, json) VALUES (?, ?)', 'jukebox.mix', JSON.stringify(envelope));
    },
    ultimoMix() {
      const r = um('SELECT json FROM ultimo_evento WHERE tipo = ?', 'jukebox.mix');
      return r ? JSON.parse(String(r.json)) as Envelope : null;
    },
    lembrarEfeito(faixaId) {
      const r = um('SELECT json FROM ultimo_evento WHERE tipo = ?', 'efeitos');
      const lista = (r ? JSON.parse(String(r.json)) as string[] : []).filter(x => x !== faixaId);
      lista.push(faixaId);
      rodar('INSERT OR REPLACE INTO ultimo_evento (tipo, json) VALUES (?, ?)', 'efeitos', JSON.stringify(lista.slice(-MAX_EFEITOS_LEMBRADOS)));
    },
    blobsPedidos() {
      const todos = new Set<string>(this.blobsCitados());
      const capa = lerChave('capaBlobId');
      if (capa) todos.add(capa);
      const mix = this.ultimoMix();
      const faixas = (mix?.dados as { faixas?: unknown } | undefined)?.faixas;
      if (Array.isArray(faixas)) for (const f of faixas) if (f && typeof (f as { faixaId?: unknown }).faixaId === 'string') todos.add((f as { faixaId: string }).faixaId);
      const e = um('SELECT json FROM ultimo_evento WHERE tipo = ?', 'efeitos');
      if (e) for (const id of JSON.parse(String(e.json)) as string[]) todos.add(id);
      return [...todos];
    },

    personagem(discordId) {
      const r = um('SELECT ficha_id FROM personagens WHERE discord_id = ?', discordId);
      return r ? String(r.ficha_id) : null;
    },
    escolherPersonagem(discordId, fichaId) {
      if (fichaId === null) rodar('DELETE FROM personagens WHERE discord_id = ?', discordId);
      else rodar('INSERT OR REPLACE INTO personagens (discord_id, ficha_id) VALUES (?, ?)', discordId, fichaId);
    },
  };
}

/** Membros conectados, sem repetir `discordId` (o mestre pode ter a ponte e uma aba), com o personagem de cada um. */
export function montarMembros(conectados: readonly Eu[], personagemDe: (discordId: string) => string | null): Membro[] {
  const vistos = new Set<string>();
  const saida: Membro[] = [];
  for (const c of conectados) {
    if (vistos.has(c.discordId)) continue;
    vistos.add(c.discordId);
    saida.push({
      discordId: c.discordId,
      nome: c.nome,
      papel: c.papel,
      ...(c.avatar !== undefined ? { avatar: c.avatar } : {}),
      personagem: personagemDe(c.discordId),
    });
  }
  return saida;
}

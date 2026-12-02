/**
 * Estado durável da sala (Durable Object com SQLite). Código puro: recebe um `{ exec }`, que no Worker é
 * `ctx.storage.sql` e nos testes é um `node:sqlite` em memória.
 */

import type { DesafioAtivo } from '../src/dominio/desafios.ts';
import type {
  Autor, ComandoConstrucao, ConfigSala, Envelope, FichaDaSala, Membro, ModoDaSala, NotaConstrucao,
  OpConstrucao, ResumoConstrucao, Eu,
} from '../src/online/protocolo.ts';
import {
  LIMITE_OP_CONSTRUCAO_BYTES, MAX_COMANDOS_POR_OP, PREFIXO_BLOB_CONSTRUCAO, TAMANHO_PEDACO,
  type CabecalhoPedaco,
} from '../src/online/protocolo.ts';

/** O mínimo do SQL do Durable Object que o estado usa. */
export interface Sql {
  exec(sql: string, ...params: any[]): Iterable<Record<string, unknown>>;
}

/** Limite do JSON de uma ficha (um valor de SQLite do Durable Object cabe em 2 MB). */
export const LIMITE_FICHA_BYTES = 1.5 * 1024 * 1024;
/** Limite do JSON de um snapshot inline de construção (acima disso vai por blob gzip). */
export const LIMITE_SNAPSHOT_CONSTRUCAO_BYTES = 1.5 * 1024 * 1024;
/** Limite em bytes de uma nota rápida da construção. */
export const LIMITE_NOTA_CONSTRUCAO_BYTES = 8 * 1024;
/** Quantas rolagens a sala lembra. */
export const MAX_ROLAGENS = 200;
/** Quantas notas rápidas da construção a sala lembra. */
export const MAX_NOTAS_CONSTRUCAO = 100;
/** Quantos efeitos tocados a sala lembra (os arquivos deles continuam pedíveis). */
export const MAX_EFEITOS_LEMBRADOS = 50;
/** Máximo de pedaços de um blob (128 × 512 KB = 64 MB). */
export const MAX_PEDACOS = 128;
/** Máximo de pedaços de um blob de snapshot da construção (20 × 512 KB = 10 MB). */
export const MAX_PEDACOS_CONSTRUCAO = 20;

export class ErroEstado extends Error {
  codigo: 'ficha-grande' | 'pedaco-invalido' | 'op-grande' | 'snapshot-grande' | 'nota-grande';
  constructor(codigo: 'ficha-grande' | 'pedaco-invalido' | 'op-grande' | 'snapshot-grande' | 'nota-grande', mensagem: string) {
    super(mensagem);
    this.codigo = codigo;
  }
}

export interface EstadoConstrucao {
  mapa?: Record<string, unknown>;
  blobId?: string;
  nome?: string;
  rev: number;
  ops: OpConstrucao[];
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
  /** Config da sala (`nome`, `capaBlobId`, `dono`, `campanhaId`, `modo`). */
  config(): ConfigSala;
  /** Modo atual da sala (`'sessao'` por padrão). */
  modo(): ModoDaSala;
  definirModo(modo: ModoDaSala): void;
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
  apagarUltimo(canal: string): void;
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
  /** Os blobs que `blob.pedir` entrega: os do último `mix`, os dos efeitos lembrados, os citados nos últimos `canal` e o snapshot da construção. */
  blobsPedidos(): string[];

  personagem(discordId: string): string | null;
  escolherPersonagem(discordId: string, fichaId: string | null): void;
  /** Desafio ativo na sessão atual (com estado completo, antes da sanitização por papel). */
  desafio(): DesafioAtivo | null;
  definirDesafio(desafio: DesafioAtivo | null): void;
  /** Limpa o estado projetado (`ultimo`), citações de blobs da projeção, desafio ativo e escolhas de personagem da sessão; mantém fichas, blobs, config, construção e rolagens. */
  limparSessao(): void;

  /** Há algum mapa em construção aberto na sala? */
  temMapaConstrucao(): boolean;
  /** Abre ou substitui o mapa da construção (`rev = 0`, limpa ops, notas e blobs antigos `construcao:`). */
  abrirConstrucao(entrada: { mapa?: Record<string, unknown>; blobId?: string; nome?: string }): EstadoConstrucao;
  /** Fecha o mapa da construção e limpa ops, notas e blobs `construcao:`. */
  fecharConstrucao(): void;
  /** Registra uma operação de construção com `rev` monotônica; `null` se não houver mapa aberto. */
  registrarOpConstrucao(entrada: {
    opId: string;
    autor: Autor;
    comandos: ComandoConstrucao[];
    rotulo?: string;
    em: number;
  }): OpConstrucao | null;
  /** Compacta o estado até `rev` (só avança se `rev > snapshot.rev` e `rev <= última rev`), podando `construcao_ops` e blobs antigos. */
  salvarSnapshotConstrucao(entrada: { rev: number; mapa?: Record<string, unknown>; blobId?: string; nome?: string }): boolean;
  /** Estado atual da construção (`snapshot` + `ops` posteriores), ou `null` se não houver mapa aberto. */
  estadoConstrucao(): EstadoConstrucao | null;
  /** Resumo leve da construção para o `bem-vindo`. */
  resumoConstrucao(): ResumoConstrucao;
  /** Grava uma nota rápida da construção, mantendo no máximo `MAX_NOTAS_CONSTRUCAO`. */
  registrarNotaConstrucao(entrada: { id: string; autor: Autor; texto: string; em: number }): NotaConstrucao;
  /** Últimas notas rápidas da construção, da mais antiga à mais nova. */
  notasConstrucao(ultimas?: number): NotaConstrucao[];
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
  rodar('CREATE TABLE IF NOT EXISTS construcao_mapa (id INTEGER PRIMARY KEY, rev INTEGER NOT NULL, snapshot_json TEXT, snapshot_blob_id TEXT, mapa_nome TEXT)');
  rodar('CREATE TABLE IF NOT EXISTS construcao_ops (rev INTEGER PRIMARY KEY, autor_json TEXT NOT NULL, op_id TEXT NOT NULL, comandos_json TEXT NOT NULL, rotulo TEXT, em INTEGER NOT NULL)');
  rodar('CREATE TABLE IF NOT EXISTS construcao_notas (id TEXT PRIMARY KEY, autor_json TEXT NOT NULL, texto TEXT NOT NULL, em INTEGER NOT NULL)');
  rodar('CREATE TABLE IF NOT EXISTS desafio_ativo (id INTEGER PRIMARY KEY, json TEXT NOT NULL)');

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
  const opDaLinha = (r: Record<string, unknown>): OpConstrucao => ({
    rev: Number(r.rev),
    opId: String(r.op_id),
    autor: JSON.parse(String(r.autor_json)) as Autor,
    comandos: JSON.parse(String(r.comandos_json)) as ComandoConstrucao[],
    ...(r.rotulo !== null && r.rotulo !== undefined ? { rotulo: String(r.rotulo) } : {}),
    em: Number(r.em),
  });

  return {
    config() {
      const c: ConfigSala = { nome: lerChave('nome') ?? '' };
      const capa = lerChave('capaBlobId');
      const dono = lerChave('dono');
      const campanhaId = lerChave('campanhaId');
      const modo = lerChave('modo');
      if (capa !== undefined) c.capaBlobId = capa;
      if (dono !== undefined) c.dono = dono;
      if (campanhaId !== undefined) c.campanhaId = campanhaId;
      if (modo === 'sessao' || modo === 'construcao') c.modo = modo;
      return c;
    },
    modo() {
      return lerChave('modo') === 'construcao' ? 'construcao' : 'sessao';
    },
    definirModo(modo) {
      gravarChave('modo', modo);
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
    apagarUltimo(canal) {
      rodar('DELETE FROM ultimo WHERE canal = ?', canal);
    },
    ultimoEstado() {
      const saida: Record<string, unknown> = {};
      for (const r of rodar('SELECT canal, json FROM ultimo ORDER BY canal')) saida[String(r.canal)] = JSON.parse(String(r.json));
      return saida;
    },

    guardarPedaco(cab, dados) {
      const maxPedacos = cab.id.startsWith(PREFIXO_BLOB_CONSTRUCAO) ? MAX_PEDACOS_CONSTRUCAO : MAX_PEDACOS;
      if (dados.length > TAMANHO_PEDACO || cab.n > maxPedacos) {
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
      const snap = um('SELECT snapshot_blob_id FROM construcao_mapa WHERE id = 1');
      if (snap && typeof snap.snapshot_blob_id === 'string' && snap.snapshot_blob_id) todos.add(snap.snapshot_blob_id);
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
    desafio() {
      const r = um('SELECT json FROM desafio_ativo WHERE id = 1');
      return r ? JSON.parse(String(r.json)) as DesafioAtivo : null;
    },
    definirDesafio(desafio) {
      if (desafio === null) rodar('DELETE FROM desafio_ativo WHERE id = 1');
      else rodar('INSERT OR REPLACE INTO desafio_ativo (id, json) VALUES (1, ?)', JSON.stringify(desafio));
    },
    limparSessao() {
      rodar('DELETE FROM ultimo');
      rodar('DELETE FROM citados');
      rodar('DELETE FROM personagens');
      rodar('DELETE FROM desafio_ativo');
    },

    temMapaConstrucao() {
      return um('SELECT 1 AS x FROM construcao_mapa WHERE id = 1') !== null;
    },
    abrirConstrucao(entrada) {
      if (entrada.mapa === undefined && !entrada.blobId) {
        throw new ErroEstado('pedaco-invalido', 'mapa de construção precisa de mapa ou blobId');
      }
      const json = entrada.mapa !== undefined ? JSON.stringify(entrada.mapa) : undefined;
      if (json !== undefined && BYTES.encode(json).length > LIMITE_SNAPSHOT_CONSTRUCAO_BYTES) {
        throw new ErroEstado('snapshot-grande', 'o mapa passa de 1,5 MB; envie comprimido');
      }
      const nomeExtraido = entrada.nome
        ?? (entrada.mapa && typeof entrada.mapa.name === 'string' && entrada.mapa.name ? entrada.mapa.name : undefined);
      rodar('DELETE FROM construcao_ops');
      rodar('DELETE FROM construcao_notas');
      this.apagarBlobsComPrefixo(PREFIXO_BLOB_CONSTRUCAO, entrada.blobId ?? '');
      rodar(
        'INSERT OR REPLACE INTO construcao_mapa (id, rev, snapshot_json, snapshot_blob_id, mapa_nome) VALUES (1, 0, ?, ?, ?)',
        json ?? null,
        entrada.blobId ?? null,
        nomeExtraido ?? null,
      );
      return {
        ...(entrada.mapa !== undefined ? { mapa: entrada.mapa } : {}),
        ...(entrada.blobId !== undefined ? { blobId: entrada.blobId } : {}),
        ...(nomeExtraido !== undefined ? { nome: nomeExtraido } : {}),
        rev: 0,
        ops: [],
      };
    },
    fecharConstrucao() {
      rodar('DELETE FROM construcao_mapa');
      rodar('DELETE FROM construcao_ops');
      rodar('DELETE FROM construcao_notas');
      this.apagarBlobsComPrefixo(PREFIXO_BLOB_CONSTRUCAO, '');
    },
    registrarOpConstrucao(entrada) {
      const mapaRow = um('SELECT rev FROM construcao_mapa WHERE id = 1');
      if (!mapaRow) return null;
      if (entrada.comandos.length === 0 || entrada.comandos.length > MAX_COMANDOS_POR_OP) {
        throw new ErroEstado('op-grande', 'quantidade de comandos inválida na operação');
      }
      const comandosJson = JSON.stringify(entrada.comandos);
      if (BYTES.encode(comandosJson).length > LIMITE_OP_CONSTRUCAO_BYTES) {
        throw new ErroEstado('op-grande', 'operação de construção grande demais');
      }
      const maxOpRow = um('SELECT MAX(rev) AS r FROM construcao_ops');
      const revAtual = Math.max(Number(mapaRow.rev), maxOpRow && maxOpRow.r !== null ? Number(maxOpRow.r) : 0);
      const rev = revAtual + 1;
      rodar(
        'INSERT INTO construcao_ops (rev, autor_json, op_id, comandos_json, rotulo, em) VALUES (?, ?, ?, ?, ?, ?)',
        rev,
        JSON.stringify(entrada.autor),
        entrada.opId,
        comandosJson,
        entrada.rotulo ?? null,
        entrada.em,
      );
      return {
        rev,
        opId: entrada.opId,
        autor: entrada.autor,
        comandos: entrada.comandos,
        ...(entrada.rotulo !== undefined ? { rotulo: entrada.rotulo } : {}),
        em: entrada.em,
      };
    },
    salvarSnapshotConstrucao(entrada) {
      const atual = um('SELECT rev, snapshot_blob_id, mapa_nome FROM construcao_mapa WHERE id = 1');
      if (!atual) return false;
      if (entrada.mapa === undefined && !entrada.blobId) {
        throw new ErroEstado('pedaco-invalido', 'snapshot precisa de mapa ou blobId');
      }
      const json = entrada.mapa !== undefined ? JSON.stringify(entrada.mapa) : undefined;
      if (json !== undefined && BYTES.encode(json).length > LIMITE_SNAPSHOT_CONSTRUCAO_BYTES) {
        throw new ErroEstado('snapshot-grande', 'o snapshot passa de 1,5 MB; envie comprimido');
      }
      const revSnapshotAtual = Number(atual.rev);
      const maxOpRow = um('SELECT MAX(rev) AS r FROM construcao_ops');
      const ultimaRev = Math.max(revSnapshotAtual, maxOpRow && maxOpRow.r !== null ? Number(maxOpRow.r) : 0);
      const blobAtual = typeof atual.snapshot_blob_id === 'string' ? atual.snapshot_blob_id : undefined;

      if (entrada.rev <= revSnapshotAtual || entrada.rev > ultimaRev) {
        if (entrada.blobId && entrada.blobId.startsWith(PREFIXO_BLOB_CONSTRUCAO) && entrada.blobId !== blobAtual) {
          this.apagarBlob(entrada.blobId);
        }
        return false;
      }

      const nomeExtraido = entrada.nome
        ?? (entrada.mapa && typeof entrada.mapa.name === 'string' && entrada.mapa.name ? entrada.mapa.name : undefined);
      const nomeFinal = nomeExtraido ?? (typeof atual.mapa_nome === 'string' ? atual.mapa_nome : undefined);

      rodar(
        'INSERT OR REPLACE INTO construcao_mapa (id, rev, snapshot_json, snapshot_blob_id, mapa_nome) VALUES (1, ?, ?, ?, ?)',
        entrada.rev,
        json ?? null,
        entrada.blobId ?? null,
        nomeFinal ?? null,
      );
      rodar('DELETE FROM construcao_ops WHERE rev <= ?', entrada.rev);
      this.apagarBlobsComPrefixo(PREFIXO_BLOB_CONSTRUCAO, entrada.blobId ?? '');
      return true;
    },
    estadoConstrucao() {
      const r = um('SELECT rev, snapshot_json, snapshot_blob_id, mapa_nome FROM construcao_mapa WHERE id = 1');
      if (!r) return null;
      const ops = rodar('SELECT rev, autor_json, op_id, comandos_json, rotulo, em FROM construcao_ops ORDER BY rev').map(opDaLinha);
      return {
        ...(r.snapshot_json !== null && r.snapshot_json !== undefined
          ? { mapa: JSON.parse(String(r.snapshot_json)) as Record<string, unknown> }
          : {}),
        ...(r.snapshot_blob_id !== null && r.snapshot_blob_id !== undefined
          ? { blobId: String(r.snapshot_blob_id) }
          : {}),
        ...(r.mapa_nome !== null && r.mapa_nome !== undefined ? { nome: String(r.mapa_nome) } : {}),
        rev: Number(r.rev),
        ops,
      };
    },
    resumoConstrucao() {
      const r = um('SELECT rev, mapa_nome FROM construcao_mapa WHERE id = 1');
      if (!r) return { temMapa: false, rev: 0 };
      const maxOpRow = um('SELECT MAX(rev) AS r FROM construcao_ops');
      const rev = Math.max(Number(r.rev), maxOpRow && maxOpRow.r !== null ? Number(maxOpRow.r) : 0);
      return {
        temMapa: true,
        ...(r.mapa_nome !== null && r.mapa_nome !== undefined ? { nome: String(r.mapa_nome) } : {}),
        rev,
      };
    },
    registrarNotaConstrucao(entrada) {
      if (BYTES.encode(entrada.texto).length > LIMITE_NOTA_CONSTRUCAO_BYTES) {
        throw new ErroEstado('nota-grande', 'nota de construção grande demais');
      }
      rodar(
        'INSERT OR REPLACE INTO construcao_notas (id, autor_json, texto, em) VALUES (?, ?, ?, ?)',
        entrada.id,
        JSON.stringify(entrada.autor),
        entrada.texto,
        entrada.em,
      );
      rodar('DELETE FROM construcao_notas WHERE rowid <= (SELECT rowid FROM construcao_notas ORDER BY rowid DESC LIMIT 1 OFFSET ?)', MAX_NOTAS_CONSTRUCAO);
      return { id: entrada.id, autor: entrada.autor, texto: entrada.texto, em: entrada.em };
    },
    notasConstrucao(ultimas) {
      const linhas = ultimas === undefined
        ? rodar('SELECT id, autor_json, texto, em FROM construcao_notas ORDER BY rowid')
        : rodar('SELECT id, autor_json, texto, em FROM (SELECT rowid AS r, id, autor_json, texto, em FROM construcao_notas ORDER BY rowid DESC LIMIT ?) ORDER BY r', ultimas);
      return linhas.map(r => ({
        id: String(r.id),
        autor: JSON.parse(String(r.autor_json)) as Autor,
        texto: String(r.texto),
        em: Number(r.em),
      }));
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

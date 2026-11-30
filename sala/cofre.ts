/**
 * Lógica pura do cofre de fichas de uma conta do Discord (sem tipos do Workers, testada no Node).
 * Um Durable Object por `discordId`; a classe `CofreJogador`, que só traduz HTTP, está em `cofre-jogador.ts`.
 */
import type { Sql } from './estado.ts';

export const LIMITE_FICHA_BYTES = 2_000_000;
export const LIMITE_FICHAS_POR_CONTA = 200;

export interface FichaDoCofre {
  id: string;
  json: string;
  atualizadaEm: number;
}

export interface Cofre {
  listar(): FichaDoCofre[];
  /** `ok`; `invalida` se o JSON não é um objeto; `grande` acima do limite de bytes; `cheio` acima do limite de fichas. */
  salvar(id: string, json: string, agora: number): 'ok' | 'invalida' | 'grande' | 'cheio';
  remover(id: string): void;
}

export const idDeFichaValido = (id: unknown): id is string => typeof id === 'string' && /^[\w.-]{1,80}$/.test(id);

export function criarCofre(sql: Sql): Cofre {
  const rodar = (q: string, ...p: unknown[]): Array<Record<string, unknown>> => Array.from(sql.exec(q, ...p));
  rodar('CREATE TABLE IF NOT EXISTS fichas (id TEXT PRIMARY KEY, json TEXT NOT NULL, updated_at INTEGER NOT NULL)');
  return {
    listar() {
      return rodar('SELECT id, json, updated_at FROM fichas ORDER BY updated_at DESC')
        .map(r => ({ id: String(r.id), json: String(r.json), atualizadaEm: Number(r.updated_at) }));
    },
    salvar(id, json, agora) {
      let objeto: unknown;
      try { objeto = JSON.parse(json); } catch { return 'invalida'; }
      if (!objeto || typeof objeto !== 'object' || Array.isArray(objeto)) return 'invalida';
      if (new TextEncoder().encode(json).length > LIMITE_FICHA_BYTES) return 'grande';
      const existe = rodar('SELECT 1 AS x FROM fichas WHERE id = ?', id).length > 0;
      if (!existe && Number(rodar('SELECT COUNT(*) AS n FROM fichas')[0]?.n ?? 0) >= LIMITE_FICHAS_POR_CONTA) return 'cheio';
      rodar('INSERT OR REPLACE INTO fichas (id, json, updated_at) VALUES (?, ?, ?)', id, json, agora);
      return 'ok';
    },
    remover(id) {
      rodar('DELETE FROM fichas WHERE id = ?', id);
    },
  };
}

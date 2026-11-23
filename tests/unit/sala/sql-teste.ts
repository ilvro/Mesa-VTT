import { DatabaseSync } from 'node:sqlite';
import type { Sql } from '../../../sala/estado.ts';

/** O SQLite do Durable Object, no Node: `node:sqlite` em memória. */
export function sqlEmMemoria(): Sql {
  const db = new DatabaseSync(':memory:');
  return { exec: (q, ...p) => db.prepare(q).all(...p) as Array<Record<string, unknown>> };
}

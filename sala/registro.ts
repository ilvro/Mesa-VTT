/**
 * Lógica pura do diretório (sem tipos do Workers, testada no Node): liga cada servidor do Discord (`guildId`) à sala da campanha e guarda as salas de cada mestre.
 * Um único Durable Object (`idFromName('diretorio')`). A classe `Diretorio`, que só traduz HTTP, está em `diretorio.ts`.
 */

import type { Sql } from './estado.ts';

export interface SalaDoMestre {
  salaId: string;
  nome: string;
  criadaEm: number;
}

export interface RegistroDiretorio {
  /** Registra uma sala nova de `dono`. */
  registrarSala(salaId: string, dono: string, nome: string, agora: number): void;
  /** `ok`; `desconhecida` se a sala não existe; `nao-dono` se `discordId` não é o dono dela. */
  ligar(guildId: string, salaId: string, discordId: string): 'ok' | 'desconhecida' | 'nao-dono';
  /** A sala ligada ao servidor, ou `null`. */
  consultar(guildId: string): string | null;
  /** As salas de um mestre, as mais novas primeiro. */
  salasDoMestre(dono: string): SalaDoMestre[];
  /** Registra que a atividade foi aberta neste servidor do Discord (R18). */
  registrarGuilda(guildId: string, agora: number): void;
  /** Lista os ids dos servidores onde a atividade já foi vista. */
  guildasVistas(): string[];
}

export function criarDiretorio(sql: Sql): RegistroDiretorio {
  const rodar = (q: string, ...p: unknown[]): Array<Record<string, unknown>> => Array.from(sql.exec(q, ...p));
  rodar('CREATE TABLE IF NOT EXISTS salas (sala_id TEXT PRIMARY KEY, dono TEXT NOT NULL, nome TEXT NOT NULL, criada_em INTEGER NOT NULL)');
  rodar('CREATE INDEX IF NOT EXISTS salas_dono ON salas (dono)');
  rodar('CREATE TABLE IF NOT EXISTS ligacoes (guild_id TEXT PRIMARY KEY, sala_id TEXT NOT NULL)');
  rodar('CREATE TABLE IF NOT EXISTS guildas_vistas (guild_id TEXT PRIMARY KEY, vista_em INTEGER NOT NULL)');
  return {
    registrarSala(salaId, dono, nome, agora) {
      rodar('INSERT OR REPLACE INTO salas (sala_id, dono, nome, criada_em) VALUES (?, ?, ?, ?)', salaId, dono, nome, agora);
    },
    ligar(guildId, salaId, discordId) {
      const s = rodar('SELECT dono FROM salas WHERE sala_id = ?', salaId)[0];
      if (!s) return 'desconhecida';
      if (String(s.dono) !== discordId) return 'nao-dono';
      rodar('INSERT OR REPLACE INTO ligacoes (guild_id, sala_id) VALUES (?, ?)', guildId, salaId);
      return 'ok';
    },
    consultar(guildId) {
      const r = rodar('SELECT sala_id FROM ligacoes WHERE guild_id = ?', guildId)[0];
      return r ? String(r.sala_id) : null;
    },
    salasDoMestre(dono) {
      return rodar('SELECT sala_id, nome, criada_em FROM salas WHERE dono = ? ORDER BY criada_em DESC, rowid DESC', dono)
        .map(r => ({ salaId: String(r.sala_id), nome: String(r.nome), criadaEm: Number(r.criada_em) }));
    },
    registrarGuilda(guildId, agora) {
      if (!guildId) return;
      rodar('INSERT OR REPLACE INTO guildas_vistas (guild_id, vista_em) VALUES (?, ?)', guildId, agora);
    },
    guildasVistas() {
      return rodar('SELECT guild_id FROM guildas_vistas ORDER BY vista_em DESC').map(r => String(r.guild_id));
    },
  };
}

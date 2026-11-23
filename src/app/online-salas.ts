/** Chamadas HTTP da tela `#/online` à sala: listar, criar e ligar a um servidor do Discord. Sempre com `Authorization: Bearer <sessao>`. */
import { urlDaSala } from '../online/config.ts';

export interface SalaDoMestre { salaId: string; nome: string; criadaEm: number }

export const chaveDaSalaDaCampanha = (campanhaId: string): string => `mesa:sala:${campanhaId}`;

async function pedir<T>(sessao: string, metodo: 'GET' | 'POST', caminho: string, corpo?: unknown, f: typeof fetch = fetch, base: string = urlDaSala()): Promise<T> {
  const r = await f(`${base}${caminho}`, {
    method: metodo,
    headers: { Authorization: `Bearer ${sessao}`, ...(corpo !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    ...(corpo !== undefined ? { body: JSON.stringify(corpo) } : {}),
  });
  const d = await r.json().catch(() => ({})) as T & { erro?: string };
  if (!r.ok) throw new Error(d.erro ?? `a sala respondeu ${r.status}`);
  return d;
}

export async function listarMinhasSalas(sessao: string, f?: typeof fetch): Promise<SalaDoMestre[]> {
  return (await pedir<{ salas?: SalaDoMestre[] }>(sessao, 'GET', '/sala/minhas', undefined, f)).salas ?? [];
}

/** Cria a sala da campanha e guarda o id em `localStorage['mesa:sala:<campanhaId>']`. */
export async function criarSala(sessao: string, nome: string, campanhaId: string, f?: typeof fetch): Promise<{ salaId: string; nome: string }> {
  const r = await pedir<{ salaId: string; nome: string }>(sessao, 'POST', '/sala/nova', { nome, campanhaId }, f);
  try { localStorage.setItem(chaveDaSalaDaCampanha(campanhaId), r.salaId); } catch { /* ignora */ }
  return r;
}

export async function ligarAoServidor(sessao: string, guildId: string, salaId: string, f?: typeof fetch): Promise<void> {
  await pedir(sessao, 'POST', '/sala/diretorio/ligar', { guildId, salaId }, f);
}

export function salaDaCampanha(campanhaId: string | undefined): string | null {
  if (!campanhaId) return null;
  try { return localStorage.getItem(chaveDaSalaDaCampanha(campanhaId)); } catch { return null; }
}

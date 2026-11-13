import type { Ref } from '#mesa';
import type { MomentoDoMapa } from '../dominio/cenas.ts';

const PREFIXO_DO_BANCO_DO_ATLAS = 'atlas-v1:';

/** Abre um banco existente sem criá-lo nem alterar a versão; `null` se não der. */
function abrirExistente(nome: string): Promise<IDBDatabase | null> {
  return new Promise(resolver => {
    const req = indexedDB.open(nome);
    req.onerror = () => resolver(null);
    req.onblocked = () => resolver(null);
    req.onsuccess = () => resolver(req.result);
  });
}

/**
 * Lê os momentos de um mapa do Atlas direto do banco do Atlas (mesma origem, banco `atlas-v1:<caminho>`).
 * Devolve `null` quando não dá para ler (outra origem, como no dev com portas diferentes, ou mapa fora do banco):
 * quem chama decide o que fazer sem a lista.
 */
export async function momentosDoMapaDoAtlas(mapa: Ref): Promise<MomentoDoMapa[] | null> {
  if (typeof indexedDB === 'undefined' || typeof indexedDB.databases !== 'function') return null;
  const id = mapa.tipo === 'comodo' ? mapa.id.split('/')[0]! : mapa.id;
  try {
    const bancos = (await indexedDB.databases()).map(d => d.name).filter((n): n is string => !!n && n.startsWith(PREFIXO_DO_BANCO_DO_ATLAS));
    for (const nome of bancos) {
      const db = await abrirExistente(nome);
      if (!db) continue;
      try {
        if (!db.objectStoreNames.contains('mapas')) continue;
        const doc = await new Promise<{ moments?: Record<string, { id?: unknown; nome?: unknown }> } | undefined>((ok, falhou) => {
          const q = db.transaction('mapas', 'readonly').objectStore('mapas').get(id);
          q.onsuccess = () => ok(q.result);
          q.onerror = () => falhou(q.error);
        });
        if (!doc) continue;
        return Object.values(doc.moments ?? {}).flatMap(m => (typeof m.id === 'string' && typeof m.nome === 'string' ? [{ id: m.id, nome: m.nome }] : []));
      } finally { db.close(); }
    }
  } catch { /* sem acesso ao banco do Atlas */ }
  return null;
}

import type { Campanha, Ref } from '#mesa';
import { barramentoDaMesa } from './barramento.ts';
import type { FatosDaCampanha } from '../dominio/prontidao.ts';
import type { PacoteDeCena } from '../dominio/cenas.ts';

const BANCO_DE_HANDOUTS = 'mesa-handouts-v1';

async function abrirBancoHandouts(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return null;
  if (typeof indexedDB.databases === 'function') {
    try {
      const dbs = await indexedDB.databases();
      if (!dbs.some(d => d.name === BANCO_DE_HANDOUTS)) return null;
    } catch {
      return null;
    }
  }
  return new Promise(resolver => {
    const req = indexedDB.open(BANCO_DE_HANDOUTS);
    req.onerror = () => resolver(null);
    req.onblocked = () => resolver(null);
    req.onsuccess = () => {
      const db = req.result;
      if (db.objectStoreNames.contains('handouts')) resolver(db);
      else {
        db.close();
        resolver(null);
      }
    };
  });
}

async function lerDocumentosEntregues(): Promise<Set<string>> {
  const ids = new Set<string>();
  const db = await abrirBancoHandouts();
  if (!db) return ids;
  try {
    const keys = await new Promise<IDBValidKey[]>((resolve, reject) => {
      const q = db.transaction('handouts', 'readonly').objectStore('handouts').getAllKeys();
      q.onsuccess = () => resolve(q.result);
      q.onerror = () => reject(q.error);
    });
    for (const k of keys) {
      if (typeof k === 'string') ids.add(k);
    }
  } catch {
    // ignora
  } finally {
    db.close();
  }
  return ids;
}

/**
 * Coleta os fatos da campanha necessários para a checagem de prontidão:
 * - Documentos entregues aos jogadores (mesa-handouts-v1);
 * - Prontidão das trilhas sonoras via barramento (jukebox.prontidao);
 * - Elenco definido na campanha.
 */
export async function carregarFatos(
  campanha: Pick<Campanha, 'elenco'>,
  pacotes: PacoteDeCena[]
): Promise<FatosDaCampanha> {
  const documentosEntregues = await lerDocumentosEntregues();

  const trilhasRefs = new Map<string, Ref>();
  for (const p of pacotes) {
    if (p.trilha) {
      trilhasRefs.set(p.trilha.ref.id, p.trilha.ref);
    }
  }

  const b = barramentoDaMesa();
  const mapaTrilhas = new Map<string, { total: number; faltando: number } | null>();

  await Promise.all(
    Array.from(trilhasRefs.entries()).map(async ([id, ref]) => {
      if (!b) {
        mapaTrilhas.set(id, null);
        return;
      }
      try {
        const timeoutPromise = new Promise<null>(resolve => setTimeout(() => resolve(null), 1500));
        const res = await Promise.race([
          b.pedir('jukebox.prontidao', { ref }).catch(() => null),
          timeoutPromise,
        ]);
        if (res && (res as any).ok) {
          mapaTrilhas.set(id, {
            total: Number((res as any).total) || 0,
            faltando: Number((res as any).faltando) || 0,
          });
        } else {
          mapaTrilhas.set(id, null);
        }
      } catch {
        mapaTrilhas.set(id, null);
      }
    })
  );

  return {
    documentosEntregues,
    trilhas: mapaTrilhas,
    elenco: campanha.elenco,
  };
}

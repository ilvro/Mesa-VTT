import type { Ref } from '#mesa';

/**
 * Leitor enxuto e somente-leitura do banco IndexedDB compartilhado `mesa-handouts-v1`
 * (contrato v1 do Ateliê: stores `handouts` e `bakes`).
 */
export const BANCO_DE_PISTAS = 'mesa-handouts-v1';

export interface PistaDoAtelie {
  id: string;
  name: string;
  hasUv: boolean;
  normal: Blob;
  uv: Blob | null;
  source?: string;
}

export interface OpcoesDePista {
  idb?: IDBFactory;
}

const ehObj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

/** Extrai o id do documento quando a Ref aponta para um documento do Ateliê. */
export function idDaPistaDoAtelie(ref: Ref | null | undefined): string | null {
  return ref && ref.app === 'atelie' && ref.tipo === 'documento' && ref.id ? ref.id : null;
}

const resolverIdb = (opcoes?: OpcoesDePista): IDBFactory | undefined =>
  opcoes?.idb ?? (typeof indexedDB !== 'undefined' ? indexedDB : undefined);

/**
 * Abre `mesa-handouts-v1` apenas se ele já existir e tiver as stores do contrato,
 * evitando criar um banco vazio ou alterar sua versão.
 */
async function abrirBancoDePistas(idb: IDBFactory): Promise<IDBDatabase | null> {
  if (typeof idb.databases === 'function') {
    try {
      const lista = await idb.databases();
      if (!lista.some(d => d.name === BANCO_DE_PISTAS)) return null;
    } catch {
      // Alguns ambientes restringem `databases()`; prossegue com guarda no `onupgradeneeded`.
    }
  }
  return new Promise(resolve => {
    try {
      const pedido = idb.open(BANCO_DE_PISTAS);
      pedido.onupgradeneeded = () => {
        try { pedido.transaction?.abort(); } catch { /* ignora */ }
      };
      pedido.onerror = () => resolve(null);
      pedido.onblocked = () => resolve(null);
      pedido.onsuccess = () => {
        const db = pedido.result;
        if (db.objectStoreNames.contains('handouts') && db.objectStoreNames.contains('bakes')) {
          resolve(db);
        } else {
          db.close();
          resolve(null);
        }
      };
    } catch {
      resolve(null);
    }
  });
}

/**
 * Lê metadados (`handouts`) e assados (`bakes`: `normal` e `uv`) de um documento do Ateliê.
 * Retorna `null` se o banco ou o documento não existirem ou não tiverem imagem `normal`.
 */
export async function obterPistaDoAtelie(
  documentoId: string,
  opcoes?: OpcoesDePista,
): Promise<PistaDoAtelie | null> {
  if (!documentoId) return null;
  const idb = resolverIdb(opcoes);
  if (!idb) return null;
  const db = await abrirBancoDePistas(idb);
  if (!db) return null;
  try {
    return await new Promise<PistaDoAtelie | null>(resolve => {
      const tx = db.transaction(['handouts', 'bakes'], 'readonly');
      const handoutReq = tx.objectStore('handouts').get(documentoId);
      const normalReq = tx.objectStore('bakes').get([documentoId, 'normal']);
      const uvReq = tx.objectStore('bakes').get([documentoId, 'uv']);
      tx.onerror = () => resolve(null);
      tx.onabort = () => resolve(null);
      tx.oncomplete = () => {
        const handout: unknown = handoutReq.result;
        const normalReg: unknown = normalReq.result;
        const uvReg: unknown = uvReq.result;

        const hObj = ehObj(handout) ? handout : null;
        const normal =
          ehObj(normalReg) && normalReg.blob instanceof Blob
            ? normalReg.blob
            : hObj && hObj.preview instanceof Blob
              ? hObj.preview
              : null;
        if (!normal) {
          resolve(null);
          return;
        }
        const uv = ehObj(uvReg) && uvReg.blob instanceof Blob ? uvReg.blob : null;
        const name = hObj && typeof hObj.name === 'string' && hObj.name ? hObj.name : documentoId;
        const hasUv = hObj?.hasUv === true || uv !== null;
        const source = hObj && typeof hObj.source === 'string' && hObj.source ? hObj.source : undefined;
        resolve({
          id: documentoId,
          name,
          hasUv,
          normal,
          uv,
          ...(source ? { source } : {}),
        });
      };
    });
  } catch {
    return null;
  } finally {
    db.close();
  }
}

const MAX_CACHE_MINIATURAS = 200;
const cacheMiniaturasPorIdb = new WeakMap<IDBFactory, Map<string, Blob>>();

/** Limpa o cache em memória de miniaturas (útil ao receber atualização do Ateliê ou em testes). */
export function limparCacheDePistas(opcoes?: OpcoesDePista): void {
  const idb = resolverIdb(opcoes);
  if (idb) cacheMiniaturasPorIdb.delete(idb);
}

/**
 * Devolve apenas o blob `normal` de uma pista do Ateliê, com cache leve em memória
 * por `documentoId` para evitar releituras repetidas do IndexedDB durante renders.
 */
export async function miniaturaDaPista(
  documentoId: string,
  opcoes?: OpcoesDePista,
): Promise<Blob | null> {
  if (!documentoId) return null;
  const idb = resolverIdb(opcoes);
  if (!idb) return null;

  let mapa = cacheMiniaturasPorIdb.get(idb);
  const emCache = mapa?.get(documentoId);
  if (emCache) return emCache;

  const pista = await obterPistaDoAtelie(documentoId, { idb });
  if (!pista) return null;

  if (!mapa) {
    mapa = new Map<string, Blob>();
    cacheMiniaturasPorIdb.set(idb, mapa);
  }
  if (mapa.size >= MAX_CACHE_MINIATURAS) {
    const maisAntigo = mapa.keys().next().value;
    if (maisAntigo !== undefined) mapa.delete(maisAntigo);
  }
  mapa.set(documentoId, pista.normal);
  return pista.normal;
}

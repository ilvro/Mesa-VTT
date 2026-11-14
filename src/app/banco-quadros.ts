import { abrirBanco, obterTudo, promessa, transacao, type DefinicaoStore } from '#mesa';
import type { EstadoDoMundo } from '../dominio/estado-do-mundo.ts';
import {
  validarItem,
  validarQuadro,
  type Item,
  type Quadro,
  type TipoSemantico,
} from '../dominio/quadro.ts';

export const NOME_BANCO_QUADROS = 'mesa-quadros-v1';
export const VERSAO_BANCO_QUADROS = 1;

export interface RegistroImagem {
  id: string;
  blob: Blob;
  tipo: string;
  largura: number;
  altura: number;
  criadaEm: number;
}

const STORES: DefinicaoStore[] = [
  {
    nome: 'quadros',
    chave: 'id',
    indices: [{ nome: 'campanhaId', caminho: 'campanhaId' }],
  },
  {
    nome: 'itens',
    chave: 'id',
    indices: [{ nome: 'quadroId', caminho: 'quadroId' }],
  },
  {
    nome: 'imagens',
    chave: 'id',
  },
  {
    nome: 'ajustes',
    chave: 'campanhaId',
  },
];

let bancoPadrao: Promise<IDBDatabase> | null = null;
let idbPadrao: IDBFactory | undefined;

export function definirIdbQuadros(idb?: IDBFactory): void {
  idbPadrao = idb;
  bancoPadrao = null;
}

export async function abrirBancoQuadros(idb?: IDBFactory): Promise<IDBDatabase> {
  return abrirBanco(NOME_BANCO_QUADROS, VERSAO_BANCO_QUADROS, STORES, idb ?? idbPadrao);
}

async function obterBanco(db?: IDBDatabase): Promise<IDBDatabase> {
  if (db) return db;
  if (!bancoPadrao) {
    bancoPadrao = abrirBancoQuadros();
  }
  return bancoPadrao;
}

export async function listarQuadros(campanhaId: string, db?: IDBDatabase): Promise<Quadro[]> {
  const banco = await obterBanco(db);
  return transacao(banco, ['quadros'], 'readonly', async (tx) => {
    const idx = tx.objectStore('quadros').index('campanhaId');
    const lista = await obterTudo<Quadro>(idx, campanhaId);
    return lista.sort((a, b) => b.atualizadoEm - a.atualizadoEm);
  });
}

export async function obterQuadro(id: string, db?: IDBDatabase): Promise<Quadro | null> {
  const banco = await obterBanco(db);
  return transacao(banco, ['quadros'], 'readonly', async (tx) => {
    const res = await promessa(tx.objectStore('quadros').get(id));
    return (res as Quadro | undefined) ?? null;
  });
}

export async function salvarQuadro(quadro: Quadro, db?: IDBDatabase): Promise<void> {
  validarQuadro(quadro);
  const banco = await obterBanco(db);
  await transacao(banco, ['quadros'], 'readwrite', async (tx) => {
    await promessa(tx.objectStore('quadros').put(quadro));
  });
}

export async function removerQuadro(id: string, db?: IDBDatabase): Promise<void> {
  const banco = await obterBanco(db);
  await transacao(banco, ['quadros', 'itens'], 'readwrite', async (tx) => {
    await promessa(tx.objectStore('quadros').delete(id));
    const idx = tx.objectStore('itens').index('quadroId');
    const chaves = await promessa(idx.getAllKeys(id));
    const storeItens = tx.objectStore('itens');
    for (const chave of chaves) {
      await promessa(storeItens.delete(chave));
    }
  });
}

export async function removerQuadrosDaCampanha(
  campanhaId: string,
  db?: IDBDatabase,
): Promise<void> {
  const banco = await obterBanco(db);
  await transacao(banco, ['quadros', 'itens'], 'readwrite', async (tx) => {
    const storeQuadros = tx.objectStore('quadros');
    const storeItens = tx.objectStore('itens');
    const quadroIds = await promessa(storeQuadros.index('campanhaId').getAllKeys(campanhaId));
    const idxItens = storeItens.index('quadroId');
    for (const qId of quadroIds) {
      const itemIds = await promessa(idxItens.getAllKeys(qId));
      for (const iId of itemIds) {
        await promessa(storeItens.delete(iId));
      }
      await promessa(storeQuadros.delete(qId));
    }
  });
}

export async function listarItens(quadroId: string, db?: IDBDatabase): Promise<Item[]> {
  const banco = await obterBanco(db);
  return transacao(banco, ['itens'], 'readonly', async (tx) => {
    const idx = tx.objectStore('itens').index('quadroId');
    return obterTudo<Item>(idx, quadroId);
  });
}

export async function gravarItens(
  salvar: Item[],
  remover: string[],
  db?: IDBDatabase,
): Promise<void> {
  if (salvar.length === 0 && remover.length === 0) return;
  for (let i = 0; i < salvar.length; i++) {
    validarItem(salvar[i], `salvar[${i}]`);
  }
  const banco = await obterBanco(db);
  await transacao(banco, ['itens'], 'readwrite', async (tx) => {
    const store = tx.objectStore('itens');
    for (const item of salvar) {
      await promessa(store.put(item));
    }
    for (const id of remover) {
      await promessa(store.delete(id));
    }
  });
}

async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', buffer);
  const bytes = new Uint8Array(hash);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += (bytes[i] ?? 0).toString(16).padStart(2, '0');
  }
  return hex;
}

async function lerDimensoesImagem(blob: Blob): Promise<{ largura: number; altura: number }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(blob);
      const res = { largura: bmp.width, altura: bmp.height };
      bmp.close();
      return res;
    } catch {
      return { largura: 0, altura: 0 };
    }
  }
  return { largura: 0, altura: 0 };
}

export async function guardarImagem(
  blob: Blob,
  db?: IDBDatabase,
): Promise<{ id: string; largura: number; altura: number }> {
  const buffer = await blob.arrayBuffer();
  const id = await sha256Hex(buffer);
  const banco = await obterBanco(db);

  const existente = await transacao(banco, ['imagens'], 'readonly', async (tx) => {
    return (await promessa(tx.objectStore('imagens').get(id))) as RegistroImagem | undefined;
  });
  if (existente) {
    return { id: existente.id, largura: existente.largura, altura: existente.altura };
  }

  const { largura, altura } = await lerDimensoesImagem(blob);
  const registro: RegistroImagem = {
    id,
    blob,
    tipo: blob.type || 'application/octet-stream',
    largura,
    altura,
    criadaEm: Date.now(),
  };

  await transacao(banco, ['imagens'], 'readwrite', async (tx) => {
    const store = tx.objectStore('imagens');
    const jaExiste = await promessa(store.get(id));
    if (!jaExiste) {
      await promessa(store.put(registro));
    }
  });

  return { id, largura, altura };
}

export interface AjustesQuadro {
  campanhaId: string;
  paleta?: Partial<Record<TipoSemantico, string>>;
  estado?: EstadoDoMundo;
}

export async function lerAjustesQuadro(
  campanhaId: string,
  db?: IDBDatabase,
): Promise<AjustesQuadro | null> {
  const banco = await obterBanco(db);
  return transacao(banco, ['ajustes'], 'readonly', async (tx) => {
    const res = await promessa(tx.objectStore('ajustes').get(campanhaId));
    return (res as AjustesQuadro | undefined) ?? null;
  });
}

export async function salvarAjustesQuadro(
  ajustes: AjustesQuadro,
  db?: IDBDatabase,
): Promise<void> {
  const banco = await obterBanco(db);
  await transacao(banco, ['ajustes'], 'readwrite', async (tx) => {
    await promessa(tx.objectStore('ajustes').put(ajustes));
  });
}

export async function lerImagem(
  id: string,
  db?: IDBDatabase,
): Promise<RegistroImagem | null> {
  const banco = await obterBanco(db);
  return transacao(banco, ['imagens'], 'readonly', async (tx) => {
    const res = await promessa(tx.objectStore('imagens').get(id));
    return (res as RegistroImagem | undefined) ?? null;
  });
}

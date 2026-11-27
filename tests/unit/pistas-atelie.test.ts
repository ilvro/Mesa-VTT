import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { criarRef } from '#mesa';
import {
  BANCO_DE_PISTAS,
  idDaPistaDoAtelie,
  limparCacheDePistas,
  miniaturaDaPista,
  obterPistaDoAtelie,
} from '../../src/app/pistas-atelie.ts';

async function criarBancoDeTeste(idb: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = idb.open(BANCO_DE_PISTAS, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore('handouts', { keyPath: 'id' });
      db.createObjectStore('bakes', { keyPath: ['id', 'light'] });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function gravarHandout(
  db: IDBDatabase,
  summary: { id: string; name: string; hasUv: boolean; revision?: number; source?: string; preview?: Blob | null },
  bakes: { normal?: Blob; uv?: Blob | null },
): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['handouts', 'bakes'], 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);

    tx.objectStore('handouts').put({
      revision: 1,
      preview: null,
      ...summary,
    });
    if (bakes.normal) {
      tx.objectStore('bakes').put({
        id: summary.id,
        light: 'normal',
        revision: summary.revision ?? 1,
        blob: bakes.normal,
        width: 800,
        height: 1100,
      });
    }
    if (bakes.uv) {
      tx.objectStore('bakes').put({
        id: summary.id,
        light: 'uv',
        revision: summary.revision ?? 1,
        blob: bakes.uv,
        width: 800,
        height: 1100,
      });
    }
  });
}

describe('pistas-atelie', () => {
  it('idDaPistaDoAtelie reconhece apenas refs atelie/documento com id', () => {
    assert.equal(idDaPistaDoAtelie(criarRef('atelie', 'documento', 'doc-1')), 'doc-1');
    assert.equal(idDaPistaDoAtelie(criarRef('atlas', 'mapa', 'm-1')), null);
    assert.equal(idDaPistaDoAtelie(criarRef('atelie', 'pasta', 'p-1')), null);
    assert.equal(idDaPistaDoAtelie(null), null);
    assert.equal(idDaPistaDoAtelie(undefined), null);
  });

  it('retorna null quando o banco mesa-handouts-v1 não existe e não o cria vazio', async () => {
    const idb = new IDBFactory();
    assert.equal(await obterPistaDoAtelie('doc-inexistente', { idb }), null);
    assert.equal(await miniaturaDaPista('doc-inexistente', { idb }), null);
    const dbs = await idb.databases();
    assert.equal(dbs.some(d => d.name === BANCO_DE_PISTAS), false);
  });

  it('lê metadados, blob normal e blob uv de mesa-handouts-v1', async () => {
    const idb = new IDBFactory();
    const db = await criarBancoDeTeste(idb);
    const normalBlob = new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/png' });
    const uvBlob = new Blob([new Uint8Array([9, 8, 7, 6])], { type: 'image/png' });

    await gravarHandout(
      db,
      { id: 'doc-uv', name: 'Diário Oculto', hasUv: true, source: 'http://localhost:5174' },
      { normal: normalBlob, uv: uvBlob },
    );
    await gravarHandout(
      db,
      { id: 'doc-simples', name: 'Recibo do Hotel', hasUv: false },
      { normal: normalBlob, uv: null },
    );
    db.close();

    const pistaUv = await obterPistaDoAtelie('doc-uv', { idb });
    assert.ok(pistaUv);
    assert.equal(pistaUv.id, 'doc-uv');
    assert.equal(pistaUv.name, 'Diário Oculto');
    assert.equal(pistaUv.hasUv, true);
    assert.equal(pistaUv.source, 'http://localhost:5174');
    assert.deepEqual(new Uint8Array(await pistaUv.normal.arrayBuffer()), new Uint8Array([1, 2, 3, 4]));
    assert.ok(pistaUv.uv);
    assert.deepEqual(new Uint8Array(await pistaUv.uv.arrayBuffer()), new Uint8Array([9, 8, 7, 6]));

    const pistaSimples = await obterPistaDoAtelie('doc-simples', { idb });
    assert.ok(pistaSimples);
    assert.equal(pistaSimples.name, 'Recibo do Hotel');
    assert.equal(pistaSimples.hasUv, false);
    assert.equal(pistaSimples.uv, null);

    assert.equal(await obterPistaDoAtelie('doc-ausente', { idb }), null);
  });

  it('miniaturaDaPista devolve o blob normal e usa cache em memória', async () => {
    const idb = new IDBFactory();
    const db = await criarBancoDeTeste(idb);
    const normalBlob = new Blob([new Uint8Array([10, 20, 30])], { type: 'image/webp' });
    await gravarHandout(db, { id: 'doc-1', name: 'Mapa Rasgado', hasUv: false }, { normal: normalBlob });
    db.close();

    const m1 = await miniaturaDaPista('doc-1', { idb });
    assert.ok(m1);
    assert.deepEqual(new Uint8Array(await m1.arrayBuffer()), new Uint8Array([10, 20, 30]));

    // Segunda chamada retorna exatamente a mesma instância do cache em memória
    const m2 = await miniaturaDaPista('doc-1', { idb });
    assert.equal(m2, m1);

    limparCacheDePistas({ idb });
    const m3 = await miniaturaDaPista('doc-1', { idb });
    assert.ok(m3);
    assert.deepEqual(new Uint8Array(await m3.arrayBuffer()), new Uint8Array([10, 20, 30]));

    assert.equal(await miniaturaDaPista('nao-existe', { idb }), null);
  });
});

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import {
  abrirBancoQuadros,
  definirIdbQuadros,
  guardarImagem,
  lerImagem,
  listarModelos,
  listarQuadros,
  removerImagensOrfas,
  removerModelo,
  removerQuadrosDaCampanha,
  salvarModelo,
  NOME_BANCO_QUADROS,
} from '../../src/app/banco-quadros.ts';
import { copiar } from '../../src/dominio/area-de-transferencia.ts';
import { novaImagem, novoQuadro } from '../../src/dominio/quadro.ts';
import type { ModeloDeCena } from '../../src/dominio/modelos.ts';

const conteudoVazio = copiar([]);
const modelo = (id: string, campanhaId: string | null, conteudo = conteudoVazio): ModeloDeCena => ({
  id,
  nome: `Modelo ${id}`,
  campanhaId,
  conteudo,
  criadoEm: 1,
});

describe('banco-quadros: modelos de cena', () => {
  let db: IDBDatabase | undefined;

  beforeEach(async () => {
    definirIdbQuadros(indexedDB);
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.deleteDatabase(NOME_BANCO_QUADROS);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  });
  afterEach(() => {
    db?.close();
    db = undefined;
  });

  it('migra um banco v1 com dados para v2 sem perder nada e cria a store modelos', async () => {
    const v1 = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(NOME_BANCO_QUADROS, 1);
      req.onupgradeneeded = () => {
        const b = req.result;
        b.createObjectStore('quadros', { keyPath: 'id' }).createIndex('campanhaId', 'campanhaId');
        b.createObjectStore('itens', { keyPath: 'id' }).createIndex('quadroId', 'quadroId');
        b.createObjectStore('imagens', { keyPath: 'id' });
        b.createObjectStore('ajustes', { keyPath: 'campanhaId' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const quadro = novoQuadro('camp-1', 'Antigo', 1000, 'q-1');
    await new Promise<void>((resolve, reject) => {
      const tx = v1.transaction('quadros', 'readwrite');
      tx.objectStore('quadros').put(quadro);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    assert.equal(v1.objectStoreNames.contains('modelos'), false);
    v1.close();

    db = await abrirBancoQuadros(indexedDB);
    assert.equal(db.version, 2);
    assert.equal(db.objectStoreNames.contains('modelos'), true);
    assert.deepEqual(await listarQuadros('camp-1', db), [quadro]);
    assert.deepEqual(await listarModelos(db), []);
  });

  it('salva, lista, renomeia (put) e apaga modelos', async () => {
    db = await abrirBancoQuadros(indexedDB);
    await salvarModelo(modelo('a', 'c1'), db);
    await salvarModelo(modelo('b', null), db);
    assert.equal((await listarModelos(db)).length, 2);
    await salvarModelo({ ...modelo('a', 'c1'), nome: 'Outro nome' }, db);
    const a = (await listarModelos(db)).find((m) => m.id === 'a');
    assert.equal(a?.nome, 'Outro nome');
    await removerModelo('a', db);
    assert.deepEqual((await listarModelos(db)).map((m) => m.id), ['b']);
    await assert.rejects(salvarModelo({ ...modelo('c', null), nome: '' }, db));
  });

  it('apagar a campanha apaga só os modelos dela', async () => {
    db = await abrirBancoQuadros(indexedDB);
    await salvarModelo(modelo('a', 'c1'), db);
    await salvarModelo(modelo('b', 'c2'), db);
    await salvarModelo(modelo('c', null), db);
    await removerQuadrosDaCampanha('c1', db);
    assert.deepEqual((await listarModelos(db)).map((m) => m.id).sort(), ['b', 'c']);
  });

  it('a coleta de imagens sem uso preserva as imagens usadas por modelos', async () => {
    db = await abrirBancoQuadros(indexedDB);
    const usada = await guardarImagem(new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }), db);
    const solta = await guardarImagem(new Blob([new Uint8Array([9, 9, 9])], { type: 'image/png' }), db);
    const img = novaImagem(
      { quadroId: 'q', x: 0, y: 0, imagemId: usada.id, larguraOriginal: 10, alturaOriginal: 10 },
      1,
      'i-1',
    );
    await salvarModelo(modelo('m', null, copiar([img])), db);
    const removidas = await removerImagensOrfas(new Set(), Date.now() + 3_600_000, 1000, db);
    assert.equal(removidas, 1);
    assert.ok(await lerImagem(usada.id, db));
    assert.equal(await lerImagem(solta.id, db), null);
  });
});

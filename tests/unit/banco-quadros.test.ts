import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import {
  abrirBancoQuadros,
  definirIdbQuadros,
  gravarItens,
  guardarImagem,
  lerImagem,
  listarItens,
  listarQuadros,
  obterQuadro,
  removerQuadro,
  removerQuadrosDaCampanha,
  salvarQuadro,
} from '../../src/app/banco-quadros.ts';
import { docDeTexto, novaNotaAdesiva, novoQuadro, novoTexto } from '../../src/dominio/quadro.ts';

describe('banco-quadros', () => {
  let db: IDBDatabase | undefined;

  afterEach(() => {
    db?.close();
    db = undefined;
  });

  beforeEach(async () => {
    definirIdbQuadros(indexedDB);
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.deleteDatabase('mesa-quadros-v1');
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
    db = await abrirBancoQuadros(indexedDB);
  });

  it('cria quadro, grava itens e reabre com os mesmos itens', async () => {
    const q = novoQuadro('camp-1', 'Lysdal', 1000, 'q-1');
    await salvarQuadro(q, db);

    const t1 = novoTexto({ quadroId: 'q-1', x: 10, y: 20, doc: docDeTexto('Olá') }, 1001, 'i-1');
    const n1 = novaNotaAdesiva({ quadroId: 'q-1', x: 200, y: 150, doc: docDeTexto('Nota') }, 1002, 'i-2');
    await gravarItens([t1, n1], [], db);

    // Atualiza i-1 e remove i-2 em uma única transação
    const t1Editado = { ...t1, x: 55, atualizadoEm: 1003 };
    await gravarItens([t1Editado], ['i-2'], db);

    const lido = await obterQuadro('q-1', db);
    assert.deepEqual(lido, q);
    const itens = await listarItens('q-1', db);
    assert.equal(itens.length, 1);
    assert.deepEqual(itens[0], t1Editado);
  });

  it('removerQuadro remove o quadro e todos os seus itens', async () => {
    const q1 = novoQuadro('camp-1', 'Q1', 1000, 'q-1');
    const q2 = novoQuadro('camp-1', 'Q2', 1000, 'q-2');
    await salvarQuadro(q1, db);
    await salvarQuadro(q2, db);

    await gravarItens(
      [
        novoTexto({ quadroId: 'q-1', x: 0, y: 0 }, 1000, 'a'),
        novoTexto({ quadroId: 'q-1', x: 10, y: 0 }, 1000, 'b'),
        novoTexto({ quadroId: 'q-2', x: 20, y: 0 }, 1000, 'c'),
      ],
      [],
      db,
    );

    await removerQuadro('q-1', db);

    assert.equal(await obterQuadro('q-1', db), null);
    assert.deepEqual(await listarItens('q-1', db), []);
    assert.equal((await listarItens('q-2', db)).length, 1);
  });

  it('guardarImagem dedupica por SHA-256 e não regrava imagem igual', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5, 6]);
    const b1 = new Blob([bytes], { type: 'image/png' });
    const b2 = new Blob([bytes], { type: 'image/png' });

    const r1 = await guardarImagem(b1, db);
    const registroAntes = await lerImagem(r1.id, db);
    assert.ok(registroAntes);

    const r2 = await guardarImagem(b2, db);
    assert.equal(r2.id, r1.id);
    const registroDepois = await lerImagem(r2.id, db);
    assert.equal(registroDepois?.criadaEm, registroAntes.criadaEm);
  });

  it('removerQuadrosDaCampanha apaga apenas os quadros e itens da campanha alvo', async () => {
    await salvarQuadro(novoQuadro('camp-1', 'A', 1000, 'q-1'), db);
    await salvarQuadro(novoQuadro('camp-1', 'B', 1001, 'q-2'), db);
    await salvarQuadro(novoQuadro('camp-2', 'C', 1002, 'q-3'), db);

    await gravarItens(
      [
        novoTexto({ quadroId: 'q-1', x: 0, y: 0 }, 1000, 'i-1'),
        novoTexto({ quadroId: 'q-2', x: 0, y: 0 }, 1000, 'i-2'),
        novoTexto({ quadroId: 'q-3', x: 0, y: 0 }, 1000, 'i-3'),
      ],
      [],
      db,
    );

    await removerQuadrosDaCampanha('camp-1', db);

    assert.deepEqual(await listarQuadros('camp-1', db), []);
    assert.deepEqual(await listarItens('q-1', db), []);
    assert.deepEqual(await listarItens('q-2', db), []);

    const qCamp2 = await listarQuadros('camp-2', db);
    assert.equal(qCamp2.length, 1);
    assert.equal((await listarItens('q-3', db)).length, 1);
  });
});

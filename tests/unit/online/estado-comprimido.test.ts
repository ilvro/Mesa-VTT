import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blobIdDoEstado, comprimirEstado, descomprimirEstado, LIMITE_ESTADO_BYTES } from '../../../src/online/estado-comprimido.ts';

test('descomprimirEstado devolve o objeto original', async () => {
  const obj = { tipo: 'estado', versao: 3, doc: { id: 'm', nome: 'Gruta ação', grade: [1, 2, 3], nulo: null } };
  const blob = await comprimirEstado(obj);
  assert.equal(blob.type, 'application/gzip');
  assert.deepEqual(await descomprimirEstado(blob), obj);
});

test('3 MB de JSON comprimem, descomprimem iguais e ficam bem menores', async () => {
  const obj = { doc: { cells: Array.from({ length: 150_000 }, (_, i) => [i % 400, Math.floor(i / 400), i % 7]) } };
  assert.ok(JSON.stringify(obj).length > 1.5 * 1024 * 1024);
  const blob = await comprimirEstado(obj);
  assert.ok(blob.size < JSON.stringify(obj).length / 3);
  assert.deepEqual(await descomprimirEstado(blob), obj);
});

test('descomprimirEstado rejeita o que não é gzip', async () => {
  await assert.rejects(descomprimirEstado(new Blob(['nao sou gzip'])));
});

test('id do blob e limite', () => {
  assert.equal(blobIdDoEstado('mapa-1', 12), 'estado:mapa-1:12');
  assert.equal(LIMITE_ESTADO_BYTES, 256 * 1024);
});

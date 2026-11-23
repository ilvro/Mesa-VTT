import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chaveDaRef, type Ref } from '#mesa';
import { fracao, lerRecursos, recursosDaEntidade, tomDoPv, type Recursos } from '../../src/dominio/recursos-das-fichas.ts';

const ficha: Ref = { app: 'ficha', tipo: 'ficha', id: 's1' };
const mesa: Ref = { app: 'mesa', tipo: 'entidade', id: 'e1' };
const rec: Recursos = { pv: 7, pvMax: 10, pd: 2, pdMax: 4 };

test('lerRecursos aceita o fato e recusa dados quebrados', () => {
  assert.deepEqual(lerRecursos({ ficha, ...rec }), { ficha, recursos: rec });
  assert.equal(lerRecursos({ ficha, pv: 1 }), null);
  assert.equal(lerRecursos({ ficha: 'x', ...rec }), null);
  assert.equal(lerRecursos(null), null);
});

test('recursosDaEntidade acha pela ficha entre os refs', () => {
  const mapa = new Map([[chaveDaRef(ficha), rec]]);
  assert.equal(recursosDaEntidade([mesa, ficha], mapa), rec);
  assert.equal(recursosDaEntidade([mesa], mapa), undefined);
  assert.equal(recursosDaEntidade([ficha], new Map()), undefined);
});

test('fracao limita a 0..1 e tolera máximo zero', () => {
  assert.equal(fracao(5, 10), 0.5);
  assert.equal(fracao(15, 10), 1);
  assert.equal(fracao(-3, 10), 0);
  assert.equal(fracao(3, 0), 0);
});

test('tomDoPv', () => {
  assert.equal(tomDoPv(1), 'sucesso');
  assert.equal(tomDoPv(0.4), 'sucesso');
  assert.equal(tomDoPv(0.1), 'perigo');
});

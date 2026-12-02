import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registrarAcessoLru, removerDaLru } from '../../src/dominio/lru.ts';

test('registrarAcessoLru com limite 1 mantém apenas o último acessado e despeja o anterior', () => {
  const r1 = registrarAcessoLru([], 'ficha-1', 1);
  assert.deepEqual(r1, { ordem: ['ficha-1'], despejados: [] });

  const r2 = registrarAcessoLru(r1.ordem, 'ficha-2', 1);
  assert.deepEqual(r2, { ordem: ['ficha-2'], despejados: ['ficha-1'] });

  const r3 = registrarAcessoLru(r2.ordem, 'ficha-2', 1);
  assert.deepEqual(r3, { ordem: ['ficha-2'], despejados: [] });
});

test('registrarAcessoLru com limite 2 promove item existente para o topo e preserva ordem exata dos despejados', () => {
  const r1 = registrarAcessoLru([], 'a', 2);
  const r2 = registrarAcessoLru(r1.ordem, 'b', 2);
  assert.deepEqual(r2, { ordem: ['b', 'a'], despejados: [] });

  // Acessar 'a' promove para o topo sem despejar ninguém
  const r3 = registrarAcessoLru(r2.ordem, 'a', 2);
  assert.deepEqual(r3, { ordem: ['a', 'b'], despejados: [] });

  // Acessar 'c' despeja 'b' (o menos recente)
  const r4 = registrarAcessoLru(r3.ordem, 'c', 2);
  assert.deepEqual(r4, { ordem: ['c', 'a'], despejados: ['b'] });
});

test('registrarAcessoLru ao reduzir limite despeja excedentes em ordem do mais recente excedente ao mais antigo', () => {
  const r = registrarAcessoLru(['c', 'b', 'a'], 'd', 1);
  assert.deepEqual(r, { ordem: ['d'], despejados: ['c', 'b', 'a'] });
});

test('removerDaLru remove o item sem mutar o array original', () => {
  const original = ['c', 'b', 'a'];
  const resultado = removerDaLru(original, 'b');
  assert.deepEqual(resultado, ['c', 'a']);
  assert.deepEqual(original, ['c', 'b', 'a']);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarCofre, idDeFichaValido, LIMITE_FICHA_BYTES, LIMITE_FICHAS_POR_CONTA } from '../../../sala/cofre.ts';
import { sqlEmMemoria } from './sql-teste.ts';

test('salva, atualiza e lista as fichas, a mais recente primeiro', () => {
  const c = criarCofre(sqlEmMemoria());
  assert.deepEqual(c.listar(), []);
  assert.equal(c.salvar('a', '{"name":"Ana"}', 10), 'ok');
  assert.equal(c.salvar('b', '{"name":"Bia"}', 20), 'ok');
  assert.equal(c.salvar('a', '{"name":"Ana 2"}', 30), 'ok');
  assert.deepEqual(c.listar().map(f => [f.id, f.atualizadaEm]), [['a', 30], ['b', 20]]);
  assert.equal(JSON.parse(c.listar()[0]!.json).name, 'Ana 2');
});

test('remove uma ficha e ignora id inexistente', () => {
  const c = criarCofre(sqlEmMemoria());
  c.salvar('a', '{}', 1);
  c.remover('nada');
  c.remover('a');
  assert.deepEqual(c.listar(), []);
});

test('recusa JSON inválido, que não é objeto, grande demais e cofre cheio', () => {
  const c = criarCofre(sqlEmMemoria());
  assert.equal(c.salvar('a', 'não é json', 1), 'invalida');
  assert.equal(c.salvar('a', '[1]', 1), 'invalida');
  assert.equal(c.salvar('a', '3', 1), 'invalida');
  assert.equal(c.salvar('a', JSON.stringify({ x: 'y'.repeat(LIMITE_FICHA_BYTES) }), 1), 'grande');
  for (let i = 0; i < LIMITE_FICHAS_POR_CONTA; i++) assert.equal(c.salvar(`f${i}`, '{}', i), 'ok');
  assert.equal(c.salvar('extra', '{}', 1), 'cheio');
  assert.equal(c.salvar('f0', '{"novo":1}', 5), 'ok', 'atualizar uma existente continua valendo');
});

test('ids de ficha', () => {
  assert.equal(idDeFichaValido('sheet-ab12'), true);
  assert.equal(idDeFichaValido('../x'), false);
  assert.equal(idDeFichaValido(''), false);
  assert.equal(idDeFichaValido(5), false);
});

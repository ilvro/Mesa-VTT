import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarDiretorio } from '../../../sala/registro.ts';
import { sqlEmMemoria } from './sql-teste.ts';

test('o diretório liga um servidor à sala do dono e consulta', () => {
  const d = criarDiretorio(sqlEmMemoria());
  d.registrarSala('s1', 'M', 'Campanha 1', 10);
  d.registrarSala('s2', 'M', 'Campanha 2', 20);
  d.registrarSala('s3', 'N', 'Do amigo', 30);
  assert.equal(d.consultar('g1'), null);
  assert.equal(d.ligar('g1', 's1', 'M'), 'ok');
  assert.equal(d.consultar('g1'), 's1');
  assert.equal(d.ligar('g1', 's2', 'M'), 'ok'); // religar troca a sala
  assert.equal(d.consultar('g1'), 's2');
});

test('o diretório recusa quem não é dono e sala desconhecida', () => {
  const d = criarDiretorio(sqlEmMemoria());
  d.registrarSala('s1', 'M', 'Campanha', 10);
  assert.equal(d.ligar('g1', 's1', 'N'), 'nao-dono');
  assert.equal(d.ligar('g1', 'nada', 'M'), 'desconhecida');
  assert.equal(d.consultar('g1'), null);
});

test('lista as salas de cada mestre, as mais novas primeiro', () => {
  const d = criarDiretorio(sqlEmMemoria());
  d.registrarSala('s1', 'M', 'A', 10);
  d.registrarSala('s2', 'M', 'B', 20);
  d.registrarSala('s3', 'N', 'C', 30);
  assert.deepEqual(d.salasDoMestre('M'), [{ salaId: 's2', nome: 'B', criadaEm: 20 }, { salaId: 's1', nome: 'A', criadaEm: 10 }]);
  assert.deepEqual(d.salasDoMestre('X'), []);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Entidade } from '#mesa';
import { contarPorTipo, filtrarEntidades, lerTags, podeEditar, ROTULO_DO_TIPO, semAcento } from '../../src/dominio/entidades.ts';

const base = { campanhaId: 'c', refs: [], tags: [], notas: '', criadaPor: 'mesa', criadaEm: 1, atualizadaEm: 1 } as const;
const e = (id: string, tipo: Entidade['tipo'], nome: string, extra: Partial<Entidade> = {}): Entidade => ({ ...base, id, tipo, nome, ...extra } as Entidade);

const lista = [
  e('1', 'lugar', 'Casa dos Salgueiros', { tags: ['mansão', 'Vila'] }),
  e('2', 'personagem', 'Muirenn', { criadaPor: 'ficha', notas: 'Investigadora de Ateliê' }),
  e('3', 'pista', 'Carta queimada', { notas: 'Achada na biblioteca' }),
  e('4', 'lugar', 'Álamo Velho'),
  e('5', 'nota', 'zeta'),
];

test('semAcento: minúsculas e sem acento', () => {
  assert.equal(semAcento('Ateliê Ação'), 'atelie acao');
  assert.equal(semAcento('ÁLAMO'), 'alamo');
});

test('filtrarEntidades: por tipo, ordenado sem acento (Álamo antes de Casa)', () => {
  assert.deepEqual(filtrarEntidades(lista, { tipo: 'lugar' }).map(x => x.id), ['4', '1']);
  assert.deepEqual(filtrarEntidades(lista).map(x => x.id), ['4', '3', '1', '2', '5']);
});

test('filtrarEntidades: a busca ignora acento e caixa e olha nome, etiquetas e notas', () => {
  assert.deepEqual(filtrarEntidades(lista, { busca: 'MANSAO' }).map(x => x.id), ['1']);
  assert.deepEqual(filtrarEntidades(lista, { busca: 'atelie' }).map(x => x.id), ['2']);
  assert.deepEqual(filtrarEntidades(lista, { busca: 'biblioteca carta' }).map(x => x.id), ['3']);
  assert.deepEqual(filtrarEntidades(lista, { busca: 'carta mansao' }).map(x => x.id), []);
  assert.deepEqual(filtrarEntidades(lista, { busca: '   ' }).length, 5);
});

test('filtrarEntidades: tipo e busca juntos', () => {
  assert.deepEqual(filtrarEntidades(lista, { tipo: 'lugar', busca: 'salgueiros' }).map(x => x.id), ['1']);
  assert.deepEqual(filtrarEntidades(lista, { tipo: 'pista', busca: 'salgueiros' }), []);
});

test('contarPorTipo conta cada tipo', () => {
  const c = contarPorTipo(lista);
  assert.equal(c.lugar, 2); assert.equal(c.personagem, 1); assert.equal(c.cena, 0);
});

test('podeEditar: só quem criou', () => {
  assert.equal(podeEditar(e('a', 'lugar', 'x')), true);
  assert.equal(podeEditar(e('b', 'personagem', 'y', { criadaPor: 'ficha' })), false);
  assert.equal(podeEditar(e('b', 'personagem', 'y', { criadaPor: 'ficha' }), 'ficha'), true);
});

test('lerTags: tira vazias e repetidas (sem acento), corta no limite do contrato', () => {
  assert.deepEqual(lerTags('a, b ,, A; c\nd'), ['a', 'b', 'c', 'd']);
  assert.deepEqual(lerTags('Mansão, mansao'), ['Mansão']);
  assert.equal(lerTags('x'.repeat(100))[0]!.length, 40);
  assert.equal(lerTags(Array.from({ length: 80 }, (_, i) => `t${i}`).join(',')).length, 50);
  assert.deepEqual(lerTags(''), []);
});

test('ameaca: tem rótulo próprio, conta separada de personagem e entra na busca por tipo', () => {
  const lista = [e('1', 'personagem', 'Muirenn'), e('2', 'ameaca', 'Zumbi de Sangue'), e('3', 'ameaca', 'Ariranha')];
  const c = contarPorTipo(lista);
  assert.equal(c.ameaca, 2); assert.equal(c.personagem, 1);
  assert.deepEqual(filtrarEntidades(lista, { tipo: 'ameaca' }).map(x => x.nome), ['Ariranha', 'Zumbi de Sangue']);
  assert.deepEqual(filtrarEntidades(lista, { busca: 'zumbi' }).map(x => x.id), ['2']);
  assert.deepEqual(ROTULO_DO_TIPO.ameaca, { singular: 'Ameaça', plural: 'Ameaças' });
});

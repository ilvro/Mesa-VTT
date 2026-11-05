import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Entidade, Ref } from '#mesa';
import { adicionar, candidatos, ehAbrivel, MAXIMO_DO_ROTEIRO, mover, nomeDoRef, podarNotas, removerItem } from '../../src/dominio/roteiro.ts';

const r = (app: string, tipo: string, id: string) => ({ app, tipo, id }) as Ref;
const base = { campanhaId: 'c', tags: [], notas: '', criadaPor: 'atlas', criadaEm: 1, atualizadaEm: 1 };
const e = (id: string, tipo: string, nome: string, refs: Ref[]) => ({ ...base, id, tipo, nome, refs }) as unknown as Entidade;
const lista = [
  e('1', 'lugar', 'Casa dos Salgueiros', [r('atlas', 'mapa', 'm1'), r('mesa', 'entidade', '1')]), e('2', 'personagem', 'Muirenn', [r('ficha', 'ficha', 's1')]),
  e('3', 'cena', 'Chuva forte', [r('jukebox', 'cena-sonora', 'chuva')]), e('4', 'pista', 'Carta', [r('atelie', 'documento', 'd1')]), e('5', 'lugar', 'Sem nada', []),
  e('6', 'lugar', 'Álamo', [r('atlas', 'regiao', 'm2/r1'), r('atlas', 'comodo', 'm2/c1')]),
];

test('ehAbrivel: só os tipos que o aplicativo dono sabe abrir', () => {
  assert.equal(ehAbrivel(r('atlas', 'mapa', 'x')), true); assert.equal(ehAbrivel(r('atlas', 'comodo', 'x/y')), true); assert.equal(ehAbrivel(r('atlas', 'regiao', 'x/y')), false);
  assert.equal(ehAbrivel(r('jukebox', 'efeito', 'x')), true); assert.equal(ehAbrivel(r('mesa', 'entidade', 'x')), false); assert.equal(ehAbrivel(r('tabletop', 'cena', 'x')), false);
});

test('candidatos: um por Ref abrível, com o nome da entidade, em ordem alfabética sem acento atrapalhar, sem os Refs da Mesa', () => {
  assert.deepEqual(candidatos(lista).map(c => `${c.nome}|${c.ref.app}/${c.ref.tipo}`), ['Álamo|atlas/comodo', 'Carta|atelie/documento', 'Casa dos Salgueiros|atlas/mapa', 'Chuva forte|jukebox/cena-sonora', 'Muirenn|ficha/ficha']);
});

test('adicionar, remover e mover: sem repetir, sem passar do máximo, sem sair dos limites', () => {
  const a = r('atlas', 'mapa', 'm1'), b = r('jukebox', 'cena-sonora', 'chuva'), c = r('ficha', 'ficha', 's1');
  let rot: Ref[] = [];
  rot = adicionar(rot, a); rot = adicionar(rot, b); rot = adicionar(rot, c); assert.deepEqual(rot, [a, b, c]);
  assert.deepEqual(adicionar(rot, { ...a, rev: 2 }), rot, 'o mesmo Ref não entra duas vezes');
  assert.deepEqual(mover(rot, 0, 1), [b, a, c]); assert.deepEqual(mover(rot, 2, -1), [a, c, b]);
  assert.deepEqual(mover(rot, 0, -1), rot); assert.deepEqual(mover(rot, 2, 1), rot); assert.deepEqual(mover(rot, 9, 1), rot);
  assert.deepEqual(removerItem(rot, 1), [a, c]); assert.deepEqual(removerItem(rot, 7), rot);
  const cheio = Array.from({ length: MAXIMO_DO_ROTEIRO }, (_, i) => r('atlas', 'mapa', `x${i}`));
  assert.equal(adicionar(cheio, a).length, MAXIMO_DO_ROTEIRO);
  assert.notEqual(mover(rot, 0, 1), rot, 'devolve cópia'); 
});

test('nomeDoRef: o nome da entidade, ou o aplicativo e o tipo quando a campanha não conhece', () => {
  assert.equal(nomeDoRef(lista, r('atlas', 'mapa', 'm1')), 'Casa dos Salgueiros');
  assert.equal(nomeDoRef(lista, r('atlas', 'mapa', 'desconhecido')), 'Atlas · mapa');
  assert.equal(nomeDoRef(lista, r('jukebox', 'cena-sonora', 'x')), 'Jukebox · cena sonora');
});

test('podarNotas: o que saiu do roteiro leva a nota; nota vazia não é guardada', () => {
  const a = r('atlas', 'mapa', 'm1'), b = r('ficha', 'ficha', 's1');
  assert.deepEqual(podarNotas({ 'atlas/mapa/m1': 'x', 'ficha/ficha/s1': '  ', 'jukebox/cena-sonora/zz': 'y' }, [a, b]), { 'atlas/mapa/m1': 'x' });
});

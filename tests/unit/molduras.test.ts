import assert from 'node:assert/strict';
import { test } from 'node:test';
import { novaMoldura, novaNotaAdesiva, type Item } from '../../src/dominio/quadro.ts';
import { filhos, linkDaMoldura, molduraQueContem, ordemDeLeitura } from '../../src/dominio/molduras.ts';

test('molduraQueContem escolhe a menor moldura que contém o centro do item', () => {
  const externa = novaMoldura({ quadroId: 'q1', x: 0, y: 0, largura: 800, altura: 600 }, 1, 'm1');
  const interna = novaMoldura({ quadroId: 'q1', x: 100, y: 100, largura: 300, altura: 200 }, 1, 'm2');
  const nota = novaNotaAdesiva({ quadroId: 'q1', x: 150, y: 150, largura: 100, altura: 100 }, 1, 'n1');
  const fora = novaNotaAdesiva({ quadroId: 'q1', x: 900, y: 150, largura: 100, altura: 100 }, 1, 'n2');

  assert.equal(molduraQueContem(nota, [externa, interna])?.id, 'm2');
  assert.equal(molduraQueContem(fora, [externa, interna]), null);
});

test('ordemDeLeitura ordena de cima para baixo e esquerda para direita com tolerância de 1/3 da altura', () => {
  const m1 = novaMoldura({ quadroId: 'q1', x: 400, y: 50, largura: 200, altura: 120, titulo: 'B' }, 1, 'm1');
  const m2 = novaMoldura({ quadroId: 'q1', x: 50, y: 20, largura: 200, altura: 120, titulo: 'A' }, 1, 'm2');
  const m3 = novaMoldura({ quadroId: 'q1', x: 50, y: 250, largura: 200, altura: 120, titulo: 'C' }, 1, 'm3');

  const ordenadas = ordemDeLeitura([m1, m3, m2]);
  assert.deepEqual(
    ordenadas.map((m) => m.titulo),
    ['A', 'B', 'C'],
  );
});

test('filhos e linkDaMoldura funcionam corretamente', () => {
  const m = novaMoldura({ quadroId: 'q1', x: 0, y: 0 }, 1, 'm1');
  const n1 = { ...novaNotaAdesiva({ quadroId: 'q1', x: 20, y: 20 }, 1, 'n1'), molduraId: 'm1' };
  const n2 = novaNotaAdesiva({ quadroId: 'q1', x: 900, y: 20 }, 1, 'n2');
  const mapa = new Map<string, Item>([
    [m.id, m],
    [n1.id, n1],
    [n2.id, n2],
  ]);
  assert.deepEqual(
    filhos('m1', mapa).map((i) => i.id),
    ['n1'],
  );
  assert.equal(linkDaMoldura('q1', 'm1'), 'mesa:mesa/item/q1/m1');
});

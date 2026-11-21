import assert from 'node:assert/strict';
import { test } from 'node:test';
import { novaMoldura, novaNotaAdesiva, novaSeta, type Item } from '../../src/dominio/quadro.ts';
import { comConteudo, filhos, linkDaMoldura, molduraQueContem, ordemDeLeitura, pertencimentoDoPasso } from '../../src/dominio/molduras.ts';

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

const mold = (id: string, x: number, y: number, l: number, a: number) =>
  novaMoldura({ quadroId: 'q1', x, y, largura: l, altura: a }, 1, id);
const nota = (id: string, x: number, y: number) =>
  novaNotaAdesiva({ quadroId: 'q1', x, y, largura: 50, altura: 50 }, 1, id);
const mapa = (...l: Item[]) => new Map(l.map((i) => [i.id, i]));

test('moldura aninhada: mãe é a menor que contém a caixa inteira e é estritamente maior', () => {
  const grande = mold('g', 0, 0, 1000, 800);
  const media = mold('m', 100, 100, 500, 400);
  const pequena = mold('p', 150, 150, 200, 100);
  const parcial = mold('x', 500, 300, 300, 300);
  assert.equal(molduraQueContem(pequena, [grande, media, pequena])?.id, 'm');
  assert.equal(molduraQueContem(media, [grande, media, pequena])?.id, 'g');
  assert.equal(molduraQueContem(parcial, [grande, media])?.id, 'g');
  assert.equal(molduraQueContem(grande, [grande, media, pequena]), null);
});

test('molduras iguais não viram mãe uma da outra', () => {
  const a = mold('a', 0, 0, 300, 300);
  const b = mold('b', 0, 0, 300, 300);
  assert.equal(molduraQueContem(a, [a, b]), null);
  assert.equal(molduraQueContem(b, [a, b]), null);
});

test('pertencimentoDoPasso: item criado dentro ganha molduraId', () => {
  const m = mold('m', 0, 0, 500, 500);
  const n = nota('n', 100, 100);
  const r = pertencimentoDoPasso(mapa(m, n), new Set(['n']), false);
  assert.deepEqual(r, [{ id: 'n', antes: null, depois: 'm' }]);
  assert.deepEqual(pertencimentoDoPasso(mapa(m, n), new Set(), false), []);
});

test('pertencimentoDoPasso: moldura redimensionada adota e solta', () => {
  const m = mold('m', 0, 0, 500, 500);
  const dentro = { ...nota('d', 100, 100), molduraId: 'm' };
  const fora = nota('f', 700, 100);
  const antes = pertencimentoDoPasso(mapa(m, dentro, fora), new Set(['m']), true);
  assert.deepEqual(antes, []);
  const m2 = { ...m, largura: 800 };
  const r = pertencimentoDoPasso(mapa(m2, dentro, fora), new Set(['m']), true);
  assert.deepEqual(r, [{ id: 'f', antes: null, depois: 'm' }]);
  const m3 = { ...m, largura: 50, altura: 50 };
  const r3 = pertencimentoDoPasso(mapa(m3, dentro, fora), new Set(['m']), true);
  assert.deepEqual(r3, [{ id: 'd', antes: 'm', depois: null }]);
});

test('pertencimentoDoPasso: moldura removida solta filhos ou passa para a avó', () => {
  const avo = mold('a', 0, 0, 1000, 1000);
  const filho = { ...nota('n', 100, 100), molduraId: 'm' };
  const r = pertencimentoDoPasso(mapa(avo, filho), new Set(), true);
  assert.deepEqual(r, [{ id: 'n', antes: 'm', depois: 'a' }]);
  const solto = pertencimentoDoPasso(mapa(filho), new Set(), true);
  assert.deepEqual(solto, [{ id: 'n', antes: 'm', depois: null }]);
});

test('pertencimentoDoPasso: seta com ponta livre entra; ligada nas duas pontas não', () => {
  const m = mold('m', 0, 0, 500, 500);
  const livre = novaSeta(
    { quadroId: 'q1', de: { ponto: [10, 10] }, para: { ponto: [100, 100] }, x: 10, y: 10, largura: 90, altura: 90 },
    1,
    's1',
  );
  const ligada = novaSeta(
    { quadroId: 'q1', de: { itemId: 'a', lado: 'direita' }, para: { itemId: 'b', lado: 'esquerda' }, x: 10, y: 10, largura: 90, altura: 90 },
    1,
    's2',
  );
  const r = pertencimentoDoPasso(mapa(m, livre, ligada), new Set(['s1', 's2']), false);
  assert.deepEqual(r, [{ id: 's1', antes: null, depois: 'm' }]);
});

test('comConteudo traz descendentes recursivos, setas internas e ignora o resto', () => {
  const ext = novaMoldura({ quadroId: 'q1', x: 0, y: 0, largura: 800, altura: 600 }, 1, 'm1');
  const int: Item = { ...novaMoldura({ quadroId: 'q1', x: 50, y: 50, largura: 300, altura: 300 }, 1, 'm2'), molduraId: 'm1' };
  const n1: Item = { ...novaNotaAdesiva({ quadroId: 'q1', x: 60, y: 60 }, 1, 'n1'), molduraId: 'm2' };
  const n2: Item = { ...novaNotaAdesiva({ quadroId: 'q1', x: 400, y: 60 }, 1, 'n2'), molduraId: 'm1' };
  const solta = novaNotaAdesiva({ quadroId: 'q1', x: 2000, y: 0 }, 1, 'n3');
  const interna = novaSeta({ quadroId: 'q1', de: { itemId: 'n1', lado: 'direita' }, para: { itemId: 'n2', lado: 'esquerda' } }, 1, 's1');
  const saindo = novaSeta({ quadroId: 'q1', de: { itemId: 'n1', lado: 'direita' }, para: { itemId: 'n3', lado: 'esquerda' } }, 1, 's2');
  const livre = novaSeta({ quadroId: 'q1', de: { itemId: 'n2', lado: 'direita' }, para: { ponto: [5, 5] } }, 1, 's3');
  const mapa = new Map<string, Item>([ext, int, n1, n2, solta, interna, saindo, livre].map((i) => [i.id, i]));

  const ids = (l: Item[]) => l.map((i) => i.id).sort();
  assert.deepEqual(ids(comConteudo(['m1', 'm1', 'inexistente'], mapa)), ['m1', 'm2', 'n1', 'n2', 's1', 's3']);
  assert.deepEqual(ids(comConteudo(['m2'], mapa)), ['m2', 'n1']);
  assert.deepEqual(ids(comConteudo(['n3', 'm2'], mapa)), ['m2', 'n1', 'n3', 's2']);
});

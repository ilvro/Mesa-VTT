import assert from 'node:assert/strict';
import { test } from 'node:test';
import { novaMoldura, novaNotaAdesiva, novaSeta, novoTraco, type Item } from '../../src/dominio/quadro.ts';
import { roteiroDoQuadro } from '../../src/dominio/roteiro-do-quadro.ts';

const mold = (id: string, x: number, y: number, l: number, a: number, mae: string | null = null): Item => ({
  ...novaMoldura({ quadroId: 'q', x, y, largura: l, altura: a, titulo: id }, 1, id),
  molduraId: mae,
});
const nota = (id: string, x: number, y: number, moldura: string | null): Item => ({
  ...novaNotaAdesiva({ quadroId: 'q', x, y, largura: 50, altura: 50 }, 1, id),
  molduraId: moldura,
});

test('molduras aninhadas vêm logo depois da mãe, com nível', () => {
  const itens = [
    mold('B', 0, 1000, 500, 400),
    mold('A', 0, 0, 800, 800),
    mold('A1', 400, 400, 300, 300, 'A'),
    mold('A0', 20, 20, 300, 300, 'A'),
  ];
  const r = roteiroDoQuadro(itens);
  assert.deepEqual(r.map((s) => [s.moldura?.id, s.nivel]), [['A', 0], ['A0', 1], ['A1', 1], ['B', 0]]);
});

test('itens de cada moldura em linhas por y e depois x; setas e traços ficam de fora', () => {
  const itens: Item[] = [
    mold('M', 0, 0, 800, 800),
    nota('c', 10, 200, 'M'),
    nota('b', 200, 10, 'M'),
    nota('a', 10, 20, 'M'),
    { ...novaSeta({ quadroId: 'q', de: { ponto: [0, 0] }, para: { ponto: [5, 5] } }, 1, 's'), molduraId: 'M' },
    { ...novoTraco({ quadroId: 'q', x: 0, y: 0, largura: 1, altura: 1, pontos: [[0, 0, 1]] }, 1, 't'), molduraId: 'M' },
  ];
  const r = roteiroDoQuadro(itens);
  assert.equal(r.length, 1);
  assert.deepEqual(r[0]!.itens.map((i) => i.id), ['a', 'b', 'c']);
});

test('soltos vão no fim, numa seção sem moldura; sem soltos, sem seção', () => {
  const com = roteiroDoQuadro([nota('x', 5, 5, null), mold('M', 100, 100, 300, 300), nota('y', 120, 120, 'M')]);
  assert.deepEqual(com.map((s) => s.moldura?.id ?? null), ['M', null]);
  assert.deepEqual(com[1]!.itens.map((i) => i.id), ['x']);
  const sem = roteiroDoQuadro([mold('M', 0, 0, 100, 100)]);
  assert.deepEqual(sem.map((s) => s.moldura?.id), ['M']);
  assert.deepEqual(roteiroDoQuadro([]), []);
});

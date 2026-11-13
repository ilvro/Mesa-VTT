import assert from 'node:assert/strict';
import { test } from 'node:test';
import { novaNotaAdesiva } from '../../src/dominio/quadro.ts';
import { alinhar, distribuir, guias } from '../../src/dominio/alinhamento.ts';

test('alinhar posiciona itens nos 6 modos', () => {
  const a = novaNotaAdesiva({ quadroId: 'q1', x: 10, y: 20, largura: 100, altura: 50 }, 1, 'a');
  const b = novaNotaAdesiva({ quadroId: 'q1', x: 210, y: 120, largura: 60, altura: 90 }, 1, 'b');

  const esq = alinhar([a, b], 'esquerda');
  assert.equal(esq.get('a')?.x, 10);
  assert.equal(esq.get('b')?.x, 10);

  const dir = alinhar([a, b], 'direita');
  assert.equal(dir.get('a')?.x, 170);
  assert.equal(dir.get('b')?.x, 210);

  const ch = alinhar([a, b], 'centro-h');
  // minX=10, maxX=270 -> centro=140
  assert.equal(ch.get('a')?.x, 90);
  assert.equal(ch.get('b')?.x, 110);

  const topo = alinhar([a, b], 'topo');
  assert.equal(topo.get('b')?.y, 20);

  const base = alinhar([a, b], 'base');
  assert.equal(base.get('a')?.y, 160);

  const cv = alinhar([a, b], 'centro-v');
  // minY=20, maxY=210 -> centro=115
  assert.equal(cv.get('a')?.y, 90);
  assert.equal(cv.get('b')?.y, 70);
});

test('distribuir espaça itens uniformemente na horizontal e vertical', () => {
  const a = novaNotaAdesiva({ quadroId: 'q1', x: 0, y: 0, largura: 100, altura: 50 }, 1, 'a');
  const b = novaNotaAdesiva({ quadroId: 'q1', x: 120, y: 20, largura: 100, altura: 50 }, 1, 'b');
  const c = novaNotaAdesiva({ quadroId: 'q1', x: 400, y: 300, largura: 100, altura: 50 }, 1, 'c');

  const h = distribuir([a, b, c], 'h');
  assert.equal(h.get('a')?.x, 0);
  assert.equal(h.get('b')?.x, 200);
  assert.equal(h.get('c')?.x, 400);

  const v = distribuir([a, b, c], 'v');
  assert.equal(v.get('a')?.y, 0);
  assert.equal(v.get('b')?.y, 150);
  assert.equal(v.get('c')?.y, 300);
});

test('guias encontra bordas e centros dentro da tolerância', () => {
  const movendo = { x: 103, y: 204, largura: 100, altura: 80 };
  const outros = [
    { x: 100, y: 10, largura: 80, altura: 80 }, // borda esquerda x=100
    { x: 300, y: 200, largura: 100, altura: 80 }, // centro y=240
  ];
  const res = guias(movendo, outros, 6);
  assert.equal(res.dx, -3);
  assert.equal(res.dy, -4);
  assert.equal(res.linhas.length, 2);
});

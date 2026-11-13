import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ALCAS,
  caixaDe,
  contemPonto,
  encaixarNaGrade,
  girar,
  itensNoRetangulo,
  redimensionar,
} from '../../src/dominio/geometria.ts';

test('caixaDe e contemPonto consideram rotação', () => {
  const item = { x: 100, y: 100, largura: 200, altura: 40, rotacao: 90 };
  const c = caixaDe(item);
  // Centro em (200, 120); dimensões invertidas: 40x200
  assert.ok(Math.abs(c.x - 180) < 1e-9);
  assert.ok(Math.abs(c.y - 20) < 1e-9);
  assert.ok(Math.abs(c.largura - 40) < 1e-9);
  assert.ok(Math.abs(c.altura - 200) < 1e-9);

  // Ponto dentro do retângulo rotacionado (em cima do centro)
  assert.equal(contemPonto(item, { x: 200, y: 40 }), true);
  // Ponto que estaria dentro sem rotação (x=110, y=120), mas está fora após 90°
  assert.equal(contemPonto(item, { x: 110, y: 120 }), false);
});

test('itensNoRetangulo distingue tocar e conter', () => {
  const a = { id: 'a', x: 10, y: 10, largura: 50, altura: 50, rotacao: 0 };
  const b = { id: 'b', x: 80, y: 10, largura: 100, altura: 50, rotacao: 0 };
  const ret = { x: 0, y: 0, largura: 100, altura: 100 };

  assert.deepEqual(
    itensNoRetangulo([a, b], ret, 'tocar').map((i) => i.id),
    ['a', 'b'],
  );
  assert.deepEqual(
    itensNoRetangulo([a, b], ret, 'conter').map((i) => i.id),
    ['a'],
  );
});

test('redimensionar funciona em todas as 8 alças, com proporção e doCentro', () => {
  const base = { x: 100, y: 100, largura: 200, altura: 100 };

  for (const alca of ALCAS) {
    const res = redimensionar(base, alca, { x: 10, y: 10 });
    assert.ok(res.largura >= 16);
    assert.ok(res.altura >= 16);
  }

  const seProp = redimensionar(base, 'se', { x: 100, y: 10 }, { manterProporcao: true });
  assert.ok(Math.abs(seProp.largura / seProp.altura - 2) < 1e-6);

  const centro = redimensionar(base, 'se', { x: 20, y: 10 }, { doCentro: true });
  assert.equal(centro.x, 80);
  assert.equal(centro.y, 90);
  assert.equal(centro.largura, 240);
  assert.equal(centro.altura, 120);
});

test('girar e encaixarNaGrade', () => {
  const caixa = { x: 0, y: 0, largura: 100, altura: 100 };
  assert.equal(girar(caixa, 22, true), 15);
  assert.equal(girar(caixa, 23, true), 30);
  assert.equal(girar(caixa, 355, false), -5);
  assert.equal(encaixarNaGrade(37, 24), 48);
  assert.equal(encaixarNaGrade(11, 24), 0);
  assert.equal(encaixarNaGrade(13, 24), 24);
});

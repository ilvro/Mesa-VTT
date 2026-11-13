import { test } from 'node:test';
import assert from 'node:assert/strict';
import { areaUtil, caminhoDaForma } from '../../src/dominio/formas.ts';
import { FORMAS } from '../../src/dominio/quadro.ts';

test('caminhoDaForma começa com M e termina com Z para todas as 9 formas', () => {
  for (const forma of FORMAS) {
    const d = caminhoDaForma(forma, 200, 120, 8);
    assert.ok(d.startsWith('M '), `${forma} deve começar com M`);
    assert.ok(d.endsWith('Z'), `${forma} deve terminar com Z`);
  }
});

test('areaUtil fica contida dentro da caixa para todas as formas', () => {
  const caixa = { x: 10, y: 20, largura: 200, altura: 100 };
  for (const forma of FORMAS) {
    const util = areaUtil(forma, caixa);
    assert.ok(util.x >= caixa.x, `${forma}.x`);
    assert.ok(util.y >= caixa.y, `${forma}.y`);
    assert.ok(util.x + util.largura <= caixa.x + caixa.largura + 1e-6, `${forma}.dir`);
    assert.ok(util.y + util.altura <= caixa.y + caixa.altura + 1e-6, `${forma}.base`);
    assert.ok(util.largura > 0 && util.altura > 0, `${forma} positiva`);
  }
});

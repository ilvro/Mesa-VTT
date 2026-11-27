import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  VISTA_INICIAL,
  ZOOM_MAX,
  ZOOM_MIN,
  arrastar,
  encaixe,
  paraFracao,
  paraTela,
  zoomEm,
} from '../../src/dominio/inspecao.ts';

const TELA = { largura: 1000, altura: 800 };
const IMG = { largura: 500, altura: 1000 };

describe('dominio/inspecao', () => {
  it('encaixe centraliza a imagem respeitando a margem inicial de 90%', () => {
    const r = encaixe(VISTA_INICIAL, TELA, IMG);
    // altura limita: 800 / 1000 * 0.9 = 0.72 -> w = 360, h = 720
    assert.ok(Math.abs(r.w - 360) < 1e-6);
    assert.ok(Math.abs(r.h - 720) < 1e-6);
    assert.ok(Math.abs(r.x - (1000 - 360) / 2) < 1e-6);
    assert.ok(Math.abs(r.y - (800 - 720) / 2) < 1e-6);
  });

  it('paraFracao e paraTela são inversas uma da outra', () => {
    const v = { zoom: 2.2, cx: 0.35, cy: 0.65 };
    const ponto: [number, number] = [612, 245];
    const frac = paraFracao(ponto, v, TELA, IMG);
    const volta = paraTela(frac, v, TELA, IMG);
    assert.ok(Math.abs(volta[0] - ponto[0]) < 1e-6);
    assert.ok(Math.abs(volta[1] - ponto[1]) < 1e-6);
  });

  it('zoomEm mantém o ponto sob o cursor fixo e respeita ZOOM_MIN e ZOOM_MAX', () => {
    const foco: [number, number] = [420, 310];
    const fracAntes = paraFracao(foco, VISTA_INICIAL, TELA, IMG);
    const aproximado = zoomEm(VISTA_INICIAL, 2.5, foco, TELA, IMG);
    assert.equal(aproximado.zoom, 2.5);

    const fracDepois = paraFracao(foco, aproximado, TELA, IMG);
    assert.ok(Math.abs(fracDepois[0] - fracAntes[0]) < 1e-6);
    assert.ok(Math.abs(fracDepois[1] - fracAntes[1]) < 1e-6);

    const noMaximo = zoomEm(aproximado, 100, foco, TELA, IMG);
    assert.equal(noMaximo.zoom, ZOOM_MAX);
    assert.strictEqual(zoomEm(noMaximo, 2, foco, TELA, IMG), noMaximo);

    const noMinimo = zoomEm(VISTA_INICIAL, 0.01, foco, TELA, IMG);
    assert.equal(noMinimo.zoom, ZOOM_MIN);
    assert.strictEqual(zoomEm(noMinimo, 0.5, foco, TELA, IMG), noMinimo);
  });

  it('arrastar desloca o centro no sentido oposto e limita em [0, 1]', () => {
    const r = encaixe(VISTA_INICIAL, TELA, IMG);
    // Arrastar para a direita (+dx) reduz cx; arrastar para baixo (+dy) reduz cy
    const movida = arrastar(VISTA_INICIAL, r.w * 0.25, -r.h * 0.1, TELA, IMG);
    assert.ok(Math.abs(movida.cx - 0.25) < 1e-6);
    assert.ok(Math.abs(movida.cy - 0.6) < 1e-6);

    const limiteInferior = arrastar(VISTA_INICIAL, 10000, 10000, TELA, IMG);
    assert.equal(limiteInferior.cx, 0);
    assert.equal(limiteInferior.cy, 0);

    const limiteSuperior = arrastar(VISTA_INICIAL, -10000, -10000, TELA, IMG);
    assert.equal(limiteSuperior.cx, 1);
    assert.equal(limiteSuperior.cy, 1);
  });
});

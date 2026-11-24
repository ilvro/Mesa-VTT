import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { prepararImagemParaGuardar } from '../../src/app/imagens-quadro.ts';

const origCreateImageBitmap = globalThis.createImageBitmap;
const origOffscreenCanvas = globalThis.OffscreenCanvas;

function instalarMocksCanvas(larguraOrig: number, alturaOrig: number) {
  const chamadas: { w: number; h: number; type?: string; quality?: number }[] = [];

  (globalThis as unknown as { createImageBitmap: unknown }).createImageBitmap = async () => ({
    width: larguraOrig,
    height: alturaOrig,
    close() {},
  });

  (globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
    width: number;
    height: number;
    constructor(w: number, h: number) {
      this.width = w;
      this.height = h;
    }
    getContext() {
      return {
        drawImage() {},
      };
    }
    async convertToBlob(opts?: { type?: string; quality?: number }) {
      chamadas.push({ w: this.width, h: this.height, type: opts?.type, quality: opts?.quality });
      return new Blob([new Uint8Array([1, 2, 3])], { type: opts?.type ?? 'image/png' });
    }
  };

  return chamadas;
}

describe('prepararImagemParaGuardar', () => {
  afterEach(() => {
    (globalThis as unknown as { createImageBitmap: unknown }).createImageBitmap = origCreateImageBitmap;
    (globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = origOffscreenCanvas;
  });

  it('reduz imagem maior que 2048 px para até 2048 px em WebP', async () => {
    const chamadas = instalarMocksCanvas(4000, 3000);
    const entrada = new Blob([new Uint8Array([1, 2])], { type: 'image/png' });

    const saida = await prepararImagemParaGuardar(entrada, {
      ladoMaximo: 2048,
      converterParaWebp: true,
      qualidade: 0.85,
    });

    assert.equal(saida.type, 'image/webp');
    assert.deepEqual(chamadas, [{ w: 2048, h: 1536, type: 'image/webp', quality: 0.85 }]);
  });

  it('converte PNG menor que 2048 px para WebP mantendo as dimensões', async () => {
    const chamadas = instalarMocksCanvas(1200, 800);
    const entrada = new Blob([new Uint8Array([1, 2])], { type: 'image/png' });

    const saida = await prepararImagemParaGuardar(entrada, {
      ladoMaximo: 2048,
      converterParaWebp: true,
      qualidade: 0.85,
    });

    assert.equal(saida.type, 'image/webp');
    assert.deepEqual(chamadas, [{ w: 1200, h: 800, type: 'image/webp', quality: 0.85 }]);
  });

  it('preserva WebP já dentro de 2048 px sem reencodar', async () => {
    const chamadas = instalarMocksCanvas(1200, 800);
    const entrada = new Blob([new Uint8Array([1, 2])], { type: 'image/webp' });

    const saida = await prepararImagemParaGuardar(entrada, {
      ladoMaximo: 2048,
      converterParaWebp: true,
    });

    assert.equal(saida, entrada);
    assert.deepEqual(chamadas, []);
  });

  it('preserva GIF e SVG sem rasterizar', async () => {
    const chamadas = instalarMocksCanvas(5000, 5000);
    const gif = new Blob([new Uint8Array([1, 2])], { type: 'image/gif' });
    const svg = new Blob(['<svg></svg>'], { type: 'image/svg+xml' });

    assert.equal(await prepararImagemParaGuardar(gif, { ladoMaximo: 2048, converterParaWebp: true }), gif);
    assert.equal(await prepararImagemParaGuardar(svg, { ladoMaximo: 2048, converterParaWebp: true }), svg);
    assert.deepEqual(chamadas, []);
  });
});

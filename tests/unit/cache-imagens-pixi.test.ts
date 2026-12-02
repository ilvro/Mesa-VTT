import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { modoLeve } from '../../src/app/desempenho.ts';
import { CacheImagensPixi } from '../../src/ui/quadro/pixi/cache-imagens-pixi.ts';
import { degrauZoomMoldura } from '../../src/ui/quadro/pixi/render-itens.ts';

const origCreateImageBitmap = globalThis.createImageBitmap;
const origOffscreenCanvas = globalThis.OffscreenCanvas;
const origModoLeve = modoLeve.peek();

function instalarMocksBitmap(): void {
  (globalThis as unknown as { createImageBitmap: unknown }).createImageBitmap = async () => ({
    width: 128,
    height: 128,
    close() {},
  });
  (globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
    width: number;
    height: number;
    constructor(width: number, height: number) {
      this.width = width;
      this.height = height;
    }
    getContext() {
      return { drawImage() {} };
    }
  };
}

describe('cache-imagens-pixi (M3)', () => {
  afterEach(() => {
    (globalThis as unknown as { createImageBitmap: unknown }).createImageBitmap = origCreateImageBitmap;
    (globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = origOffscreenCanvas;
    modoLeve.value = origModoLeve;
  });

  it('aplica evicção LRU em miniaturas mantendo as mais recentes', async () => {
    instalarMocksBitmap();
    const cache = new CacheImagensPixi({
      maxMiniaturas: 8,
      aoCarregar: () => {},
      carregarBlob: async () => new Blob([new Uint8Array([1, 2, 3])], { type: 'image/webp' }),
    });

    for (let i = 0; i < 8; i++) {
      cache.obter(`mini-${i}`, 'miniatura');
      await new Promise((r) => setTimeout(r, 2));
    }
    assert.equal(cache.quantidadeEmCache().miniaturas, 8);

    // Promove mini-0 para o topo da LRU antes de inserir mais 2.
    assert.ok(cache.obter('mini-0', 'miniatura') !== null);

    for (let i = 8; i < 10; i++) {
      cache.obter(`mini-${i}`, 'miniatura');
      await new Promise((r) => setTimeout(r, 2));
    }
    assert.equal(cache.quantidadeEmCache().miniaturas, 8);
    assert.ok(cache.obter('mini-0', 'miniatura') !== null);
    assert.equal(cache.obter('mini-1', 'miniatura'), null);

    cache.destruir();
  });

  it('usa limites reduzidos quando modoLeve está ativo', async () => {
    instalarMocksBitmap();
    modoLeve.value = true;
    const cache = new CacheImagensPixi({
      aoCarregar: () => {},
      carregarBlob: async () => new Blob([new Uint8Array([1, 2, 3])], { type: 'image/webp' }),
    });

    for (let i = 0; i < 24; i++) {
      cache.obter(`img-${i}`, 'completa');
      await new Promise((r) => setTimeout(r, 2));
    }
    assert.equal(cache.quantidadeEmCache().completas, 20);
    cache.destruir();
  });

  it('quantiza zoom de títulos de moldura em degraus discretos', () => {
    const base = degrauZoomMoldura(1.0);
    assert.equal(degrauZoomMoldura(1.02), base);
    assert.equal(degrauZoomMoldura(0.98), base);
    assert.notEqual(degrauZoomMoldura(1.5), base);
    assert.notEqual(degrauZoomMoldura(0.6), base);
  });
});

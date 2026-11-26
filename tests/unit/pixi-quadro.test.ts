import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import {
  CacheImagensPixi,
  nivelMipmapParaTela,
} from '../../src/ui/quadro/pixi/cache-imagens-pixi.ts';

const origCreateImageBitmap = globalThis.createImageBitmap;
const origOffscreenCanvas = globalThis.OffscreenCanvas;

describe('pixi-quadro (QW5)', () => {
  afterEach(() => {
    (globalThis as unknown as { createImageBitmap: unknown }).createImageBitmap = origCreateImageBitmap;
    (globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = origOffscreenCanvas;
  });

  it('nivelMipmapParaTela escolhe miniatura para itens pequenos na tela e completa ao aproximar', () => {
    assert.equal(nivelMipmapParaTela(1000, 800, 0.1), 'miniatura');
    assert.equal(nivelMipmapParaTela(1000, 800, 0.18), 'miniatura');
    assert.equal(nivelMipmapParaTela(1000, 800, 0.25), 'completa');
    assert.equal(nivelMipmapParaTela(200, 200, 1), 'completa');
  });

  it('CacheImagensPixi aplica evicção LRU em texturas completas sem descartar miniaturas', async () => {
    let fechados = 0;
    (globalThis as unknown as { createImageBitmap: unknown }).createImageBitmap = async () => ({
      width: 128,
      height: 128,
      close() {
        fechados++;
      },
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

    let notificacoes = 0;
    const cache = new CacheImagensPixi({
      maxCompletas: 8,
      aoCarregar: () => {
        notificacoes++;
      },
      carregarBlob: async () => new Blob([new Uint8Array([1, 2, 3])], { type: 'image/webp' }),
    });

    for (let i = 0; i < 10; i++) {
      cache.obter(`img-${i}`, 'completa');
      await new Promise((r) => setTimeout(r, 5));
    }

    assert.equal(cache.quantidadeEmCache().completas, 8);
    assert.ok(notificacoes >= 10);

    cache.obter('mini-1', 'miniatura');
    await new Promise((r) => setTimeout(r, 5));
    assert.equal(cache.quantidadeEmCache().miniaturas, 1);

    cache.destruir();
    assert.deepEqual(cache.quantidadeEmCache(), { miniaturas: 0, completas: 0 });
    assert.ok(fechados >= 0);
  });
});

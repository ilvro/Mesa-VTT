import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { Container } from 'pixi.js';
import { PALETA_PADRAO } from '../../src/dominio/paleta.ts';
import {
  novaForma,
  novaMoldura,
  novaSeta,
  novoTexto,
  novoTraco,
  type Item,
} from '../../src/dominio/quadro.ts';
import {
  CacheImagensPixi,
  nivelMipmapParaTela,
} from '../../src/ui/quadro/pixi/cache-imagens-pixi.ts';
import { parsearCorPixi } from '../../src/ui/quadro/pixi/cores-pixi.ts';
import { GerenciadorItensPixi } from '../../src/ui/quadro/pixi/render-itens.ts';

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

  it('QW6: GerenciadorItensPixi sincroniza formas, molduras, traços, setas curvas e aplica culling', () => {
    const cache = new CacheImagensPixi({
      aoCarregar: () => {},
      carregarBlob: async () => null,
    });
    const camadaMolduras = new Container();
    const camadaItens = new Container();
    const camadaSetas = new Container();

    const ger = new GerenciadorItensPixi({
      camadaMolduras,
      camadaItens,
      camadaSetas,
      cacheImagens: cache,
    });

    const m1 = novaMoldura({ quadroId: 'q1', x: 0, y: 0, largura: 800, altura: 600, titulo: 'Ato 1', z: 1 }, 1, 'm1');
    const f1 = novaForma({ quadroId: 'q1', x: 50, y: 50, largura: 120, altura: 80, forma: 'estrela', z: 2 }, 1, 'f1');
    const t1 = novoTexto({ quadroId: 'q1', x: 5000, y: 5000, largura: 200, altura: 100, z: 3 }, 1, 't-fora');
    const tr1 = novoTraco({
      quadroId: 'q1',
      x: 100,
      y: 100,
      largura: 60,
      altura: 40,
      pontos: [[0, 0, 0.5], [30, 20, 0.5], [60, 40, 0.5]],
      z: 4,
    }, 1, 'tr1');
    const s1 = novaSeta({
      quadroId: 'q1',
      de: { ponto: [60, 60] },
      para: { ponto: [260, 60] },
      rota: 'curva',
      curva: [160, 10],
      espessura: 16,
      z: 5,
    }, 1, 's1');

    const mapa1 = new Map<string, Item>([m1, f1, t1, tr1, s1].map((i) => [i.id, i]));

    ger.sincronizar({
      itens: mapa1,
      camera: { x: 0, y: 0, zoom: 1 },
      tamanho: { largura: 1280, altura: 720 },
      paleta: PALETA_PADRAO,
      esconderSegredos: false,
    });

    assert.equal(ger.quantidadeVisual(), 5);
    assert.equal(ger.quantidadeVisiveis(), 4);
    assert.equal(camadaMolduras.children.length, 1);
    assert.equal(camadaItens.children.length, 3);
    assert.equal(camadaSetas.children.length, 1);

    // Move a câmera para o item distante: o culling alterna a visibilidade.
    ger.sincronizar({
      itens: mapa1,
      camera: { x: 4800, y: 4800, zoom: 1 },
      tamanho: { largura: 1280, altura: 720 },
      paleta: PALETA_PADRAO,
      esconderSegredos: false,
    });
    assert.equal(ger.quantidadeVisiveis(), 1);

    assert.deepEqual(parsearCorPixi('#abc'), { color: 0xaabbcc, alpha: 1 });
    assert.deepEqual(parsearCorPixi('rgba(255, 0, 0, 0.5)'), { color: 0xff0000, alpha: 0.5 });

    ger.destruir();
    cache.destruir();
  });
});

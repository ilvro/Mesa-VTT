import { ImageSource, Texture } from 'pixi.js';
import { lerImagem } from '../../../app/banco-quadros.ts';
import { modoLeve } from '../../../app/desempenho.ts';

export type NivelMipmap = 'miniatura' | 'completa';

const LADO_MINIATURA_PIXI = 256;
const LIMIAR_TELA_MINIATURA = 180;
const MAX_COMPLETAS_PADRAO = 48;
const MAX_COMPLETAS_MODO_LEVE = 20;
const MAX_MINIATURAS_PADRAO = 240;
const MAX_MINIATURAS_MODO_LEVE = 100;

/** Escolhe entre miniatura (<= 256 px) e textura completa conforme o tamanho do item na tela. */
export function nivelMipmapParaTela(
  larguraMundo: number,
  alturaMundo: number,
  zoom: number,
): NivelMipmap {
  return Math.max(larguraMundo, alturaMundo) * zoom <= LIMIAR_TELA_MINIATURA
    ? 'miniatura'
    : 'completa';
}

function texturaDeBitmap(bitmap: ImageBitmap): Texture {
  return new Texture({ source: new ImageSource({ resource: bitmap }) });
}

async function decodificarParaNivel(blob: Blob, nivel: NivelMipmap): Promise<ImageBitmap> {
  if (nivel === 'completa') {
    return createImageBitmap(blob);
  }
  const orig = await createImageBitmap(blob);
  try {
    const maior = Math.max(orig.width, orig.height);
    if (maior <= LADO_MINIATURA_PIXI || maior === 0) {
      return orig;
    }
    const escala = LADO_MINIATURA_PIXI / maior;
    const w = Math.max(1, Math.round(orig.width * escala));
    const h = Math.max(1, Math.round(orig.height * escala));
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext('2d');
    if (!ctx) return orig;
    ctx.drawImage(orig, 0, 0, w, h);
    const bmpMini = await createImageBitmap(canvas);
    orig.close();
    return bmpMini;
  } catch (err) {
    orig.close();
    throw err;
  }
}

export interface OpcoesCacheImagensPixi {
  maxCompletas?: number;
  maxMiniaturas?: number;
  aoCarregar: () => void;
  carregarBlob?: (imagemId: string) => Promise<Blob | null>;
}

/**
 * Gerencia texturas de imagem em duas resoluções para o palco PixiJS:
 * - `miniatura` (<= 256 px): mantida com evicção LRU para zoom distante sem pesar na VRAM.
 * - `completa` (até 2048 px): carregada sob demanda ao aproximar, com evicção LRU.
 */
export class CacheImagensPixi {
  private readonly miniaturas = new Map<string, Texture>();
  private readonly completas = new Map<string, Texture>();
  private readonly falhas = new Set<string>();
  private readonly emVoo = new Map<string, Promise<void>>();
  private readonly maxCompletas: number;
  private readonly maxMiniaturas: number;
  private readonly aoCarregar: () => void;
  private readonly carregarBlob: (imagemId: string) => Promise<Blob | null>;
  private destruido = false;

  constructor(opcoes: OpcoesCacheImagensPixi) {
    const leve = modoLeve.peek();
    const padraoCompletas = leve ? MAX_COMPLETAS_MODO_LEVE : MAX_COMPLETAS_PADRAO;
    const padraoMiniaturas = leve ? MAX_MINIATURAS_MODO_LEVE : MAX_MINIATURAS_PADRAO;
    this.maxCompletas = Math.max(8, opcoes.maxCompletas ?? padraoCompletas);
    this.maxMiniaturas = Math.max(8, opcoes.maxMiniaturas ?? padraoMiniaturas);
    this.aoCarregar = opcoes.aoCarregar;
    this.carregarBlob =
      opcoes.carregarBlob ??
      (async (id) => {
        const reg = await lerImagem(id);
        return reg ? reg.blob : null;
      });
  }

  obter(imagemId: string, nivel: NivelMipmap): Texture | null {
    if (this.destruido || this.falhas.has(imagemId)) return null;

    if (nivel === 'completa') {
      const comp = this.completas.get(imagemId);
      if (comp) {
        // Atualiza posição no LRU.
        this.completas.delete(imagemId);
        this.completas.set(imagemId, comp);
        return comp;
      }
      this.agendar(imagemId, 'completa');
      const miniFallback = this.miniaturas.get(imagemId);
      if (miniFallback) {
        this.miniaturas.delete(imagemId);
        this.miniaturas.set(imagemId, miniFallback);
      }
      return miniFallback ?? null;
    }

    const mini = this.miniaturas.get(imagemId);
    if (mini) {
      this.miniaturas.delete(imagemId);
      this.miniaturas.set(imagemId, mini);
      return mini;
    }
    const comp = this.completas.get(imagemId);
    if (comp) {
      this.completas.delete(imagemId);
      this.completas.set(imagemId, comp);
      return comp;
    }
    this.agendar(imagemId, 'miniatura');
    return null;
  }

  private agendar(imagemId: string, nivel: NivelMipmap): void {
    const chave = `${nivel}:${imagemId}`;
    if (this.emVoo.has(chave)) return;
    const p = this.carregarNivel(imagemId, nivel).finally(() => {
      this.emVoo.delete(chave);
    });
    this.emVoo.set(chave, p);
  }

  private async carregarNivel(imagemId: string, nivel: NivelMipmap): Promise<void> {
    try {
      const blob = await this.carregarBlob(imagemId);
      if (this.destruido || !blob) {
        if (!blob) this.falhas.add(imagemId);
        return;
      }
      const bmp = await decodificarParaNivel(blob, nivel);
      if (this.destruido) {
        bmp.close();
        return;
      }
      const tex = texturaDeBitmap(bmp);
      if (nivel === 'miniatura') {
        this.guardarComLru(this.miniaturas, this.maxMiniaturas, imagemId, tex);
      } else {
        this.guardarComLru(this.completas, this.maxCompletas, imagemId, tex);
      }
      this.aoCarregar();
    } catch {
      this.falhas.add(imagemId);
    }
  }

  private guardarComLru(
    mapa: Map<string, Texture>,
    limite: number,
    imagemId: string,
    tex: Texture,
  ): void {
    const antiga = mapa.get(imagemId);
    if (antiga) {
      mapa.delete(imagemId);
      antiga.destroy(true);
    }
    while (mapa.size >= limite) {
      const primeiro = mapa.keys().next().value;
      if (!primeiro) break;
      const removida = mapa.get(primeiro);
      mapa.delete(primeiro);
      removida?.destroy(true);
    }
    mapa.set(imagemId, tex);
  }

  quantidadeEmCache(): { miniaturas: number; completas: number } {
    return { miniaturas: this.miniaturas.size, completas: this.completas.size };
  }

  /** Quantas imagens ainda estão carregando (a captura espera chegar a zero). */
  emCarregamento(): number {
    return this.emVoo.size;
  }

  destruir(): void {
    this.destruido = true;
    for (const t of this.miniaturas.values()) t.destroy(true);
    for (const t of this.completas.values()) t.destroy(true);
    this.miniaturas.clear();
    this.completas.clear();
    this.emVoo.clear();
    this.falhas.clear();
  }
}

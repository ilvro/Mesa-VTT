import { ImageSource, Texture } from 'pixi.js';
import { lerImagem } from '../../../app/banco-quadros.ts';

export type NivelMipmap = 'miniatura' | 'completa';

const LADO_MINIATURA_PIXI = 256;
const LIMIAR_TELA_MINIATURA = 180;
const MAX_COMPLETAS_PADRAO = 120;

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
  aoCarregar: () => void;
  carregarBlob?: (imagemId: string) => Promise<Blob | null>;
}

/**
 * Gerencia texturas de imagem em duas resoluções para o palco PixiJS:
 * - `miniatura` (<= 256 px): mantida durante o quadro aberto para zoom distante sem pesar na VRAM.
 * - `completa` (até 2048 px): carregada sob demanda ao aproximar, com evicção LRU.
 */
export class CacheImagensPixi {
  private readonly miniaturas = new Map<string, Texture>();
  private readonly completas = new Map<string, Texture>();
  private readonly falhas = new Set<string>();
  private readonly emVoo = new Map<string, Promise<void>>();
  private readonly maxCompletas: number;
  private readonly aoCarregar: () => void;
  private readonly carregarBlob: (imagemId: string) => Promise<Blob | null>;
  private destruido = false;

  constructor(opcoes: OpcoesCacheImagensPixi) {
    this.maxCompletas = Math.max(8, opcoes.maxCompletas ?? MAX_COMPLETAS_PADRAO);
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
      return this.miniaturas.get(imagemId) ?? null;
    }

    const mini = this.miniaturas.get(imagemId);
    if (mini) return mini;
    const comp = this.completas.get(imagemId);
    if (comp) return comp;
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
        const antiga = this.miniaturas.get(imagemId);
        if (antiga) antiga.destroy(true);
        this.miniaturas.set(imagemId, tex);
      } else {
        this.guardarCompleta(imagemId, tex);
      }
      this.aoCarregar();
    } catch {
      this.falhas.add(imagemId);
    }
  }

  private guardarCompleta(imagemId: string, tex: Texture): void {
    const antiga = this.completas.get(imagemId);
    if (antiga) {
      this.completas.delete(imagemId);
      antiga.destroy(true);
    }
    while (this.completas.size >= this.maxCompletas) {
      const primeiro = this.completas.keys().next().value;
      if (!primeiro) break;
      const removida = this.completas.get(primeiro);
      this.completas.delete(primeiro);
      removida?.destroy(true);
    }
    this.completas.set(imagemId, tex);
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

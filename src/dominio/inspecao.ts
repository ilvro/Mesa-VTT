/**
 * Matemática pura da inspeção de documentos (pistas do Ateliê):
 * enquadramento na tela, zoom em torno de um ponto, arrasto (pan) e conversão
 * entre coordenadas de tela e frações normalizadas da imagem (para sincronizar
 * a lanterna UV com o projetor em qualquer resolução).
 */
export interface Vista {
  zoom: number;
  /** Fração (0 a 1) da imagem que está no centro da tela. */
  cx: number;
  cy: number;
}

export interface Tamanho {
  largura: number;
  altura: number;
}

export interface Caixa {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const VISTA_INICIAL: Vista = { zoom: 1, cx: 0.5, cy: 0.5 };
export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 8;

/** O documento ocupa no máximo esta fração da tela com zoom 1. */
const MARGEM = 0.9;

/** Raio da lanterna UV em frações da largura exibida do documento. */
export const RAIO_DA_LANTERNA = 0.13;

const limitar = (n: number, a: number, b: number): number => Math.min(b, Math.max(a, n));

/** Pixels de tela por pixel da imagem com zoom 1 (a imagem inteira cabe na tela com margem). */
export function escalaBase(tela: Tamanho, img: Tamanho): number {
  if (tela.largura <= 0 || tela.altura <= 0 || img.largura <= 0 || img.altura <= 0) return 0;
  return Math.min(tela.largura / img.largura, tela.altura / img.altura) * MARGEM;
}

/** Retângulo (x, y, w, h) da imagem projetada na tela para a vista atual. */
export function encaixe(v: Vista, tela: Tamanho, img: Tamanho): Caixa {
  const e = escalaBase(tela, img) * v.zoom;
  const w = img.largura * e;
  const h = img.altura * e;
  return {
    x: tela.largura / 2 - v.cx * w,
    y: tela.altura / 2 - v.cy * h,
    w,
    h,
  };
}

/** Converte um ponto da tela (px) em frações da imagem (pode cair fora de 0..1). */
export function paraFracao(
  p: readonly [number, number],
  v: Vista,
  tela: Tamanho,
  img: Tamanho,
): [number, number] {
  const r = encaixe(v, tela, img);
  if (r.w <= 0 || r.h <= 0) return [0.5, 0.5];
  return [(p[0] - r.x) / r.w, (p[1] - r.y) / r.h];
}

/** Converte uma fração da imagem em coordenadas de tela (px). */
export function paraTela(
  f: readonly [number, number],
  v: Vista,
  tela: Tamanho,
  img: Tamanho,
): [number, number] {
  const r = encaixe(v, tela, img);
  return [r.x + f[0] * r.w, r.y + f[1] * r.h];
}

/** Altera o zoom mantendo fixo o ponto da imagem sob `foco` (px da tela). */
export function zoomEm(
  v: Vista,
  fator: number,
  foco: readonly [number, number],
  tela: Tamanho,
  img: Tamanho,
): Vista {
  const zoom = limitar(v.zoom * fator, ZOOM_MIN, ZOOM_MAX);
  if (zoom === v.zoom) return v;
  const e = escalaBase(tela, img) * zoom;
  const w = img.largura * e;
  const h = img.altura * e;
  if (w <= 0 || h <= 0) return { ...v, zoom };
  const f = paraFracao(foco, v, tela, img);
  return {
    zoom,
    cx: f[0] - (foco[0] - tela.largura / 2) / w,
    cy: f[1] - (foco[1] - tela.altura / 2) / h,
  };
}

/** Arrasta a imagem `dx`, `dy` pixels da tela (o centro caminha no sentido inverso, preso em 0..1). */
export function arrastar(
  v: Vista,
  dx: number,
  dy: number,
  tela: Tamanho,
  img: Tamanho,
): Vista {
  const e = escalaBase(tela, img) * v.zoom;
  const w = img.largura * e;
  const h = img.altura * e;
  if (w <= 0 || h <= 0) return v;
  return {
    ...v,
    cx: limitar(v.cx - dx / w, 0, 1),
    cy: limitar(v.cy - dy / h, 0, 1),
  };
}

import type { Item } from './quadro.ts';

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export interface Ponto {
  x: number;
  y: number;
}

export interface Caixa {
  x: number;
  y: number;
  largura: number;
  altura: number;
}

export interface Tamanho {
  largura: number;
  altura: number;
}

export const ZOOM_MIN = 0.001;
export const ZOOM_MAX = 4;

export function limitarZoom(zoom: number, min = ZOOM_MIN, max = ZOOM_MAX): number {
  if (!Number.isFinite(zoom)) return 1;
  return Math.min(max, Math.max(min, zoom));
}

export function telaParaMundo(camera: Camera, ponto: Ponto): Ponto {
  return {
    x: camera.x + ponto.x / camera.zoom,
    y: camera.y + ponto.y / camera.zoom,
  };
}

export function mundoParaTela(camera: Camera, ponto: Ponto): Ponto {
  return {
    x: (ponto.x - camera.x) * camera.zoom,
    y: (ponto.y - camera.y) * camera.zoom,
  };
}

export function zoomEm(
  camera: Camera,
  pontoTela: Ponto,
  fator: number,
  min = ZOOM_MIN,
  max = ZOOM_MAX,
): Camera {
  const mundo = telaParaMundo(camera, pontoTela);
  const novoZoom = limitarZoom(camera.zoom * fator, min, max);
  return {
    x: mundo.x - pontoTela.x / novoZoom,
    y: mundo.y - pontoTela.y / novoZoom,
    zoom: novoZoom,
  };
}

/**
 * Pinça de dois dedos: (p1a, p2a) são os dedos no começo, (p1b, p2b) agora (em coordenadas da tela do quadro).
 * O ponto do mundo que estava sob o ponto médio inicial fica sob o ponto médio atual, e o zoom
 * é multiplicado pela razão das distâncias (dentro dos limites).
 */
export function pinca(
  cameraInicial: Camera,
  p1a: Ponto,
  p2a: Ponto,
  p1b: Ponto,
  p2b: Ponto,
  min = ZOOM_MIN,
  max = ZOOM_MAX,
): Camera {
  const distA = Math.hypot(p2a.x - p1a.x, p2a.y - p1a.y);
  const distB = Math.hypot(p2b.x - p1b.x, p2b.y - p1b.y);
  const fator = distA > 0 && distB > 0 ? distB / distA : 1;
  const medioA = { x: (p1a.x + p2a.x) / 2, y: (p1a.y + p2a.y) / 2 };
  const medioB = { x: (p1b.x + p2b.x) / 2, y: (p1b.y + p2b.y) / 2 };
  const mundo = telaParaMundo(cameraInicial, medioA);
  const zoom = limitarZoom(cameraInicial.zoom * fator, min, max);
  return { x: mundo.x - medioB.x / zoom, y: mundo.y - medioB.y / zoom, zoom };
}

export function enquadrar(
  caixa: Caixa,
  tamanhoTela: Tamanho,
  margem = 48,
  min = ZOOM_MIN,
  max = ZOOM_MAX,
): Camera {
  const telaL = Math.max(1, tamanhoTela.largura);
  const telaA = Math.max(1, tamanhoTela.altura);
  const dispL = Math.max(1, telaL - margem * 2);
  const dispA = Math.max(1, telaA - margem * 2);
  const caixaL = Math.max(1, caixa.largura);
  const caixaA = Math.max(1, caixa.altura);

  const zoom = limitarZoom(Math.min(dispL / caixaL, dispA / caixaA), min, max);
  const cx = caixa.x + caixa.largura / 2;
  const cy = caixa.y + caixa.altura / 2;

  return {
    x: cx - telaL / (2 * zoom),
    y: cy - telaA / (2 * zoom),
    zoom,
  };
}

export function caixaVisivel(camera: Camera, tela: Tamanho): Caixa {
  return {
    x: camera.x,
    y: camera.y,
    largura: tela.largura / camera.zoom,
    altura: tela.altura / camera.zoom,
  };
}

export function caixaEnvolventeDeItem(
  item: Pick<Item, 'x' | 'y' | 'largura' | 'altura' | 'rotacao'>,
): Caixa {
  if (item.rotacao === 0) {
    return {
      x: item.x,
      y: item.y,
      largura: item.largura,
      altura: item.altura,
    };
  }
  const rad = (item.rotacao * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sen = Math.abs(Math.sin(rad));
  const novaL = item.largura * cos + item.altura * sen;
  const novaA = item.largura * sen + item.altura * cos;
  const cx = item.x + item.largura / 2;
  const cy = item.y + item.altura / 2;
  return {
    x: cx - novaL / 2,
    y: cy - novaA / 2,
    largura: novaL,
    altura: novaA,
  };
}

export function caixaEnvolventeTotal(
  itens: Iterable<Pick<Item, 'x' | 'y' | 'largura' | 'altura' | 'rotacao'>>,
): Caixa | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let tem = false;

  for (const item of itens) {
    const c = caixaEnvolventeDeItem(item);
    tem = true;
    if (c.x < minX) minX = c.x;
    if (c.y < minY) minY = c.y;
    if (c.x + c.largura > maxX) maxX = c.x + c.largura;
    if (c.y + c.altura > maxY) maxY = c.y + c.altura;
  }

  if (!tem) return null;
  return {
    x: minX,
    y: minY,
    largura: maxX - minX,
    altura: maxY - minY,
  };
}

export function itensVisiveis<
  T extends Pick<Item, 'x' | 'y' | 'largura' | 'altura' | 'rotacao'>,
>(itens: Iterable<T>, caixa: Caixa, margem = 0): T[] {
  const vx1 = caixa.x - margem;
  const vy1 = caixa.y - margem;
  const vx2 = caixa.x + caixa.largura + margem;
  const vy2 = caixa.y + caixa.altura + margem;

  const saida: T[] = [];
  for (const item of itens) {
    const c = caixaEnvolventeDeItem(item);
    if (
      c.x + c.largura >= vx1 &&
      c.x <= vx2 &&
      c.y + c.altura >= vy1 &&
      c.y <= vy2
    ) {
      saida.push(item);
    }
  }
  return saida;
}

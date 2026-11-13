import getStroke from 'perfect-freehand';
import type { Ponto } from './camera.ts';
import type { FERRAMENTAS_TRACO, Item } from './quadro.ts';

export type PontoTraco = [number, number, number];
export type ItemTraco = Extract<Item, { tipo: 'traco' }>;

function distanciaPontoSegmento(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq <= 1e-9) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

export function simplificar(
  pontos: readonly PontoTraco[],
  tolerancia: number,
): PontoTraco[] {
  if (pontos.length <= 2) return pontos.map((p) => [p[0], p[1], p[2]]);

  const primeiro = pontos[0]!;
  const ultimo = pontos[pontos.length - 1]!;
  let maxDist = 0;
  let indiceMax = 0;

  for (let i = 1; i < pontos.length - 1; i++) {
    const p = pontos[i]!;
    const d = distanciaPontoSegmento(
      p[0],
      p[1],
      primeiro[0],
      primeiro[1],
      ultimo[0],
      ultimo[1],
    );
    if (d > maxDist) {
      maxDist = d;
      indiceMax = i;
    }
  }

  if (maxDist > tolerancia) {
    const esquerda = simplificar(pontos.slice(0, indiceMax + 1), tolerancia);
    const direita = simplificar(pontos.slice(indiceMax), tolerancia);
    return [...esquerda.slice(0, -1), ...direita];
  }

  return [
    [primeiro[0], primeiro[1], primeiro[2]],
    [ultimo[0], ultimo[1], ultimo[2]],
  ];
}

export function normalizarTraco(pontosAbsolutos: readonly PontoTraco[]): {
  x: number;
  y: number;
  largura: number;
  altura: number;
  pontos: PontoTraco[];
} {
  if (pontosAbsolutos.length === 0) {
    return { x: 0, y: 0, largura: 4, altura: 4, pontos: [] };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [px, py] of pontosAbsolutos) {
    if (px < minX) minX = px;
    if (py < minY) minY = py;
    if (px > maxX) maxX = px;
    if (py > maxY) maxY = py;
  }
  const pontos: PontoTraco[] = pontosAbsolutos.map(([px, py, pr]) => [
    px - minX,
    py - minY,
    pr,
  ]);
  return {
    x: minX,
    y: minY,
    largura: Math.max(4, maxX - minX),
    altura: Math.max(4, maxY - minY),
    pontos,
  };
}

function contornoParaSvg(contorno: readonly number[][]): string {
  if (contorno.length === 0) return '';
  const primeiro = contorno[0]!;
  const partes: string[] = [`M ${primeiro[0]!.toFixed(2)} ${primeiro[1]!.toFixed(2)}`];
  for (let i = 0; i < contorno.length; i++) {
    const a = contorno[i]!;
    const b = contorno[(i + 1) % contorno.length]!;
    const mx = ((a[0]! + b[0]!) / 2).toFixed(2);
    const my = ((a[1]! + b[1]!) / 2).toFixed(2);
    partes.push(`Q ${a[0]!.toFixed(2)} ${a[1]!.toFixed(2)} ${mx} ${my}`);
  }
  partes.push('Z');
  return partes.join(' ');
}

export function caminhoDoTraco(traco: {
  pontos: readonly PontoTraco[];
  ferramenta: (typeof FERRAMENTAS_TRACO)[number];
  espessura: number;
}): string {
  if (traco.pontos.length === 0) return '';
  const marcaTexto = traco.ferramenta === 'marca-texto';
  const contorno = getStroke(
    traco.pontos.map((p) => [p[0], p[1], p[2]]),
    {
    size: traco.espessura,
    thinning: marcaTexto ? 0 : 0.5,
    smoothing: marcaTexto ? 0.3 : 0.5,
    streamline: marcaTexto ? 0.4 : 0.5,
    simulatePressure: false,
    start: marcaTexto ? { cap: false } : { cap: true },
    end: marcaTexto ? { cap: false } : { cap: true },
  });
  return contornoParaSvg(contorno);
}

export function tracoToca(
  traco: Pick<ItemTraco, 'x' | 'y' | 'largura' | 'altura' | 'pontos' | 'espessura'>,
  ponto: Ponto,
  raio: number,
): boolean {
  const alcance = raio + traco.espessura / 2;
  if (
    ponto.x < traco.x - alcance ||
    ponto.x > traco.x + traco.largura + alcance ||
    ponto.y < traco.y - alcance ||
    ponto.y > traco.y + traco.altura + alcance
  ) {
    return false;
  }
  if (traco.pontos.length === 0) return false;
  if (traco.pontos.length === 1) {
    const p = traco.pontos[0]!;
    return Math.hypot(ponto.x - (traco.x + p[0]), ponto.y - (traco.y + p[1])) <= alcance;
  }
  for (let i = 0; i < traco.pontos.length - 1; i++) {
    const a = traco.pontos[i]!;
    const b = traco.pontos[i + 1]!;
    const d = distanciaPontoSegmento(
      ponto.x,
      ponto.y,
      traco.x + a[0],
      traco.y + a[1],
      traco.x + b[0],
      traco.y + b[1],
    );
    if (d <= alcance) return true;
  }
  return false;
}

export function escalarPontosTraco(
  pontos: readonly PontoTraco[],
  escalaX: number,
  escalaY: number,
): PontoTraco[] {
  return pontos.map(([x, y, p]) => [x * escalaX, y * escalaY, p]);
}

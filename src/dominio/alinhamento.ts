import type { Caixa } from './camera.ts';
import type { Item } from './quadro.ts';

export type ModoAlinhamento =
  | 'esquerda'
  | 'centro-h'
  | 'direita'
  | 'topo'
  | 'centro-v'
  | 'base';

export interface LinhaGuia {
  eixo: 'x' | 'y';
  pos: number;
  de: number;
  ate: number;
}

export function alinhar(
  itens: readonly Item[],
  modo: ModoAlinhamento,
): Map<string, { x: number; y: number }> {
  const resultado = new Map<string, { x: number; y: number }>();
  if (itens.length < 2) return resultado;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const it of itens) {
    if (it.x < minX) minX = it.x;
    if (it.y < minY) minY = it.y;
    if (it.x + it.largura > maxX) maxX = it.x + it.largura;
    if (it.y + it.altura > maxY) maxY = it.y + it.altura;
  }
  const centroX = (minX + maxX) / 2;
  const centroY = (minY + maxY) / 2;

  for (const it of itens) {
    let x = it.x;
    let y = it.y;
    switch (modo) {
      case 'esquerda':
        x = minX;
        break;
      case 'centro-h':
        x = centroX - it.largura / 2;
        break;
      case 'direita':
        x = maxX - it.largura;
        break;
      case 'topo':
        y = minY;
        break;
      case 'centro-v':
        y = centroY - it.altura / 2;
        break;
      case 'base':
        y = maxY - it.altura;
        break;
    }
    resultado.set(it.id, { x, y });
  }
  return resultado;
}

export function distribuir(
  itens: readonly Item[],
  eixo: 'h' | 'v',
): Map<string, { x: number; y: number }> {
  const resultado = new Map<string, { x: number; y: number }>();
  if (itens.length < 3) return resultado;

  const ordenados = [...itens].sort((a, b) =>
    eixo === 'h' ? a.x - b.x || a.id.localeCompare(b.id) : a.y - b.y || a.id.localeCompare(b.id),
  );

  const primeiro = ordenados[0]!;
  const ultimo = ordenados[ordenados.length - 1]!;

  if (eixo === 'h') {
    const inicio = primeiro.x;
    const fim = ultimo.x + ultimo.largura;
    const somaLarguras = ordenados.reduce((s, i) => s + i.largura, 0);
    const espaco = (fim - inicio - somaLarguras) / (ordenados.length - 1);
    let cursor = inicio;
    for (const it of ordenados) {
      resultado.set(it.id, { x: cursor, y: it.y });
      cursor += it.largura + espaco;
    }
  } else {
    const inicio = primeiro.y;
    const fim = ultimo.y + ultimo.altura;
    const somaAlturas = ordenados.reduce((s, i) => s + i.altura, 0);
    const espaco = (fim - inicio - somaAlturas) / (ordenados.length - 1);
    let cursor = inicio;
    for (const it of ordenados) {
      resultado.set(it.id, { x: it.x, y: cursor });
      cursor += it.altura + espaco;
    }
  }

  return resultado;
}

export function guias(
  movendo: Caixa,
  outros: readonly Caixa[],
  tolerancia: number,
): { dx: number; dy: number; linhas: LinhaGuia[] } {
  const linhas: LinhaGuia[] = [];
  if (outros.length === 0) return { dx: 0, dy: 0, linhas };

  const mx = [movendo.x, movendo.x + movendo.largura / 2, movendo.x + movendo.largura];
  const my = [movendo.y, movendo.y + movendo.altura / 2, movendo.y + movendo.altura];

  let melhorDx = 0;
  let menorDistX = tolerancia + 1e-6;
  let alvoX: number | null = null;

  let melhorDy = 0;
  let menorDistY = tolerancia + 1e-6;
  let alvoY: number | null = null;

  for (const o of outros) {
    const ox = [o.x, o.x + o.largura / 2, o.x + o.largura];
    for (const a of mx) {
      for (const b of ox) {
        const dist = Math.abs(b - a);
        if (dist <= tolerancia && dist < menorDistX) {
          menorDistX = dist;
          melhorDx = b - a;
          alvoX = b;
        }
      }
    }

    const oy = [o.y, o.y + o.altura / 2, o.y + o.altura];
    for (const a of my) {
      for (const b of oy) {
        const dist = Math.abs(b - a);
        if (dist <= tolerancia && dist < menorDistY) {
          menorDistY = dist;
          melhorDy = b - a;
          alvoY = b;
        }
      }
    }
  }

  const dx = alvoX !== null ? melhorDx : 0;
  const dy = alvoY !== null ? melhorDy : 0;

  if (alvoX !== null) {
    let de = movendo.y + dy;
    let ate = movendo.y + dy + movendo.altura;
    for (const o of outros) {
      const ox = [o.x, o.x + o.largura / 2, o.x + o.largura];
      if (ox.some((v) => Math.abs(v - alvoX!) < 0.5)) {
        if (o.y < de) de = o.y;
        if (o.y + o.altura > ate) ate = o.y + o.altura;
      }
    }
    linhas.push({ eixo: 'x', pos: alvoX, de, ate });
  }

  if (alvoY !== null) {
    let de = movendo.x + dx;
    let ate = movendo.x + dx + movendo.largura;
    for (const o of outros) {
      const oy = [o.y, o.y + o.altura / 2, o.y + o.altura];
      if (oy.some((v) => Math.abs(v - alvoY!) < 0.5)) {
        if (o.x < de) de = o.x;
        if (o.x + o.largura > ate) ate = o.x + o.largura;
      }
    }
    linhas.push({ eixo: 'y', pos: alvoY, de, ate });
  }

  return { dx, dy, linhas };
}

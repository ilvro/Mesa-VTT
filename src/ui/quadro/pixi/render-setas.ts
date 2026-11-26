import type { Graphics } from 'pixi.js';
import type { Ponto } from '../../../dominio/camera.ts';
import type { Cabeca, Item } from '../../../dominio/quadro.ts';
import { caminhoDaSeta, type ItemSeta } from '../../../dominio/setas.ts';
import { desenharPolilinha, parsearCorPixi } from './cores-pixi.ts';

function amostrarQuadratica(p0: Ponto, c: Ponto, p1: Ponto, passos = 28): Ponto[] {
  const pts: Ponto[] = [];
  for (let i = 0; i <= passos; i++) {
    const t = i / passos;
    const u = 1 - t;
    pts.push({
      x: u * u * p0.x + 2 * u * t * c.x + t * t * p1.x,
      y: u * u * p0.y + 2 * u * t * c.y + t * t * p1.y,
    });
  }
  return pts;
}

function amostrarCubica(p0: Ponto, c1: Ponto, c2: Ponto, p1: Ponto, passos = 32): Ponto[] {
  const pts: Ponto[] = [];
  for (let i = 0; i <= passos; i++) {
    const t = i / passos;
    const u = 1 - t;
    const u2 = u * u;
    const t2 = t * t;
    pts.push({
      x: u2 * u * p0.x + 3 * u2 * t * c1.x + 3 * u * t2 * c2.x + t2 * t * p1.x,
      y: u2 * u * p0.y + 3 * u2 * t * c1.y + 3 * u * t2 * c2.y + t2 * t * p1.y,
    });
  }
  return pts;
}

function rotacionarPonto(px: number, py: number, ox: number, oy: number, rad: number, esc: number): Ponto {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const sx = px * esc;
  const sy = py * esc;
  return {
    x: ox + sx * c - sy * s,
    y: oy + sx * s + sy * c,
  };
}

function desenharCabeca(
  g: Graphics,
  cabeca: Cabeca,
  x: number,
  y: number,
  anguloGraus: number,
  color: number,
  alpha: number,
  espessura: number,
): void {
  if (cabeca === 'nenhuma') return;
  const escala = Math.max(0.85, Math.min(2, espessura / 2));
  if (cabeca === 'circulo') {
    g.circle(x, y, 4 * escala).fill({ color, alpha });
    return;
  }

  const rad = (anguloGraus * Math.PI) / 180;
  if (cabeca === 'seta') {
    const a = rotacionarPonto(-10, -5, x, y, rad, escala);
    const b = rotacionarPonto(0, 0, x, y, rad, escala);
    const c = rotacionarPonto(-10, 5, x, y, rad, escala);
    g.moveTo(a.x, a.y).lineTo(b.x, b.y).lineTo(c.x, c.y);
    g.stroke({ color, alpha, width: 2 * escala, cap: 'round', join: 'round' });
    return;
  }

  if (cabeca === 'triangulo') {
    const a = rotacionarPonto(-11, -5, x, y, rad, escala);
    const b = rotacionarPonto(0, 0, x, y, rad, escala);
    const c = rotacionarPonto(-11, 5, x, y, rad, escala);
    g.poly([a.x, a.y, b.x, b.y, c.x, c.y], true).fill({ color, alpha });
    return;
  }

  // losango
  const p1 = rotacionarPonto(-14, 0, x, y, rad, escala);
  const p2 = rotacionarPonto(-7, -5, x, y, rad, escala);
  const p3 = rotacionarPonto(0, 0, x, y, rad, escala);
  const p4 = rotacionarPonto(-7, 5, x, y, rad, escala);
  g.poly([p1.x, p1.y, p2.x, p2.y, p3.x, p3.y, p4.x, p4.y], true).fill({ color, alpha });
}

/**
 * Desenha uma seta (`reta`, `curva` quadrática/cúbica ou `cotovelo`) com tracejado
 * e cabeças em um `Graphics` do PixiJS.
 */
export function desenharSetaPixi(
  g: Graphics,
  seta: ItemSeta,
  todosItens: ReadonlyMap<string, Item>,
): void {
  g.clear();
  const cam = caminhoDaSeta(seta, todosItens);
  const { color, alpha } = parsearCorPixi(seta.cor, 0xa8b8ad);

  let pontos: Ponto[];
  if (seta.rota === 'curva' && seta.curva && cam.pontosControle.length >= 4) {
    pontos = amostrarQuadratica(cam.inicio, cam.pontosControle[1]!, cam.fim);
  } else if (seta.rota === 'curva' && cam.pontosControle.length === 4) {
    pontos = amostrarCubica(
      cam.inicio,
      cam.pontosControle[1]!,
      cam.pontosControle[2]!,
      cam.fim,
    );
  } else {
    pontos = cam.pontosControle;
  }

  if (seta.tracejado === 'solido' && seta.rota === 'curva') {
    g.moveTo(cam.inicio.x, cam.inicio.y);
    if (seta.curva && cam.pontosControle.length >= 2) {
      const c = cam.pontosControle[1]!;
      g.quadraticCurveTo(c.x, c.y, cam.fim.x, cam.fim.y);
    } else if (cam.pontosControle.length === 4) {
      const c1 = cam.pontosControle[1]!;
      const c2 = cam.pontosControle[2]!;
      g.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, cam.fim.x, cam.fim.y);
    }
  } else {
    desenharPolilinha(g, pontos, seta.tracejado, seta.espessura);
  }
  g.stroke({ color, alpha, width: seta.espessura, cap: 'round', join: 'round' });

  desenharCabeca(
    g,
    seta.inicio,
    cam.inicio.x,
    cam.inicio.y,
    cam.angInicio + 180,
    color,
    alpha,
    seta.espessura,
  );
  desenharCabeca(
    g,
    seta.fim,
    cam.fim.x,
    cam.fim.y,
    cam.angFim,
    color,
    alpha,
    seta.espessura,
  );
}

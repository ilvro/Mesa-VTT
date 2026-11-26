import type { Graphics } from 'pixi.js';
import type { Ponto } from '../../../dominio/camera.ts';
import type { TRACEJADOS } from '../../../dominio/quadro.ts';

/** Converte `#rgb`, `#rrggbb` ou `rgb(...)` em inteiro `0xRRGGBB` + alfa opcional. */
export function parsearCorPixi(
  cor: string,
  fallback = 0xffffff,
): { color: number; alpha: number } {
  const limpa = cor.trim();
  const hex6 = /^#([0-9a-f]{6})$/i.exec(limpa);
  if (hex6) {
    return { color: parseInt(hex6[1]!, 16), alpha: 1 };
  }
  const hex3 = /^#([0-9a-f]{3})$/i.exec(limpa);
  if (hex3) {
    const [r, g, b] = hex3[1]!;
    return { color: parseInt(`${r}${r}${g}${g}${b}${b}`, 16), alpha: 1 };
  }
  const rgb = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*([0-9.]+))?\s*\)$/i.exec(
    limpa,
  );
  if (rgb) {
    const r = Math.min(255, Number(rgb[1]));
    const g = Math.min(255, Number(rgb[2]));
    const b = Math.min(255, Number(rgb[3]));
    const a = rgb[4] !== undefined ? Math.max(0, Math.min(1, Number(rgb[4]))) : 1;
    return { color: (r << 16) | (g << 8) | b, alpha: Number.isFinite(a) ? a : 1 };
  }
  return { color: fallback, alpha: 1 };
}

/**
 * Traça uma polilinha contínua ou tracejada/pontilhada em `Graphics`,
 * replicando os comprimentos de traço usados em `ItemSeta` e `ItemForma`.
 */
export function desenharPolilinha(
  g: Graphics,
  pontos: readonly Ponto[],
  tracejado: (typeof TRACEJADOS)[number],
  espessura: number,
  fechada = false,
): void {
  if (pontos.length < 2) return;
  const lista = fechada ? [...pontos, pontos[0]!] : pontos;

  if (tracejado === 'solido') {
    g.moveTo(lista[0]!.x, lista[0]!.y);
    for (let i = 1; i < lista.length; i++) {
      g.lineTo(lista[i]!.x, lista[i]!.y);
    }
    return;
  }

  const passoCheio = tracejado === 'tracejado' ? Math.max(4, espessura * 3.5) : Math.max(1.5, espessura);
  const passoVazio =
    tracejado === 'tracejado' ? Math.max(3, espessura * 2.5) : Math.max(3, espessura * 2.2);

  let desenhando = true;
  let restante = passoCheio;

  for (let i = 1; i < lista.length; i++) {
    const a = lista[i - 1]!;
    const b = lista[i]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const comp = Math.hypot(dx, dy);
    if (comp < 1e-6) continue;
    const ux = dx / comp;
    const uy = dy / comp;
    let percorrido = 0;

    while (percorrido < comp - 1e-6) {
      const trecho = Math.min(restante, comp - percorrido);
      const x1 = a.x + ux * percorrido;
      const y1 = a.y + uy * percorrido;
      const x2 = a.x + ux * (percorrido + trecho);
      const y2 = a.y + uy * (percorrido + trecho);
      if (desenhando) {
        g.moveTo(x1, y1);
        g.lineTo(x2, y2);
      }
      percorrido += trecho;
      restante -= trecho;
      if (restante <= 1e-6) {
        desenhando = !desenhando;
        restante = desenhando ? passoCheio : passoVazio;
      }
    }
  }
}

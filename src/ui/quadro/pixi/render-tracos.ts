import type { Graphics } from 'pixi.js';
import { contornoDoTraco, type ItemTraco } from '../../../dominio/tracos.ts';
import { parsearCorPixi } from './cores-pixi.ts';

/**
 * Desenha o contorno preenchido de um traço livre (`perfect-freehand`) em `Graphics`.
 */
export function desenharTracoPixi(g: Graphics, traco: ItemTraco): void {
  g.clear();
  const contorno = contornoDoTraco(traco);
  if (contorno.length === 0) return;

  const { color, alpha } = parsearCorPixi(traco.cor, 0xe8efe9);
  const primeiro = contorno[0]!;
  g.moveTo(primeiro[0]!, primeiro[1]!);
  for (let i = 0; i < contorno.length; i++) {
    const a = contorno[i]!;
    const b = contorno[(i + 1) % contorno.length]!;
    const mx = (a[0]! + b[0]!) / 2;
    const my = (a[1]! + b[1]!) / 2;
    g.quadraticCurveTo(a[0]!, a[1]!, mx, my);
  }
  g.closePath();
  g.fill({ color, alpha: alpha * traco.opacidade });
}

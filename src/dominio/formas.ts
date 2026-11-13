import type { Caixa } from './camera.ts';
import type { Forma } from './quadro.ts';

function retanguloArredondado(w: number, h: number, r: number): string {
  const cr = Math.max(0, Math.min(r, w / 2, h / 2));
  if (cr === 0) {
    return `M 0 0 L ${w} 0 L ${w} ${h} L 0 ${h} Z`;
  }
  return [
    `M ${cr} 0`,
    `L ${w - cr} 0`,
    `Q ${w} 0 ${w} ${cr}`,
    `L ${w} ${h - cr}`,
    `Q ${w} ${h} ${w - cr} ${h}`,
    `L ${cr} ${h}`,
    `Q 0 ${h} 0 ${h - cr}`,
    `L 0 ${cr}`,
    `Q 0 0 ${cr} 0`,
    'Z',
  ].join(' ');
}

export function caminhoDaForma(
  forma: Forma,
  largura: number,
  altura: number,
  raio = 0,
): string {
  const w = Math.max(1, largura);
  const h = Math.max(1, altura);
  const rx = w / 2;
  const ry = h / 2;

  switch (forma) {
    case 'retangulo':
      return retanguloArredondado(w, h, raio);

    case 'arredondado':
      return retanguloArredondado(w, h, Math.max(raio, Math.min(w, h) * 0.18));

    case 'elipse':
      return [
        `M ${rx} 0`,
        `A ${rx} ${ry} 0 1 1 ${rx} ${h}`,
        `A ${rx} ${ry} 0 1 1 ${rx} 0`,
        'Z',
      ].join(' ');

    case 'losango':
      return `M ${rx} 0 L ${w} ${ry} L ${rx} ${h} L 0 ${ry} Z`;

    case 'triangulo':
      return `M ${rx} 0 L ${w} ${h} L 0 ${h} Z`;

    case 'paralelogramo': {
      const dx = w * 0.18;
      return `M ${dx} 0 L ${w} 0 L ${w - dx} ${h} L 0 ${h} Z`;
    }

    case 'hexagono': {
      const dx = w * 0.22;
      return `M ${dx} 0 L ${w - dx} 0 L ${w} ${ry} L ${w - dx} ${h} L ${dx} ${h} L 0 ${ry} Z`;
    }

    case 'estrela': {
      const pts: string[] = [];
      for (let i = 0; i < 10; i++) {
        const ang = -Math.PI / 2 + (i * Math.PI) / 5;
        const f = i % 2 === 0 ? 1 : 0.42;
        const px = rx + Math.cos(ang) * rx * f;
        const py = ry + Math.sin(ang) * ry * f;
        pts.push(`${i === 0 ? 'M' : 'L'} ${px.toFixed(2)} ${py.toFixed(2)}`);
      }
      pts.push('Z');
      return pts.join(' ');
    }

    case 'nuvem': {
      return [
        `M ${(w * 0.25).toFixed(1)} ${(h * 0.85).toFixed(1)}`,
        `C ${(w * 0.05).toFixed(1)} ${(h * 0.85).toFixed(1)}, 0 ${(h * 0.55).toFixed(1)}, ${(w * 0.14).toFixed(1)} ${(h * 0.42).toFixed(1)}`,
        `C ${(w * 0.1).toFixed(1)} ${(h * 0.2).toFixed(1)}, ${(w * 0.32).toFixed(1)} ${(h * 0.06).toFixed(1)}, ${(w * 0.5).toFixed(1)} ${(h * 0.16).toFixed(1)}`,
        `C ${(w * 0.65).toFixed(1)} ${(h * 0.04).toFixed(1)}, ${(w * 0.9).toFixed(1)} ${(h * 0.18).toFixed(1)}, ${(w * 0.86).toFixed(1)} ${(h * 0.4).toFixed(1)}`,
        `C ${(w * 1.0).toFixed(1)} ${(h * 0.54).toFixed(1)}, ${(w * 0.94).toFixed(1)} ${(h * 0.85).toFixed(1)}, ${(w * 0.74).toFixed(1)} ${(h * 0.85).toFixed(1)}`,
        'Z',
      ].join(' ');
    }
  }
}

export function areaUtil(forma: Forma, caixa: Caixa): Caixa {
  const { x, y, largura: w, altura: h } = caixa;
  const inset = (fx: number, fy: number, fw: number, fh: number): Caixa => ({
    x: x + w * fx,
    y: y + h * fy,
    largura: w * fw,
    altura: h * fh,
  });

  switch (forma) {
    case 'retangulo':
    case 'arredondado':
      return { x, y, largura: w, altura: h };
    case 'elipse':
      return inset(0.15, 0.15, 0.7, 0.7);
    case 'losango':
      return inset(0.25, 0.25, 0.5, 0.5);
    case 'triangulo':
      return inset(0.25, 0.45, 0.5, 0.5);
    case 'paralelogramo':
      return inset(0.16, 0.06, 0.68, 0.88);
    case 'hexagono':
      return inset(0.16, 0.08, 0.68, 0.84);
    case 'estrela':
      return inset(0.28, 0.28, 0.44, 0.44);
    case 'nuvem':
      return inset(0.18, 0.22, 0.64, 0.56);
  }
}

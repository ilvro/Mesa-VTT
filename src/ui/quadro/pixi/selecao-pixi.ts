import { Container, Graphics } from 'pixi.js';
import type { LinhaGuia } from '../../../dominio/alinhamento.ts';
import { ZOOM_MIN, type Caixa } from '../../../dominio/camera.ts';
import { contornoDoTraco, type PontoTraco } from '../../../dominio/tracos.ts';
import { parsearCorPixi } from './cores-pixi.ts';

export interface TracoEmDesenhoPixi {
  ferramenta: 'caneta' | 'marca-texto';
  pontos: PontoTraco[];
  cor: string;
  espessura: number;
  opacidade: number;
}

export interface OpcoesSelecaoPixi {
  zoom: number;
  retanguloSelecao: Caixa | null;
  linhasGuia?: readonly LinhaGuia[];
  tracoEmDesenho?: TracoEmDesenhoPixi | null;
}

/**
 * Desenha sobreposições de seleção na `camadaSelecao` do PixiJS:
 * retângulo de seleção por arrasto, linhas-guia de alinhamento e prévia do traço ao vivo.
 */
export class CamadaSelecaoPixi {
  private readonly g = new Graphics();

  constructor(camada: Container) {
    camada.addChild(this.g);
  }

  atualizar(op: OpcoesSelecaoPixi): void {
    const g = this.g;
    g.clear();
    const invZoom = 1 / Math.max(ZOOM_MIN, op.zoom);

    if (op.retanguloSelecao) {
      const r = op.retanguloSelecao;
      const x = Math.min(r.x, r.x + r.largura);
      const y = Math.min(r.y, r.y + r.altura);
      const w = Math.abs(r.largura);
      const h = Math.abs(r.altura);
      g.rect(x, y, w, h)
        .fill({ color: 0x8bd197, alpha: 0.12 })
        .stroke({ color: 0x8bd197, alpha: 0.9, width: 1.5 * invZoom });
    }

    if (op.linhasGuia && op.linhasGuia.length > 0) {
      for (const l of op.linhasGuia) {
        if (l.eixo === 'x') {
          g.moveTo(l.pos, l.de).lineTo(l.pos, l.ate);
        } else {
          g.moveTo(l.de, l.pos).lineTo(l.ate, l.pos);
        }
      }
      g.stroke({ color: 0x8bd197, alpha: 0.85, width: invZoom });
    }

    if (op.tracoEmDesenho && op.tracoEmDesenho.pontos.length > 0) {
      const contorno = contornoDoTraco(op.tracoEmDesenho);
      if (contorno.length > 0) {
        const { color, alpha } = parsearCorPixi(op.tracoEmDesenho.cor, 0xe8efe9);
        const p0 = contorno[0]!;
        g.moveTo(p0[0]!, p0[1]!);
        for (let i = 0; i < contorno.length; i++) {
          const a = contorno[i]!;
          const b = contorno[(i + 1) % contorno.length]!;
          g.quadraticCurveTo(a[0]!, a[1]!, (a[0]! + b[0]!) / 2, (a[1]! + b[1]!) / 2);
        }
        g.closePath();
        g.fill({ color, alpha: alpha * op.tracoEmDesenho.opacidade });
      }
    }
  }

  destruir(): void {
    this.g.destroy();
  }
}

import type { Graphics } from 'pixi.js';
import type { Camera, Tamanho } from '../../../dominio/camera.ts';
import { corFundoClara } from '../quadro-helpers.ts';

export interface ConfigFundoGrade {
  cor: string;
  grade: 'nenhuma' | 'pontos' | 'linhas';
  passo: number;
}

/**
 * Desenha a grade ou os pontos do fundo diretamente em coordenadas de tela,
 * alinhados com a câmera atual sem gerar repaints ou layout de CSS.
 */
export function desenharGradePixi(
  g: Graphics,
  fundo: ConfigFundoGrade,
  cam: Camera,
  tela: Tamanho,
): void {
  g.clear();
  const passoTela = fundo.passo * cam.zoom;
  if (fundo.grade === 'nenhuma' || passoTela < 6 || tela.largura <= 0 || tela.altura <= 0) {
    return;
  }

  const clara = corFundoClara(fundo.cor);
  const cor = clara ? 0x000000 : 0xffffff;
  const alpha = fundo.grade === 'pontos' ? (clara ? 0.22 : 0.2) : 0.14;
  const ox = ((-cam.x * cam.zoom) % passoTela + passoTela) % passoTela;
  const oy = ((-cam.y * cam.zoom) % passoTela + passoTela) % passoTela;

  if (fundo.grade === 'pontos') {
    for (let y = oy; y <= tela.altura; y += passoTela) {
      for (let x = ox; x <= tela.largura; x += passoTela) {
        g.rect(x, y, 1.5, 1.5);
      }
    }
    g.fill({ color: cor, alpha });
    return;
  }

  for (let x = ox; x <= tela.largura; x += passoTela) {
    g.moveTo(x, 0);
    g.lineTo(x, tela.altura);
  }
  for (let y = oy; y <= tela.altura; y += passoTela) {
    g.moveTo(0, y);
    g.lineTo(tela.largura, y);
  }
  g.stroke({ color: cor, alpha, width: 1 });
}

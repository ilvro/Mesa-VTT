import type { Graphics } from 'pixi.js';
import type { Camera, Tamanho } from '../../../dominio/camera.ts';
import { corFundoClara } from '../quadro-helpers.ts';

export interface ConfigFundoGrade {
  cor: string;
  grade: 'nenhuma' | 'pontos' | 'linhas';
  passo: number;
}

/** Cada nível da grade é 4× o anterior (passo, 4·passo, 16·passo…), como no Miro. */
export const FATOR_NIVEL_GRADE = 4;
/** Abaixo deste espaçamento na tela (px) um nível some; acima de `CHEIO`, fica com a opacidade inteira. */
const ESPACO_SOME = 6;
const ESPACO_CHEIO = 40;

export interface NivelGrade {
  /** Espaçamento em px do quadro. */
  passo: number;
  /** 0–1, multiplicado pela opacidade base. */
  forca: number;
}

/**
 * Níveis visíveis da grade em linhas, do mais fino ao mais grosso. O mais fino aparece
 * aos poucos conforme o espaçamento na tela cresce; ao afastar, ele some e o seguinte
 * vira o fino. Assim a grade nunca desaparece e não "pula" de tamanho.
 */
export function niveisDaGrade(passoBase: number, zoom: number, quantos = 3): NivelGrade[] {
  if (!(passoBase > 0) || !(zoom > 0)) return [];
  let passo = passoBase;
  while (passo * zoom < ESPACO_SOME) passo *= FATOR_NIVEL_GRADE;
  const niveis: NivelGrade[] = [];
  for (let i = 0; i < quantos; i++) {
    const t = (passo * zoom - ESPACO_SOME) / (ESPACO_CHEIO - ESPACO_SOME);
    const c = Math.min(1, Math.max(0, t));
    niveis.push({ passo, forca: c * c * (3 - 2 * c) });
    passo *= FATOR_NIVEL_GRADE;
  }
  return niveis;
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
  if (fundo.grade === 'nenhuma' || tela.largura <= 0 || tela.altura <= 0) return;

  const clara = corFundoClara(fundo.cor);
  const cor = clara ? 0x000000 : 0xffffff;

  if (fundo.grade === 'pontos') {
    let passoTela = fundo.passo * cam.zoom;
    if (!(passoTela > 0)) return;
    while (passoTela < 10) passoTela *= FATOR_NIVEL_GRADE;
    const ox = ((-cam.x * cam.zoom) % passoTela + passoTela) % passoTela;
    const oy = ((-cam.y * cam.zoom) % passoTela + passoTela) % passoTela;
    for (let y = oy; y <= tela.altura; y += passoTela) {
      for (let x = ox; x <= tela.largura; x += passoTela) {
        g.rect(x, y, 1.5, 1.5);
      }
    }
    g.fill({ color: cor, alpha: clara ? 0.22 : 0.2 });
    return;
  }

  // Linhas: cada linha é desenhada uma vez só, com a força do nível mais grosso a que pertence.
  const base = clara ? 0.13 : 0.1;
  const niveis = niveisDaGrade(fundo.passo, cam.zoom);
  const x0 = cam.x;
  const y0 = cam.y;
  const x1 = cam.x + tela.largura / cam.zoom;
  const y1 = cam.y + tela.altura / cam.zoom;
  for (let i = 0; i < niveis.length; i++) {
    const nivel = niveis[i]!;
    const alpha = base * nivel.forca;
    if (alpha < 0.004) continue;
    const superior = i + 1 < niveis.length;
    const s = nivel.passo;
    let n = Math.ceil(x0 / s);
    for (let wx = n * s; wx <= x1; wx += s, n++) {
      if (superior && n % FATOR_NIVEL_GRADE === 0) continue;
      const x = Math.round((wx - cam.x) * cam.zoom) + 0.5;
      g.moveTo(x, 0);
      g.lineTo(x, tela.altura);
    }
    n = Math.ceil(y0 / s);
    for (let wy = n * s; wy <= y1; wy += s, n++) {
      if (superior && n % FATOR_NIVEL_GRADE === 0) continue;
      const y = Math.round((wy - cam.y) * cam.zoom) + 0.5;
      g.moveTo(0, y);
      g.lineTo(tela.largura, y);
    }
    g.stroke({ color: cor, alpha, width: 1 });
  }
}

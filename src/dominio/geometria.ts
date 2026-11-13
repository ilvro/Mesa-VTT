import { caixaEnvolventeDeItem, type Caixa, type Ponto } from './camera.ts';
import type { Item } from './quadro.ts';

export type Alca = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';

export const ALCAS: readonly Alca[] = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'];

export function caixaDe(
  item: Pick<Item, 'x' | 'y' | 'largura' | 'altura' | 'rotacao'>,
): Caixa {
  return caixaEnvolventeDeItem(item);
}

export function contemPonto(
  item: Pick<Item, 'x' | 'y' | 'largura' | 'altura' | 'rotacao'>,
  p: Ponto,
): boolean {
  if (item.rotacao === 0) {
    return (
      p.x >= item.x &&
      p.x <= item.x + item.largura &&
      p.y >= item.y &&
      p.y <= item.y + item.altura
    );
  }
  const cx = item.x + item.largura / 2;
  const cy = item.y + item.altura / 2;
  const rad = (-item.rotacao * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sen = Math.sin(rad);
  const dx = p.x - cx;
  const dy = p.y - cy;
  const lx = dx * cos - dy * sen + item.largura / 2;
  const ly = dx * sen + dy * cos + item.altura / 2;
  return lx >= 0 && lx <= item.largura && ly >= 0 && ly <= item.altura;
}

export function itensNoRetangulo<
  T extends Pick<Item, 'x' | 'y' | 'largura' | 'altura' | 'rotacao'>,
>(itens: Iterable<T>, ret: Caixa, modo: 'tocar' | 'conter'): T[] {
  const rx1 = Math.min(ret.x, ret.x + ret.largura);
  const ry1 = Math.min(ret.y, ret.y + ret.altura);
  const rx2 = Math.max(ret.x, ret.x + ret.largura);
  const ry2 = Math.max(ret.y, ret.y + ret.altura);

  const saida: T[] = [];
  for (const item of itens) {
    const c = caixaDe(item);
    const ix1 = c.x;
    const iy1 = c.y;
    const ix2 = c.x + c.largura;
    const iy2 = c.y + c.altura;
    if (modo === 'tocar') {
      if (ix2 >= rx1 && ix1 <= rx2 && iy2 >= ry1 && iy1 <= ry2) {
        saida.push(item);
      }
    } else {
      if (ix1 >= rx1 && ix2 <= rx2 && iy1 >= ry1 && iy2 <= ry2) {
        saida.push(item);
      }
    }
  }
  return saida;
}

export function encaixarNaGrade(v: number, passo: number): number {
  if (!Number.isFinite(passo) || passo <= 0) return v;
  return Math.round(v / passo) * passo;
}

export function girar(
  _caixa: Caixa,
  angulo: number,
  encaixe15: boolean,
): number {
  let a = encaixe15 ? Math.round(angulo / 15) * 15 : angulo;
  a = ((a % 360) + 360) % 360;
  if (a > 180) a -= 360;
  return Object.is(a, -0) ? 0 : a;
}

export function redimensionar(
  caixa: Caixa,
  alca: Alca,
  delta: Ponto,
  opcoes: { manterProporcao?: boolean; doCentro?: boolean; minTamanho?: number } = {},
): Caixa {
  const min = opcoes.minTamanho ?? 16;
  const doCentro = opcoes.doCentro ?? false;
  const manterProporcao = opcoes.manterProporcao ?? false;

  const temOeste = alca.includes('w');
  const temLeste = alca.includes('e');
  const temNorte = alca.includes('n');
  const temSul = alca.includes('s');

  let esquerda = caixa.x;
  let direita = caixa.x + caixa.largura;
  let topo = caixa.y;
  let base = caixa.y + caixa.altura;

  if (temOeste) {
    esquerda += delta.x;
    if (doCentro) direita -= delta.x;
  } else if (temLeste) {
    direita += delta.x;
    if (doCentro) esquerda -= delta.x;
  }

  if (temNorte) {
    topo += delta.y;
    if (doCentro) base -= delta.y;
  } else if (temSul) {
    base += delta.y;
    if (doCentro) topo -= delta.y;
  }

  let largura = direita - esquerda;
  let altura = base - topo;

  if (largura < min) {
    const diff = min - largura;
    if (doCentro) {
      esquerda -= diff / 2;
      direita += diff / 2;
    } else if (temOeste) {
      esquerda = direita - min;
    } else {
      direita = esquerda + min;
    }
    largura = min;
  }

  if (altura < min) {
    const diff = min - altura;
    if (doCentro) {
      topo -= diff / 2;
      base += diff / 2;
    } else if (temNorte) {
      topo = base - min;
    } else {
      base = topo + min;
    }
    altura = min;
  }

  if (manterProporcao && caixa.largura > 0 && caixa.altura > 0) {
    const razao = caixa.largura / caixa.altura;
    const ehCanto = (temOeste || temLeste) && (temNorte || temSul);
    if (ehCanto) {
      const escalaL = largura / caixa.largura;
      const escalaA = altura / caixa.altura;
      if (Math.abs(escalaL - 1) >= Math.abs(escalaA - 1)) {
        altura = Math.max(min, largura / razao);
        largura = altura * razao;
      } else {
        largura = Math.max(min, altura * razao);
        altura = largura / razao;
      }
    } else if (temOeste || temLeste) {
      altura = Math.max(min, largura / razao);
      largura = altura * razao;
    } else if (temNorte || temSul) {
      largura = Math.max(min, altura * razao);
      altura = largura / razao;
    }

    if (doCentro) {
      const cx = caixa.x + caixa.largura / 2;
      const cy = caixa.y + caixa.altura / 2;
      esquerda = cx - largura / 2;
      topo = cy - altura / 2;
    } else {
      if (temOeste) esquerda = direita - largura;
      if (temNorte) topo = base - altura;
    }
  }

  return { x: esquerda, y: topo, largura, altura };
}

import type { Ponto } from './camera.ts';
import type { Cabeca, Item, Ponta } from './quadro.ts';

export type ItemSeta = Extract<Item, { tipo: 'seta' }>;
export type LadoResolvido = 'cima' | 'baixo' | 'esquerda' | 'direita';

export interface CaminhoSeta {
  d: string;
  inicio: Ponto;
  fim: Ponto;
  meio: [number, number];
  angInicio: number;
  angFim: number;
  pontosControle: Ponto[];
}

export function centroDoItem(item: Pick<Item, 'x' | 'y' | 'largura' | 'altura'>): Ponto {
  return {
    x: item.x + item.largura / 2,
    y: item.y + item.altura / 2,
  };
}

export function pontoNoLado(
  item: Pick<Item, 'x' | 'y' | 'largura' | 'altura'>,
  lado: LadoResolvido,
): Ponto {
  switch (lado) {
    case 'cima':
      return { x: item.x + item.largura / 2, y: item.y };
    case 'baixo':
      return { x: item.x + item.largura / 2, y: item.y + item.altura };
    case 'esquerda':
      return { x: item.x, y: item.y + item.altura / 2 };
    case 'direita':
      return { x: item.x + item.largura, y: item.y + item.altura / 2 };
  }
}

function pontoAlvoDe(
  ref: Ponta | Ponto | undefined,
  itens: ReadonlyMap<string, Item>,
): Ponto | null {
  if (!ref) return null;
  if ('x' in ref && 'y' in ref) return ref;
  if ('ponto' in ref) return { x: ref.ponto[0], y: ref.ponto[1] };
  const item = itens.get(ref.itemId);
  return item ? centroDoItem(item) : null;
}

export function pontoDaPonta(
  ponta: Ponta,
  itens: ReadonlyMap<string, Item>,
  outraPonta?: Ponta | Ponto,
): { ponto: Ponto; lado: LadoResolvido | null } {
  if ('ponto' in ponta) {
    return { ponto: { x: ponta.ponto[0], y: ponta.ponto[1] }, lado: null };
  }
  const item = itens.get(ponta.itemId);
  if (!item) {
    return { ponto: { x: 0, y: 0 }, lado: null };
  }
  if (ponta.lado !== 'auto') {
    return { ponto: pontoNoLado(item, ponta.lado), lado: ponta.lado };
  }

  const alvo = pontoAlvoDe(outraPonta, itens);
  if (!alvo) {
    return { ponto: pontoNoLado(item, 'direita'), lado: 'direita' };
  }
  const centro = centroDoItem(item);
  const dx = alvo.x - centro.x;
  const dy = alvo.y - centro.y;
  const rx = Math.abs(dx) / Math.max(1, item.largura);
  const ry = Math.abs(dy) / Math.max(1, item.altura);
  const lado: LadoResolvido =
    rx >= ry ? (dx >= 0 ? 'direita' : 'esquerda') : dy >= 0 ? 'baixo' : 'cima';
  return { ponto: pontoNoLado(item, lado), lado };
}

function vetorDoLado(lado: LadoResolvido): Ponto {
  switch (lado) {
    case 'cima':
      return { x: 0, y: -1 };
    case 'baixo':
      return { x: 0, y: 1 };
    case 'esquerda':
      return { x: -1, y: 0 };
    case 'direita':
      return { x: 1, y: 0 };
  }
}

function anguloEntre(de: Ponto, para: Ponto, fallback = 0): number {
  const dx = para.x - de.x;
  const dy = para.y - de.y;
  if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) return fallback;
  return (Math.atan2(dy, dx) * 180) / Math.PI;
}

export function caminhoDaSeta(
  seta: Pick<ItemSeta, 'de' | 'para' | 'rota'>,
  itens: ReadonlyMap<string, Item>,
): CaminhoSeta {
  const resInicio = pontoDaPonta(seta.de, itens, seta.para);
  const resFim = pontoDaPonta(seta.para, itens, seta.de);
  const p1 = resInicio.ponto;
  const p2 = resFim.ponto;
  const angDireto = anguloEntre(p1, p2, 0);

  if (seta.rota === 'reta') {
    return {
      d: `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}`,
      inicio: p1,
      fim: p2,
      meio: [(p1.x + p2.x) / 2, (p1.y + p2.y) / 2],
      angInicio: angDireto,
      angFim: angDireto,
      pontosControle: [p1, p2],
    };
  }

  if (seta.rota === 'curva') {
    const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const alavanca = Math.max(36, Math.min(180, dist * 0.4));
    const v1 = resInicio.lado
      ? vetorDoLado(resInicio.lado)
      : { x: (p2.x - p1.x) / Math.max(1, dist), y: (p2.y - p1.y) / Math.max(1, dist) };
    const v2 = resFim.lado
      ? vetorDoLado(resFim.lado)
      : { x: (p1.x - p2.x) / Math.max(1, dist), y: (p1.y - p2.y) / Math.max(1, dist) };

    const c1: Ponto = { x: p1.x + v1.x * alavanca, y: p1.y + v1.y * alavanca };
    const c2: Ponto = { x: p2.x + v2.x * alavanca, y: p2.y + v2.y * alavanca };

    const meioX = 0.125 * p1.x + 0.375 * c1.x + 0.375 * c2.x + 0.125 * p2.x;
    const meioY = 0.125 * p1.y + 0.375 * c1.y + 0.375 * c2.y + 0.125 * p2.y;

    return {
      d: `M ${p1.x} ${p1.y} C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${p2.x} ${p2.y}`,
      inicio: p1,
      fim: p2,
      meio: [meioX, meioY],
      angInicio: anguloEntre(p1, c1, angDireto),
      angFim: anguloEntre(c2, p2, angDireto),
      pontosControle: [p1, c1, c2, p2],
    };
  }

  // cotovelo (ortogonal, no máximo 3 segmentos)
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const saidaHorizontal =
    resInicio.lado === 'esquerda' || resInicio.lado === 'direita'
      ? true
      : resInicio.lado === 'cima' || resInicio.lado === 'baixo'
        ? false
        : Math.abs(dx) >= Math.abs(dy);

  let pts: Ponto[];
  let meio: [number, number];

  if (saidaHorizontal) {
    const midX = (p1.x + p2.x) / 2;
    pts = [p1, { x: midX, y: p1.y }, { x: midX, y: p2.y }, p2];
    meio = [midX, (p1.y + p2.y) / 2];
  } else {
    const midY = (p1.y + p2.y) / 2;
    pts = [p1, { x: p1.x, y: midY }, { x: p2.x, y: midY }, p2];
    meio = [(p1.x + p2.x) / 2, midY];
  }

  const d = pts.map((pt, idx) => `${idx === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`).join(' ');
  const primeiroDiferente = pts.find(
    (pt, idx) => idx > 0 && (Math.abs(pt.x - p1.x) > 1e-3 || Math.abs(pt.y - p1.y) > 1e-3),
  );
  const ultimoDiferente = [...pts]
    .reverse()
    .find(
      (pt, idx) => idx > 0 && (Math.abs(pt.x - p2.x) > 1e-3 || Math.abs(pt.y - p2.y) > 1e-3),
    );

  return {
    d,
    inicio: p1,
    fim: p2,
    meio,
    angInicio: primeiroDiferente ? anguloEntre(p1, primeiroDiferente, angDireto) : angDireto,
    angFim: ultimoDiferente ? anguloEntre(ultimoDiferente, p2, angDireto) : angDireto,
    pontosControle: pts,
  };
}

export function caixaDaSeta(
  seta: Pick<ItemSeta, 'de' | 'para' | 'rota'>,
  itens: ReadonlyMap<string, Item>,
): { x: number; y: number; largura: number; altura: number } {
  const cam = caminhoDaSeta(seta, itens);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const pt of cam.pontosControle) {
    if (pt.x < minX) minX = pt.x;
    if (pt.y < minY) minY = pt.y;
    if (pt.x > maxX) maxX = pt.x;
    if (pt.y > maxY) maxY = pt.y;
  }
  const [mx, my] = cam.meio;
  if (mx < minX) minX = mx;
  if (my < minY) minY = my;
  if (mx > maxX) maxX = mx;
  if (my > maxY) maxY = my;

  return {
    x: minX,
    y: minY,
    largura: Math.max(20, maxX - minX),
    altura: Math.max(20, maxY - minY),
  };
}

export function setasLigadasA(
  ids: ReadonlySet<string> | readonly string[],
  itens: ReadonlyMap<string, Item>,
): ItemSeta[] {
  const conjunto = ids instanceof Set ? ids : new Set(ids);
  const resultado: ItemSeta[] = [];
  for (const item of itens.values()) {
    if (item.tipo !== 'seta') continue;
    const ligadaDe = 'itemId' in item.de && conjunto.has(item.de.itemId);
    const ligadaPara = 'itemId' in item.para && conjunto.has(item.para.itemId);
    if (ligadaDe || ligadaPara) {
      resultado.push(item);
    }
  }
  return resultado;
}

export function caminhoCabecaSeta(cabeca: Cabeca): string | null {
  switch (cabeca) {
    case 'nenhuma':
      return null;
    case 'seta':
      return 'M -10 -5 L 0 0 L -10 5';
    case 'triangulo':
      return 'M -11 -5 L 0 0 L -11 5 Z';
    case 'losango':
      return 'M -14 0 L -7 -5 L 0 0 L -7 5 Z';
    case 'circulo':
      return null;
  }
}

// Puro: a região do quadro que `quadro_ver_regiao` captura (Q9c).
import { caixaEnvolventeTotal, type Caixa } from './camera.ts';
import type { Item } from './quadro.ts';

export const MARGEM_DA_CAPTURA = 40;
export const LADO_PADRAO_CAPTURA = 1024;
export const LADO_MAXIMO_CAPTURA = 1568;
/** Acima disso o texto fica ilegível mesmo no lado máximo; a ferramenta pede uma região menor. */
export const MAIOR_LADO_DA_REGIAO = 12000;

/** Caixa envolvente dos itens (setas ficam de fora: seguem as pontas) com uma margem; null se não houver item. */
export function caixaDaCaptura(itens: Iterable<Item>, margem = MARGEM_DA_CAPTURA): Caixa | null {
  const c = caixaEnvolventeTotal([...itens].filter((i) => i.tipo !== 'seta'));
  if (!c) return null;
  return { x: c.x - margem, y: c.y - margem, largura: c.largura + 2 * margem, altura: c.altura + 2 * margem };
}

/** Zoom e tamanho em pixels para que o maior lado da caixa caiba em `lado` (nunca amplia além de 2×). */
export function escalaDaCaptura(caixa: Caixa, lado: number): { zoom: number; largura: number; altura: number } {
  const maior = Math.max(1, caixa.largura, caixa.altura);
  const zoom = Math.min(2, lado / maior);
  return { zoom, largura: Math.max(1, Math.round(caixa.largura * zoom)), altura: Math.max(1, Math.round(caixa.altura * zoom)) };
}

/** Os itens que tocam a caixa (as setas entram se uma das pontas estiver ligada a um deles ou cair na caixa). */
export function itensDaRegiao(itens: ReadonlyMap<string, Item>, caixa: Caixa): Map<string, Item> {
  const dentro = (x: number, y: number) => x >= caixa.x && x <= caixa.x + caixa.largura && y >= caixa.y && y <= caixa.y + caixa.altura;
  const saida = new Map<string, Item>();
  for (const [id, i] of itens) {
    if (i.tipo === 'seta') continue;
    if (i.x + i.largura >= caixa.x && i.x <= caixa.x + caixa.largura && i.y + i.altura >= caixa.y && i.y <= caixa.y + caixa.altura) saida.set(id, i);
  }
  for (const [id, i] of itens) {
    if (i.tipo !== 'seta') continue;
    const toca = [i.de, i.para].some((p) => ('itemId' in p ? saida.has(p.itemId) : dentro(p.ponto[0], p.ponto[1])));
    if (toca) saida.set(id, i);
  }
  // Uma seta ligada a um item fora da região precisa dele para achar o caminho.
  for (const i of [...saida.values()]) {
    if (i.tipo !== 'seta') continue;
    for (const p of [i.de, i.para]) if ('itemId' in p && !saida.has(p.itemId)) { const o = itens.get(p.itemId); if (o) saida.set(o.id, o); }
  }
  return saida;
}

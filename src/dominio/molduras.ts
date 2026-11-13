import type { Item } from './quadro.ts';

export type ItemMoldura = Extract<Item, { tipo: 'moldura' }>;

export function molduraQueContem(
  item: Pick<Item, 'id' | 'x' | 'y' | 'largura' | 'altura'>,
  molduras: Iterable<ItemMoldura>,
): ItemMoldura | null {
  const cx = item.x + item.largura / 2;
  const cy = item.y + item.altura / 2;
  let melhor: ItemMoldura | null = null;
  let melhorArea = Infinity;

  for (const m of molduras) {
    if (m.id === item.id) continue;
    if (cx >= m.x && cx <= m.x + m.largura && cy >= m.y && cy <= m.y + m.altura) {
      const area = m.largura * m.altura;
      if (area < melhorArea) {
        melhorArea = area;
        melhor = m;
      }
    }
  }
  return melhor;
}

export function filhos(
  molduraId: string,
  itens: ReadonlyMap<string, Item>,
): Item[] {
  const resultado: Item[] = [];
  for (const item of itens.values()) {
    if (item.molduraId === molduraId) {
      resultado.push(item);
    }
  }
  return resultado;
}

export function ordemDeLeitura(molduras: Iterable<ItemMoldura>): ItemMoldura[] {
  const lista = [...molduras];
  if (lista.length <= 1) return lista;

  const porY = [...lista].sort((a, b) => a.y - b.y || a.x - b.x || a.id.localeCompare(b.id));
  const linhas: ItemMoldura[][] = [];

  for (const m of porY) {
    const ultimaLinha = linhas[linhas.length - 1];
    if (!ultimaLinha) {
      linhas.push([m]);
      continue;
    }
    const ancora = ultimaLinha[0]!;
    const tolerancia = Math.max(ancora.altura, m.altura) / 3;
    if (Math.abs(m.y - ancora.y) <= tolerancia) {
      ultimaLinha.push(m);
    } else {
      linhas.push([m]);
    }
  }

  const resultado: ItemMoldura[] = [];
  for (const linha of linhas) {
    linha.sort((a, b) => a.x - b.x || a.y - b.y || a.id.localeCompare(b.id));
    resultado.push(...linha);
  }
  return resultado;
}

export function linkDaMoldura(quadroId: string, molduraId: string): string {
  return `mesa:mesa/item/${quadroId}/${molduraId}`;
}

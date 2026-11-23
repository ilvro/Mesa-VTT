import { ordemDeLeitura, type ItemMoldura } from './molduras.ts';
import type { Item } from './quadro.ts';

export interface SecaoDoRoteiro {
  /** `null` na seção dos itens soltos (fora de qualquer moldura). */
  moldura: ItemMoldura | null;
  /** 0 para molduras de topo; +1 a cada moldura-mãe. */
  nivel: number;
  itens: Item[];
}

const TIPOS_LEGIVEIS = new Set<Item['tipo']>(['texto', 'forma', 'ref', 'imagem']);

/** Linhas por `y` (tolerância de 1/3 da altura), depois `x`. */
export function ordemDeLeituraDeItens(itens: readonly Item[]): Item[] {
  const porY = [...itens].sort((a, b) => a.y - b.y || a.x - b.x || a.id.localeCompare(b.id));
  const linhas: Item[][] = [];
  for (const it of porY) {
    const ultima = linhas[linhas.length - 1];
    const ancora = ultima?.[0];
    if (ultima && ancora && Math.abs(it.y - ancora.y) <= Math.max(ancora.altura, it.altura) / 3) {
      ultima.push(it);
    } else {
      linhas.push([it]);
    }
  }
  const resultado: Item[] = [];
  for (const linha of linhas) {
    linha.sort((a, b) => a.x - b.x || a.y - b.y || a.id.localeCompare(b.id));
    resultado.push(...linha);
  }
  return resultado;
}

/**
 * O quadro como página: molduras em ordem de leitura (as aninhadas logo depois da mãe),
 * cada uma com seus itens em ordem de leitura; os soltos vão no fim.
 * Entram texto, forma, ref e imagem; setas e traços ficam de fora.
 */
export function roteiroDoQuadro(itens: Iterable<Item>): SecaoDoRoteiro[] {
  const todos = [...itens];
  const molduras = todos.filter((i): i is ItemMoldura => i.tipo === 'moldura');
  const idsMolduras = new Set(molduras.map((m) => m.id));

  const filhasDe = new Map<string | null, ItemMoldura[]>();
  for (const m of molduras) {
    const mae = m.molduraId && idsMolduras.has(m.molduraId) && m.molduraId !== m.id ? m.molduraId : null;
    const lista = filhasDe.get(mae);
    if (lista) lista.push(m);
    else filhasDe.set(mae, [m]);
  }

  const legiveisPorMoldura = new Map<string | null, Item[]>();
  for (const it of todos) {
    if (!TIPOS_LEGIVEIS.has(it.tipo)) continue;
    const dono = it.molduraId && idsMolduras.has(it.molduraId) ? it.molduraId : null;
    const lista = legiveisPorMoldura.get(dono);
    if (lista) lista.push(it);
    else legiveisPorMoldura.set(dono, [it]);
  }

  const secoes: SecaoDoRoteiro[] = [];
  const visitadas = new Set<string>();
  const visitar = (mae: string | null, nivel: number): void => {
    for (const m of ordemDeLeitura(filhasDe.get(mae) ?? [])) {
      if (visitadas.has(m.id)) continue;
      visitadas.add(m.id);
      secoes.push({
        moldura: m,
        nivel,
        itens: ordemDeLeituraDeItens(legiveisPorMoldura.get(m.id) ?? []),
      });
      visitar(m.id, nivel + 1);
    }
  };
  visitar(null, 0);

  const soltos = legiveisPorMoldura.get(null) ?? [];
  if (soltos.length > 0) {
    secoes.push({ moldura: null, nivel: 0, itens: ordemDeLeituraDeItens(soltos) });
  }
  return secoes;
}

import type { Item } from './quadro.ts';

export type ItemMoldura = Extract<Item, { tipo: 'moldura' }>;

const FOLGA = 0.01;

export function molduraQueContem(
  item: Pick<Item, 'id' | 'x' | 'y' | 'largura' | 'altura'> & { tipo?: Item['tipo'] },
  molduras: Iterable<ItemMoldura>,
): ItemMoldura | null {
  const ehMoldura = item.tipo === 'moldura';
  const areaItem = item.largura * item.altura;
  const cx = item.x + item.largura / 2;
  const cy = item.y + item.altura / 2;
  let melhor: ItemMoldura | null = null;
  let melhorArea = Infinity;

  for (const m of molduras) {
    if (m.id === item.id) continue;
    const area = m.largura * m.altura;
    if (ehMoldura) {
      // mãe de moldura: contém a caixa inteira e é estritamente maior (sem ciclos)
      if (area <= areaItem + FOLGA) continue;
      if (
        item.x < m.x - FOLGA ||
        item.y < m.y - FOLGA ||
        item.x + item.largura > m.x + m.largura + FOLGA ||
        item.y + item.altura > m.y + m.altura + FOLGA
      ) {
        continue;
      }
    } else if (!(cx >= m.x && cx <= m.x + m.largura && cy >= m.y && cy <= m.y + m.altura)) {
      continue;
    }
    if (area < melhorArea) {
      melhorArea = area;
      melhor = m;
    }
  }
  return melhor;
}

export interface MudancaDePertencimento {
  id: string;
  antes: string | null;
  depois: string | null;
}

/** Itens cuja geometria define o pertencimento. */
export const CAMPOS_GEOMETRICOS = ['x', 'y', 'largura', 'altura', 'rotacao', 'de', 'para'] as const;

/**
 * Mudanças de `molduraId` necessárias após um passo. Recalcula os itens tocados;
 * se alguma moldura foi criada, removida ou movida/redimensionada, recalcula todos.
 * Setas com as duas pontas ligadas a itens seguem os itens e ficam sem moldura.
 */
export function pertencimentoDoPasso(
  itensDepois: ReadonlyMap<string, Item>,
  tocados: ReadonlySet<string>,
  molduraMudou: boolean,
): MudancaDePertencimento[] {
  const molduras: ItemMoldura[] = [];
  for (const it of itensDepois.values()) {
    if (it.tipo === 'moldura') molduras.push(it);
  }
  const mudancas: MudancaDePertencimento[] = [];
  const candidatos: Iterable<Item | undefined> = molduraMudou
    ? itensDepois.values()
    : [...tocados].map((id) => itensDepois.get(id));
  for (const it of candidatos) {
    if (!it) continue;
    let nova: string | null;
    if (it.tipo === 'seta' && !('ponto' in it.de || 'ponto' in it.para)) {
      nova = null;
    } else {
      nova = molduraQueContem(it, molduras)?.id ?? null;
    }
    if (nova !== it.molduraId) {
      mudancas.push({ id: it.id, antes: it.molduraId, depois: nova });
    }
  }
  return mudancas;
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

export type ModoMoldurasAgem = 'sim' | 'perguntar' | 'nao';

function molduraEhAncestral(
  ancestralId: string,
  descendente: ItemMoldura,
  porId: ReadonlyMap<string, ItemMoldura>,
): boolean {
  let atual: ItemMoldura | undefined = descendente;
  const visitados = new Set<string>();
  while (atual?.molduraId) {
    if (visitados.has(atual.id)) break;
    visitados.add(atual.id);
    if (atual.molduraId === ancestralId) return true;
    atual = porId.get(atual.molduraId);
  }
  return false;
}

export function deveDisparar(
  anteriorId: string | null,
  atual: ItemMoldura,
  todasMolduras: readonly ItemMoldura[],
  modo: ModoMoldurasAgem,
): boolean {
  if (modo === 'nao') return false;
  if (!atual.aoFocar) return false;
  const temAcao =
    atual.aoFocar.cena !== null ||
    Object.keys(atual.aoFocar.fatos).length > 0;
  if (!temAcao) return false;
  if (anteriorId === atual.id) return false;

  if (anteriorId) {
    const porId = new Map(todasMolduras.map((m) => [m.id, m]));
    const anterior = porId.get(anteriorId);
    if (anterior && molduraEhAncestral(atual.id, anterior, porId)) {
      return false;
    }
  }
  return true;
}

function idDaPonta(ponta: { itemId: string } | { ponto: [number, number] }): string | null {
  return 'itemId' in ponta ? ponta.itemId : null;
}

/**
 * Os itens dos ids mais todo o conteúdo das molduras entre eles (recursivo, pelo `molduraId`).
 * Setas com uma ponta ligada ao conjunto e a outra no conjunto ou livre também entram;
 * setas que saem para fora não. Ids inexistentes são ignorados; sem repetição.
 */
export function comConteudo(
  ids: Iterable<string>,
  itens: ReadonlyMap<string, Item>,
): Item[] {
  const conjunto = new Map<string, Item>();
  for (const id of ids) {
    const it = itens.get(id);
    if (it) conjunto.set(id, it);
  }
  const filhosPorMoldura = new Map<string, Item[]>();
  for (const it of itens.values()) {
    if (!it.molduraId) continue;
    const lista = filhosPorMoldura.get(it.molduraId);
    if (lista) lista.push(it);
    else filhosPorMoldura.set(it.molduraId, [it]);
  }
  const fila = [...conjunto.values()].filter((i) => i.tipo === 'moldura');
  while (fila.length > 0) {
    const m = fila.pop()!;
    for (const f of filhosPorMoldura.get(m.id) ?? []) {
      if (conjunto.has(f.id)) continue;
      conjunto.set(f.id, f);
      if (f.tipo === 'moldura') fila.push(f);
    }
  }
  for (const it of itens.values()) {
    if (it.tipo !== 'seta' || conjunto.has(it.id)) continue;
    const a = idDaPonta(it.de);
    const b = idDaPonta(it.para);
    if (a === null && b === null) continue;
    const dentro = (x: string | null) => x === null || conjunto.has(x);
    if (dentro(a) && dentro(b)) conjunto.set(it.id, it);
  }
  return [...conjunto.values()];
}

/**
 * Itens de topo de um conjunto copiado: sem os que estão dentro de uma moldura do
 * conjunto e sem as setas ligadas a esses descendentes.
 */
export function itensDeTopo(itens: readonly Item[]): Item[] {
  const porId = new Map(itens.map((i) => [i.id, i]));
  const descendente = (id: string | null): boolean => {
    if (id === null) return false;
    const it = porId.get(id);
    return Boolean(it?.molduraId && porId.has(it.molduraId));
  };
  return itens.filter((i) => {
    if (i.molduraId && porId.has(i.molduraId)) return false;
    if (i.tipo === 'seta') {
      return !(descendente(idDaPonta(i.de)) || descendente(idDaPonta(i.para)));
    }
    return true;
  });
}

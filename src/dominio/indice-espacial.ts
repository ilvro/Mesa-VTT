import { caixaEnvolventeDeItem, type Caixa, type Ponto } from './camera.ts';
import type { Item } from './quadro.ts';

const CELULA_PEQ = 1024;
const LIMITE_PEQ = 4096;
const CELULA_MED = 8192;
const LIMITE_MED = 32768;
const MAX_CELULAS_GRADE = 1024;

type ItemComCaixa = Pick<Item, 'x' | 'y' | 'largura' | 'altura' | 'rotacao'>;

interface Entrada<T extends ItemComCaixa> {
  item: T;
  caixa: Caixa;
  ordem: number;
}

export interface IndiceEspacial<T extends ItemComCaixa = Item> {
  readonly entradas: readonly Entrada<T>[];
  readonly peq: ReadonlyMap<string, number[]>;
  readonly med: ReadonlyMap<string, number[]>;
  readonly grandes: readonly number[];
  /** Array reutilizável de carimbos para evitar alocações de Set em cada consulta. */
  readonly visto: Uint32Array;
  marcaAtual: number;
}

function chaveCelula(cx: number, cy: number): string {
  return `${cx},${cy}`;
}

function inserirNaGrade<T extends ItemComCaixa>(
  grade: Map<string, number[]>,
  idx: number,
  c: Caixa,
  tamanhoCelula: number,
): void {
  const x0 = Math.floor(c.x / tamanhoCelula);
  const y0 = Math.floor(c.y / tamanhoCelula);
  const x1 = Math.floor((c.x + c.largura) / tamanhoCelula);
  const y1 = Math.floor((c.y + c.altura) / tamanhoCelula);
  for (let cy = y0; cy <= y1; cy++) {
    for (let cx = x0; cx <= x1; cx++) {
      const k = chaveCelula(cx, cy);
      const lista = grade.get(k);
      if (lista) lista.push(idx);
      else grade.set(k, [idx]);
    }
  }
}

function intersecaoCaixa(c: Caixa, vx1: number, vy1: number, vx2: number, vy2: number): boolean {
  return c.x + c.largura >= vx1 && c.x <= vx2 && c.y + c.altura >= vy1 && c.y <= vy2;
}

/**
 * Cria um índice espacial multi-nível para consultar itens visíveis e itens sob o cursor
 * em tempo constante/sublinear mesmo com 10.000+ itens no quadro.
 */
export function criarIndiceEspacial<T extends ItemComCaixa>(
  itens: Iterable<T>,
): IndiceEspacial<T> {
  const entradas: Entrada<T>[] = [];
  const peq = new Map<string, number[]>();
  const med = new Map<string, number[]>();
  const grandes: number[] = [];

  let ordem = 0;
  for (const item of itens) {
    const caixa = caixaEnvolventeDeItem(item);
    const idx = ordem++;
    entradas.push({ item, caixa, ordem: idx });

    const maior = Math.max(caixa.largura, caixa.altura);
    if (maior <= LIMITE_PEQ) {
      inserirNaGrade(peq, idx, caixa, CELULA_PEQ);
    } else if (maior <= LIMITE_MED) {
      inserirNaGrade(med, idx, caixa, CELULA_MED);
    } else {
      grandes.push(idx);
    }
  }

  return {
    entradas,
    peq,
    med,
    grandes,
    visto: new Uint32Array(entradas.length),
    marcaAtual: 0,
  };
}

function proximoCarimbo<T extends ItemComCaixa>(indice: IndiceEspacial<T>): number {
  indice.marcaAtual++;
  if (indice.marcaAtual === 0 || indice.marcaAtual >= 0xffffffff) {
    indice.visto.fill(0);
    indice.marcaAtual = 1;
  }
  return indice.marcaAtual;
}

function coletarDaGrade<T extends ItemComCaixa>(
  indice: IndiceEspacial<T>,
  grade: ReadonlyMap<string, number[]>,
  tamanhoCelula: number,
  vx1: number,
  vy1: number,
  vx2: number,
  vy2: number,
  marca: number,
  indicesSaida: number[],
): void {
  if (grade.size === 0) return;
  const x0 = Math.floor(vx1 / tamanhoCelula);
  const y0 = Math.floor(vy1 / tamanhoCelula);
  const x1 = Math.floor(vx2 / tamanhoCelula);
  const y1 = Math.floor(vy2 / tamanhoCelula);
  for (let cy = y0; cy <= y1; cy++) {
    for (let cx = x0; cx <= x1; cx++) {
      const lista = grade.get(chaveCelula(cx, cy));
      if (!lista) continue;
      for (let i = 0; i < lista.length; i++) {
        const idx = lista[i]!;
        if (indice.visto[idx] === marca) continue;
        indice.visto[idx] = marca;
        const c = indice.entradas[idx]!.caixa;
        if (intersecaoCaixa(c, vx1, vy1, vx2, vy2)) {
          indicesSaida.push(idx);
        }
      }
    }
  }
}

/** Retorna os itens cuja caixa envolvente intersecta `caixa` (+ `margem`), na mesma ordem de entrada. */
export function consultarCaixa<T extends ItemComCaixa>(
  indice: IndiceEspacial<T>,
  caixa: Caixa,
  margem = 0,
): T[] {
  const vx1 = caixa.x - margem;
  const vy1 = caixa.y - margem;
  const vx2 = caixa.x + caixa.largura + margem;
  const vy2 = caixa.y + caixa.altura + margem;

  const celulasX = Math.floor(vx2 / CELULA_PEQ) - Math.floor(vx1 / CELULA_PEQ) + 1;
  const celulasY = Math.floor(vy2 / CELULA_PEQ) - Math.floor(vy1 / CELULA_PEQ) + 1;
  if (celulasX * celulasY > MAX_CELULAS_GRADE) {
    const saida: T[] = [];
    for (let i = 0; i < indice.entradas.length; i++) {
      const ent = indice.entradas[i]!;
      if (intersecaoCaixa(ent.caixa, vx1, vy1, vx2, vy2)) {
        saida.push(ent.item);
      }
    }
    return saida;
  }

  const marca = proximoCarimbo(indice);
  const indices: number[] = [];
  coletarDaGrade(indice, indice.peq, CELULA_PEQ, vx1, vy1, vx2, vy2, marca, indices);

  const celulasMedX = Math.floor(vx2 / CELULA_MED) - Math.floor(vx1 / CELULA_MED) + 1;
  const celulasMedY = Math.floor(vy2 / CELULA_MED) - Math.floor(vy1 / CELULA_MED) + 1;
  if (celulasMedX * celulasMedY <= MAX_CELULAS_GRADE) {
    coletarDaGrade(indice, indice.med, CELULA_MED, vx1, vy1, vx2, vy2, marca, indices);
  } else {
    for (const ent of indice.entradas) {
      const maior = Math.max(ent.caixa.largura, ent.caixa.altura);
      if (maior > LIMITE_PEQ && maior <= LIMITE_MED && indice.visto[ent.ordem] !== marca) {
        indice.visto[ent.ordem] = marca;
        if (intersecaoCaixa(ent.caixa, vx1, vy1, vx2, vy2)) indices.push(ent.ordem);
      }
    }
  }

  for (let i = 0; i < indice.grandes.length; i++) {
    const idx = indice.grandes[i]!;
    if (indice.visto[idx] === marca) continue;
    indice.visto[idx] = marca;
    const c = indice.entradas[idx]!.caixa;
    if (intersecaoCaixa(c, vx1, vy1, vx2, vy2)) {
      indices.push(idx);
    }
  }

  indices.sort((a, b) => a - b);
  const saida = new Array<T>(indices.length);
  for (let i = 0; i < indices.length; i++) {
    saida[i] = indice.entradas[indices[i]!]!.item;
  }
  return saida;
}

/** Retorna os candidatos cuja caixa envolvente contém `ponto` (+ `margem`), na mesma ordem de entrada. */
export function consultarPonto<T extends ItemComCaixa>(
  indice: IndiceEspacial<T>,
  ponto: Ponto,
  margem = 0,
): T[] {
  return consultarCaixa(
    indice,
    { x: ponto.x, y: ponto.y, largura: 0, altura: 0 },
    margem,
  );
}

import type { Item, Ponta } from './quadro.ts';

export type Operacao =
  | { criar: Item[] }
  | { alterar: { id: string; antes: Partial<Item>; depois: Partial<Item> }[] }
  | { remover: Item[] };

export interface Passo {
  rotulo: string;
  ops: Operacao[];
}

export function aplicar(itens: ReadonlyMap<string, Item>, passo: Passo): Map<string, Item> {
  const proximo = new Map(itens);
  for (const op of passo.ops) {
    if ('criar' in op) {
      for (const item of op.criar) {
        proximo.set(item.id, item);
      }
    } else if ('alterar' in op) {
      for (const alt of op.alterar) {
        const atual = proximo.get(alt.id);
        if (!atual) continue;
        proximo.set(alt.id, { ...atual, ...alt.depois } as Item);
      }
    } else if ('remover' in op) {
      for (const item of op.remover) {
        proximo.delete(item.id);
      }
    }
  }
  return proximo;
}

export function inverter(passo: Passo): Passo {
  const opsInvertidas: Operacao[] = [];
  for (let i = passo.ops.length - 1; i >= 0; i--) {
    const op = passo.ops[i];
    if (!op) continue;
    if ('criar' in op) {
      opsInvertidas.push({ remover: op.criar });
    } else if ('remover' in op) {
      opsInvertidas.push({ criar: op.remover });
    } else if ('alterar' in op) {
      opsInvertidas.push({
        alterar: op.alterar.map((a) => ({
          id: a.id,
          antes: a.depois,
          depois: a.antes,
        })),
      });
    }
  }
  return { rotulo: passo.rotulo, ops: opsInvertidas };
}

interface EntradaHistorico {
  passo: Passo;
  chave: string | null;
}

function tentarMesclarPassos(anterior: Passo, proximo: Passo): Passo {
  const opAnt = anterior.ops[0];
  const opProx = proximo.ops[0];
  if (
    anterior.ops.length === 1 &&
    proximo.ops.length === 1 &&
    opAnt &&
    opProx &&
    'alterar' in opAnt &&
    'alterar' in opProx
  ) {
    const mapa = new Map<string, { id: string; antes: Partial<Item>; depois: Partial<Item> }>();
    for (const a of opAnt.alterar) {
      mapa.set(a.id, { id: a.id, antes: { ...a.antes }, depois: { ...a.depois } });
    }
    for (const b of opProx.alterar) {
      const existente = mapa.get(b.id);
      if (existente) {
        existente.antes = { ...b.antes, ...existente.antes } as Partial<Item>;
        existente.depois = { ...existente.depois, ...b.depois } as Partial<Item>;
      } else {
        mapa.set(b.id, { id: b.id, antes: { ...b.antes }, depois: { ...b.depois } });
      }
    }
    return {
      rotulo: proximo.rotulo,
      ops: [{ alterar: [...mapa.values()] }],
    };
  }
  return {
    rotulo: proximo.rotulo,
    ops: [...anterior.ops, ...proximo.ops],
  };
}

export class Historico {
  readonly limite: number;
  private passado: EntradaHistorico[] = [];
  private futuro: Passo[] = [];
  private chaveAgrupamento: string | null = null;

  constructor(limite = 200) {
    this.limite = limite;
  }

  get podeDesfazer(): boolean {
    return this.passado.length > 0;
  }

  get podeRefazer(): boolean {
    return this.futuro.length > 0;
  }

  get tamanho(): number {
    return this.passado.length;
  }

  agrupar(chave: string | null): void {
    this.chaveAgrupamento = chave;
  }

  registrar(passo: Passo, chave?: string): void {
    if (passo.ops.length === 0) return;
    const chaveEfetiva = chave ?? this.chaveAgrupamento;
    this.futuro = [];

    const topo = this.passado[this.passado.length - 1];
    if (chaveEfetiva !== null && topo && topo.chave === chaveEfetiva) {
      topo.passo = tentarMesclarPassos(topo.passo, passo);
      return;
    }

    this.passado.push({ passo, chave: chaveEfetiva });
    if (this.passado.length > this.limite) {
      this.passado.shift();
    }
  }

  desfazer(): Passo | null {
    const entrada = this.passado.pop();
    if (!entrada) return null;
    this.chaveAgrupamento = null;
    this.futuro.push(entrada.passo);
    return inverter(entrada.passo);
  }

  refazer(): Passo | null {
    const passo = this.futuro.pop();
    if (!passo) return null;
    this.chaveAgrupamento = null;
    this.passado.push({ passo, chave: null });
    return passo;
  }

  limpar(): void {
    this.passado = [];
    this.futuro = [];
    this.chaveAgrupamento = null;
  }
}

// ---------------------------------------------------------------------------
// Ajudantes de ordem (z) e duplicação
// ---------------------------------------------------------------------------

function ordenarPorZ(itens: ReadonlyMap<string, Item>): Item[] {
  return [...itens.values()].sort((a, b) => a.z - b.z || a.id.localeCompare(b.id));
}

function normalizarConjunto(ids: ReadonlySet<string> | readonly string[]): Set<string> {
  return ids instanceof Set ? new Set(ids) : new Set(ids);
}

function passoDeReordenacao(
  rotulo: string,
  antesLista: Item[],
  depoisLista: Item[],
): Passo {
  const alterar: { id: string; antes: Partial<Item>; depois: Partial<Item> }[] = [];
  for (let i = 0; i < depoisLista.length; i++) {
    const item = depoisLista[i];
    if (!item) continue;
    const novoZ = i + 1;
    if (item.z !== novoZ) {
      alterar.push({ id: item.id, antes: { z: item.z }, depois: { z: novoZ } });
    }
  }
  void antesLista;
  return { rotulo, ops: alterar.length > 0 ? [{ alterar }] : [] };
}

export function trazerParaFrente(
  itens: ReadonlyMap<string, Item>,
  ids: ReadonlySet<string> | readonly string[],
): Passo {
  const alvo = normalizarConjunto(ids);
  const ordenados = ordenarPorZ(itens);
  const resto = ordenados.filter((i) => !alvo.has(i.id));
  const selecionados = ordenados.filter((i) => alvo.has(i.id));
  return passoDeReordenacao('Trazer para frente', ordenados, [...resto, ...selecionados]);
}

export function levarParaTras(
  itens: ReadonlyMap<string, Item>,
  ids: ReadonlySet<string> | readonly string[],
): Passo {
  const alvo = normalizarConjunto(ids);
  const ordenados = ordenarPorZ(itens);
  const selecionados = ordenados.filter((i) => alvo.has(i.id));
  const resto = ordenados.filter((i) => !alvo.has(i.id));
  return passoDeReordenacao('Levar para trás', ordenados, [...selecionados, ...resto]);
}

export function subirUm(
  itens: ReadonlyMap<string, Item>,
  ids: ReadonlySet<string> | readonly string[],
): Passo {
  const alvo = normalizarConjunto(ids);
  const ordenados = ordenarPorZ(itens);
  const proximo = [...ordenados];
  for (let i = proximo.length - 2; i >= 0; i--) {
    const atual = proximo[i];
    const acima = proximo[i + 1];
    if (atual && acima && alvo.has(atual.id) && !alvo.has(acima.id)) {
      proximo[i] = acima;
      proximo[i + 1] = atual;
    }
  }
  return passoDeReordenacao('Subir uma camada', ordenados, proximo);
}

export function descerUm(
  itens: ReadonlyMap<string, Item>,
  ids: ReadonlySet<string> | readonly string[],
): Passo {
  const alvo = normalizarConjunto(ids);
  const ordenados = ordenarPorZ(itens);
  const proximo = [...ordenados];
  for (let i = 1; i < proximo.length; i++) {
    const atual = proximo[i];
    const abaixo = proximo[i - 1];
    if (atual && abaixo && alvo.has(atual.id) && !alvo.has(abaixo.id)) {
      proximo[i] = abaixo;
      proximo[i - 1] = atual;
    }
  }
  return passoDeReordenacao('Descer uma camada', ordenados, proximo);
}

function deslocarPonta(
  ponta: Ponta,
  mapaIds: ReadonlyMap<string, string>,
  dx: number,
  dy: number,
): Ponta {
  if ('itemId' in ponta) {
    const copiaId = mapaIds.get(ponta.itemId);
    return copiaId ? { ...ponta, itemId: copiaId } : { ...ponta };
  }
  return { ponto: [ponta.ponto[0] + dx, ponta.ponto[1] + dy] };
}

export function duplicar(
  itens: readonly Item[],
  novoId: () => string,
  deslocamento: { dx: number; dy: number },
  opcoes?: { agora?: number; zBase?: number },
): Passo {
  if (itens.length === 0) return { rotulo: 'Duplicar', ops: [] };

  const agora = opcoes?.agora ?? Date.now();
  const ordenados = [...itens].sort((a, b) => a.z - b.z || a.id.localeCompare(b.id));
  let zAtual = opcoes?.zBase ?? Math.max(...ordenados.map((i) => i.z)) + 1;

  const mapaIds = new Map<string, string>();
  for (const item of ordenados) {
    mapaIds.set(item.id, novoId());
  }

  const { dx, dy } = deslocamento;
  const criados: Item[] = ordenados.map((item) => {
    const id = mapaIds.get(item.id)!;
    const molduraId =
      item.molduraId && mapaIds.has(item.molduraId)
        ? mapaIds.get(item.molduraId)!
        : item.molduraId;
    const base = {
      ...item,
      id,
      x: item.x + dx,
      y: item.y + dy,
      z: zAtual++,
      molduraId,
      criadoEm: agora,
      atualizadoEm: agora,
    };
    if (base.tipo === 'seta') {
      return {
        ...base,
        de: deslocarPonta(base.de, mapaIds, dx, dy),
        para: deslocarPonta(base.para, mapaIds, dx, dy),
      };
    }
    return base;
  });

  return { rotulo: 'Duplicar', ops: [{ criar: criados }] };
}

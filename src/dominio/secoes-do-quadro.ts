import { caixaEnvolventeDeItem, caixaEnvolventeTotal, type Caixa } from './camera.ts';
import { molduraQueContem, type ItemMoldura } from './molduras.ts';
import type { Item, NoRico } from './quadro.ts';
import { textoPuro } from './quadro.ts';
import { fnv1a, jsonEstavel } from './sincronia-miro.ts';

/**
 * Seções do quadro: cada moldura é uma seção; o que está fora de molduras é agrupado
 * por proximidade em ilhas; ilhas de um item pequeno vão para "Soltos" por região.
 * Tudo puro, sem UI e sem DOM.
 */
export interface Secao {
  /** Moldura: id da moldura. Ilha: `ilha:<id do item-título>`. Soltos: `soltos:<cx>,<cy>`. */
  id: string;
  tipo: 'moldura' | 'ilha' | 'soltos';
  titulo: string;
  /** Caixa envolvente da moldura ou dos itens da seção. */
  caixa: Caixa;
  /** Itens da seção, exceto setas e (nas molduras) as molduras filhas, que são seções próprias. */
  itemIds: string[];
  /** Só molduras aninhadas. */
  maeId: string | null;
}

export interface LigacaoEntreSecoes {
  de: string;
  para: string;
  rotulo: string;
}

export interface OpcoesSecoes {
  /** Vão fixo em px; `null` = automático (fatorVao × mediana da menor dimensão, entre vaoMin e vaoMax). */
  vao: number | null;
  fatorVao: number;
  vaoMin: number;
  vaoMax: number;
  /** Item cuja caixa expandida cobre mais células que isso é tratado como "grande" (sem grade). */
  maxCelulasPorItem: number;
  /** Lado da região (px) que agrupa os "Soltos". */
  regiaoDosSoltos: number;
  /** Ilha de um único item com lado maior até esse valor (px) vai para os "Soltos". */
  tamanhoPequeno: number;
  /** Título por fonte: tamanho efetivo ≥ razao × mediana da seção. */
  razaoTitulo: number;
  maxCaracteresTitulo: number;
  maxCaracteresPrimeiraLinha: number;
}

export const OPCOES_PADRAO_SECOES: Readonly<OpcoesSecoes> = {
  vao: null,
  fatorVao: 1.5,
  vaoMin: 40,
  vaoMax: 400,
  maxCelulasPorItem: 64,
  regiaoDosSoltos: 4000,
  tamanhoPequeno: 120,
  razaoTitulo: 1.6,
  maxCaracteresTitulo: 80,
  maxCaracteresPrimeiraLinha: 60,
};

// ---------------------------------------------------------------------------
// Texto de um item
// ---------------------------------------------------------------------------

export interface InfoTexto {
  texto: string;
  primeiraLinha: string;
  cabecalho: boolean;
  tamanho: number;
}

function tamanhoDaMarca(valor: unknown): number | null {
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null;
  if (typeof valor !== 'string') return null;
  const m = /^\s*(\d+(?:\.\d+)?)\s*px\s*$/i.exec(valor);
  return m ? Number(m[1]) : null;
}

export function infoDoTexto(item: Item): InfoTexto | null {
  if (item.tipo !== 'texto' && item.tipo !== 'forma') return null;
  const linhas: string[] = [];
  let atual = '';
  let cabecalho = false;
  let maior = 0;
  const fechar = () => {
    linhas.push(atual);
    atual = '';
  };
  const visitar = (no: NoRico) => {
    if (no.type === 'text') {
      atual += no.text ?? '';
      for (const m of no.marks ?? []) {
        if (m.type !== 'textStyle') continue;
        const t = tamanhoDaMarca(m.attrs?.fontSize);
        if (t !== null && t > maior) maior = t;
      }
      return;
    }
    if (no.type === 'hardBreak') {
      fechar();
      return;
    }
    if (no.type === 'heading') {
      const nivel = no.attrs?.level;
      if (nivel === 1 || nivel === 2 || nivel === undefined) cabecalho = true;
    }
    for (const f of no.content ?? []) visitar(f);
    if (no.type === 'paragraph' || no.type === 'heading' || no.type === 'listItem') fechar();
  };
  for (const no of item.doc.content) visitar(no);
  fechar();
  const naoVazias = linhas.map((l) => l.trim()).filter((l) => l !== '');
  return {
    texto: naoVazias.join('\n'),
    primeiraLinha: naoVazias[0] ?? '',
    cabecalho,
    tamanho: maior > 0 ? maior : item.texto.tamanho,
  };
}

export function mediana(valores: number[]): number {
  if (valores.length === 0) return 0;
  const o = [...valores].sort((a, b) => a - b);
  const m = o.length >> 1;
  return o.length % 2 ? o[m]! : (o[m - 1]! + o[m]!) / 2;
}

function maisAcima<T extends Item>(lista: readonly T[]): T | null {
  let melhor: T | null = null;
  for (const it of lista) {
    if (
      !melhor ||
      it.y < melhor.y ||
      (it.y === melhor.y && (it.x < melhor.x || (it.x === melhor.x && it.id < melhor.id)))
    ) {
      melhor = it;
    }
  }
  return melhor;
}

function cortar(texto: string, max: number): string {
  return texto.length > max ? `${texto.slice(0, max).trimEnd()}…` : texto;
}

/** Critério de título por fonte: texto curto com H1/H2 ou tamanho efetivo ≥ razão × mediana. */
export function tituloPorFonte(info: InfoTexto, mediana: number, o: OpcoesSecoes): boolean {
  if (info.texto.length > o.maxCaracteresTitulo) return false;
  return info.cabecalho || info.tamanho >= o.razaoTitulo * mediana;
}

export interface TituloDaSecao {
  titulo: string;
  /** Item que deu o título (regras 2 e 3); `null` no texto da primeira linha ou sem texto. */
  itemId: string | null;
}

/**
 * Título de um conjunto de itens (sem a regra da moldura, que é do chamador):
 * 1. item com `semantica === 'titulo'`; 2. texto curto com H1/H2 ou fonte ≥ razão × mediana;
 * 3. primeira linha do item mais acima (cortada). Entre vários candidatos, o mais acima.
 */
export function tituloDaSecao(
  itens: readonly Item[],
  opcoes: Partial<OpcoesSecoes> = {},
): TituloDaSecao {
  const o = { ...OPCOES_PADRAO_SECOES, ...opcoes };
  const infos = new Map<string, InfoTexto>();
  const comTexto: Item[] = [];
  for (const it of itens) {
    const info = infoDoTexto(it);
    if (info && info.texto !== '') {
      infos.set(it.id, info);
      comTexto.push(it);
    }
  }

  const porSemantica = maisAcima(
    itens.filter((i) => (i.tipo === 'texto' || i.tipo === 'forma') && i.semantica === 'titulo' && infos.has(i.id)),
  );
  if (porSemantica) {
    return {
      titulo: cortar(infos.get(porSemantica.id)!.primeiraLinha, o.maxCaracteresPrimeiraLinha),
      itemId: porSemantica.id,
    };
  }

  const med = mediana(comTexto.map((i) => infos.get(i.id)!.tamanho));
  const candidatos = comTexto.filter((i) => tituloPorFonte(infos.get(i.id)!, med, o));
  const destaque = maisAcima(candidatos);
  if (destaque) {
    const info = infos.get(destaque.id)!;
    return { titulo: info.texto.replace(/\n+/g, ' '), itemId: destaque.id };
  }

  const primeiro = maisAcima(comTexto);
  if (primeiro) {
    return {
      titulo: cortar(infos.get(primeiro.id)!.primeiraLinha, o.maxCaracteresPrimeiraLinha),
      itemId: null,
    };
  }
  const rotuloRef = maisAcima(itens.filter((i) => i.tipo === 'ref' && i.rotulo));
  if (rotuloRef && rotuloRef.tipo === 'ref') {
    return { titulo: cortar(rotuloRef.rotulo ?? '', o.maxCaracteresPrimeiraLinha), itemId: null };
  }
  const imagens = itens.filter((i) => i.tipo === 'imagem').length;
  return { titulo: imagens > 0 ? '[imagens]' : 'Sem título', itemId: null };
}

// ---------------------------------------------------------------------------
// Ilhas
// ---------------------------------------------------------------------------

interface Caixinha {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

function vaoEntre(a: Caixinha, b: Caixinha): number {
  const dx = Math.max(0, a.x0 - b.x1, b.x0 - a.x1);
  const dy = Math.max(0, a.y0 - b.y1, b.y0 - a.y1);
  return dx === 0 ? dy : dy === 0 ? dx : Math.hypot(dx, dy);
}

function agruparPorProximidade(caixas: Caixinha[], vao: number, maxCelulas: number): Int32Array {
  const n = caixas.length;
  const pai = new Int32Array(n);
  for (let i = 0; i < n; i++) pai[i] = i;
  const raiz = (i: number): number => {
    while (pai[i] !== i) {
      pai[i] = pai[pai[i]!]!;
      i = pai[i]!;
    }
    return i;
  };
  const unir = (a: number, b: number) => {
    const ra = raiz(a);
    const rb = raiz(b);
    if (ra !== rb) pai[Math.max(ra, rb)] = Math.min(ra, rb);
  };

  const meio = vao / 2;
  const celulas = new Map<number, number[]>();
  const grandes: number[] = [];
  const chave = (cx: number, cy: number) => cx * 16777216 + cy;
  for (let i = 0; i < n; i++) {
    const c = caixas[i]!;
    const cx0 = Math.floor((c.x0 - meio) / vao);
    const cx1 = Math.floor((c.x1 + meio) / vao);
    const cy0 = Math.floor((c.y0 - meio) / vao);
    const cy1 = Math.floor((c.y1 + meio) / vao);
    if ((cx1 - cx0 + 1) * (cy1 - cy0 + 1) > maxCelulas) {
      grandes.push(i);
      continue;
    }
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cy = cy0; cy <= cy1; cy++) {
        const k = chave(cx, cy);
        const l = celulas.get(k);
        if (l) l.push(i);
        else celulas.set(k, [i]);
      }
    }
  }

  for (const lista of celulas.values()) {
    for (let a = 0; a < lista.length; a++) {
      const i = lista[a]!;
      for (let b = a + 1; b < lista.length; b++) {
        const j = lista[b]!;
        if (raiz(i) === raiz(j)) continue;
        if (vaoEntre(caixas[i]!, caixas[j]!) < vao) unir(i, j);
      }
    }
  }
  // Caixas enormes (uma imagem gigante): comparadas com todas, sem passar pela grade.
  for (const g of grandes) {
    for (let j = 0; j < n; j++) {
      if (j === g || raiz(g) === raiz(j)) continue;
      if (vaoEntre(caixas[g]!, caixas[j]!) < vao) unir(g, j);
    }
  }

  const resultado = new Int32Array(n);
  for (let i = 0; i < n; i++) resultado[i] = raiz(i);
  return resultado;
}

// ---------------------------------------------------------------------------
// Ordem de leitura
// ---------------------------------------------------------------------------

/** Mesma regra de `ordemDeLeitura`: linhas por `y` (tolerância de 1/3 da altura), depois `x`. */
function ordenarLeitura<T extends { id: string; caixa: Caixa }>(lista: readonly T[]): T[] {
  const porY = [...lista].sort(
    (a, b) => a.caixa.y - b.caixa.y || a.caixa.x - b.caixa.x || a.id.localeCompare(b.id),
  );
  const linhas: T[][] = [];
  for (const s of porY) {
    const ultima = linhas[linhas.length - 1];
    const ancora = ultima?.[0];
    if (
      ultima &&
      ancora &&
      Math.abs(s.caixa.y - ancora.caixa.y) <= Math.max(ancora.caixa.altura, s.caixa.altura) / 3
    ) {
      ultima.push(s);
    } else {
      linhas.push([s]);
    }
  }
  const resultado: T[] = [];
  for (const linha of linhas) {
    linha.sort((a, b) => a.caixa.x - b.caixa.x || a.caixa.y - b.caixa.y || a.id.localeCompare(b.id));
    resultado.push(...linha);
  }
  return resultado;
}

// ---------------------------------------------------------------------------
// Seções
// ---------------------------------------------------------------------------

export function secoesDoQuadro(
  itens: readonly Item[],
  opcoes: Partial<OpcoesSecoes> = {},
): Secao[] {
  const o = { ...OPCOES_PADRAO_SECOES, ...opcoes };
  const molduras = itens.filter((i): i is ItemMoldura => i.tipo === 'moldura');
  const moldurasPorId = new Map(molduras.map((m) => [m.id, m]));

  // Mãe de cada moldura: `molduraId` válido ou, se nulo, a que a contém.
  const maeDe = new Map<string, string | null>();
  for (const m of molduras) {
    let mae: string | null = null;
    if (m.molduraId && m.molduraId !== m.id && moldurasPorId.has(m.molduraId)) {
      mae = m.molduraId;
    } else if (!m.molduraId) {
      mae = molduraQueContem(m, molduras)?.id ?? null;
    }
    maeDe.set(m.id, mae);
  }
  for (const m of molduras) {
    // ciclos em dados ruins: corta o elo
    let atual: string | null = maeDe.get(m.id) ?? null;
    let passos = 0;
    while (atual !== null && atual !== m.id && passos <= molduras.length) {
      atual = maeDe.get(atual) ?? null;
      passos++;
    }
    if (atual === m.id) maeDe.set(m.id, null);
  }

  const filhosDeMoldura = new Map<string, Item[]>();
  const soltos: Item[] = [];
  for (const it of itens) {
    if (it.tipo === 'moldura' || it.tipo === 'seta') continue;
    let dono: string | null = null;
    if (it.molduraId && moldurasPorId.has(it.molduraId)) dono = it.molduraId;
    else if (molduras.length > 0) dono = molduraQueContem(it, molduras)?.id ?? null;
    if (dono === null) {
      soltos.push(it);
      continue;
    }
    const lista = filhosDeMoldura.get(dono);
    if (lista) lista.push(it);
    else filhosDeMoldura.set(dono, [it]);
  }

  const secoes: Secao[] = [];
  for (const m of molduras) {
    secoes.push({
      id: m.id,
      tipo: 'moldura',
      titulo: m.titulo.trim() !== '' ? m.titulo.trim() : tituloDaSecao(filhosDeMoldura.get(m.id) ?? [], o).titulo,
      caixa: caixaEnvolventeDeItem(m),
      itemIds: (filhosDeMoldura.get(m.id) ?? []).map((i) => i.id),
      maeId: maeDe.get(m.id) ?? null,
    });
  }

  // Ilhas
  if (soltos.length > 0) {
    const caixas: Caixa[] = soltos.map((i) => caixaEnvolventeDeItem(i));
    let vao = o.vao;
    if (vao === null) {
      const med = mediana(caixas.map((c) => Math.min(c.largura, c.altura)));
      vao = Math.min(o.vaoMax, Math.max(o.vaoMin, o.fatorVao * med));
    }
    vao = Math.max(1, vao);
    const raizes = agruparPorProximidade(
      caixas.map((c) => ({ x0: c.x, y0: c.y, x1: c.x + c.largura, y1: c.y + c.altura })),
      vao,
      o.maxCelulasPorItem,
    );
    const grupos = new Map<number, Item[]>();
    soltos.forEach((it, i) => {
      const r = raizes[i]!;
      const g = grupos.get(r);
      if (g) g.push(it);
      else grupos.set(r, [it]);
    });

    const soltosPorRegiao = new Map<string, Item[]>();
    for (const grupo of grupos.values()) {
      const { titulo, itemId } = tituloDaSecao(grupo, o);
      if (grupo.length === 1 && itemId === null) {
        const it = grupo[0]!;
        const c = caixaEnvolventeDeItem(it);
        const vazio = (it.tipo === 'texto' || it.tipo === 'forma') && infoDoTexto(it)?.texto === '';
        if (it.tipo === 'traco' || vazio || Math.max(c.largura, c.altura) <= o.tamanhoPequeno) {
          const cx = Math.floor((c.x + c.largura / 2) / o.regiaoDosSoltos);
          const cy = Math.floor((c.y + c.altura / 2) / o.regiaoDosSoltos);
          const k = `${cx},${cy}`;
          const l = soltosPorRegiao.get(k);
          if (l) l.push(it);
          else soltosPorRegiao.set(k, [it]);
          continue;
        }
      }
      const ancora = itemId ?? maisAcima(grupo)!.id;
      secoes.push({
        id: `ilha:${ancora}`,
        tipo: 'ilha',
        titulo,
        caixa: caixaEnvolventeTotal(grupo)!,
        itemIds: grupo.map((i) => i.id),
        maeId: null,
      });
    }
    for (const [k, lista] of soltosPorRegiao) {
      secoes.push({
        id: `soltos:${k}`,
        tipo: 'soltos',
        titulo: 'Soltos',
        caixa: caixaEnvolventeTotal(lista)!,
        itemIds: lista.map((i) => i.id),
        maeId: null,
      });
    }
  }

  // Ordem: leitura, filhas logo depois da mãe.
  const filhas = new Map<string | null, Secao[]>();
  for (const s of secoes) {
    const l = filhas.get(s.maeId);
    if (l) l.push(s);
    else filhas.set(s.maeId, [s]);
  }
  const resultado: Secao[] = [];
  const emitir = (lista: readonly Secao[]) => {
    for (const s of ordenarLeitura(lista)) {
      resultado.push(s);
      const f = filhas.get(s.id);
      if (f) emitir(f);
    }
  };
  emitir(filhas.get(null) ?? []);
  return resultado;
}

// ---------------------------------------------------------------------------
// Ligações
// ---------------------------------------------------------------------------

/**
 * Setas cujas pontas ligadas a itens caem em seções diferentes. Pontas livres
 * (`ponto`) são ignoradas. Ligações idênticas (de, para, rótulo) saem uma vez.
 */
export function ligacoesEntreSecoes(
  secoes: readonly Secao[],
  itens: readonly Item[],
): LigacaoEntreSecoes[] {
  const secaoDoItem = new Map<string, string>();
  for (const s of secoes) {
    if (s.tipo === 'moldura') secaoDoItem.set(s.id, s.id);
    for (const id of s.itemIds) secaoDoItem.set(id, s.id);
  }
  const vistos = new Set<string>();
  const resultado: LigacaoEntreSecoes[] = [];
  for (const it of itens) {
    if (it.tipo !== 'seta') continue;
    if (!('itemId' in it.de) || !('itemId' in it.para)) continue;
    const de = secaoDoItem.get(it.de.itemId);
    const para = secaoDoItem.get(it.para.itemId);
    if (!de || !para || de === para) continue;
    const chave = `${de}\u0000${para}\u0000${it.rotulo}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    resultado.push({ de, para, rotulo: it.rotulo });
  }
  return resultado;
}

// ---------------------------------------------------------------------------
// Assinatura (para saber se um resumo ficou velho)
// ---------------------------------------------------------------------------

function conteudoParaAssinatura(item: Item): unknown {
  switch (item.tipo) {
    case 'texto':
    case 'forma':
      return [item.id, item.tipo, textoPuro(item.doc)];
    case 'moldura':
      return [item.id, item.tipo, item.titulo];
    case 'ref':
      return [item.id, item.tipo, item.rotulo];
    case 'imagem':
      return [item.id, item.tipo, item.imagemId, item.legenda ?? ''];
    default:
      return [item.id, item.tipo];
  }
}

/**
 * Hash dos ids e dos textos (texto puro, títulos, rótulos, legendas, `imagemId`) dos itens da
 * seção, em ordem estável (por id). Posição, tamanho e estilo não entram. Setas ficam de fora.
 */
export function assinaturaDaSecao(secao: Secao, itens: readonly Item[]): string {
  const porId = new Map(itens.map((i) => [i.id, i]));
  const partes: unknown[] = [secao.tipo === 'moldura' ? secao.titulo : ''];
  for (const id of [...secao.itemIds].sort()) {
    const it = porId.get(id);
    if (it && it.tipo !== 'seta') partes.push(conteudoParaAssinatura(it));
  }
  return fnv1a(jsonEstavel(partes));
}

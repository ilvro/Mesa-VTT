import { semAcento } from './entidades.ts';
import type { Item, NoRico } from './quadro.ts';
import { ordemDeLeituraDeItens } from './roteiro-do-quadro.ts';
import { itensDaSecao, numeroCurto, titulosEntre } from './estrutura-da-secao.ts';
import { infoDoTexto, mediana, secoesDoQuadro, type Secao } from './secoes-do-quadro.ts';
import { idsCurtos } from './texto-da-secao.ts';
import { legendaDoQuadro, textoDaLegenda, type Legenda } from './legenda-do-quadro.ts';

/**
 * Convenções visuais de uma seção do quadro, só a partir dos itens do mestre: estilos de item,
 * destaques por trecho, fluxo (coluna, grade ou livre), lado das imagens e uso de `semantica`.
 * Puro: sem UI, DOM, signals nem banco. As coordenadas são relativas ao canto da seção.
 */

export type PapelDoTexto = 'titulo' | 'corpo';
export type FluxoDoQuadro = 'coluna' | 'centrado' | 'grade' | 'livre';

export interface GrupoDeEstilo {
  formato: string;
  papel: PapelDoTexto;
  fonte: string;
  tamanho: number;
  cor: string;
  fundo: string | null;
  contagem: number;
  larguraMediana: number;
  /** Id completo do primeiro item do grupo na ordem de leitura. */
  exemplo: string;
  exemploCurto: string;
}

export interface DestaqueDetectado {
  cor: string;
  caracteres: number;
  /** Cor de letra mais comum nesses trechos. */
  corDaLetra: string;
  exemplo: string;
  exemploCurto: string;
  /** Palpite de uso (sempre incerto), ou null. */
  uso: 'fala' | 'condição/rótulo' | 'narração' | 'regras/instruções' | null;
}

export interface EstiloDetectado {
  secaoId: string;
  secaoTitulo: string;
  /** true quando a seção foi escolhida aqui (a com mais itens de texto do mestre). */
  secaoEscolhida: boolean;
  /** Itens de texto do mestre considerados. */
  itensDeTexto: number;
  fluxo: FluxoDoQuadro;
  /** x relativo à seção, largura mediana e espaço vertical mediano; só quando `fluxo === 'coluna'`. */
  coluna: { x: number; largura: number; espacoVertical: number } | null;
  /**
   * Eixo do fluxo centrado (`fluxo === 'centrado'`): centro horizontal dos itens, relativo à seção e absoluto.
   */
  eixo: { x: number; xAbsoluto: number; largura: number; espacoVertical: number } | null;
  /** Atalhos para a Q9e. */
  espacoVertical: number | null;
  larguraDaColuna: number | null;
  imagens: { lado: 'direita' | 'esquerda' | 'dentro'; largura: number } | null;
  grupos: GrupoDeEstilo[];
  destaques: DestaqueDetectado[];
  exemploTitulo: string | null;
  exemploTituloCurto: string | null;
  exemploCorpo: string | null;
  exemploCorpoCurto: string | null;
  semantica: { fracao: number; itens: number; total: number };
  /** Legenda do quadro todo (padrão fixo, seção LEGENDA e trechos [..] destacados). */
  legenda: Legenda;
}

/**
 * Estilo do mestre fixo na Mesa (o do quadro do Pântano, vindo do Miro): vale quando a seção ainda não tem texto do mestre
 * bastante para copiar (um quadro novo, só com o título). Com material do mestre, vale o que for detectado.
 */
export const ESTILO_PADRAO_DO_MESTRE = {
  texto: { fonte: 'pt-serif', tamanho: 14, cor: '#1a1a1a' },
  caixa: { fundo: '#ffffff', padding: 0, sombra: false },
  largura: 412,
  tituloTamanho: 45.3,
  espacoVertical: 8,
  alinhar: 'centro',
  larguraDaImagem: 360,
} as const;
/** Abaixo disto (itens de texto do mestre na seção), o assistente escreve no estilo fixo. */
export const MIN_TEXTOS_PARA_DETECTAR = 3;

/** O quadro ainda não tem texto do mestre bastante para copiar o estilo: use `ESTILO_PADRAO_DO_MESTRE`. */
export function usaEstiloPadrao(e: EstiloDetectado | null | undefined): boolean {
  return !e || e.grupos.reduce((n, g) => n + g.contagem, 0) < MIN_TEXTOS_PARA_DETECTAR;
}

const TOLERANCIA_X = 24;
const LIMITE_COLUNA = 0.6;
const LIMITE_SEMANTICA = 0.2;
const TOLERANCIA_EIXO = 60;
/** Segunda pessoa: no mínimo 1 ocorrência a cada 300 caracteres para o palpite de narração. */
const LIMITE_SEGUNDA_PESSOA = 1 / 300;
const SEGUNDA_PESSOA = /(?<![\p{L}])(?:vocês|você|seus|suas|vos)(?![\p{L}])/giu;
const MAX_GRUPOS = 6;
const arred4 = (v: number): number => Math.round(v / 4) * 4;

const temTexto = (i: Item): boolean => infoDoTexto(i)?.texto !== undefined && infoDoTexto(i)!.texto !== '';
const doMestre = (i: Item): boolean => i.revisao?.origem !== 'assistente';

interface Corrida {
  fundo: string;
  letra: string | null;
  texto: string;
}

function corridasDoItem(item: Extract<Item, { tipo: 'texto' | 'forma' }>): Corrida[] {
  const r: Corrida[] = [];
  const visitar = (no: NoRico) => {
    if (no.type === 'text') {
      let fundo: string | null = null;
      let letra: string | null = null;
      for (const m of no.marks ?? []) {
        if (m.type !== 'textStyle') continue;
        const bg = m.attrs?.backgroundColor;
        if (typeof bg === 'string' && bg !== '') fundo = bg;
        const c = m.attrs?.color;
        if (typeof c === 'string' && c !== '') letra = c;
      }
      if (fundo !== null) r.push({ fundo, letra, texto: no.text ?? '' });
      return;
    }
    for (const f of no.content ?? []) visitar(f);
  };
  for (const no of item.doc.content) visitar(no);
  return r;
}

/** Luminância aproximada (0 a 1) de `#rgb`, `#rrggbb` ou `rgb(r,g,b)`; null se não reconhecer. */
function luminancia(cor: string): number | null {
  const c = cor.trim().toLowerCase();
  let r: number;
  let g: number;
  let b: number;
  const m = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/.exec(c);
  const h = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(c);
  if (m) [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])] as [number, number, number];
  else if (h) {
    const x = h[1]!.length === 3 ? [...h[1]!].map((d) => d + d).join('') : h[1]!;
    [r, g, b] = [parseInt(x.slice(0, 2), 16), parseInt(x.slice(2, 4), 16), parseInt(x.slice(4, 6), 16)];
  } else return null;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

function detectarDestaques(ordenados: readonly Item[], curtos: Map<string, string>): DestaqueDetectado[] {
  interface Acc {
    caracteres: number;
    letras: Map<string, number>;
    corridas: string[];
    melhor: { id: string; n: number } | null;
  }
  const mapa = new Map<string, Acc>();
  for (const item of ordenados) {
    if (item.tipo !== 'texto' && item.tipo !== 'forma') continue;
    const porItem = new Map<string, number>();
    for (const c of corridasDoItem(item)) {
      const a: Acc = mapa.get(c.fundo) ?? { caracteres: 0, letras: new Map<string, number>(), corridas: [], melhor: null };
      const n = c.texto.length;
      a.caracteres += n;
      const letra = c.letra ?? item.texto.cor;
      a.letras.set(letra, (a.letras.get(letra) ?? 0) + n);
      a.corridas.push(c.texto);
      mapa.set(c.fundo, a);
      porItem.set(c.fundo, (porItem.get(c.fundo) ?? 0) + n);
    }
    for (const [fundo, n] of porItem) {
      const a = mapa.get(fundo)!;
      if (!a.melhor || n > a.melhor.n) a.melhor = { id: item.id, n };
    }
  }
  const lista = [...mapa.entries()]
    .filter(([, a]) => a.caracteres > 0 && a.melhor)
    .sort((a, b) => b[1].caracteres - a[1].caracteres);
  const comMarcador = (t: string) => /\[[^\]]+\]/.test(t);
  const segunda = lista.map(([, a]) => a.corridas.reduce((n, t) => n + (t.match(SEGUNDA_PESSOA)?.length ?? 0), 0));
  const densidade = lista.map(([, a], i) => (a.caracteres > 0 ? segunda[i]! / a.caracteres : 0));
  const usos = lista.map(([, a]): DestaqueDetectado['uso'] => {
    const n = a.corridas.length;
    if (a.corridas.some((t) => /\[[^\]]+\]\s*["“”«]/.test(t))) return 'fala';
    if (a.corridas.filter(comMarcador).length * 2 >= n) return 'condição/rótulo';
    return null;
  });
  // Narração (palpite): o destaque com mais palavras da segunda pessoa por caractere, se for relevante e maior que a dos outros
  // (as falas e os rótulos já têm palpite e ficam de fora: o NPC também fala com "você").
  let iNarracao = -1;
  lista.forEach((_, i) => {
    if (usos[i] !== null || densidade[i]! < LIMITE_SEGUNDA_PESSOA) return;
    if (iNarracao < 0 || densidade[i]! > densidade[iNarracao]!) iNarracao = i;
  });
  if (iNarracao >= 0 && densidade.every((d, i) => i === iNarracao || usos[i] !== null || d < densidade[iNarracao]!)) usos[iNarracao] = 'narração';
  // Letra clara sobre fundo escuro, sem segunda pessoa: regras e instruções ao mestre.
  lista.forEach(([cor, a], i) => {
    if (usos[i] !== null || segunda[i]! > 0) return;
    let letra = '';
    let max = -1;
    for (const [l, n] of a.letras) if (n > max) { max = n; letra = l; }
    const fundo = luminancia(cor);
    const tinta = luminancia(letra);
    if (fundo !== null && tinta !== null && fundo < 0.4 && tinta > 0.6) usos[i] = 'regras/instruções';
  });
  return lista.map(([cor, a], i) => {
    let letra = '';
    let max = -1;
    for (const [l, n] of a.letras) if (n > max) { max = n; letra = l; }
    const id = a.melhor!.id;
    return { cor, caracteres: a.caracteres, corDaLetra: letra, exemplo: id, exemploCurto: curtos.get(id) ?? id.slice(0, 6), uso: usos[i]! };
  });
}

/** Maior grupo de itens com x dentro de ±24 px de um deles. */
function maiorGrupoPorX(itens: readonly Item[]): Item[] {
  let melhor: Item[] = [];
  for (const base of itens) {
    const g = itens.filter((i) => Math.abs(i.x - base.x) <= TOLERANCIA_X);
    if (g.length > melhor.length) melhor = g;
  }
  return melhor;
}

function agrupar(valores: number[]): number[][] {
  const o = [...valores].sort((a, b) => a - b);
  const r: number[][] = [];
  for (const v of o) {
    const g = r[r.length - 1];
    if (g && v - g[g.length - 1]! <= TOLERANCIA_X) g.push(v);
    else r.push([v]);
  }
  return r;
}

function ehGrade(itens: readonly Item[]): boolean {
  if (itens.length < 4) return false;
  const xs = agrupar(itens.map((i) => i.x));
  const ys = agrupar(itens.map((i) => i.y));
  if (xs.length < 2 || ys.length < 2) return false;
  const emColuna = (i: Item) => itens.filter((o) => Math.abs(o.x - i.x) <= TOLERANCIA_X).length >= 2;
  const emLinha = (i: Item) => itens.filter((o) => Math.abs(o.y - i.y) <= TOLERANCIA_X).length >= 2;
  return itens.filter((i) => emColuna(i) && emLinha(i)).length / itens.length >= LIMITE_COLUNA;
}

/**
 * Fluxo centrado: entre os itens em fila única (sem outro item de texto ao lado, na mesma altura), pelo menos 60% têm o
 * centro horizontal a até 60 px da mediana dos centros. Devolve o centro (mediana dos itens centrados) e esses itens.
 */
function eixoCentrado(textos: readonly Item[]): { centro: number; itens: Item[] } | null {
  const aoLado = (a: Item) =>
    textos.some((b) => b !== a && a.y < b.y + b.altura && a.y + a.altura > b.y && (a.x + a.largura <= b.x || b.x + b.largura <= a.x));
  const fila = textos.filter((i) => !aoLado(i));
  if (fila.length < 2) return null;
  const centro = (i: Item) => i.x + i.largura / 2;
  const med = mediana(fila.map(centro));
  const perto = fila.filter((i) => Math.abs(centro(i) - med) <= TOLERANCIA_EIXO);
  if (perto.length / fila.length < LIMITE_COLUNA) return null;
  return { centro: mediana(perto.map(centro)), itens: perto };
}

/** Itens de referência para o lado das imagens: os centrados no eixo, ou todos os textos. */
function eixoItens(textos: readonly Item[], eixo: EstiloDetectado['eixo']): readonly Item[] {
  if (!eixo) return textos;
  return textos.filter((i) => Math.abs(i.x + i.largura / 2 - eixo.xAbsoluto) <= TOLERANCIA_EIXO);
}

/** Seção com mais itens de texto do mestre (a primeira em caso de empate). A seção da legenda não conta: ela descreve o estilo, não é o material. */
function secaoComMaisTexto(itens: readonly Item[]): Secao | null {
  let melhor: Secao | null = null;
  let max = 0;
  const porId = new Map(itens.map((i) => [i.id, i]));
  for (const s of secoesDoQuadro(itens)) {
    if (/legenda/.test(semAcento(s.titulo))) continue;
    let n = 0;
    for (const id of s.itemIds) {
      const it = porId.get(id);
      if (it && (it.tipo === 'texto' || it.tipo === 'forma') && doMestre(it) && temTexto(it)) n++;
    }
    if (n > max) { max = n; melhor = s; }
  }
  return melhor;
}

export function estiloDoQuadro(itens: readonly Item[], secao?: Secao): EstiloDetectado | null {
  const escolhida = secao === undefined;
  const alvo = secao ?? secaoComMaisTexto(itens);
  if (!alvo) return null;
  const daSecao = itensDaSecao(alvo, itens);
  const curtos = idsCurtos(daSecao.map((i) => i.id));
  const curto = (id: string) => curtos.get(id) ?? id.slice(0, 6);
  const mestre = ordemDeLeituraDeItens(daSecao.filter(doMestre));
  const textos = mestre.filter((i) => (i.tipo === 'texto' || i.tipo === 'forma') && temTexto(i));
  const titulos = titulosEntre(textos);

  // Estilos de item.
  const grupos: GrupoDeEstilo[] = [];
  const larguras = new Map<GrupoDeEstilo, number[]>();
  for (const item of textos) {
    if (item.tipo !== 'texto' && item.tipo !== 'forma') continue;
    const info = infoDoTexto(item)!;
    const nota = item.tipo === 'texto' && item.caixa.fundo !== null && item.caixa.sombra;
    const formato = item.tipo === 'forma' ? `forma:${item.forma}` : nota ? 'nota' : 'texto';
    const papel: PapelDoTexto = titulos.has(item.id) ? 'titulo' : 'corpo';
    // Cor de letra do item (a das marcas, como o branco sobre preto, entra nos destaques).
    const cor = item.texto.cor;
    let g = grupos.find((x) => x.formato === formato && x.papel === papel && x.fonte === item.texto.fonte && x.cor === cor && x.fundo === item.caixa.fundo && Math.abs(x.tamanho - info.tamanho) <= 1);
    if (!g) {
      g = { formato, papel, fonte: item.texto.fonte, tamanho: info.tamanho, cor, fundo: item.caixa.fundo, contagem: 0, larguraMediana: 0, exemplo: item.id, exemploCurto: curto(item.id) };
      grupos.push(g);
      larguras.set(g, []);
    }
    g.contagem++;
    larguras.get(g)!.push(item.largura);
  }
  for (const g of grupos) g.larguraMediana = arred4(mediana(larguras.get(g)!));
  grupos.sort((a, b) => (a.papel === b.papel ? b.contagem - a.contagem : a.papel === 'titulo' ? -1 : 1));

  // Fluxo.
  const colunaItens = maiorGrupoPorX(textos);
  let fluxo: FluxoDoQuadro = 'livre';
  let coluna: EstiloDetectado['coluna'] = null;
  let eixo: EstiloDetectado['eixo'] = null;
  if (textos.length >= 2 && colunaItens.length >= 2 && colunaItens.length / textos.length > LIMITE_COLUNA) {
    fluxo = 'coluna';
    const ord = [...colunaItens].sort((a, b) => a.y - b.y);
    const vaos: number[] = [];
    for (let i = 1; i < ord.length; i++) vaos.push(Math.max(0, ord[i]!.y - (ord[i - 1]!.y + ord[i - 1]!.altura)));
    coluna = {
      x: arred4(mediana(colunaItens.map((i) => i.x)) - alvo.caixa.x),
      largura: arred4(mediana(colunaItens.map((i) => i.largura))),
      espacoVertical: arred4(mediana(vaos)),
    };
  } else {
    const c = eixoCentrado(textos);
    if (c) {
      fluxo = 'centrado';
      const ord = [...c.itens].sort((a, b) => a.y - b.y);
      const vaos: number[] = [];
      for (let i = 1; i < ord.length; i++) vaos.push(Math.max(0, ord[i]!.y - (ord[i - 1]!.y + ord[i - 1]!.altura)));
      const xAbsoluto = Math.round(c.centro);
      eixo = {
        x: xAbsoluto - Math.round(alvo.caixa.x),
        xAbsoluto,
        largura: arred4(mediana(c.itens.map((i) => i.largura))),
        espacoVertical: arred4(mediana(vaos)),
      };
    } else if (ehGrade(textos)) {
      fluxo = 'grade';
    }
  }

  // Imagens.
  const imgs = mestre.filter((i) => i.tipo === 'imagem');
  let imagens: EstiloDetectado['imagens'] = null;
  if (imgs.length > 0 && textos.length > 0) {
    const ref = colunaItens.length >= 2 && coluna ? colunaItens : eixoItens(textos, eixo);
    const esq = Math.min(...ref.map((i) => i.x));
    const dir = Math.max(...ref.map((i) => i.x + i.largura));
    const lados = { direita: 0, esquerda: 0, dentro: 0 };
    for (const im of imgs) {
      const c = im.x + im.largura / 2;
      lados[c > dir ? 'direita' : c < esq ? 'esquerda' : 'dentro']++;
    }
    const lado = (Object.entries(lados).sort((a, b) => b[1] - a[1])[0]![0]) as 'direita' | 'esquerda' | 'dentro';
    imagens = { lado, largura: arred4(mediana(imgs.map((i) => i.largura))) };
  }

  const comSemantica = textos.filter((i) => (i.tipo === 'texto' || i.tipo === 'forma') && i.semantica).length;
  const tit = grupos.find((g) => g.papel === 'titulo') ?? null;
  const cor = grupos.find((g) => g.papel === 'corpo') ?? null;
  return {
    secaoId: alvo.id,
    secaoTitulo: alvo.titulo,
    secaoEscolhida: escolhida,
    itensDeTexto: textos.length,
    fluxo,
    coluna,
    eixo,
    espacoVertical: coluna?.espacoVertical ?? eixo?.espacoVertical ?? null,
    larguraDaColuna: coluna?.largura ?? eixo?.largura ?? null,
    imagens,
    grupos,
    destaques: detectarDestaques(textos, curtos),
    exemploTitulo: tit?.exemplo ?? null,
    exemploTituloCurto: tit?.exemploCurto ?? null,
    exemploCorpo: cor?.exemplo ?? null,
    exemploCorpoCurto: cor?.exemploCurto ?? null,
    semantica: { fracao: textos.length > 0 ? comSemantica / textos.length : 0, itens: comSemantica, total: textos.length },
    legenda: legendaDoQuadro(itens),
  };
}

/** Resumo curto (alvo: menos de 600 tokens) das convenções, para o assistente. */
export function textoDoEstilo(e: EstiloDetectado | null): string {
  if (!e) return 'Não há seção com texto do mestre neste quadro para detectar o estilo.';
  const l: string[] = [];
  l.push(`Seção: "${e.secaoTitulo}" (${e.secaoId})${e.secaoEscolhida ? ', escolhida por ter mais itens de texto do mestre' : ''}; ${e.itensDeTexto} itens de texto.`);
  const img = e.imagens ? `; imagens ${e.imagens.lado === 'dentro' ? 'dentro da coluna' : `à ${e.imagens.lado}`} (~${e.imagens.largura} px)` : '';
  if (e.coluna) l.push(`Fluxo: coluna em x=${e.coluna.x}, largura ~${e.coluna.largura}, ${e.coluna.espacoVertical} px entre itens${img}.`);
  else if (e.eixo) l.push(`Fluxo: centrado num eixo em x≈${e.eixo.x} (itens centrados), ${e.eixo.espacoVertical} px entre itens${img}.`);
  else l.push(`Fluxo: ${e.fluxo}${img}.`);
  const rotulo = { titulo: 'Título', corpo: 'Corpo' } as const;
  for (const g of e.grupos.slice(0, MAX_GRUPOS)) {
    l.push(`${rotulo[g.papel]} (${g.contagem}): ${g.formato} ${g.fonte} ${numeroCurto(g.tamanho)} ${g.cor}${g.fundo !== null ? `, caixa ${g.fundo}` : ''}, largura ~${g.larguraMediana} (exemplo #${g.exemploCurto}).`);
  }
  if (e.grupos.length > MAX_GRUPOS) l.push(`(+${e.grupos.length - MAX_GRUPOS} estilos menores)`);
  if (usaEstiloPadrao(e)) {
    const f = ESTILO_PADRAO_DO_MESTRE;
    l.push(`Pouco texto do mestre nesta seção: quadro_inserir usa o estilo fixo do mestre (${f.texto.fonte} ${f.texto.tamanho} ${f.texto.cor} em caixa ${f.caixa.fundo}, largura ~${f.largura}; títulos ${f.tituloTamanho} negrito; coluna centrada, ${f.espacoVertical} px entre itens; imagens ~${f.larguraDaImagem} px).`);
  }
  const corpo = e.grupos.find((g) => g.papel === 'corpo')?.cor;
  const cobertas = new Set(e.legenda.entradas.map((x) => x.marcas.fundo));
  const destaques = e.destaques.filter((d) => !cobertas.has(d.cor));
  l.push(...textoDaLegenda(e.legenda));
  if (destaques.length > 0) {
    l.push(`Outros destaques (fundo do trecho, palpite): ${destaques.map((d) => `${d.cor}${d.corDaLetra !== corpo ? ` letra ${d.corDaLetra}` : ''}${d.uso ? ` ${d.uso}?` : ''} ${d.caracteres} car. (#${d.exemploCurto})`).join(' · ')}.`);
  }
  const pct = Math.round(e.semantica.fracao * 100);
  l.push(`Semântica: ${pct}% dos itens${e.semantica.fracao < LIMITE_SEMANTICA ? '; o mestre não usa post-its tipados; não use cores por tipo' : ''}.`);
  return l.join('\n');
}

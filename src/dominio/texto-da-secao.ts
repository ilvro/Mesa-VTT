import { formatarRef } from '#mesa';
import { analisarMarcadores } from './marcadores.ts';
import { textoPuro, type Item } from './quadro.ts';
import { ordemDeLeituraDeItens } from './roteiro-do-quadro.ts';
import { secoesDoQuadro, type Secao } from './secoes-do-quadro.ts';

/**
 * Texto compacto de uma seção do quadro, paginado por tokens estimados.
 * Puro: sem UI, sem DOM.
 */

export type NivelDoTexto = 'titulos' | 'completo';

export interface OpcoesTextoDaSecao {
  /** `titulos`: só a primeira linha de cada item (até 80 caracteres). Padrão: `completo`. */
  nivel?: NivelDoTexto;
  /** Começa em 1; fora do intervalo é ajustada. */
  pagina?: number;
  limiteTokens?: number;
  /** Seções do quadro (para listar as molduras filhas). Sem isto, são calculadas dos itens. */
  secoes?: readonly Secao[];
  /** Nome e tipo das entidades da Mesa, por id, para os cartões de entidade. */
  entidades?: ReadonlyMap<string, { nome: string; tipo: string }>;
}

export interface TextoDaSecao {
  texto: string;
  /** Tokens estimados desta página. */
  tokens: number;
  paginas: number;
  /** Tokens estimados da seção inteira (soma das páginas), para o mapa. */
  tokensTotais: number;
}

export const LIMITE_TOKENS_PADRAO = 2500;
export const MAX_CARACTERES_TITULOS = 80;
const MAX_CARACTERES_NOME_DE_SETA = 40;
const TAMANHO_MINIMO_ID = 6;

/** Estimativa grosseira: 1 token a cada 4 caracteres. */
export function estimarTokens(texto: string): number {
  return Math.ceil(texto.length / 4);
}

function cortar(texto: string, max: number): string {
  return texto.length > max ? `${texto.slice(0, max).trimEnd()}…` : texto;
}

function linhasDoItem(item: Item): string[] {
  if (item.tipo !== 'texto' && item.tipo !== 'forma') return [];
  return textoPuro(item.doc)
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '');
}

/** Menor prefixo (a partir de 6 caracteres) que não colide com o de outro id da seção. */
export function idsCurtos(ids: readonly string[]): Map<string, string> {
  const unicos = [...new Set(ids)];
  const resultado = new Map<string, string>();
  for (const id of unicos) {
    let n = Math.min(TAMANHO_MINIMO_ID, id.length);
    while (
      n < id.length &&
      unicos.some((outro) => outro !== id && outro.startsWith(id.slice(0, n)))
    ) {
      n++;
    }
    resultado.set(id, id.slice(0, n));
  }
  return resultado;
}

function rotuloDoTitulo(n: number): string {
  return `${n} ${n === 1 ? 'item' : 'itens'}`;
}

export function textoDaSecao(
  secao: Secao,
  itens: readonly Item[],
  opcoes: OpcoesTextoDaSecao = {},
): TextoDaSecao {
  const nivel = opcoes.nivel ?? 'completo';
  const limite = Math.max(1, opcoes.limiteTokens ?? LIMITE_TOKENS_PADRAO);

  const porId = new Map(itens.map((i) => [i.id, i]));
  const daSecao: Item[] = [];
  for (const id of secao.itemIds) {
    const it = porId.get(id);
    if (it && it.tipo !== 'seta') daSecao.push(it);
  }

  // Molduras filhas: uma linha cada, sem o conteúdo.
  const filhas = new Map<string, Secao>();
  if (secao.tipo === 'moldura') {
    const todas = opcoes.secoes ?? secoesDoQuadro(itens);
    for (const s of todas) {
      if (s.maeId === secao.id) filhas.set(s.id, s);
    }
  }
  const molduraFilhas = [...filhas.keys()]
    .map((id) => porId.get(id))
    .filter((i): i is Item => i !== undefined);

  const ordenados = ordemDeLeituraDeItens([...daSecao, ...molduraFilhas]);

  const curtos = idsCurtos([...daSecao.map((i) => i.id)]);
  const idCurto = (id: string) => curtos.get(id) ?? id.slice(0, TAMANHO_MINIMO_ID);

  const entidades = opcoes.entidades;
  const descricaoDeRef = (item: Extract<Item, { tipo: 'ref' }>): string => {
    const r = item.ref;
    if (r.app === 'mesa' && r.tipo === 'entidade') {
      const e = entidades?.get(r.id);
      const nome = e?.nome ?? item.rotulo ?? r.id;
      return e ? `[entidade: ${nome} (${e.tipo})]` : `[entidade: ${nome}]`;
    }
    const bruto = formatarRef(r);
    return item.rotulo ? `[ref: ${item.rotulo}, ${bruto}]` : `[ref: ${bruto}]`;
  };
  const descricaoDeImagem = (item: Extract<Item, { tipo: 'imagem' }>): string => {
    const dim = `${Math.round(item.larguraOriginal)}x${Math.round(item.alturaOriginal)}`;
    return `[imagem #${idCurto(item.id)}: ${item.legenda ?? 'sem legenda'}, ${dim}]`;
  };

  const linhasDeItens: string[] = [];
  for (const item of ordenados) {
    if (item.tipo === 'moldura') {
      const filha = filhas.get(item.id)!;
      linhasDeItens.push(`§ ${filha.titulo} (seção ${filha.id}, ${rotuloDoTitulo(filha.itemIds.length)})`);
      continue;
    }
    if (item.tipo === 'imagem') {
      linhasDeItens.push(`- ${descricaoDeImagem(item)}${sufixo(item)}`);
      continue;
    }
    if (item.tipo === 'ref') {
      linhasDeItens.push(`- #${idCurto(item.id)} ${descricaoDeRef(item)}${sufixo(item)}`);
      continue;
    }
    if (item.tipo === 'texto' || item.tipo === 'forma') {
      const linhas = linhasDoItem(item);
      if (linhas.length === 0) continue;
      const corpo =
        nivel === 'titulos'
          ? cortar(linhas[0]!, MAX_CARACTERES_TITULOS)
          : linhas.join(' / ');
      const feito = item.feito ? '✓ ' : '';
      const tipo = item.semantica ? `[${item.semantica}] ` : '';
      linhasDeItens.push(`- #${idCurto(item.id)} ${feito}${tipo}${corpo}${sufixo(item)}`);
    }
    // traços ficam de fora
  }

  // Setas internas.
  const nomeDoItem = (item: Item): string => {
    if (item.tipo === 'texto' || item.tipo === 'forma') {
      const l = linhasDoItem(item)[0];
      if (l) return `"${cortar(l, MAX_CARACTERES_NOME_DE_SETA)}" #${idCurto(item.id)}`;
    }
    if (item.tipo === 'imagem') return `[imagem #${idCurto(item.id)}]`;
    if (item.tipo === 'ref') return `${descricaoDeRef(item)} #${idCurto(item.id)}`;
    return `#${idCurto(item.id)}`;
  };
  const noSecao = new Set(daSecao.map((i) => i.id));
  const dentroDaCaixa = (p: [number, number]) =>
    p[0] >= secao.caixa.x &&
    p[0] <= secao.caixa.x + secao.caixa.largura &&
    p[1] >= secao.caixa.y &&
    p[1] <= secao.caixa.y + secao.caixa.altura;
  const linhasDeSetas: string[] = [];
  for (const it of itens) {
    if (it.tipo !== 'seta') continue;
    const a = 'itemId' in it.de ? it.de.itemId : null;
    const b = 'itemId' in it.para ? it.para.itemId : null;
    const aDentro = a !== null && noSecao.has(a);
    const bDentro = b !== null && noSecao.has(b);
    let ok = false;
    if (a !== null && b !== null) ok = aDentro && bDentro;
    else if (a !== null) ok = aDentro && dentroDaCaixa((it.para as { ponto: [number, number] }).ponto);
    else if (b !== null) ok = bDentro && dentroDaCaixa((it.de as { ponto: [number, number] }).ponto);
    if (!ok) continue;
    const ponta = (id: string | null) => {
      const item = id !== null ? porId.get(id) : undefined;
      return item ? nomeDoItem(item) : '(ponto livre)';
    };
    const rotulo = it.rotulo.trim() !== '' ? `: ${it.rotulo.trim()}` : '';
    linhasDeSetas.push(`${ponta(a)} → ${ponta(b)}${rotulo}`);
  }

  const cabecalho = `§ ${secao.titulo} (${secao.tipo}, ${rotuloDoTitulo(secao.itemIds.length)})`;
  const unidades = [...linhasDeItens, ...linhasDeSetas];

  // Paginação: nunca corta uma unidade no meio.
  const reserva = estimarTokens(`${cabecalho}\n`) + estimarTokens('\n… página 99 de 99');
  const orcamento = Math.max(1, limite - reserva);
  const paginasDeUnidades: string[][] = [];
  let atual: string[] = [];
  let usados = 0;
  const fechar = () => {
    if (atual.length > 0) paginasDeUnidades.push(atual);
    atual = [];
    usados = 0;
  };
  for (const u of unidades) {
    const t = estimarTokens(`${u}\n`);
    if (t > orcamento) {
      fechar();
      paginasDeUnidades.push([`${u} (item longo)`]);
      continue;
    }
    if (usados + t > orcamento) fechar();
    atual.push(u);
    usados += t;
  }
  fechar();
  if (paginasDeUnidades.length === 0) paginasDeUnidades.push([]);

  const paginas = paginasDeUnidades.length;
  const montar = (i: number): string => {
    const corpo = [cabecalho, ...paginasDeUnidades[i]!];
    if (paginas > 1) corpo.push(`… página ${i + 1} de ${paginas}`);
    return corpo.join('\n');
  };
  let tokensTotais = 0;
  for (let i = 0; i < paginas; i++) tokensTotais += estimarTokens(montar(i));

  const pedida = Math.min(paginas, Math.max(1, Math.trunc(opcoes.pagina ?? 1) || 1));
  const texto = montar(pedida - 1);
  return { texto, tokens: estimarTokens(texto), paginas, tokensTotais };
}

function sufixo(item: Item): string {
  const partes: string[] = [];
  // As condições (`se:poeira`) já estão no texto, dentro do marcador: repetir só gastaria tokens.
  if (item.soMestre) partes.push('(só mestre)');
  // `[segredo]` já aparece no tipo semântico; o aviso cobre o marcador [SEGREDO] no texto.
  if (
    (item.tipo === 'texto' || item.tipo === 'forma') &&
    item.semantica !== 'segredo' &&
    analisarMarcadores(textoPuro(item.doc)).some(
      (t) => t.tipo === 'marcador' && t.marcador.tipo === 'segredo',
    )
  ) {
    partes.push('(segredo)');
  }
  return partes.length > 0 ? ` ${partes.join(' ')}` : '';
}

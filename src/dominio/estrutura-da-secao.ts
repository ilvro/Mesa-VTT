import type { DocRico, Item, NoRico } from './quadro.ts';
import { textoPuro } from './quadro.ts';
import { ordemDeLeituraDeItens } from './roteiro-do-quadro.ts';
import {
  infoDoTexto,
  mediana,
  OPCOES_PADRAO_SECOES,
  secoesDoQuadro,
  tituloPorFonte,
  type Secao,
} from './secoes-do-quadro.ts';
import {
  idsCurtos,
  LIMITE_TOKENS_PADRAO,
  paginarUnidades,
} from './texto-da-secao.ts';

/**
 * Estrutura visual de uma seção do quadro: por item, formato, geometria relativa à seção,
 * fonte, tamanho efetivo, cores e destaques por trecho; mais os blocos internos
 * (títulos dentro de uma ilha ou moldura). Puro: sem UI, DOM, signals nem banco.
 */

export interface OpcoesEstruturaDaSecao {
  /** Começa em 1; fora do intervalo é ajustada. */
  pagina?: number;
  limiteTokens?: number;
  /** Seções do quadro (para listar as molduras filhas). Sem isto, são calculadas dos itens. */
  secoes?: readonly Secao[];
}

export interface EstruturaDaSecao {
  texto: string;
  paginas: number;
}

export interface BlocoDaSecao {
  tituloId: string;
  titulo: string;
  /** Itens que seguem o título na ordem de leitura, até o próximo título (sem o próprio título). */
  itemIds: string[];
}

const TAMANHO_MINIMO_ID = 6;
const MAX_DESTAQUES = 3;
const MAX_PRIMEIRA_LINHA = OPCOES_PADRAO_SECOES.maxCaracteresPrimeiraLinha;

function cortar(texto: string, max: number): string {
  return texto.length > max ? `${texto.slice(0, max).trimEnd()}…` : texto;
}

const arredondar = (v: number): number => Math.round(v / 4) * 4;

interface EstiloDoDoc {
  total: number;
  destaques: { cor: string; fracao: number }[];
  negrito: boolean;
  italico: boolean;
  /** Cor de letra que cobre mais da metade do texto. */
  cor: string | null;
}

function estiloDoDoc(doc: DocRico): EstiloDoDoc {
  let total = 0;
  let negrito = 0;
  let italico = 0;
  const fundos = new Map<string, number>();
  const cores = new Map<string, number>();
  const visitar = (no: NoRico) => {
    if (no.type === 'text') {
      const n = (no.text ?? '').length;
      total += n;
      for (const m of no.marks ?? []) {
        if (m.type === 'bold') negrito += n;
        else if (m.type === 'italic') italico += n;
        else if (m.type === 'textStyle') {
          const bg = m.attrs?.backgroundColor;
          if (typeof bg === 'string' && bg !== '') fundos.set(bg, (fundos.get(bg) ?? 0) + n);
          const c = m.attrs?.color;
          if (typeof c === 'string' && c !== '') cores.set(c, (cores.get(c) ?? 0) + n);
        }
      }
      return;
    }
    for (const f of no.content ?? []) visitar(f);
  };
  for (const no of doc.content) visitar(no);
  const destaques = [...fundos.entries()]
    .map(([cor, n]) => ({ cor, fracao: total > 0 ? n / total : 0 }))
    .sort((a, b) => b.fracao - a.fracao)
    .slice(0, MAX_DESTAQUES);
  let cor: string | null = null;
  for (const [c, n] of cores) if (total > 0 && n > total / 2) cor = c;
  return { total, destaques, negrito: total > 0 && negrito > total / 2, italico: total > 0 && italico > total / 2, cor };
}

export function itensDaSecao(secao: Secao, itens: readonly Item[]): Item[] {
  const porId = new Map(itens.map((i) => [i.id, i]));
  const r: Item[] = [];
  for (const id of secao.itemIds) {
    const it = porId.get(id);
    if (it && it.tipo !== 'seta') r.push(it);
  }
  return r;
}

/** Itens de texto/forma com texto que seriam título (semântica, H1/H2 ou fonte maior). */
export function titulosEntre(ordenados: readonly Item[]): Map<string, string> {
  const o = OPCOES_PADRAO_SECOES;
  const comTexto: { item: Item; info: NonNullable<ReturnType<typeof infoDoTexto>> }[] = [];
  for (const item of ordenados) {
    const info = infoDoTexto(item);
    if (info && info.texto !== '') comTexto.push({ item, info });
  }
  const med = mediana(comTexto.map((c) => c.info.tamanho));
  const titulos = new Map<string, string>();
  for (const { item, info } of comTexto) {
    const porSemantica = (item.tipo === 'texto' || item.tipo === 'forma') && item.semantica === 'titulo';
    if (porSemantica) titulos.set(item.id, cortar(info.primeiraLinha, MAX_PRIMEIRA_LINHA));
    else if (tituloPorFonte(info, med, o)) titulos.set(item.id, info.texto.replace(/\n+/g, ' '));
  }
  return titulos;
}

/**
 * Blocos internos de uma seção: cada item que seria título (mesmo critério de `tituloDaSecao`,
 * aplicado a todos os itens, não só ao mais acima) abre um bloco que vai até o próximo título.
 * Itens antes do primeiro título não pertencem a bloco algum.
 */
export function blocosDaSecao(secao: Secao, itens: readonly Item[]): BlocoDaSecao[] {
  const ordenados = ordemDeLeituraDeItens(itensDaSecao(secao, itens));
  const titulos = titulosEntre(ordenados);
  const blocos: BlocoDaSecao[] = [];
  let atual: BlocoDaSecao | null = null;
  for (const it of ordenados) {
    const t = titulos.get(it.id);
    if (t !== undefined) {
      atual = { tituloId: it.id, titulo: t, itemIds: [] };
      blocos.push(atual);
    } else if (atual) {
      atual.itemIds.push(it.id);
    }
  }
  return blocos;
}

export function estruturaDaSecao(
  secao: Secao,
  itens: readonly Item[],
  opcoes: OpcoesEstruturaDaSecao = {},
): EstruturaDaSecao {
  const limite = Math.max(1, opcoes.limiteTokens ?? LIMITE_TOKENS_PADRAO);
  const porId = new Map(itens.map((i) => [i.id, i]));
  const daSecao = itensDaSecao(secao, itens);

  const filhas = new Map<string, Secao>();
  if (secao.tipo === 'moldura') {
    for (const s of opcoes.secoes ?? secoesDoQuadro(itens)) {
      if (s.maeId === secao.id) filhas.set(s.id, s);
    }
  }
  const molduraFilhas = [...filhas.keys()]
    .map((id) => porId.get(id))
    .filter((i): i is Item => i !== undefined);

  const ordenados = ordemDeLeituraDeItens([...daSecao, ...molduraFilhas]);
  const titulos = titulosEntre(ordenados);
  const curtos = idsCurtos(daSecao.map((i) => i.id));
  const idCurto = (id: string) => curtos.get(id) ?? id.slice(0, TAMANHO_MINIMO_ID);

  const linhas: string[] = [];
  for (const item of ordenados) {
    const tituloDoBloco = titulos.get(item.id);
    if (tituloDoBloco !== undefined) {
      linhas.push(`▸ bloco "${cortar(tituloDoBloco, MAX_PRIMEIRA_LINHA)}" (#${idCurto(item.id)})`);
    }
    const x = arredondar(item.x - secao.caixa.x);
    const y = arredondar(item.y - secao.caixa.y);
    const geo = `${x},${y} ${arredondar(item.largura)}×${arredondar(item.altura)}`;
    const marcas = [
      item.tipo === 'texto' || item.tipo === 'forma' ? (item.semantica ? `[${item.semantica}]` : '') : '',
      item.revisao?.origem === 'assistente' ? '[do assistente]' : '',
    ].filter((m) => m !== '');
    const sufixo = marcas.length > 0 ? ` ${marcas.join(' ')}` : '';
    const id = `#${idCurto(item.id)}`;

    if (item.tipo === 'texto' || item.tipo === 'forma') {
      const info = infoDoTexto(item);
      if (!info || info.texto === '') continue;
      const estilo = estiloDoDoc(item.doc);
      // Post-it = como a `novaNotaAdesiva`: fundo e sombra. Texto corrido com caixa branca (Miro) não é nota.
      const nota = item.tipo === 'texto' && item.caixa.fundo !== null && item.caixa.sombra;
      const formato = item.tipo === 'forma' ? `forma:${item.forma}` : nota ? 'nota' : 'texto';
      const partes = [
        `- ${id} ${formato} ${geo}`,
        item.texto.fonte,
        String(info.tamanho),
        estilo.cor ?? item.texto.cor,
      ];
      if (item.caixa.fundo !== null) partes.push(`caixa:${item.caixa.fundo}`);
      if (estilo.destaques.length > 0) {
        partes.push(
          `destaques: ${estilo.destaques.map((d) => `${d.cor} ${Math.round(d.fracao * 100)}%`).join(', ')}`,
        );
      }
      if (estilo.negrito) partes.push('negrito');
      if (estilo.italico) partes.push('itálico');
      const primeira = textoPuro(item.doc)
        .split('\n')
        .map((l) => l.trim())
        .find((l) => l !== '');
      linhas.push(`${partes.join(' ')}${sufixo} · "${cortar(primeira ?? '', MAX_PRIMEIRA_LINHA)}"`);
    } else if (item.tipo === 'imagem') {
      linhas.push(`- ${id} imagem ${geo}${sufixo}${item.legenda ? ` · "${cortar(item.legenda, MAX_PRIMEIRA_LINHA)}"` : ''}`);
    } else if (item.tipo === 'moldura') {
      linhas.push(`- ${id} moldura ${geo}${sufixo} · "${cortar(item.titulo, MAX_PRIMEIRA_LINHA)}"`);
    } else if (item.tipo === 'ref') {
      linhas.push(`- ${id} ref ${geo}${sufixo}${item.rotulo ? ` · "${cortar(item.rotulo, MAX_PRIMEIRA_LINHA)}"` : ''}`);
    }
    // traços ficam de fora
  }

  // Setas no fim, só as que ligam itens da seção (ou saem de um item para um ponto dentro dela).
  const noSecao = new Set(daSecao.map((i) => i.id));
  const dentroDaCaixa = (p: [number, number]) =>
    p[0] >= secao.caixa.x &&
    p[0] <= secao.caixa.x + secao.caixa.largura &&
    p[1] >= secao.caixa.y &&
    p[1] <= secao.caixa.y + secao.caixa.altura;
  const unidades = [...linhas];
  for (const it of itens) {
    if (it.tipo !== 'seta') continue;
    const a = 'itemId' in it.de ? it.de.itemId : null;
    const b = 'itemId' in it.para ? it.para.itemId : null;
    let ok = false;
    if (a !== null && b !== null) ok = noSecao.has(a) && noSecao.has(b);
    else if (a !== null) ok = noSecao.has(a) && dentroDaCaixa((it.para as { ponto: [number, number] }).ponto);
    else if (b !== null) ok = noSecao.has(b) && dentroDaCaixa((it.de as { ponto: [number, number] }).ponto);
    if (!ok) continue;
    const ponta = (id: string | null) => (id !== null && noSecao.has(id) ? `#${idCurto(id)}` : '(ponto livre)');
    const rotulo = it.rotulo.trim() !== '' ? `: ${it.rotulo.trim()}` : '';
    unidades.push(`- seta ${ponta(a)} → ${ponta(b)}${rotulo}`);
  }

  const cabecalho = `§ ${secao.titulo} (${secao.tipo}, ${secao.itemIds.length} ${secao.itemIds.length === 1 ? 'item' : 'itens'})`;
  const r = paginarUnidades(cabecalho, unidades, limite, opcoes.pagina);
  return { texto: r.texto, paginas: r.paginas };
}


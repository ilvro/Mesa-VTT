import type { Item, NoRico } from './quadro.ts';
import { analisarMarcadores } from './marcadores.ts';
import { ordemDeLeituraDeItens } from './roteiro-do-quadro.ts';
import { itensDaSecao } from './estrutura-da-secao.ts';
import { secoesDoQuadro } from './secoes-do-quadro.ts';
import { idsCurtos } from './texto-da-secao.ts';

/**
 * Legenda do mestre: o que cada cor e cada rótulo entre colchetes significa no quadro. Duas fontes: a seção
 * "LEGENDA" (explícita) e os trechos `[…]` destacados dos itens do mestre (marcadores). A explícita vence; os
 * marcadores completam os papéis que faltarem. Puro: sem UI, DOM, signals nem banco.
 */

export interface MarcasDaLegenda {
  fundo?: string;
  letra?: string;
  negrito?: boolean;
  italico?: boolean;
}

export interface EntradaDaLegenda {
  /** `ponto`, `narracao`, `segredo`, `segredo-destaque`, `teste`, `loot`, `transicao`, `evento`, `gancho`, `fala`, `condicao`… */
  papel: string;
  /** Texto do rótulo, sem colchetes (ex.: `PONTO DE INTERAÇÃO`). */
  rotulo: string;
  descricao?: string;
  marcas: MarcasDaLegenda;
  /** Id completo do item de exemplo. */
  exemplo: string;
  exemploCurto: string;
  origem: 'legenda' | 'marcadores';
}

export interface Legenda {
  /** Título da seção da legenda explícita, ou null se só há marcadores. */
  secaoTitulo: string | null;
  entradas: EntradaDaLegenda[];
}

const semAcento = (t: string): string => t.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

const PAPEL_POR_NOME: Record<string, string> = {
  'ponto de interacao': 'ponto',
  ponto: 'ponto',
  narracao: 'narracao',
  segredo: 'segredo',
  'teste e dt': 'teste',
  teste: 'teste',
  loot: 'loot',
  transicao: 'transicao',
  evento: 'evento',
  gancho: 'gancho',
  handout: 'handout',
};

const NOTA_CONDICAO = 'condição; a legenda do mestre agrupa com teste ("ou condicional")';

interface Segmento {
  texto: string;
  marcas: MarcasDaLegenda;
}

type Linha = Segmento[];

/** Linhas de um item de texto (parágrafo ou quebra), cada uma com os segmentos e suas marcas de destaque. */
function linhasDoItem(item: Extract<Item, { tipo: 'texto' | 'forma' }>): Linha[] {
  const linhas: Linha[] = [];
  let atual: Linha = [];
  const fechar = () => {
    linhas.push(atual);
    atual = [];
  };
  const visitar = (no: NoRico) => {
    if (no.type === 'text') {
      const m: MarcasDaLegenda = {};
      for (const k of no.marks ?? []) {
        if (k.type === 'bold') m.negrito = true;
        else if (k.type === 'italic') m.italico = true;
        else if (k.type === 'textStyle') {
          const bg = k.attrs?.backgroundColor;
          const c = k.attrs?.color;
          if (typeof bg === 'string' && bg !== '') m.fundo = bg;
          if (typeof c === 'string' && c !== '') m.letra = c;
        }
      }
      atual.push({ texto: no.text ?? '', marcas: m });
      return;
    }
    if (no.type === 'hardBreak') {
      fechar();
      return;
    }
    for (const f of no.content ?? []) visitar(f);
    if (no.type === 'paragraph' || no.type === 'heading' || no.type === 'listItem') fechar();
  };
  for (const no of item.doc.content) visitar(no);
  if (atual.length > 0) fechar();
  return linhas.filter((l) => l.some((s) => s.texto.trim() !== ''));
}

const textoDaLinha = (l: Linha): string => l.map((s) => s.texto).join('');

/** Marcas do caractere na posição `pos` da linha. */
function marcasEm(l: Linha, pos: number): MarcasDaLegenda {
  let acc = 0;
  for (const s of l) {
    if (pos < acc + s.texto.length) return s.marcas;
    acc += s.texto.length;
  }
  return {};
}

const chaveDeMarcas = (m: MarcasDaLegenda): string => JSON.stringify([m.fundo ?? null, m.letra ?? null, m.negrito ?? false, m.italico ?? false]);

/** Só as marcas que dizem algo: sem chaves vazias nem falsas. */
function limpar(m: MarcasDaLegenda): MarcasDaLegenda {
  const r: MarcasDaLegenda = {};
  if (m.fundo) r.fundo = m.fundo;
  if (m.letra) r.letra = m.letra;
  if (m.negrito) r.negrito = true;
  if (m.italico) r.italico = true;
  return r;
}

function papelDoNome(nome: string): string {
  const n = semAcento(nome).trim();
  return PAPEL_POR_NOME[n] ?? nome.trim().toLowerCase();
}

function entradasExplicitas(itens: readonly Item[], curto: (id: string) => string): { titulo: string; entradas: EntradaDaLegenda[] } | null {
  const secao = secoesDoQuadro(itens).find((s) => semAcento(s.titulo).includes('legenda'));
  if (!secao) return null;
  const mestre = ordemDeLeituraDeItens(itensDaSecao(secao, itens).filter((i) => i.revisao?.origem !== 'assistente'));
  const entradas: EntradaDaLegenda[] = [];
  for (const item of mestre) {
    if (item.tipo !== 'texto' && item.tipo !== 'forma') continue;
    for (const linha of linhasDoItem(item)) {
      const texto = textoDaLinha(linha);
      const m = /^(\s*)\[([^\]\n]+)\]/.exec(texto);
      if (!m) continue;
      const marcas = limpar(marcasEm(linha, m[1]!.length + 1));
      if (!marcas.fundo) continue;
      const rotulo = m[2]!.trim();
      const resto = texto.slice(m[0].length).trim();
      let papel = papelDoNome(rotulo);
      if (papel === 'segredo' && (/destaque/i.test(resto) || entradas.some((e) => e.papel === 'segredo'))) papel = 'segredo-destaque';
      if (entradas.some((e) => e.papel === papel)) continue;
      entradas.push({ papel, rotulo, ...(resto ? { descricao: resto } : {}), marcas, exemplo: item.id, exemploCurto: curto(item.id), origem: 'legenda' });
    }
  }
  return entradas.length > 0 ? { titulo: secao.titulo, entradas } : null;
}

/** Papel de um trecho `[…]` do mestre, a partir do rótulo e do que `analisarMarcadores` classificou. */
function papelDoMarcador(inner: string, tipo: string, seguidoDeNumero: boolean): string {
  if (/^SE\s/iu.test(inner.trim())) return 'condicao';
  const porNome = PAPEL_POR_NOME[semAcento(inner).trim()];
  if (porNome) return porNome;
  if (seguidoDeNumero && (tipo === 'fala' || tipo === 'rotulo')) return 'teste';
  return tipo;
}

interface Ocorrencia {
  papel: string;
  rotulo: string;
  marcas: MarcasDaLegenda;
  item: string;
}

function ocorrenciasDeMarcadores(itens: readonly Item[]): Ocorrencia[] {
  const r: Ocorrencia[] = [];
  for (const item of itens) {
    if (item.tipo !== 'texto' && item.tipo !== 'forma') continue;
    for (const linha of linhasDoItem(item)) {
      const texto = textoDaLinha(linha);
      if (!texto.includes('[')) continue;
      let pos = 0;
      for (const trecho of analisarMarcadores(texto)) {
        const bruto = trecho.tipo === 'texto' ? trecho.texto : trecho.bruto;
        const ini = trecho.tipo === 'texto' ? pos : texto.indexOf(bruto, pos);
        if (ini < 0) continue;
        pos = ini + bruto.length;
        if (trecho.tipo !== 'marcador') continue;
        const marcas = limpar(marcasEm(linha, ini + 1));
        if (!marcas.fundo) continue;
        const inner = bruto.slice(1, -1).trim();
        const seguidoDeNumero = /^\s*\[(?:DT\s*)?\d+\]/i.test(texto.slice(pos));
        r.push({ papel: papelDoMarcador(inner, trecho.marcador.tipo, seguidoDeNumero), rotulo: inner, marcas, item: item.id });
      }
    }
  }
  return r;
}

/** Legenda do quadro todo (itens do mestre), ou null se não houver legenda explícita nem trechos destacados. */
export function legendaDoQuadro(itens: readonly Item[]): Legenda | null {
  const curtos = idsCurtos(itens.map((i) => i.id));
  const curto = (id: string) => curtos.get(id) ?? id.slice(0, 6);
  const mestre = itens.filter((i) => i.revisao?.origem !== 'assistente');
  const explicita = entradasExplicitas(mestre, curto);
  const entradas: EntradaDaLegenda[] = explicita ? [...explicita.entradas] : [];

  // Marcadores: fora da seção da legenda, que já foi lida; a combinação de marcas mais comum de cada papel.
  let doMarcador = mestre;
  if (explicita) {
    const secao = secoesDoQuadro(mestre).find((s) => semAcento(s.titulo).includes('legenda'));
    if (secao) {
      const fora = new Set(secao.itemIds);
      doMarcador = mestre.filter((i) => !fora.has(i.id));
    }
  }
  const porPapel = new Map<string, Map<string, { n: number; oc: Ocorrencia }>>();
  for (const oc of ocorrenciasDeMarcadores(ordemDeLeituraDeItens(doMarcador))) {
    const combos = porPapel.get(oc.papel) ?? new Map();
    const k = chaveDeMarcas(oc.marcas);
    const atual = combos.get(k);
    if (atual) atual.n++;
    else combos.set(k, { n: 1, oc });
    porPapel.set(oc.papel, combos);
  }
  for (const [papel, combos] of porPapel) {
    if (entradas.some((e) => e.papel === papel)) continue;
    let melhor: { n: number; oc: Ocorrencia } | null = null;
    for (const c of combos.values()) if (!melhor || c.n > melhor.n) melhor = c;
    if (!melhor) continue;
    const { oc } = melhor;
    entradas.push({
      papel,
      rotulo: oc.rotulo,
      ...(papel === 'condicao' ? { descricao: NOTA_CONDICAO } : {}),
      marcas: oc.marcas,
      exemplo: oc.item,
      exemploCurto: curto(oc.item),
      origem: 'marcadores',
    });
  }
  if (entradas.length === 0) return null;
  return { secaoTitulo: explicita?.titulo ?? null, entradas };
}

function descreverMarcas(m: MarcasDaLegenda): string {
  const p: string[] = [];
  if (m.fundo) p.push(`fundo ${m.fundo}`);
  if (m.letra) p.push(`letra ${m.letra}`);
  if (m.negrito) p.push('negrito');
  if (m.italico) p.push('itálico');
  return p.join(', ');
}

/** Linhas de texto da legenda (cabeçalho e uma linha por papel), para `quadro_estilo`. */
export function textoDaLegenda(l: Legenda): string[] {
  const cab = l.secaoTitulo !== null
    ? `Legenda do mestre ("${l.secaoTitulo}", vale para o quadro todo; "inferida" = só vista nos trechos [..] destacados):`
    : 'Legenda inferida dos trechos [..] destacados do mestre (vale para o quadro todo; não há seção de legenda):';
  const linhas = l.entradas.map((e) => {
    const d = e.descricao ? ` — ${e.descricao}` : '';
    const o = e.origem === 'marcadores' ? ' [inferida]' : '';
    return `- ${e.papel} [${e.rotulo}]: ${descreverMarcas(e.marcas)}${d} (#${e.exemploCurto})${o}`;
  });
  return [cab, ...linhas];
}

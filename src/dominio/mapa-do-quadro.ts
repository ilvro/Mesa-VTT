import type { Caixa } from './camera.ts';
import type { Item, Quadro } from './quadro.ts';
import {
  ligacoesEntreSecoes,
  secoesDoQuadro,
  type OpcoesSecoes,
  type Secao,
} from './secoes-do-quadro.ts';
import { estimarTokens, textoDaSecao } from './texto-da-secao.ts';

/**
 * Mapa do quadro: o índice que o assistente lê primeiro (uma linha por seção, em ordem de
 * leitura, com recuo para as filhas). Puro: a decisão de "resumo desatualizado" é de quem chama.
 */

export interface ResumoParaOMapa {
  texto: string;
  desatualizado: boolean;
  autor?: 'assistente' | 'mestre';
}

export interface OpcoesMapaDoQuadro {
  /** Chave: id da seção ou `item:<id>` (descrição de imagem). */
  resumos?: ReadonlyMap<string, ResumoParaOMapa>;
  /** Padrão: 6000 tokens estimados. */
  limiteTokens?: number;
  opcoesSecoes?: Partial<OpcoesSecoes>;
}

export interface MapaDoQuadro {
  texto: string;
  tokens: number;
  secoes: Secao[];
}

export const LIMITE_TOKENS_DO_MAPA = 6000;
/** Ilhas com menos itens que isto são resumidas por região quando o mapa passa do limite. */
export const MIN_ITENS_ILHA_GRANDE = 3;
const MAX_LIGACOES_POR_SECAO = 3;
const MAX_CARACTERES_PRIMEIRA_FRASE = 160;

/** `850` → "~850 tokens"; `1930` → "~1,9 mil tokens"; `2000` → "~2 mil tokens". */
export function tokensEmPortugues(n: number): string {
  if (n < 1000) return `~${Math.max(0, Math.round(n))} tokens`;
  const mil = Math.round(n / 100) / 10;
  return `~${String(mil).replace('.', ',')} mil tokens`;
}

function plural(n: number, um: string, varios: string): string {
  return `${n} ${n === 1 ? um : varios}`;
}

function primeiraFrase(texto: string): string {
  const limpo = texto.replace(/\s+/g, ' ').trim();
  const m = /^(.+?[.!?])(?:\s|$)/.exec(limpo);
  const frase = m ? m[1]! : limpo;
  return frase.length > MAX_CARACTERES_PRIMEIRA_FRASE
    ? `${frase.slice(0, MAX_CARACTERES_PRIMEIRA_FRASE).trimEnd()}…`
    : frase;
}

function distanciaEntreCaixas(a: Caixa, b: Caixa): { dx: number; dy: number; d: number } {
  const dx = Math.max(0, a.x - (b.x + b.largura), b.x - (a.x + a.largura));
  const dy = Math.max(0, a.y - (b.y + b.altura), b.y - (a.y + a.altura));
  return { dx, dy, d: Math.hypot(dx, dy) };
}

/** Direção de `a` em relação a `b`: `a` fica "acima de" `b`, etc. */
function direcaoDe(a: Caixa, b: Caixa, dx: number, dy: number): string {
  const horizontal = dx > dy || (dx === dy && Math.abs(a.x + a.largura / 2 - (b.x + b.largura / 2)) >=
    Math.abs(a.y + a.altura / 2 - (b.y + b.altura / 2)));
  if (horizontal) {
    return a.x + a.largura / 2 <= b.x + b.largura / 2 ? 'à esquerda de' : 'à direita de';
  }
  return a.y + a.altura / 2 <= b.y + b.altura / 2 ? 'acima de' : 'abaixo de';
}

function vizinhaMaisProxima(
  s: Secao,
  candidatas: readonly Secao[],
): { secao: Secao; direcao: string } | null {
  let melhor: { secao: Secao; d: number; dx: number; dy: number } | null = null;
  for (const c of candidatas) {
    if (c.id === s.id) continue;
    const { dx, dy, d } = distanciaEntreCaixas(s.caixa, c.caixa);
    if (!melhor || d < melhor.d) melhor = { secao: c, d, dx, dy };
  }
  if (!melhor) return null;
  return { secao: melhor.secao, direcao: direcaoDe(s.caixa, melhor.secao.caixa, melhor.dx, melhor.dy) };
}

function contagens(itensDaSecao: readonly Item[]): string {
  const porTipo = new Map<string, number>();
  let imagens = 0;
  let semTipo = 0;
  for (const it of itensDaSecao) {
    if (it.tipo === 'imagem') imagens++;
    else if ((it.tipo === 'texto' || it.tipo === 'forma') && it.semantica) {
      porTipo.set(it.semantica, (porTipo.get(it.semantica) ?? 0) + 1);
    } else semTipo++;
  }
  const partes = [...porTipo].map(([t, n]) => `${n} ${t}`);
  if (porTipo.size > 0 && semTipo > 0) partes.push(`${semTipo} ${semTipo === 1 ? 'outro' : 'outros'}`);
  if (imagens > 0) partes.push(plural(imagens, 'imagem', 'imagens'));
  return partes.join(', ');
}

export function mapaDoQuadro(
  quadro: Pick<Quadro, 'nome'>,
  itens: readonly Item[],
  opcoes: OpcoesMapaDoQuadro = {},
): MapaDoQuadro {
  const limite = opcoes.limiteTokens ?? LIMITE_TOKENS_DO_MAPA;
  const resumos = opcoes.resumos;
  const secoes = secoesDoQuadro(itens, opcoes.opcoesSecoes);
  const porId = new Map(itens.map((i) => [i.id, i]));
  const setas = itens.filter((i) => i.tipo === 'seta');
  const molduras = new Map<string, Item>();
  for (const i of itens) if (i.tipo === 'moldura') molduras.set(i.id, i);
  const tituloDe = new Map(secoes.map((s) => [s.id, s.titulo]));

  // Tamanho de cada seção, calculado uma vez (uma página só, sem paginar à toa).
  const tokensDe = new Map<string, number>();
  let totalTokens = 0;
  for (const s of secoes) {
    const doSecao: Item[] = [];
    for (const id of s.itemIds) {
      const it = porId.get(id);
      if (it) doSecao.push(it);
    }
    const filhas = secoes.filter((f) => f.maeId === s.id);
    const subconjunto = [...doSecao, ...filhas.map((f) => molduras.get(f.id)!).filter(Boolean), ...setas];
    const r = textoDaSecao(s, subconjunto, {
      nivel: 'completo',
      limiteTokens: Number.MAX_SAFE_INTEGER,
      secoes,
    });
    tokensDe.set(s.id, r.tokensTotais);
    totalTokens += r.tokensTotais;
  }

  const topo = secoes.filter((s) => s.maeId === null);
  const profundidade = new Map<string, number>();
  const maes = new Map(secoes.map((s) => [s.id, s.maeId]));
  for (const s of secoes) {
    let p = 0;
    let m = s.maeId;
    while (m !== null && p < 50) {
      p++;
      m = maes.get(m) ?? null;
    }
    profundidade.set(s.id, p);
  }

  const ligacoes = ligacoesEntreSecoes(secoes, itens);
  const saidas = new Map<string, string[]>();
  const adicionar = (id: string, texto: string) => {
    const l = saidas.get(id);
    if (l) l.push(texto);
    else saidas.set(id, [texto]);
  };
  for (const l of ligacoes) {
    const rot = l.rotulo.trim() !== '' ? ` (${l.rotulo.trim()})` : '';
    adicionar(l.de, `→ "${tituloDe.get(l.para) ?? l.para}"${rot}`);
    adicionar(l.para, `← "${tituloDe.get(l.de) ?? l.de}"${rot}`);
  }

  const itensItens = itens.filter((i) => i.tipo !== 'seta' && i.tipo !== 'moldura');
  const totalItens = secoes.reduce((n, s) => n + s.itemIds.length, 0);
  const imagensSemTexto = itensItens.filter(
    (i) => i.tipo === 'imagem' && (i.legenda ?? '').trim() === '' && !resumos?.has(`item:${i.id}`),
  ).length;

  const cabecalho = [
    `Quadro "${quadro.nome}": ${plural(secoes.length, 'seção', 'seções')}, ${plural(totalItens, 'item', 'itens')}, ${tokensEmPortugues(totalTokens)}.`,
  ];
  if (imagensSemTexto > 0) {
    cabecalho.push(`${plural(imagensSemTexto, 'imagem', 'imagens')} sem legenda nem descrição.`);
  }

  const montar = (ocultas: ReadonlySet<string>, soPrimeiraFrase: boolean): string => {
    const linhas: string[] = [...cabecalho];
    const visiveisTopo = topo.filter((s) => !ocultas.has(s.id));
    for (const s of secoes) {
      if (ocultas.has(s.id)) continue;
      const recuo = '  '.repeat(profundidade.get(s.id) ?? 0);
      const itensDaSecao = s.itemIds.map((id) => porId.get(id)).filter((i): i is Item => !!i);
      const cont = contagens(itensDaSecao);
      const partes = [
        `${recuo}§ ${s.id} "${s.titulo}" — ${plural(s.itemIds.length, 'item', 'itens')}${cont ? ` (${cont})` : ''}`,
        tokensEmPortugues(tokensDe.get(s.id) ?? 0),
      ];
      if (s.maeId === null) {
        const v = vizinhaMaisProxima(s, visiveisTopo);
        if (v) partes.push(`${v.direcao} "${v.secao.titulo}"`);
      }
      const lig = (saidas.get(s.id) ?? []).slice(0, MAX_LIGACOES_POR_SECAO);
      if (lig.length > 0) partes.push(lig.join(' · '));
      linhas.push(partes.join(' · '));
      const r = resumos?.get(s.id);
      if (r) {
        const texto = soPrimeiraFrase ? primeiraFrase(r.texto) : r.texto.replace(/\s+/g, ' ').trim();
        const aviso = r.desatualizado ? ' (resumo desatualizado)' : '';
        const dono = r.autor === 'mestre' ? ' (escrito pelo mestre: não troque sem pedir)' : '';
        linhas.push(`${recuo}  resumo: ${texto}${aviso}${dono}`);
      }
    }
    if (ocultas.size > 0) {
      const porAncora = new Map<string, number>();
      for (const id of ocultas) {
        const s = secoes.find((x) => x.id === id)!;
        const v = vizinhaMaisProxima(s, visiveisTopo);
        const nome = v ? `"${v.secao.titulo}"` : 'o quadro';
        porAncora.set(nome, (porAncora.get(nome) ?? 0) + 1);
      }
      for (const [nome, n] of porAncora) {
        linhas.push(`· ${plural(n, 'grupo pequeno', 'grupos pequenos')} perto de ${nome}`);
      }
      linhas.push(
        `(${plural(ocultas.size, 'seção resumida', 'seções resumidas')} assim; abra pela região ou pela busca.)`,
      );
    }
    return linhas.join('\n');
  };

  const nenhuma = new Set<string>();
  let texto = montar(nenhuma, false);
  if (estimarTokens(texto) > limite) {
    const ocultas = new Set(
      topo
        .filter((s) => s.tipo === 'soltos' || (s.tipo === 'ilha' && s.itemIds.length < MIN_ITENS_ILHA_GRANDE))
        .map((s) => s.id),
    );
    texto = montar(ocultas, false);
    if (estimarTokens(texto) > limite) texto = montar(ocultas, true);
  }
  return { texto, tokens: estimarTokens(texto), secoes };
}

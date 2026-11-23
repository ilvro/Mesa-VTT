import { itemAtendeCondicoes, type EstadoDoMundo } from './estado-do-mundo.ts';
import { analisarMarcadores } from './marcadores.ts';
import { comConteudo } from './molduras.ts';
import { docDeTexto, textoPuro, type DocRico, type Item, type NoRico } from './quadro.ts';

/**
 * Projeção para os jogadores. Este módulo é a única porta entre o quadro do mestre e a janela de projeção:
 * a janela só desenha o que `itensParaJogadores` devolve. A regra é "na dúvida, fora".
 *
 * Fora da projeção: `soMestre`, segredos (`semantica === 'segredo'`), itens em `revisao`, itens com condição
 * falsa no estado do mundo, filhos de uma moldura que ficou de fora e setas com uma ponta fora.
 * Nos itens que ficam: os marcadores do mestre (`[PERCEPÇÃO 13]`, `[SEGREDO]`, `[LOOT]`, `[FALA]`…) saem do texto,
 * a `semantica` (cor por tipo), `feito`, `revisao`, `origem` e `aoFocar` são zerados.
 */

export type ItemParaJogadores = Item;

/** Mensagens do canal `BroadcastChannel('mesa:projecao')`. */
export type MensagemDeProjecao =
  | { tipo: 'mostrar'; quadroId: string; molduraId: string }
  | { tipo: 'parar' }
  | { tipo: 'atualizar' };

export const CANAL_DA_PROJECAO = 'mesa:projecao';

/** Lê uma mensagem do canal sem confiar nela (vem de outra janela). */
export function lerMensagemDeProjecao(bruto: unknown): MensagemDeProjecao | null {
  if (typeof bruto !== 'object' || bruto === null) return null;
  const m = bruto as Record<string, unknown>;
  if (m.tipo === 'parar') return { tipo: 'parar' };
  if (m.tipo === 'atualizar') return { tipo: 'atualizar' };
  if (m.tipo === 'mostrar' && typeof m.quadroId === 'string' && typeof m.molduraId === 'string' && m.quadroId && m.molduraId) {
    return { tipo: 'mostrar', quadroId: m.quadroId, molduraId: m.molduraId };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Texto sem marcadores
// ---------------------------------------------------------------------------

interface Pedaco {
  ch: string;
  filho: number;
}

/**
 * Tira os trechos-marcador de um bloco de texto (parágrafo ou título) sem perder as marcas (negrito etc.).
 * O `analisarMarcadores` trabalha sobre o texto puro do bloco, então um marcador partido entre marcas
 * (`[PERCEP` em negrito + `ÇÃO 13]` normal) é achado e removido nos dois pedaços.
 * Limitação: marcadores nunca cruzam linhas (o analisador também não os reconhece assim), então um
 * `[` num parágrafo e o `]` no seguinte ficam como texto comum.
 * Devolve `null` quando o bloco ficou vazio por causa da remoção.
 */
function limparBloco(no: NoRico): NoRico | null {
  const filhos = no.content ?? [];
  const pedacos: Pedaco[] = [];
  filhos.forEach((f, i) => {
    if (f.type === 'text') for (const ch of f.text ?? '') pedacos.push({ ch, filho: i });
    else if (f.type === 'hardBreak') pedacos.push({ ch: '\n', filho: i });
  });
  // Um pedaço por unidade UTF-16, para os índices baterem com os do analisador.
  const unidades: Pedaco[] = [];
  for (const p of pedacos) for (let k = 0; k < p.ch.length; k++) unidades.push({ ch: p.ch[k]!, filho: p.filho });
  const texto = unidades.map((u) => u.ch).join('');

  const trechos = analisarMarcadores(texto);
  const comprimentos = trechos.map((t) => (t.tipo === 'texto' ? t.texto.length : t.bruto.length));
  const soma = comprimentos.reduce((a, b) => a + b, 0);
  const remover = new Array<boolean>(texto.length).fill(false);
  const cortar = (de: number, ate: number) => {
    for (let i = Math.max(0, de); i < Math.min(texto.length, ate); i++) remover[i] = true;
  };

  if (soma !== texto.length) {
    // O analisador não devolveu o texto inteiro: não dá para localizar os marcadores, então o bloco todo sai.
    cortar(0, texto.length);
  } else {
    let pos = 0;
    trechos.forEach((t, i) => {
      const fim = pos + comprimentos[i]!;
      if (t.tipo === 'marcador') {
        const inicioLinha = texto.lastIndexOf('\n', pos - 1) + 1;
        const quebra = texto.indexOf('\n', fim);
        const fimLinha = quebra < 0 ? texto.length : quebra;
        if (t.marcador.tipo === 'segredo') cortar(inicioLinha, fimLinha);
        else if (t.marcador.tipo === 'loot') cortar(pos, fimLinha);
        else cortar(pos, fim);
      } else if (t.tipo === 'ligacao') {
        // [[Nome|rótulo]] vira o rótulo; [[Nome]] vira Nome; ligação por Ref sem rótulo some.
        const barra = t.bruto.indexOf('|');
        if (barra >= 0) {
          cortar(pos, pos + barra + 1);
          cortar(fim - 2, fim);
        } else if (t.alvo.tipo === 'ref') {
          cortar(pos, fim);
        } else {
          cortar(pos, pos + 2);
          cortar(fim - 2, fim);
        }
      }
      pos = fim;
    });
  }

  const algumCorte = remover.some(Boolean);
  const novos: NoRico[] = [];
  filhos.forEach((f, i) => {
    if (f.type === 'text') {
      let s = '';
      unidades.forEach((u, k) => {
        if (u.filho === i && !remover[k]) s += u.ch;
      });
      if (s.length > 0) novos.push({ ...f, text: s });
    } else if (f.type === 'hardBreak') {
      const k = unidades.findIndex((u) => u.filho === i);
      if (k >= 0 && !remover[k]) novos.push(f);
    } else {
      novos.push(f);
    }
  });
  const resto = novos.filter((n) => n.type !== 'hardBreak');
  if (algumCorte && resto.length === 0) return null;
  // Quebras soltas nas pontas, deixadas pela linha removida, também saem.
  while (novos.at(-1)?.type === 'hardBreak') novos.pop();
  while (novos[0]?.type === 'hardBreak') novos.shift();
  return { ...no, content: novos };
}

function limparNo(no: NoRico): NoRico | null {
  if (no.type === 'paragraph' || no.type === 'heading') return limparBloco(no);
  if (!no.content) return no;
  const filhos: NoRico[] = [];
  for (const f of no.content) {
    const l = limparNo(f);
    if (l) filhos.push(l);
  }
  if (filhos.length === 0) return null;
  return { ...no, content: filhos };
}

/** Uma cópia do documento sem os trechos-marcador do mestre (ver `limparBloco`). */
export function docSemMarcadores(doc: DocRico): DocRico {
  const content: NoRico[] = [];
  for (const no of doc.content ?? []) {
    const l = limparNo(no);
    if (l) content.push(l);
  }
  return { type: 'doc', content };
}

/** O mesmo para uma linha de texto simples (título de moldura, rótulo de seta ou de cartão). */
export function textoSemMarcadores(texto: string): string {
  return textoPuro(docSemMarcadores(docDeTexto(texto)));
}

// ---------------------------------------------------------------------------
// Seleção dos itens
// ---------------------------------------------------------------------------

function ehSegredo(item: Item): boolean {
  return 'semantica' in item && item.semantica === 'segredo';
}

function temTexto(item: Item): boolean {
  return (item.tipo === 'texto' || item.tipo === 'forma') && textoPuro(item.doc).trim().length > 0;
}

/** Limpa o item de tudo que é do mestre. Devolve `null` se não sobrou nada para mostrar. */
function limparItem(item: Item): Item | null {
  const { revisao: _r, feito: _f, origem: _o, ...base } = item as Item & { revisao?: unknown; feito?: unknown; origem?: unknown };
  const limpo = base as Item;
  switch (limpo.tipo) {
    case 'texto':
    case 'forma': {
      const doc = docSemMarcadores(limpo.doc);
      if (temTexto(limpo) && textoPuro(doc).trim().length === 0) return null;
      return { ...limpo, doc, semantica: null };
    }
    case 'moldura': {
      const { aoFocar: _a, ...m } = limpo;
      return { ...m, titulo: textoSemMarcadores(limpo.titulo) };
    }
    case 'seta':
      return { ...limpo, rotulo: textoSemMarcadores(limpo.rotulo) };
    case 'ref':
      return { ...limpo, rotulo: limpo.rotulo === null ? null : textoSemMarcadores(limpo.rotulo) };
    default:
      return limpo;
  }
}

function pontoDentro(p: [number, number], m: Item): boolean {
  return p[0] >= m.x && p[0] <= m.x + m.largura && p[1] >= m.y && p[1] <= m.y + m.altura;
}

/**
 * Os itens da moldura (ela mesma, o que está dentro dela, e as setas ligadas só a esse conjunto) que os
 * jogadores podem ver, já sem nada do mestre. Ordem do quadro (a do mapa de entrada). Moldura inexistente: [].
 */
export function itensParaJogadores(
  itens: ReadonlyMap<string, Item>,
  molduraId: string,
  estado: EstadoDoMundo,
): ItemParaJogadores[] {
  const raiz = itens.get(molduraId);
  if (!raiz || raiz.tipo !== 'moldura') return [];

  const permitido = (it: Item): boolean =>
    !it.soMestre && !ehSegredo(it) && !it.revisao && itemAtendeCondicoes(it, estado);

  const candidatos = comConteudo([molduraId], itens);
  const porId = new Map(candidatos.map((i) => [i.id, i]));

  // Uma moldura de fora leva os filhos junto: sobe a cadeia de `molduraId` até a raiz.
  const visivel = new Map<string, boolean>();
  const cadeiaOk = (it: Item): boolean => {
    const memo = visivel.get(it.id);
    if (memo !== undefined) return memo;
    visivel.set(it.id, false); // protege de ciclo
    let ok = permitido(it);
    if (ok && it.id !== molduraId) {
      const mae = it.molduraId ? porId.get(it.molduraId) : undefined;
      ok = mae ? cadeiaOk(mae) : false;
    }
    visivel.set(it.id, ok);
    return ok;
  };

  const ficam = new Map<string, Item>();
  for (const it of candidatos) {
    if (it.tipo === 'seta') continue;
    if (!cadeiaOk(it)) continue;
    const l = limparItem(it);
    if (l) ficam.set(it.id, l);
  }
  for (const it of candidatos) {
    if (it.tipo !== 'seta' || !permitido(it)) continue;
    const pontaOk = (p: typeof it.de): boolean => ('itemId' in p ? ficam.has(p.itemId) : pontoDentro(p.ponto, raiz));
    if (!pontaOk(it.de) || !pontaOk(it.para)) continue;
    const l = limparItem(it);
    if (l) ficam.set(it.id, l);
  }
  return [...itens.values()].filter((i) => ficam.has(i.id)).map((i) => ficam.get(i.id)!);
}

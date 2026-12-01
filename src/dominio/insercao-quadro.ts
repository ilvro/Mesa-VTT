// Inserção do assistente no estilo do mestre (Q9d). Puro: monta itens soltos (x = y = 0) copiando o estilo
// de itens de referência; a posição é da Q9e e a medição de altura é injetada.
import { caixaEnvolventeDeItem, type Caixa } from './camera.ts';
import { estiloDoQuadro } from './estilo-do-quadro.ts';
import { blocosDaSecao, itensDaSecao } from './estrutura-da-secao.ts';
import { PALETA_PADRAO, type PaletaDaCampanha } from './paleta.ts';
import { MOTIVO_DO_ASSISTENTE, NOTA_ALTURA, NOTA_LARGURA, posicaoLivre } from './proposta-quadro.ts';
import { secoesDoQuadro, type Secao } from './secoes-do-quadro.ts';
import {
  docDeTexto,
  novaNotaAdesiva,
  novoTexto,
  TIPOS_SEMANTICOS,
  type DocRico,
  type Item,
  type NoRico,
  type Revisao,
  type TipoSemantico,
} from './quadro.ts';

export const MAX_ITENS_POR_INSERCAO = 40;
export const MAX_TEXTO_DO_ITEM = 4000;
const TAMANHO_DO_TITULO_PADRAO = 28;
const LARGURA_PADRAO = 240;

export interface ParagrafoPedido { texto: string; como?: string }

export type ItemPedido =
  | {
      formato: 'texto' | 'titulo';
      texto?: string;
      paragrafos?: ParagrafoPedido[];
      estilo_como?: string;
      tipo?: TipoSemantico;
      largura?: number;
    }
  | { formato: 'nota'; texto: string; tipo?: TipoSemantico; estilo_como?: string }
  // Q9f: por enquanto recusado com erro legível.
  | { formato: 'imagem'; de: string; lado?: 'direita' | 'esquerda'; largura?: number };

export interface OpcoesDaInsercao {
  quadroId: string;
  /** Todos os itens do quadro (para resolver `#id` e detectar o estilo). */
  itens: readonly Item[];
  /** Seção-alvo: define o estilo detectado e a moldura do mestre. */
  secao?: Secao;
  agora: number;
  novoId: () => string;
  /** Altura necessária do texto (injetada para manter o domínio puro). */
  medir: (item: Extract<Item, { tipo: 'texto' }>) => number;
  paleta?: PaletaDaCampanha;
}

export interface Insercao {
  itens: Item[];
  /** Altura final de cada item, por id (já gravada em `item.altura`). */
  alturas: Record<string, number>;
}

type ItemTexto = Extract<Item, { tipo: 'texto' }>;
type Marca = NonNullable<NoRico['marks']>[number];

/** Acha um item por `#id` curto, prefixo ou id completo; erros legíveis (ambíguo, inexistente). */
function itemPor(itens: readonly Item[], chave: unknown, onde: string): Item {
  const id = typeof chave === 'string' ? chave.trim().replace(/^#/, '') : '';
  if (!id) throw new Error(`Informe o #id do item em ${onde}.`);
  const exato = itens.find((i) => i.id === id);
  if (exato) return exato;
  const achados = itens.filter((i) => i.id.startsWith(id));
  if (achados.length === 0) throw new Error(`Item #${id} não encontrado (em ${onde}). Veja os ids em quadro_secao.`);
  if (achados.length > 1) {
    throw new Error(`#${id} é ambíguo (em ${onde}): ${achados.slice(0, 8).map((i) => i.id.slice(0, 10)).join(', ')}. Use mais caracteres do id.`);
  }
  return achados[0]!;
}

function itemDeTexto(itens: readonly Item[], chave: unknown, onde: string): ItemTexto {
  const item = itemPor(itens, chave, onde);
  if (item.tipo !== 'texto') {
    const artigo = item.tipo === 'imagem' || item.tipo === 'forma' || item.tipo === 'moldura' ? 'uma' : 'um';
    throw new Error(`#${String(chave).replace(/^#/, '')} é ${artigo} ${item.tipo}; use um item de texto em ${onde}.`);
  }
  return item;
}

/** Marcas do trecho predominante (a combinação que cobre mais caracteres) do item; `[]` se for texto sem marcas. */
export function marcasPredominantes(doc: DocRico): Marca[] {
  const contagem = new Map<string, { marcas: Marca[]; n: number }>();
  const visitar = (no: NoRico) => {
    if (no.type === 'text') {
      const n = (no.text ?? '').length;
      if (n === 0) return;
      const estilo: Record<string, unknown> = {};
      let negrito = false;
      let italico = false;
      for (const m of no.marks ?? []) {
        if (m.type === 'bold') negrito = true;
        else if (m.type === 'italic') italico = true;
        else if (m.type === 'textStyle') {
          for (const k of ['backgroundColor', 'color', 'fontFamily', 'fontSize'] as const) {
            const v = m.attrs?.[k];
            if (typeof v === 'string' && v !== '') estilo[k] = v;
          }
        }
      }
      const marcas: Marca[] = [];
      if (negrito) marcas.push({ type: 'bold' });
      if (italico) marcas.push({ type: 'italic' });
      if (Object.keys(estilo).length > 0) marcas.push({ type: 'textStyle', attrs: estilo });
      const chave = JSON.stringify(marcas);
      const atual = contagem.get(chave);
      if (atual) atual.n += n;
      else contagem.set(chave, { marcas, n });
      return;
    }
    for (const f of no.content ?? []) visitar(f);
  };
  for (const no of doc.content) visitar(no);
  let melhor: { marcas: Marca[]; n: number } | null = null;
  for (const c of contagem.values()) if (!melhor || c.n > melhor.n) melhor = c;
  return melhor ? melhor.marcas.map((m) => (m.attrs ? { type: m.type, attrs: { ...m.attrs } } : { type: m.type })) : [];
}

function docDeParagrafos(itens: readonly Item[], pedidos: readonly ParagrafoPedido[], n: number): DocRico {
  const content: NoRico[] = [];
  pedidos.forEach((p, k) => {
    const rotulo = `o parágrafo ${k + 1} do item ${n}`;
    const texto = typeof p?.texto === 'string' ? p.texto : '';
    if (texto.trim() === '') throw new Error(`${rotulo[0]!.toUpperCase()}${rotulo.slice(1)} está vazio.`);
    const marcas = p.como ? marcasPredominantes(itemDeTexto(itens, p.como, `como (${rotulo})`).doc) : [];
    for (const linha of texto.split('\n')) {
      if (linha === '') {
        content.push({ type: 'paragraph' });
        continue;
      }
      const no: NoRico = { type: 'text', text: linha };
      if (marcas.length > 0) no.marks = marcas.map((m) => (m.attrs ? { type: m.type, attrs: { ...m.attrs } } : { type: m.type }));
      content.push({ type: 'paragraph', content: [no] });
    }
  });
  return { type: 'doc', content };
}

/**
 * Valida (erros legíveis) e monta os itens pedidos, todos com `revisao.origem = 'assistente'` e sem posição
 * (x = y = 0). A altura de texto e título vem de `medir` (com altura fixa copiada, nunca menor que a medida); a nota mantém o tamanho.
 */
export function montarInsercao(pedidos: readonly ItemPedido[], opcoes: OpcoesDaInsercao): Insercao {
  if (!Array.isArray(pedidos) || pedidos.length === 0) throw new Error('Informe ao menos um item.');
  if (pedidos.length > MAX_ITENS_POR_INSERCAO) {
    throw new Error(`São ${pedidos.length} itens; o máximo por chamada é ${MAX_ITENS_POR_INSERCAO}. Divida em mais de uma chamada.`);
  }
  const { itens, secao, agora, novoId, medir, quadroId } = opcoes;
  const paleta = opcoes.paleta ?? PALETA_PADRAO;

  // Moldura só quando a seção é uma moldura do mestre.
  let molduraId: string | null = null;
  if (secao?.tipo === 'moldura') {
    const m = itens.find((i) => i.id === secao.id);
    if (m && m.tipo === 'moldura' && m.revisao?.origem !== 'assistente') molduraId = m.id;
  }

  // Estilo detectado (só calculado se algum item precisar).
  let detectado: ReturnType<typeof estiloDoQuadro> | undefined;
  const estiloDetectado = (papel: 'titulo' | 'corpo'): ItemTexto | null => {
    if (detectado === undefined) detectado = estiloDoQuadro(itens, secao);
    const id = papel === 'titulo' ? detectado?.exemploTitulo : detectado?.exemploCorpo;
    const item = id ? itens.find((i) => i.id === id) : undefined;
    return item && item.tipo === 'texto' ? item : null;
  };

  const resultado: Item[] = [];
  const alturas: Record<string, number> = {};

  pedidos.forEach((p, k) => {
    const n = k + 1;
    const formato = (p as { formato?: unknown } | null)?.formato;
    if (formato === 'imagem') throw new Error(`Item ${n}: formato "imagem" ainda não suportado.`);
    if (formato !== 'texto' && formato !== 'titulo' && formato !== 'nota') {
      throw new Error(`Item ${n}: formato "${String(formato)}" inválido. Use texto, titulo ou nota.`);
    }
    const pedido = p as Exclude<ItemPedido, { formato: 'imagem' }>;

    const bruto = typeof pedido.tipo === 'string' ? pedido.tipo.trim() : '';
    if (bruto && !(TIPOS_SEMANTICOS as readonly string[]).includes(bruto)) {
      throw new Error(`Tipo "${bruto}" inválido no item ${n}. Tipos: ${TIPOS_SEMANTICOS.join(', ')}.`);
    }
    const tipo = (bruto || null) as TipoSemantico | null;

    // Conteúdo.
    const comoParagrafos = 'paragrafos' in pedido && pedido.paragrafos !== undefined;
    const textoSimples = typeof pedido.texto === 'string' ? pedido.texto : undefined;
    if (comoParagrafos && textoSimples !== undefined) throw new Error(`Item ${n}: use "texto" ou "paragrafos", não os dois.`);
    let doc: DocRico;
    let total: number;
    if (comoParagrafos) {
      const lista = (pedido as { paragrafos: ParagrafoPedido[] }).paragrafos;
      if (!Array.isArray(lista) || lista.length === 0) throw new Error(`Item ${n}: "paragrafos" está vazio.`);
      total = lista.reduce((s, q) => s + (typeof q?.texto === 'string' ? q.texto.length : 0), 0);
      if (total > MAX_TEXTO_DO_ITEM) throw new Error(`O item ${n} tem ${total} caracteres; o máximo é ${MAX_TEXTO_DO_ITEM}.`);
      doc = docDeParagrafos(itens, lista, n);
    } else {
      if (textoSimples === undefined || textoSimples.trim() === '') throw new Error(`O item ${n} está sem texto.`);
      total = textoSimples.length;
      if (total > MAX_TEXTO_DO_ITEM) throw new Error(`O item ${n} tem ${total} caracteres; o máximo é ${MAX_TEXTO_DO_ITEM}.`);
      doc = docDeTexto(textoSimples);
    }

    const largura = (pedido as { largura?: unknown }).largura;
    if (largura !== undefined && (typeof largura !== 'number' || !Number.isFinite(largura) || largura < 40)) {
      throw new Error(`Item ${n}: largura deve ser um número a partir de 40.`);
    }

    // Item de referência de estilo.
    let ref: ItemTexto | null = null;
    if (pedido.estilo_como) ref = itemDeTexto(itens, pedido.estilo_como, `estilo_como (item ${n})`);
    else if (formato !== 'nota') ref = estiloDetectado(formato === 'titulo' ? 'titulo' : 'corpo');

    const id = novoId();
    let item: ItemTexto;
    if (ref) {
      item = {
        ...novoTexto({ quadroId, x: 0, y: 0, largura: largura ?? ref.largura, altura: ref.altura, doc, semantica: tipo }, agora, id),
        texto: { ...ref.texto },
        caixa: { ...ref.caixa },
        alturaAuto: ref.alturaAuto,
      };
    } else if (formato === 'nota') {
      item = novaNotaAdesiva(
        { quadroId, x: 0, y: 0, largura: NOTA_LARGURA, altura: NOTA_ALTURA, doc, fundo: tipo ? paleta[tipo] : undefined, semantica: tipo },
        agora,
        id,
      );
    } else {
      item = novoTexto({ quadroId, x: 0, y: 0, largura: largura ?? LARGURA_PADRAO, doc, semantica: tipo }, agora, id);
      if (formato === 'titulo') item.texto = { ...item.texto, tamanho: TAMANHO_DO_TITULO_PADRAO };
    }
    item.molduraId = molduraId;
    const revisao: Revisao = { origem: 'assistente', tipoSugerido: tipo, motivos: [MOTIVO_DO_ASSISTENTE] };
    item.revisao = revisao;
    // O texto é novo: a altura do exemplo não serve. Altura automática = a medida; fixa = nunca menor que a medida
    // (o texto não estoura a caixa). A nota mantém o tamanho do post-it.
    if (formato !== 'nota') item.altura = item.alturaAuto ? medir(item) : Math.max(item.altura, medir(item));
    alturas[item.id] = item.altura;
    resultado.push(item);
  });

  return { itens: resultado, alturas };
}

// ---------------------------------------------------------------------------------------------------------
// Q9e: posição em coluna.

export const ESPACO_VERTICAL_PADRAO = 24;
const TOLERANCIA_DA_COLUNA = 24;

/** Onde empilhar: abaixo de um item (ou do bloco que ele abre), abaixo da coluna principal de uma seção, ou numa coluna nova ao lado. */
export type AlvoDaColuna = { abaixoDe: Item } | { abaixoDeSecao: Secao } | { aoLadoDe: Secao };

export interface OpcoesDaColuna {
  /** Com obstáculo no caminho, desce os itens da coluna abaixo do ponto em vez de recusar. */
  abrirEspaco?: boolean;
  /** Seções do quadro (calculadas de `itens` se faltar). */
  secoes?: readonly Secao[];
}

export interface PosicaoEmColuna {
  /** Canto superior esquerdo de cada item novo, na ordem dos pedidos. */
  posicoes: { x: number; y: number }[];
  /** Itens existentes que descem `dy` px (só com `abrirEspaco`). */
  empurrar: { id: string; dy: number }[];
  /** Caixa envolvente dos itens novos. */
  caixa: Caixa;
}

const curto = (id: string) => id.slice(0, 6);
const solido = (i: Item) => i.tipo !== 'seta' && i.tipo !== 'moldura';
const cruza = (a: Caixa, b: Caixa) => a.x < b.x + b.largura && a.x + a.largura > b.x && a.y < b.y + b.altura && a.y + a.altura > b.y;
const fundo = (c: Caixa) => c.y + c.altura;

/** x e fundo da coluna principal da seção: o x mais comum (±24 px) entre os itens de texto, ou entre todos se não há texto. */
function colunaPrincipal(secao: Secao, itens: readonly Item[]): { x: number; fundo: number } {
  const lista = itensDaSecao(secao, itens).filter(solido);
  const textos = lista.filter((i) => i.tipo === 'texto');
  const base = textos.length > 0 ? textos : lista;
  if (base.length === 0) return { x: secao.caixa.x, fundo: secao.caixa.y };
  let melhor: Item[] = [];
  for (const a of base) {
    const grupo = base.filter((b) => Math.abs(b.x - a.x) <= TOLERANCIA_DA_COLUNA);
    if (grupo.length > melhor.length || (grupo.length === melhor.length && a.x < melhor[0]!.x)) melhor = grupo;
  }
  const x = Math.min(...melhor.map((i) => i.x));
  return { x, fundo: Math.max(...melhor.map((i) => fundo(caixaEnvolventeDeItem(i)))) };
}

/**
 * Posiciona itens novos (de `alturas` e `larguras` já medidas) empilhados com `espaco` px entre eles, conforme o alvo.
 * Nada se sobrepõe a nada (molduras e setas não contam como obstáculo): com obstáculo e sem `abrirEspaco` lança um erro
 * que diz o que está no caminho; com `abrirEspaco`, devolve em `empurrar` os itens da mesma coluna abaixo do ponto.
 */
export function posicionarEmColuna(
  alturas: readonly number[],
  larguras: readonly number[],
  itens: readonly Item[],
  alvo: AlvoDaColuna,
  espaco: number,
  opcoes: OpcoesDaColuna = {},
): PosicaoEmColuna {
  if (alturas.length === 0 || alturas.length !== larguras.length) throw new Error('Nada a posicionar.');
  const secoes = opcoes.secoes ?? secoesDoQuadro(itens);
  const largura = Math.max(...larguras);
  const total = alturas.reduce((s, h) => s + h, 0) + espaco * (alturas.length - 1);
  const empilhar = (x: number, y0: number): { x: number; y: number }[] => {
    let y = y0;
    return alturas.map((h) => {
      const p = { x, y };
      y += h + espaco;
      return p;
    });
  };
  const resposta = (posicoes: { x: number; y: number }[], empurrar: { id: string; dy: number }[]): PosicaoEmColuna => ({
    posicoes,
    empurrar,
    caixa: { x: posicoes[0]!.x, y: posicoes[0]!.y, largura, altura: total },
  });

  if ('aoLadoDe' in alvo) {
    const p = posicaoLivre({ largura, altura: total }, itens, alvo.aoLadoDe.caixa);
    return resposta(empilhar(p.x, p.y), []);
  }

  // Âncora: x da coluna e fundo do ponto.
  let x: number;
  let fimDoPonto: number;
  let secao: Secao | undefined;
  if ('abaixoDe' in alvo) {
    const item = alvo.abaixoDe;
    if (item.tipo === 'seta') throw new Error(`#${curto(item.id)} é uma seta; escolha um item de texto, imagem ou forma.`);
    if (item.tipo === 'moldura') throw new Error(`#${curto(item.id)} é uma moldura; passe a seção (id ou título) em abaixo_de.`);
    secao = secoes.find((s) => s.itemIds.includes(item.id));
    x = item.x;
    fimDoPonto = fundo(caixaEnvolventeDeItem(item));
    const bloco = secao ? blocosDaSecao(secao, itens).find((b) => b.tituloId === item.id) : undefined;
    if (bloco) {
      const porId = new Map(itens.map((i) => [i.id, i]));
      for (const id of bloco.itemIds) {
        const it = porId.get(id);
        if (it && solido(it)) fimDoPonto = Math.max(fimDoPonto, fundo(caixaEnvolventeDeItem(it)));
      }
    }
  } else {
    secao = alvo.abaixoDeSecao;
    const c = colunaPrincipal(secao, itens);
    x = c.x;
    fimDoPonto = c.fundo;
  }

  const y0 = fimDoPonto + espaco;
  const posicoes = empilhar(x, y0);
  const regiao: Caixa = { x, y: y0, largura, altura: total + espaco };
  const obstaculos = itens
    .filter(solido)
    .map((i) => ({ item: i, caixa: caixaEnvolventeDeItem(i) }))
    .filter((o) => cruza(regiao, o.caixa))
    .sort((a, b) => a.caixa.y - b.caixa.y);
  if (obstaculos.length === 0) return resposta(posicoes, []);

  if (!opcoes.abrirEspaco) {
    const o = obstaculos[0]!.item;
    const dist = Math.round(obstaculos[0]!.caixa.y - fimDoPonto);
    const sec = secoes.find((s) => s.itemIds.includes(o.id));
    const bloco = sec ? blocosDaSecao(sec, itens).find((b) => b.tituloId === o.id || b.itemIds.includes(o.id)) : undefined;
    const onde = dist >= 0 ? `começa ${dist} px abaixo` : `ocupa o espaço`;
    const quem = bloco ? `o bloco "${bloco.titulo}"` : `o item #${curto(o.id)}`;
    throw new Error(`Não há espaço livre: ${quem} ${onde}. Use abrir_espaco: true (desce a coluna) ou outro abaixo_de.`);
  }

  // Desce, pela altura inserida mais o espaço, o que está abaixo do ponto na coluna e na seção.
  const dy = total + espaco;
  const coluna = { x, largura };
  const empurrados = itens
    .filter((i) => solido(i) && fundo(caixaEnvolventeDeItem(i)) > fimDoPonto && caixaEnvolventeDeItem(i).y >= fimDoPonto - 1)
    .filter((i) => {
      // A coluna e, na mesma seção, o que fica ao lado dela (imagens dos blocos seguintes descem junto com o texto).
      if (secao?.itemIds.includes(i.id)) return true;
      const c = caixaEnvolventeDeItem(i);
      return c.x < coluna.x + coluna.largura && c.x + c.largura > coluna.x;
    });
  const ids = new Set(empurrados.map((i) => i.id));
  const preso = obstaculos.find((o) => !ids.has(o.item.id));
  if (preso) throw new Error(`Não há espaço livre: o item #${curto(preso.item.id)} atravessa o ponto e não é da coluna; abrir_espaco não o move. Escolha outro abaixo_de ou ao_lado_de.`);
  for (const i of empurrados) {
    const depois = { ...caixaEnvolventeDeItem(i) };
    depois.y += dy;
    for (const o of itens) {
      if (!solido(o) || ids.has(o.id)) continue;
      if (cruza(depois, caixaEnvolventeDeItem(o))) {
        throw new Error(`Abrir espaço faria o item #${curto(i.id)} bater no item #${curto(o.id)}. Escolha outro abaixo_de ou ao_lado_de.`);
      }
    }
  }
  return resposta(posicoes, empurrados.map((i) => ({ id: i.id, dy })));
}

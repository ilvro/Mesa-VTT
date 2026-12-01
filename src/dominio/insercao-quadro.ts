// Inserção do assistente no estilo do mestre (Q9d). Puro: monta itens soltos (x = y = 0) copiando o estilo
// de itens de referência; a posição é da Q9e e a medição de altura é injetada.
import { caixaEnvolventeDeItem, type Caixa } from './camera.ts';
import { estiloDoQuadro } from './estilo-do-quadro.ts';
import { caixaDaSeta } from './setas.ts';
import { blocosDaSecao, itensDaSecao } from './estrutura-da-secao.ts';
import { PALETA_PADRAO, type PaletaDaCampanha } from './paleta.ts';
import { MOTIVO_DO_ASSISTENTE, NOTA_ALTURA, NOTA_LARGURA, posicaoLivre } from './proposta-quadro.ts';
import { secoesDoQuadro, type Secao } from './secoes-do-quadro.ts';
import {
  docDeTexto,
  novaImagem,
  novaNotaAdesiva,
  novaSeta,
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
const LARGURA_PADRAO_DA_IMAGEM = 320;

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
  // Q9f: `de` = "#id" (imagem do quadro) ou "entidade:<nome ou id>" (retrato, resolvido por `retratos`).
  | { formato: 'imagem'; de: string; lado?: 'direita' | 'esquerda'; largura?: number };

export type LadoDaImagem = 'direita' | 'esquerda';

/** Uma imagem já guardada no banco de imagens do quadro (a de um item existente ou o retrato de uma entidade). */
export interface ImagemResolvida { imagemId: string; larguraOriginal: number; alturaOriginal: number; nome?: string }

/** Ponta de uma seta pedida: índice (base 0) de um item criado na mesma chamada, ou `#id` de um item existente. */
export interface PedidoDeSeta { de: number | string; para: number | string; rotulo?: string }

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
  /** Largura (px) do texto numa linha só, com padding; `null` se não dá para medir (Q9n). Sem isto, o título mantém a largura copiada. */
  medirLargura?: (item: Extract<Item, { tipo: 'texto' }>) => number | null;
  paleta?: PaletaDaCampanha;
  /** Retratos já resolvidos (e guardados no banco de imagens), pela chave `de` do pedido (ex.: "entidade:Aldric"). */
  retratos?: ReadonlyMap<string, ImagemResolvida>;
}

/** Quanto o título (e o futuro rótulo) pode alargar além da largura copiada do exemplo. */
export const FATOR_MAXIMO_DE_LARGURA = 1.5;

/**
 * Largura de um item que deve caber numa linha (título; futuro rótulo): a medida do texto arredondada para cima,
 * no mínimo a largura copiada (se o texto cabe nela) e no máximo 1,5 × a copiada. Sem medida, a copiada.
 */
export function larguraDeUmaLinha(copiada: number, medida: number | null | undefined): number {
  if (medida == null || !Number.isFinite(medida)) return copiada;
  return Math.max(copiada, Math.min(Math.ceil(medida), copiada * FATOR_MAXIMO_DE_LARGURA));
}

export interface Insercao {
  itens: Item[];
  /** Por item: o lado em que a imagem fica ao lado do texto anterior, ou null (entra na coluna). */
  lados: (LadoDaImagem | null)[];
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
 * (x = y = 0). A altura de texto e título vem de `medir`; a nota mantém o tamanho.
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
  const lados: (LadoDaImagem | null)[] = [];
  const alturas: Record<string, number> = {};
  let larguraPadraoDaImagem: number | undefined;

  pedidos.forEach((p, k) => {
    const n = k + 1;
    const formato = (p as { formato?: unknown } | null)?.formato;
    if (formato === 'imagem') {
      const pi = p as Extract<ItemPedido, { formato: 'imagem' }>;
      const lado = pi.lado as unknown;
      if (lado !== undefined && lado !== 'direita' && lado !== 'esquerda') throw new Error(`Item ${n}: lado "${String(lado)}" inválido. Use direita ou esquerda.`);
      if (pi.largura !== undefined && (typeof pi.largura !== 'number' || !Number.isFinite(pi.largura) || pi.largura < 40)) {
        throw new Error(`Item ${n}: largura deve ser um número a partir de 40.`);
      }
      const chave = typeof pi.de === 'string' ? pi.de.trim() : '';
      if (!chave) throw new Error(`Item ${n}: imagem sem "de" (#id de uma imagem do quadro ou entidade:<nome>).`);
      let origem: ImagemResolvida;
      if (/^entidade:/i.test(chave)) {
        const r = opcoes.retratos?.get(chave);
        if (!r) throw new Error(`Item ${n}: o retrato de "${chave.slice(chave.indexOf(':') + 1).trim()}" não está disponível.`);
        origem = r;
      } else {
        const fonte = itemPor(itens, chave, `de (item ${n})`);
        if (fonte.tipo !== 'imagem') throw new Error(`Item ${n}: #${fonte.id.slice(0, 6)} é ${fonte.tipo === 'forma' ? 'uma' : 'um'} ${fonte.tipo}, não uma imagem. Use o #id de uma imagem ou entidade:<nome>.`);
        origem = fonte;
      }
      if (larguraPadraoDaImagem === undefined) larguraPadraoDaImagem = (secao ? estiloDoQuadro(itens, secao)?.imagens?.largura : undefined) || LARGURA_PADRAO_DA_IMAGEM;
      const lo = origem.larguraOriginal > 0 ? origem.larguraOriginal : 1;
      const ao = origem.alturaOriginal > 0 ? origem.alturaOriginal : 1;
      const larguraDaImagem = pi.largura ?? larguraPadraoDaImagem;
      const img = novaImagem(
        { quadroId, x: 0, y: 0, imagemId: origem.imagemId, larguraOriginal: origem.larguraOriginal, alturaOriginal: origem.alturaOriginal, largura: larguraDaImagem, altura: Math.max(20, Math.round((larguraDaImagem * ao) / lo)) },
        agora,
        novoId(),
      );
      img.molduraId = molduraId;
      img.revisao = { origem: 'assistente', tipoSugerido: null, motivos: [MOTIVO_DO_ASSISTENTE] };
      alturas[img.id] = img.altura;
      resultado.push(img);
      lados.push(lado ?? null);
      return;
    }
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
    // O texto é novo: a altura do exemplo não serve (o corpo copia o estilo de um exemplo qualquer, e a caixa dele
    // pode ter o triplo do texto novo). Texto e título têm a altura medida; a nota mantém o tamanho do post-it.
    // Título sem largura explícita: alarga até caber numa linha (limite 1,5×) antes de medir a altura.
    if (formato === 'titulo' && largura === undefined && opcoes.medirLargura) {
      item.largura = larguraDeUmaLinha(item.largura, opcoes.medirLargura(item));
    }
    if (formato !== 'nota') item.altura = medir(item);
    alturas[item.id] = item.altura;
    resultado.push(item);
    lados.push(null);
  });

  return { itens: resultado, lados, alturas };
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
  /** `esquerda` (padrão): todos pela borda esquerda; `centro`: o centro de cada item no eixo da coluna. */
  alinhar?: 'esquerda' | 'centro';
  /** Eixo absoluto (x) com `abaixoDeSecao` e `centro`; sem ele, o centro da coluna principal da seção. */
  eixo?: number;
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
  const centrado = opcoes.alinhar === 'centro';
  /** Com `x` = borda esquerda (esquerda) ou eixo (centro). */
  const empilhar = (x: number, y0: number): { x: number; y: number }[] => {
    let y = y0;
    return alturas.map((h, k) => {
      const p = { x: centrado ? Math.round(x - larguras[k]! / 2) : x, y };
      y += h + espaco;
      return p;
    });
  };
  /** Extensão horizontal real dos itens novos. */
  const extensao = (posicoes: { x: number }[]): { x: number; largura: number } => {
    const x0 = Math.min(...posicoes.map((p) => p.x));
    return { x: x0, largura: Math.max(...posicoes.map((p, k) => p.x + larguras[k]!)) - x0 };
  };
  const resposta = (posicoes: { x: number; y: number }[], empurrar: { id: string; dy: number }[]): PosicaoEmColuna => {
    const ext = extensao(posicoes);
    return { posicoes, empurrar, caixa: { x: ext.x, y: posicoes[0]!.y, largura: ext.largura, altura: total } };
  };

  if ('aoLadoDe' in alvo) {
    const p = posicaoLivre({ largura, altura: total }, itens, alvo.aoLadoDe.caixa);
    return resposta(empilhar(centrado ? p.x + largura / 2 : p.x, p.y), []);
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
    x = centrado ? item.x + item.largura / 2 : item.x;
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
    x = centrado ? (opcoes.eixo ?? c.x + largura / 2) : c.x;
    fimDoPonto = c.fundo;
  }

  const y0 = fimDoPonto + espaco;
  const posicoes = empilhar(x, y0);
  const ext = extensao(posicoes);
  const regiao: Caixa = { x: ext.x, y: y0, largura: ext.largura, altura: total + espaco };
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
  const coluna = { x: ext.x, largura: ext.largura };
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


// ---------------------------------------------------------------------------------------------------------
// Q9l: grupos (linha e grade de células) em 2D.

/** Uma célula é uma lista de itens empilhados (um cartão). */
export type CelulaPedida = ItemPedido[];
export interface GrupoEmLinha { linha: CelulaPedida[]; espaco?: number; largura_da_celula?: number }
export interface GrupoEmGrade { grade: CelulaPedida[]; colunas: number; espaco?: number; largura_da_celula?: number }
export type GrupoPedido = GrupoEmLinha | GrupoEmGrade;
export type EntradaPedida = ItemPedido | GrupoPedido;

/** Estrutura dos pedidos: itens soltos e grupos, em ordem; os números são índices na lista achatada de itens. */
export type SegmentoPedido =
  | { tipo: 'solto'; indice: number }
  | { tipo: 'grupo'; espaco: number | undefined; fileiras: number[][][] };

const ehGrupo = (e: unknown): e is GrupoPedido => !!e && typeof e === 'object' && ('linha' in e || 'grade' in e);

/**
 * Achata as entradas (itens e grupos) na lista de itens que `montarInsercao` aceita, na ordem fileira por fileira, célula por
 * célula, item por item (a dos índices das setas). `largura_da_celula` força a largura de texto, título e imagem das células.
 */
export function achatarPedidos(entradas: readonly EntradaPedida[]): { itens: ItemPedido[]; estrutura: SegmentoPedido[] } {
  if (!Array.isArray(entradas) || entradas.length === 0) throw new Error('Informe ao menos um item.');
  const itens: ItemPedido[] = [];
  const estrutura: SegmentoPedido[] = [];
  entradas.forEach((e, k) => {
    if (!ehGrupo(e)) {
      estrutura.push({ tipo: 'solto', indice: itens.length });
      itens.push(e);
      return;
    }
    const onde = `Grupo ${k + 1}`;
    const g = e as { linha?: unknown; grade?: unknown; colunas?: unknown; espaco?: unknown; largura_da_celula?: unknown };
    if (g.linha !== undefined && g.grade !== undefined) throw new Error(`${onde}: use "linha" ou "grade", não os dois.`);
    const celulas = g.linha !== undefined ? g.linha : g.grade;
    const nome = g.linha !== undefined ? 'linha' : 'grade';
    if (!Array.isArray(celulas) || celulas.length === 0) throw new Error(`${onde}: "${nome}" deve ser uma lista de células (cada uma, uma lista de itens).`);
    let colunas = celulas.length;
    if (nome === 'grade') {
      if (typeof g.colunas !== 'number' || !Number.isInteger(g.colunas) || g.colunas < 1) throw new Error(`${onde}: a grade precisa de "colunas" (inteiro a partir de 1).`);
      colunas = g.colunas;
    } else if (g.colunas !== undefined) throw new Error(`${onde}: "colunas" é só da grade.`);
    if (g.espaco !== undefined && (typeof g.espaco !== 'number' || !Number.isFinite(g.espaco) || g.espaco < 0)) throw new Error(`${onde}: espaco deve ser um número a partir de 0.`);
    const forcada = g.largura_da_celula;
    if (forcada !== undefined && (typeof forcada !== 'number' || !Number.isFinite(forcada) || forcada < 40)) throw new Error(`${onde}: largura_da_celula deve ser um número a partir de 40.`);
    const fileiras: number[][][] = [];
    celulas.forEach((cel: unknown, c: number) => {
      if (!Array.isArray(cel) || cel.length === 0) throw new Error(`${onde}, célula ${c + 1}: deve ser uma lista com ao menos um item.`);
      const indices: number[] = [];
      for (const it of cel as ItemPedido[]) {
        if (ehGrupo(it)) throw new Error(`${onde}, célula ${c + 1}: grupo dentro de célula não é suportado.`);
        const f = (it as { formato?: unknown } | null)?.formato;
        if (f === 'imagem' && (it as { lado?: unknown }).lado !== undefined) {
          throw new Error(`${onde}, célula ${c + 1}: imagem com "lado" não vale dentro de célula; ela entra empilhada. Tire o lado.`);
        }
        const copia = (it && typeof it === 'object' ? { ...it } : it) as ItemPedido;
        if (forcada !== undefined && (f === 'texto' || f === 'titulo' || f === 'imagem')) (copia as { largura?: number }).largura = forcada;
        indices.push(itens.length);
        itens.push(copia);
      }
      if (c % colunas === 0) fileiras.push([]);
      fileiras[fileiras.length - 1]!.push(indices);
    });
    estrutura.push({ tipo: 'grupo', espaco: typeof g.espaco === 'number' ? g.espaco : undefined, fileiras });
  });
  return { itens, estrutura };
}

export interface LayoutDeBlocos {
  /** Altura e largura de cada bloco da coluna (item solto ou grupo), na ordem da estrutura. */
  alturas: number[];
  larguras: number[];
  /** Com as posições dos blocos (de `posicionarEmColuna`), a posição de cada item achatado (null: nenhum bloco o contém, ex.: imagem com `lado`). */
  espalhar(posicoes: readonly { x: number; y: number }[]): ({ x: number; y: number } | null)[];
}

/**
 * Mede os blocos da coluna. Itens soltos são blocos de um item; um grupo é um bloco com as células lado a lado (alinhadas pelo
 * topo, `espaco` entre elas, padrão: espaço da coluna × 3, mínimo 24; entre as fileiras da grade vale o mesmo espaço). Cada fileira
 * fica centrada no bloco (alinhar `centro`) ou à esquerda; na grade as células têm todas a mesma largura (a maior). Dentro da
 * célula os itens empilham com `espacoDaColuna`, cada um centrado se a célula for mais larga.
 */
export function layoutDeBlocos(estrutura: readonly SegmentoPedido[], itens: readonly Item[], espacoDaColuna: number, alinhar: 'esquerda' | 'centro'): LayoutDeBlocos {
  const alturas: number[] = [];
  const larguras: number[] = [];
  type Interno = { indice: number; dx: number; dy: number };
  const internos: Interno[][] = [];
  const centrado = alinhar === 'centro';
  for (const seg of estrutura) {
    if (seg.tipo === 'solto') {
      const it = itens[seg.indice]!;
      alturas.push(it.altura);
      larguras.push(it.largura);
      internos.push([{ indice: seg.indice, dx: 0, dy: 0 }]);
      continue;
    }
    const gap = seg.espaco ?? Math.max(24, espacoDaColuna * 3);
    const celulaW = (cel: number[]) => Math.max(...cel.map((i) => itens[i]!.largura));
    const celulaH = (cel: number[]) => cel.reduce((s, i) => s + itens[i]!.altura, 0) + espacoDaColuna * (cel.length - 1);
    const todas = seg.fileiras.flat();
    const uniforme = seg.fileiras.length > 1 ? Math.max(...todas.map(celulaW)) : undefined;
    const larguraDaCelula = (cel: number[]) => uniforme ?? celulaW(cel);
    const larguraDaFileira = (f: number[][]) => f.reduce((s, c) => s + larguraDaCelula(c), 0) + gap * (f.length - 1);
    const larguraTotal = Math.max(...seg.fileiras.map(larguraDaFileira));
    const lista: Interno[] = [];
    let y = 0;
    seg.fileiras.forEach((f, r) => {
      let x = centrado ? Math.round((larguraTotal - larguraDaFileira(f)) / 2) : 0;
      const altura = Math.max(...f.map(celulaH));
      for (const cel of f) {
        const w = larguraDaCelula(cel);
        let yi = y;
        for (const i of cel) {
          lista.push({ indice: i, dx: x + Math.round((w - itens[i]!.largura) / 2), dy: yi });
          yi += itens[i]!.altura + espacoDaColuna;
        }
        x += w + gap;
      }
      y += altura + (r < seg.fileiras.length - 1 ? gap : 0);
    });
    alturas.push(y);
    larguras.push(larguraTotal);
    internos.push(lista);
  }
  return {
    alturas,
    larguras,
    espalhar(posicoes) {
      const saida: ({ x: number; y: number } | null)[] = itens.map(() => null);
      internos.forEach((lista, b) => {
        const p = posicoes[b]!;
        for (const { indice, dx, dy } of lista) saida[indice] = { x: p.x + dx, y: p.y + dy };
      });
      return saida;
    },
  };
}

// ---------------------------------------------------------------------------------------------------------
// Q9f: imagens ao lado do texto anterior e setas.

/**
 * Completa as posições dos itens novos: as imagens com `lado` ficam ao lado do item de coluna anterior (que não seja imagem),
 * alinhadas pelo topo, a `espaco` px dele; não ocupam altura na coluna. Recusa se a imagem bater em algo (existente, já
 * descido por `empurrar`, ou novo). `posicoes` traz as posições da coluna (null onde há `lado`); devolve todas preenchidas.
 */
export function posicionarImagensAoLado(
  novos: readonly Item[],
  lados: readonly (LadoDaImagem | null)[],
  posicoes: readonly ({ x: number; y: number } | null)[],
  itens: readonly Item[],
  empurrar: readonly { id: string; dy: number }[] = [],
  espaco: number = ESPACO_VERTICAL_PADRAO,
): { x: number; y: number }[] {
  const dy = new Map(empurrar.map((e) => [e.id, e.dy]));
  const existentes = itens.filter(solido).map((i) => {
    const c = caixaEnvolventeDeItem(i);
    return { id: i.id, caixa: { ...c, y: c.y + (dy.get(i.id) ?? 0) } };
  });
  const saida: ({ x: number; y: number } | null)[] = posicoes.map((p) => (p ? { ...p } : null));
  const ocupados: { id: string; caixa: Caixa }[] = [];
  novos.forEach((it, k) => {
    const p = saida[k];
    if (p && lados[k] === null) ocupados.push({ id: it.id, caixa: { x: p.x, y: p.y, largura: it.largura, altura: it.altura } });
  });
  novos.forEach((it, k) => {
    const lado = lados[k];
    if (!lado) return;
    let j = k - 1;
    while (j >= 0 && (lados[j] !== null || novos[j]!.tipo === 'imagem' || !saida[j])) j--;
    if (j < 0) throw new Error(`Item ${k + 1}: a imagem com lado precisa de um item de texto antes dela na mesma chamada.`);
    const ancora = saida[j]!;
    const x = lado === 'direita' ? ancora.x + novos[j]!.largura + espaco : ancora.x - espaco - it.largura;
    const caixa: Caixa = { x, y: ancora.y, largura: it.largura, altura: it.altura };
    const batida = [...existentes, ...ocupados].find((o) => cruza(caixa, o.caixa));
    if (batida) {
      const nova = novos.some((n) => n.id === batida.id);
      throw new Error(
        `A imagem do item ${k + 1} (à ${lado}) bateria em ${nova ? 'outro item novo' : `#${curto(batida.id)}`}. Tente o outro lado, outro abaixo_de ou tire o lado (entra na coluna).`,
      );
    }
    saida[k] = { x, y: ancora.y };
    ocupados.push({ id: it.id, caixa });
  });
  return saida as { x: number; y: number }[];
}

export interface OpcoesDasSetas {
  quadroId: string;
  /** Itens existentes do quadro (para `#id` e para copiar o estilo da seta mais comum do mestre). */
  itens: readonly Item[];
  /** Itens criados na chamada, já com x e y finais (as pontas por índice apontam para eles). */
  novos: readonly Item[];
  agora: number;
  novoId: () => string;
}

export const MAX_SETAS_POR_INSERCAO = 40;

/** A seta mais comum do mestre (cor, espessura, tracejado, cabeças, rota); `null` se o mestre não fez nenhuma. */
function estiloDaSetaDoMestre(itens: readonly Item[]): Pick<Extract<Item, { tipo: 'seta' }>, 'cor' | 'espessura' | 'tracejado' | 'inicio' | 'fim' | 'rota'> | null {
  const contagem = new Map<string, { n: number; estilo: ReturnType<typeof estiloDaSetaDoMestre> }>();
  for (const i of itens) {
    if (i.tipo !== 'seta' || i.revisao?.origem === 'assistente') continue;
    const estilo = { cor: i.cor, espessura: i.espessura, tracejado: i.tracejado, inicio: i.inicio, fim: i.fim, rota: i.rota };
    const chave = JSON.stringify(estilo);
    const c = contagem.get(chave);
    if (c) c.n++;
    else contagem.set(chave, { n: 1, estilo });
  }
  let melhor: { n: number; estilo: ReturnType<typeof estiloDaSetaDoMestre> } | null = null;
  for (const c of contagem.values()) if (!melhor || c.n > melhor.n) melhor = c;
  return melhor?.estilo ?? null;
}

/** Monta as setas pedidas (com `revisao` do assistente e o estilo da seta mais comum do mestre); ponta inválida lança erro legível. */
export function montarSetas(pedidos: readonly PedidoDeSeta[], opcoes: OpcoesDasSetas): Extract<Item, { tipo: 'seta' }>[] {
  if (!Array.isArray(pedidos)) throw new Error('"setas" deve ser uma lista de { de, para, rotulo? }.');
  if (pedidos.length > MAX_SETAS_POR_INSERCAO) {
    throw new Error(`São ${pedidos.length} setas; o máximo por chamada é ${MAX_SETAS_POR_INSERCAO}.`);
  }
  const { quadroId, itens, novos, agora, novoId } = opcoes;
  const estilo = estiloDaSetaDoMestre(itens);
  const mapa = new Map<string, Item>([...itens, ...novos].map((i) => [i.id, i]));
  const z0 = Math.max(0, ...[...mapa.values()].map((i) => i.z));
  const ponta = (v: unknown, qual: 'de' | 'para', n: number): Item => {
    const onde = `seta ${n}, "${qual}"`;
    const indice = typeof v === 'number' ? v : typeof v === 'string' && /^\d+$/.test(v.trim()) ? Number(v) : null;
    let item: Item;
    if (indice !== null) {
      if (!Number.isInteger(indice) || indice < 0 || indice >= novos.length) {
        throw new Error(`${onde[0]!.toUpperCase()}${onde.slice(1)}: o índice ${String(v)} não existe; os itens novos vão de 0 a ${novos.length - 1}.`);
      }
      item = novos[indice]!;
    } else if (typeof v === 'string' && v.trim().startsWith('#')) {
      item = itemPor(itens, v, onde);
    } else {
      throw new Error(`${onde[0]!.toUpperCase()}${onde.slice(1)}: use o índice (0 a ${novos.length - 1}) de um item novo ou o #id de um item existente.`);
    }
    if (item.tipo === 'seta') throw new Error(`${onde[0]!.toUpperCase()}${onde.slice(1)}: #${curto(item.id)} é uma seta; ligue itens de texto, imagem ou forma.`);
    return item;
  };
  return pedidos.map((p, k) => {
    const n = k + 1;
    const de = ponta(p?.de, 'de', n);
    const para = ponta(p?.para, 'para', n);
    if (de.id === para.id) throw new Error(`Seta ${n}: "de" e "para" são o mesmo item.`);
    const rotulo = typeof p.rotulo === 'string' ? p.rotulo.trim() : '';
    const base = { de: { itemId: de.id, lado: 'auto' as const }, para: { itemId: para.id, lado: 'auto' as const } };
    const seta = novaSeta(
      { quadroId, ...base, ...(estilo ? { rota: estilo.rota, cor: estilo.cor, espessura: estilo.espessura } : {}), rotulo, z: z0 + 1 + k },
      agora,
      novoId(),
    );
    if (estilo) {
      seta.tracejado = estilo.tracejado;
      seta.inicio = estilo.inicio;
      seta.fim = estilo.fim;
    }
    Object.assign(seta, caixaDaSeta(seta, mapa));
    seta.revisao = { origem: 'assistente', tipoSugerido: null, motivos: [MOTIVO_DO_ASSISTENTE] };
    return seta;
  });
}

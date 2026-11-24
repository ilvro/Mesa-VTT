// Propostas do assistente (L4a). Puro: acha um lugar livre no quadro e monta a moldura "✦ título" com as notas.
import { caixaEnvolventeDeItem, type Caixa } from './camera.ts';
import { docDeTexto, novaMoldura, novaNotaAdesiva, TIPOS_SEMANTICOS, type Item, type Revisao, type TipoSemantico } from './quadro.ts';
import { PALETA_PADRAO, type PaletaDaCampanha } from './paleta.ts';

export const MARGEM_ENTRE_SECOES = 80;
export const MARGEM_DE_COLISAO = 40;
export const MAX_NOTAS_POR_PROPOSTA = 30;
export const MAX_TEXTO_DA_NOTA = 2000;
export const MAX_TITULO_DA_PROPOSTA = 120;
export const MOTIVO_DO_ASSISTENTE = 'Proposta do assistente';
export const NOTA_LARGURA = 240;
export const NOTA_ALTURA = 160;
export const NOTA_ESPACO = 24;
export const NOTA_COLUNAS = 3;
const TOPO_DA_MOLDURA = 48;
const FUNDO_NEUTRO = '#f3e9a6';
const MAX_TENTATIVAS = 60;

export interface NotaProposta { texto: string; tipo?: string | null }

function livre(c: Caixa, caixas: readonly Caixa[]): boolean {
  const m = MARGEM_DE_COLISAO;
  for (const b of caixas) {
    if (c.x < b.x + b.largura + m && c.x + c.largura + m > b.x && c.y < b.y + b.altura + m && c.y + c.altura + m > b.y) return false;
  }
  return true;
}

/**
 * Posição (canto superior esquerdo) do primeiro retângulo do tamanho de `desejada` que não toca nenhum item
 * (caixa envolvente + 40 px). Com `perto`, procura à direita dela (+80 px) e depois abaixo; sem `perto`, ou se
 * nada servir em até 60 tentativas por lado, fica à direita de tudo.
 */
export function posicaoLivre(
  desejada: Pick<Caixa, 'largura' | 'altura'>,
  itens: Iterable<Item>,
  perto: Caixa | null,
): { x: number; y: number } {
  const caixas: Caixa[] = [];
  let direita = -Infinity;
  let topo = Infinity;
  for (const i of itens) {
    if (i.tipo === 'seta') continue;
    const c = caixaEnvolventeDeItem(i);
    caixas.push(c);
    direita = Math.max(direita, c.x + c.largura);
    topo = Math.min(topo, c.y);
  }
  const tamanho = { largura: desejada.largura, altura: desejada.altura };
  if (perto) {
    const passoY = Math.max(40, desejada.altura / 2);
    const passoX = Math.max(40, desejada.largura / 2);
    const x0 = perto.x + perto.largura + MARGEM_ENTRE_SECOES;
    for (let k = 0; k < MAX_TENTATIVAS; k++) {
      const c = { x: x0, y: perto.y + k * passoY, ...tamanho };
      if (livre(c, caixas)) return { x: c.x, y: c.y };
    }
    const y0 = perto.y + perto.altura + MARGEM_ENTRE_SECOES;
    for (let k = 0; k < MAX_TENTATIVAS; k++) {
      const c = { x: perto.x + k * passoX, y: y0, ...tamanho };
      if (livre(c, caixas)) return { x: c.x, y: c.y };
    }
  }
  if (caixas.length === 0) return perto ? { x: perto.x + perto.largura + MARGEM_ENTRE_SECOES, y: perto.y } : { x: 0, y: 0 };
  return { x: direita + MARGEM_ENTRE_SECOES, y: perto ? Math.min(topo, perto.y) : topo };
}

/** Tamanho da moldura para `n` notas em grade de 3 colunas. */
export function tamanhoDaProposta(n: number): { largura: number; altura: number } {
  const colunas = Math.max(1, Math.min(NOTA_COLUNAS, n));
  const linhas = Math.max(1, Math.ceil(n / NOTA_COLUNAS));
  return {
    largura: NOTA_ESPACO * 2 + colunas * NOTA_LARGURA + (colunas - 1) * NOTA_ESPACO,
    altura: TOPO_DA_MOLDURA + NOTA_ESPACO + linhas * NOTA_ALTURA + (linhas - 1) * NOTA_ESPACO,
  };
}

export interface OpcoesDaProposta {
  quadroId: string;
  /** Canto superior esquerdo da moldura. */
  x: number;
  y: number;
  agora: number;
  novoId: () => string;
  paleta?: PaletaDaCampanha;
}

export interface Proposta { moldura: Extract<Item, { tipo: 'moldura' }>; notas: Extract<Item, { tipo: 'texto' }>[]; itens: Item[] }

/** Valida (erros legíveis) e monta a moldura e as notas, todas com `revisao.origem = 'assistente'`. */
export function montarProposta(titulo: string, notas: readonly NotaProposta[], opcoes: OpcoesDaProposta): Proposta {
  const t = typeof titulo === 'string' ? titulo.trim() : '';
  if (!t) throw new Error('Informe o título da proposta.');
  if (t.length > MAX_TITULO_DA_PROPOSTA) throw new Error(`O título tem ${t.length} caracteres; o máximo é ${MAX_TITULO_DA_PROPOSTA}.`);
  if (!Array.isArray(notas) || notas.length === 0) throw new Error('Informe ao menos uma nota.');
  if (notas.length > MAX_NOTAS_POR_PROPOSTA) throw new Error(`São ${notas.length} notas; o máximo por chamada é ${MAX_NOTAS_POR_PROPOSTA}. Divida em mais de uma proposta.`);
  const paleta = opcoes.paleta ?? PALETA_PADRAO;
  const revisao = (tipo: TipoSemantico | null): Revisao => ({ tipoSugerido: tipo, motivos: [MOTIVO_DO_ASSISTENTE], origem: 'assistente' });
  const validadas = notas.map((n, i) => {
    const texto = typeof n?.texto === 'string' ? n.texto.trim() : '';
    if (!texto) throw new Error(`A nota ${i + 1} está sem texto.`);
    if (texto.length > MAX_TEXTO_DA_NOTA) throw new Error(`A nota ${i + 1} tem ${texto.length} caracteres; o máximo é ${MAX_TEXTO_DA_NOTA}.`);
    const bruto = typeof n.tipo === 'string' ? n.tipo.trim() : '';
    if (bruto && !(TIPOS_SEMANTICOS as readonly string[]).includes(bruto)) {
      throw new Error(`Tipo "${bruto}" inválido na nota ${i + 1}. Tipos: ${TIPOS_SEMANTICOS.join(', ')}.`);
    }
    return { texto, tipo: (bruto || null) as TipoSemantico | null };
  });
  const { largura, altura } = tamanhoDaProposta(validadas.length);
  const moldura = {
    ...novaMoldura({ quadroId: opcoes.quadroId, x: opcoes.x, y: opcoes.y, largura, altura, titulo: `✦ ${t}`, z: 0 }, opcoes.agora, opcoes.novoId()),
    revisao: revisao(null),
  };
  const itensNota = validadas.map((n, i) => {
    const col = i % NOTA_COLUNAS;
    const lin = Math.floor(i / NOTA_COLUNAS);
    const nota = novaNotaAdesiva({
      quadroId: opcoes.quadroId,
      x: opcoes.x + NOTA_ESPACO + col * (NOTA_LARGURA + NOTA_ESPACO),
      y: opcoes.y + TOPO_DA_MOLDURA + lin * (NOTA_ALTURA + NOTA_ESPACO),
      largura: NOTA_LARGURA,
      altura: NOTA_ALTURA,
      doc: docDeTexto(n.texto),
      fundo: n.tipo ? paleta[n.tipo] : FUNDO_NEUTRO,
      semantica: n.tipo,
    }, opcoes.agora, opcoes.novoId());
    return { ...nota, molduraId: moldura.id, revisao: revisao(n.tipo) };
  });
  return { moldura, notas: itensNota, itens: [moldura, ...itensNota] };
}

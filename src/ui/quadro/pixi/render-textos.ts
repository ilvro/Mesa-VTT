import { ImageSource, Texture } from 'pixi.js';
import { familiaCss } from '../../../dominio/fontes.ts';
import type { DocRico, IdFonte, Item, NoRico } from '../../../dominio/quadro.ts';

export interface TrechoTexto {
  texto: string;
  negrito: boolean;
  italico: boolean;
  sublinhado: boolean;
  riscado: boolean;
  cor?: string;
  fundo?: string;
  fonte?: string;
  tamanho?: number;
  ehLink: boolean;
}

export interface BlocoTexto {
  trechos: TrechoTexto[];
  escalaTitulo: number;
  alinhamento?: 'esquerda' | 'centro' | 'direita';
  prefixo?: string;
}

function mapearAlinAttr(v: unknown): 'esquerda' | 'centro' | 'direita' | undefined {
  if (v === 'center') return 'centro';
  if (v === 'right') return 'direita';
  if (v === 'left') return 'esquerda';
  return undefined;
}

function extrairTrecho(no: NoRico): TrechoTexto {
  let negrito = false;
  let italico = false;
  let sublinhado = false;
  let riscado = false;
  let cor: string | undefined;
  let fundo: string | undefined;
  let fonte: string | undefined;
  let tamanho: number | undefined;
  let ehLink = false;

  for (const m of no.marks ?? []) {
    if (m.type === 'bold') negrito = true;
    else if (m.type === 'italic') italico = true;
    else if (m.type === 'underline') sublinhado = true;
    else if (m.type === 'strike') riscado = true;
    else if (m.type === 'link') ehLink = true;
    else if (m.type === 'textStyle' && m.attrs) {
      if (typeof m.attrs.color === 'string') cor = m.attrs.color;
      if (typeof m.attrs.backgroundColor === 'string') fundo = m.attrs.backgroundColor;
      if (typeof m.attrs.fontFamily === 'string') fonte = m.attrs.fontFamily;
      if (typeof m.attrs.fontSize === 'string') {
        const n = parseFloat(m.attrs.fontSize);
        if (Number.isFinite(n) && n > 0) tamanho = n;
      } else if (typeof m.attrs.fontSize === 'number' && m.attrs.fontSize > 0) {
        tamanho = m.attrs.fontSize;
      }
    }
  }

  return {
    texto: no.text ?? '',
    negrito,
    italico,
    sublinhado,
    riscado,
    cor,
    fundo,
    fonte,
    tamanho,
    ehLink,
  };
}

function coletarTrechos(nos: readonly NoRico[] | undefined): TrechoTexto[] {
  const saida: TrechoTexto[] = [];
  for (const n of nos ?? []) {
    if (n.type === 'text') {
      if (n.text) saida.push(extrairTrecho(n));
    } else if (n.type === 'hardBreak') {
      saida.push({
        texto: '\n',
        negrito: false,
        italico: false,
        sublinhado: false,
        riscado: false,
        ehLink: false,
      });
    } else if (n.content) {
      saida.push(...coletarTrechos(n.content));
    }
  }
  return saida;
}

/** Converte um `DocRico` em blocos com estilos inline preservados para rasterização em canvas. */
export function extrairBlocosDeTexto(doc: DocRico): BlocoTexto[] {
  const blocos: BlocoTexto[] = [];

  const percorrer = (nos: readonly NoRico[], prefixo?: string) => {
    for (const no of nos) {
      if (no.type === 'paragraph') {
        blocos.push({
          trechos: coletarTrechos(no.content),
          escalaTitulo: 1,
          alinhamento: mapearAlinAttr(no.attrs?.textAlign),
          prefixo,
        });
      } else if (no.type === 'heading') {
        const lvl = Number(no.attrs?.level ?? 1);
        const escalaTitulo = lvl === 1 ? 1.5 : lvl === 2 ? 1.25 : 1.12;
        blocos.push({
          trechos: coletarTrechos(no.content),
          escalaTitulo,
          alinhamento: mapearAlinAttr(no.attrs?.textAlign),
          prefixo,
        });
      } else if (no.type === 'bulletList') {
        for (const li of no.content ?? []) {
          percorrer(li.content ?? [], '• ');
        }
      } else if (no.type === 'orderedList') {
        let idx = 1;
        for (const li of no.content ?? []) {
          percorrer(li.content ?? [], `${idx++}. `);
        }
      } else if (no.content) {
        percorrer(no.content, prefixo);
      }
    }
  };

  percorrer(doc.content ?? []);
  return blocos;
}

/** Escalas de raster: de 1/64 a 2, para a textura acompanhar o tamanho na tela mesmo bem longe. */
const BALDES_ESCALA = [1 / 64, 1 / 32, 1 / 16, 1 / 8, 1 / 4, 0.5, 1, 1.5, 2];

export function baldeEscalaTexto(zoom: number, dpr = 1): number {
  const alvo = zoom * dpr;
  for (const b of BALDES_ESCALA) if (alvo <= b) return b;
  return 2;
}

/** Abaixo disto (px de fonte na tela) o texto nem é desenhado: seria menos que um traço. */
export const FONTE_MINIMA_NA_TELA = 0.35;
/** Abaixo disto (px de fonte no raster) as palavras viram faixas, como o Miro faz de longe. */
const FONTE_MINIMA_LEGIVEL = 2.5;

export interface PedidoTextoPixi {
  chave: string;
  versaoItem: Item | string;
  doc: DocRico;
  largura: number;
  altura: number;
  padding: number;
  fonte: IdFonte;
  tamanhoFonte: number;
  corPadrao: string;
  alinhamento: 'esquerda' | 'centro' | 'direita' | 'justificado';
  vertical: 'topo' | 'meio' | 'base';
}

interface EntradaCacheTexto {
  chave: string;
  versaoItem: Item | string;
  escala: number;
  textura: Texture;
  larguraCss: number;
  alturaCss: number;
  bytes: number;
}

interface SegmentoLinha {
  texto: string;
  cssFonte: string;
  tamanhoPx: number;
  largura: number;
  cor: string;
  fundo?: string;
  sublinhado: boolean;
  riscado: boolean;
}

interface LinhaLayout {
  segmentos: SegmentoLinha[];
  largura: number;
  altura: number;
  alinhamento: 'esquerda' | 'centro' | 'direita';
}

const MAX_TEXTURA_DIM = 2048;
const MAX_BYTES_PADRAO = 128 * 1024 * 1024;
const ORCAMENTO_FRAME_MS = 8;

function criarSurface(w: number, h: number): OffscreenCanvas | HTMLCanvasElement | null {
  if (typeof OffscreenCanvas === 'function') return new OffscreenCanvas(w, h);
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }
  return null;
}

type ContextoTexto = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

/** Quebra o texto em linhas com as mesmas regras do raster (usado também para medir a altura). */
function montarLinhas(
  ctx: ContextoTexto,
  blocos: BlocoTexto[],
  pedido: Pick<PedidoTextoPixi, 'tamanhoFonte' | 'fonte' | 'corPadrao' | 'alinhamento'>,
  maxW: number,
): LinhaLayout[] {
  const alinPadrao = pedido.alinhamento === 'justificado' ? 'esquerda' : pedido.alinhamento;
  const linhas: LinhaLayout[] = [];
  for (const bloco of blocos) {
    const alinBloco = bloco.alinhamento ?? alinPadrao;
    const trechos = bloco.prefixo
      ? [
          {
            texto: bloco.prefixo,
            negrito: false,
            italico: false,
            sublinhado: false,
            riscado: false,
            ehLink: false,
          },
          ...bloco.trechos,
        ]
      : bloco.trechos;

    if (trechos.length === 0) {
      const alt = pedido.tamanhoFonte * bloco.escalaTitulo * 1.25;
      linhas.push({ segmentos: [], largura: 0, altura: alt, alinhamento: alinBloco });
      continue;
    }

    let segsLinha: SegmentoLinha[] = [];
    let largLinha = 0;
    let altLinha = pedido.tamanhoFonte * bloco.escalaTitulo * 1.25;

    const fecharLinha = () => {
      linhas.push({
        segmentos: segsLinha,
        largura: largLinha,
        altura: altLinha,
        alinhamento: alinBloco,
      });
      segsLinha = [];
      largLinha = 0;
      altLinha = pedido.tamanhoFonte * bloco.escalaTitulo * 1.25;
    };

    for (const tr of trechos) {
      if (tr.texto === '\n') {
        fecharLinha();
        continue;
      }
      const tam = (tr.tamanho ?? pedido.tamanhoFonte) * bloco.escalaTitulo;
      const peso = tr.negrito || bloco.escalaTitulo > 1 ? '700 ' : '';
      const estilo = tr.italico ? 'italic ' : '';
      const fam = tr.fonte ?? familiaCss(pedido.fonte);
      const cssFonte = `${estilo}${peso}${tam}px ${fam}`;
      const cor = tr.ehLink ? '#8bd197' : (tr.cor ?? pedido.corPadrao);
      ctx.font = cssFonte;

      const tokens = tr.texto.split(/(\s+)/).filter((p) => p.length > 0);
      for (const tok of tokens) {
        const wTok = ctx.measureText(tok).width;
        if (largLinha > 0 && largLinha + wTok > maxW && tok.trim().length > 0) {
          fecharLinha();
        }
        if (segsLinha.length === 0 && tok.trim().length === 0) continue;
        segsLinha.push({
          texto: tok,
          cssFonte,
          tamanhoPx: tam,
          largura: wTok,
          cor,
          fundo: tr.fundo,
          sublinhado: tr.sublinhado || tr.ehLink,
          riscado: tr.riscado,
        });
        largLinha += wTok;
        altLinha = Math.max(altLinha, tam * 1.25);
      }
    }
    if (segsLinha.length > 0) fecharLinha();
  }
  return linhas;
}

/**
 * Altura (px do quadro) que o texto precisa nesta largura, com as regras do raster.
 * `null` sem canvas (testes em Node) ou sem conteúdo.
 */
export function alturaNecessariaDoTexto(
  pedido: Pick<PedidoTextoPixi, 'doc' | 'largura' | 'padding' | 'tamanhoFonte' | 'fonte' | 'corPadrao' | 'alinhamento'>,
): number | null {
  const medida = medirLinhasDoTexto(pedido, (wCss) => wCss);
  if (!medida) return null;
  return medida.linhas.reduce((acc, l) => acc + l.altura, 0) + medida.pad * 2;
}

/**
 * Largura (px do quadro) que o texto precisa para caber sem quebrar: a da linha mais longa (cada parágrafo numa linha),
 * com as mesmas regras de fonte e marcas da altura, mais o padding dos dois lados. `null` sem canvas ou sem conteúdo.
 */
export function larguraNecessariaDoTexto(
  pedido: Pick<PedidoTextoPixi, 'doc' | 'padding' | 'tamanhoFonte' | 'fonte' | 'corPadrao' | 'alinhamento'>,
): number | null {
  const medida = medirLinhasDoTexto({ ...pedido, largura: 0 }, () => Number.POSITIVE_INFINITY);
  if (!medida) return null;
  return medida.linhas.reduce((acc, l) => Math.max(acc, l.largura), 0) + pedido.padding * 2;
}

/** Monta as linhas do texto (base da medição de altura e de largura); `maxW(larguraCss)` dá a largura útil de quebra. */
function medirLinhasDoTexto(
  pedido: Pick<PedidoTextoPixi, 'doc' | 'largura' | 'padding' | 'tamanhoFonte' | 'fonte' | 'corPadrao' | 'alinhamento'>,
  larguraUtil: (wCss: number) => number,
): { linhas: LinhaLayout[]; pad: number } | null {
  const blocos = extrairBlocosDeTexto(pedido.doc);
  if (!blocos.some((b) => b.trechos.some((t) => t.texto.trim().length > 0))) return null;
  const surface = criarSurface(1, 1);
  const ctx = surface?.getContext('2d') as ContextoTexto | null | undefined;
  if (!ctx) return null;
  const wCss = Math.max(4, pedido.largura);
  const pad = Math.min(pedido.padding, wCss * 0.2);
  const util = larguraUtil(wCss);
  const linhas = montarLinhas(ctx, blocos, pedido, Number.isFinite(util) ? Math.max(4, util - pad * 2) : util);
  return { linhas, pad };
}

/**
 * Gera e mantém texturas de texto rico em LRU com orçamento por frame
 * e corte sub-pixel para manter 60 FPS em quadros com milhares de textos.
 */
export class CacheTextosPixi {
  private readonly entradas = new Map<string, EntradaCacheTexto>();
  private readonly maxBytes: number;
  private bytesTotais = 0;
  private inicioQuadroMs = 0;
  private pendenteNesteQuadro = false;

  constructor(maxBytes = MAX_BYTES_PADRAO) {
    this.maxBytes = Math.max(1024 * 1024, maxBytes);
  }

  iniciarQuadro(): void {
    this.inicioQuadroMs = performance.now();
    this.pendenteNesteQuadro = false;
  }

  tevePendencia(): boolean {
    return this.pendenteNesteQuadro;
  }

  obter(
    pedido: PedidoTextoPixi,
    zoom: number,
    dpr = 1,
  ): { textura: Texture; larguraCss: number; alturaCss: number } | null {
    if (pedido.tamanhoFonte * zoom < FONTE_MINIMA_NA_TELA) return null;
    if (pedido.largura < 4 || pedido.altura < 4) return null;

    const escala = baldeEscalaTexto(zoom, dpr);
    const existente = this.entradas.get(pedido.chave);
    if (
      existente &&
      existente.versaoItem === pedido.versaoItem &&
      existente.escala === escala
    ) {
      this.entradas.delete(pedido.chave);
      this.entradas.set(pedido.chave, existente);
      return existente;
    }

    if (performance.now() - this.inicioQuadroMs > ORCAMENTO_FRAME_MS) {
      this.pendenteNesteQuadro = true;
      return existente ?? null;
    }

    const gerada = this.rasterizar(pedido, escala);
    if (!gerada) return null;

    if (existente) {
      this.bytesTotais -= existente.bytes;
      this.entradas.delete(pedido.chave);
      existente.textura.destroy(true);
    }

    this.bytesTotais += gerada.bytes;
    this.entradas.set(pedido.chave, gerada);
    this.evictarSePreciso();
    return gerada;
  }

  private evictarSePreciso(): void {
    while (this.bytesTotais > this.maxBytes && this.entradas.size > 1) {
      const maisAntiga = this.entradas.keys().next().value;
      if (!maisAntiga) break;
      const ent = this.entradas.get(maisAntiga);
      this.entradas.delete(maisAntiga);
      if (ent) {
        this.bytesTotais -= ent.bytes;
        ent.textura.destroy(true);
      }
    }
  }

  private rasterizar(pedido: PedidoTextoPixi, escala: number): EntradaCacheTexto | null {
    const blocos = extrairBlocosDeTexto(pedido.doc);
    const temConteudo = blocos.some((b) =>
      b.trechos.some((t) => t.texto.trim().length > 0),
    );
    if (!temConteudo) return null;

    const wCss = Math.max(4, pedido.largura);
    const hCss = Math.max(4, pedido.altura);
    const escLimitada = Math.min(
      escala,
      MAX_TEXTURA_DIM / wCss,
      MAX_TEXTURA_DIM / hCss,
    );
    const pxW = Math.max(1, Math.round(wCss * escLimitada));
    const pxH = Math.max(1, Math.round(hCss * escLimitada));
    const surface = criarSurface(pxW, pxH);
    if (!surface) return null;
    const ctx = surface.getContext('2d') as
      | OffscreenCanvasRenderingContext2D
      | CanvasRenderingContext2D
      | null;
    if (!ctx) return null;

    ctx.scale(escLimitada, escLimitada);
    const pad = Math.min(pedido.padding, wCss * 0.2, hCss * 0.2);
    const maxW = Math.max(4, wCss - pad * 2);

    const linhas = montarLinhas(ctx, blocos, pedido, maxW);

    const alturaTotal = linhas.reduce((acc, l) => acc + l.altura, 0);
    const espacoV = Math.max(0, hCss - pad * 2 - alturaTotal);
    let y =
      pedido.vertical === 'meio'
        ? pad + espacoV / 2
        : pedido.vertical === 'base'
          ? pad + espacoV
          : pad;

    ctx.textBaseline = 'top';
    for (const linha of linhas) {
      if (y > hCss - pad) break;
      let x = pad;
      if (linha.alinhamento === 'centro') x = pad + Math.max(0, (maxW - linha.largura) / 2);
      else if (linha.alinhamento === 'direita') x = pad + Math.max(0, maxW - linha.largura);

      for (const seg of linha.segmentos) {
        if (seg.fundo) {
          ctx.fillStyle = seg.fundo;
          ctx.fillRect(x, y, seg.largura, seg.tamanhoPx * 1.15);
        }
        ctx.fillStyle = seg.cor;
        if (seg.tamanhoPx * escLimitada < FONTE_MINIMA_LEGIVEL) {
          // Longe demais para glifos: a palavra vira uma faixa na cor do texto.
          if (seg.texto.trim().length > 0) {
            ctx.globalAlpha = 0.55;
            ctx.fillRect(x, y + seg.tamanhoPx * 0.3, seg.largura, seg.tamanhoPx * 0.55);
            ctx.globalAlpha = 1;
          }
        } else {
          ctx.font = seg.cssFonte;
          ctx.fillText(seg.texto, x, y);
        }
        if (seg.sublinhado) {
          ctx.fillRect(x, y + seg.tamanhoPx * 1.02, seg.largura, Math.max(1, seg.tamanhoPx * 0.07));
        }
        if (seg.riscado) {
          ctx.fillRect(x, y + seg.tamanhoPx * 0.55, seg.largura, Math.max(1, seg.tamanhoPx * 0.07));
        }
        x += seg.largura;
      }
      y += linha.altura;
    }

    const tex = new Texture({ source: new ImageSource({ resource: surface }) });
    return {
      chave: pedido.chave,
      versaoItem: pedido.versaoItem,
      escala,
      textura: tex,
      larguraCss: wCss,
      alturaCss: hCss,
      bytes: pxW * pxH * 4,
    };
  }

  quantidade(): number {
    return this.entradas.size;
  }

  bytesEmUso(): number {
    return this.bytesTotais;
  }

  destruir(): void {
    for (const ent of this.entradas.values()) ent.textura.destroy(true);
    this.entradas.clear();
    this.bytesTotais = 0;
  }
}

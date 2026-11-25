import type { Camera, Tamanho } from '../../dominio/camera.ts';
import { familiaCss } from '../../dominio/fontes.ts';
import { caminhoDaForma } from '../../dominio/formas.ts';
import { corDoTexto, fundoEfetivo, type PaletaDaCampanha } from '../../dominio/paleta.ts';
import { textoPuro, type Item, type TipoSemantico } from '../../dominio/quadro.ts';
import { itemEhSecreto, itemPassaNoFiltro } from '../../dominio/busca-quadro.ts';
import { pontoDaPonta } from '../../dominio/setas.ts';
import { caminhoDoTraco } from '../../dominio/tracos.ts';
import { urlDaImagem } from '../../app/imagens-quadro.ts';

/*
 * Desenho de longe (zoom < 25% com muitos itens): um canvas só, no lugar do DOM.
 * Imagens aparecem de verdade (é por elas que se acha o caminho num quadro grande),
 * formas e traços com o contorno certo, tudo com rotação e na densidade da tela.
 */

const LADO_MINIATURA_LOD = 256;
const imagens = new Map<string, HTMLCanvasElement | HTMLImageElement | 'carregando' | 'falhou'>();

function reduzirParaLod(img: HTMLImageElement): HTMLCanvasElement | HTMLImageElement {
  const maior = Math.max(img.naturalWidth, img.naturalHeight);
  if (maior <= LADO_MINIATURA_LOD || maior === 0) return img;
  const escala = LADO_MINIATURA_LOD / maior;
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(img.naturalWidth * escala));
  c.height = Math.max(1, Math.round(img.naturalHeight * escala));
  const cx = c.getContext('2d');
  if (!cx) return img;
  cx.drawImage(img, 0, 0, c.width, c.height);
  return c;
}

function imagemPronta(
  imagemId: string,
  aoCarregar: () => void,
): HTMLCanvasElement | HTMLImageElement | null {
  const atual = imagens.get(imagemId);
  if (atual instanceof HTMLCanvasElement) return atual;
  if (atual instanceof HTMLImageElement) return atual.complete ? atual : null;
  if (atual) return null;
  imagens.set(imagemId, 'carregando');
  void urlDaImagem(imagemId).then((url) => {
    if (!url) {
      imagens.set(imagemId, 'falhou');
      return;
    }
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      imagens.set(imagemId, reduzirParaLod(img));
      aoCarregar();
    };
    img.onerror = () => imagens.set(imagemId, 'falhou');
    img.src = url;
  });
  return null;
}

/** As URLs são revogadas ao fechar o quadro; as imagens decodificadas também saem. */
export function esquecerImagensLod(): void {
  imagens.clear();
}

const caminhos = new WeakMap<Item, Path2D>();

function caminhoDe(it: Item): Path2D | null {
  const salvo = caminhos.get(it);
  if (salvo) return salvo;
  let d = '';
  if (it.tipo === 'traco') d = caminhoDoTraco(it);
  else if (it.tipo === 'forma') d = caminhoDaForma(it.forma, it.largura, it.altura, it.caixa.raio);
  if (!d) return null;
  const p = new Path2D(d);
  caminhos.set(it, p);
  return p;
}

const textosEmCache = new WeakMap<Item, string>();

function textoDe(it: Extract<Item, { tipo: 'texto' | 'forma' }>): string {
  const salvo = textosEmCache.get(it);
  if (salvo !== undefined) return salvo;
  const limpo = textoPuro(it.doc).trim();
  textosEmCache.set(it, limpo);
  return limpo;
}

function corTextoLod(
  it: Extract<Item, { tipo: 'texto' | 'forma' }>,
  fundo: string | null,
): string {
  return it.semantica && !it.caixa.fundo && fundo ? corDoTexto(fundo) : it.texto.cor;
}

function desenharTextoLod(
  ctx: CanvasRenderingContext2D,
  it: Extract<Item, { tipo: 'texto' | 'forma' }>,
  zoom: number,
  fundo: string | null,
): void {
  const conteudo = textoDe(it);
  if (!conteudo) return;

  const cor = corTextoLod(it, fundo);
  const tamTela = it.texto.tamanho * zoom;
  const pad = Math.min(it.caixa.padding, it.largura * 0.1, it.altura * 0.1);
  const maxW = Math.max(4, it.largura - pad * 2);

  if (tamTela < 2.5) {
    if (it.largura * zoom < 14 || it.altura * zoom < 10) return;
    ctx.save();
    ctx.globalAlpha *= 0.35;
    ctx.fillStyle = cor;
    const h = Math.max(4, Math.min(it.texto.tamanho * 0.7, it.altura * 0.08));
    ctx.fillRect(pad, pad, maxW, h);
    if (it.altura > pad * 2 + h * 2.5) {
      ctx.fillRect(pad, pad + Math.max(8, h * 1.8), maxW * 0.65, h);
    }
    ctx.restore();
    return;
  }

  ctx.save();
  ctx.beginPath();
  ctx.rect(pad, pad, maxW, Math.max(4, it.altura - pad * 2));
  ctx.clip();

  ctx.fillStyle = cor;
  ctx.font = `${it.texto.tamanho}px ${familiaCss(it.texto.fonte)}`;
  ctx.textBaseline = 'top';
  const alin = it.texto.alinhamento;
  ctx.textAlign = alin === 'centro' ? 'center' : alin === 'direita' ? 'right' : 'left';
  const xTexto = alin === 'centro' ? it.largura / 2 : alin === 'direita' ? it.largura - pad : pad;

  const entrelinha = it.texto.tamanho * 1.25;
  let y = pad;
  const maxY = it.altura - pad;
  const paragrafos = conteudo.split('\n');
  for (const par of paragrafos) {
    if (y > maxY) break;
    const palavras = par.split(/\s+/).filter(Boolean);
    if (palavras.length === 0) {
      y += entrelinha * 0.6;
      continue;
    }
    let linha = palavras[0]!;
    for (let i = 1; i < palavras.length; i++) {
      const teste = `${linha} ${palavras[i]}`;
      if (ctx.measureText(teste).width <= maxW) {
        linha = teste;
      } else {
        ctx.fillText(linha, xTexto, y);
        y += entrelinha;
        if (y > maxY) break;
        linha = palavras[i]!;
      }
    }
    if (y <= maxY) {
      ctx.fillText(linha, xTexto, y);
      y += entrelinha;
    }
  }
  ctx.restore();
}

export interface OpcoesLod {
  camera: Camera;
  tamanho: Tamanho;
  itens: readonly Item[];
  todos: ReadonlyMap<string, Item>;
  pular: (it: Item) => boolean;
  paleta: PaletaDaCampanha;
  tiposFiltro?: ReadonlySet<TipoSemantico>;
  esconderSegredos: boolean;
  aoCarregarImagem: () => void;
}

export function desenharLod(canvas: HTMLCanvasElement, o: OpcoesLod): void {
  const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
  const largura = Math.round(o.tamanho.largura * dpr);
  const altura = Math.round(o.tamanho.altura * dpr);
  if (canvas.width !== largura) canvas.width = largura;
  if (canvas.height !== altura) canvas.height = altura;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const { camera } = o;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, largura, altura);
  ctx.setTransform(
    camera.zoom * dpr,
    0,
    0,
    camera.zoom * dpr,
    -camera.x * camera.zoom * dpr,
    -camera.y * camera.zoom * dpr,
  );
  const umPixel = 1 / camera.zoom;
  const temFiltro = Boolean(o.tiposFiltro && o.tiposFiltro.size > 0);

  for (const it of o.itens) {
    if (o.pular(it)) continue;
    if (o.esconderSegredos && itemEhSecreto(it)) continue;
    ctx.globalAlpha = temFiltro && !itemPassaNoFiltro(it, o.tiposFiltro!) ? 0.15 : 1;

    if (it.tipo === 'seta') {
      const p1 = pontoDaPonta(it.de, o.todos, it.para).ponto;
      const p2 = pontoDaPonta(it.para, o.todos, it.de).ponto;
      if (Math.hypot(p2.x - p1.x, p2.y - p1.y) * camera.zoom < 3) continue;
      ctx.strokeStyle = it.cor;
      ctx.lineWidth = Math.max(it.espessura, umPixel);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
      continue;
    }

    const wTela = it.largura * camera.zoom;
    const hTela = it.altura * camera.zoom;
    const maiorTela = Math.max(wTela, hTela);
    if (maiorTela < 1.2) continue;

    ctx.save();
    ctx.translate(it.x, it.y);
    if (it.rotacao) {
      ctx.translate(it.largura / 2, it.altura / 2);
      ctx.rotate((it.rotacao * Math.PI) / 180);
      ctx.translate(-it.largura / 2, -it.altura / 2);
    }

    if (it.tipo === 'imagem') {
      const img = imagemPronta(it.imagemId, o.aoCarregarImagem);
      ctx.globalAlpha *= it.caixa.opacidade;
      if (img) ctx.drawImage(img, 0, 0, it.largura, it.altura);
      else {
        ctx.fillStyle = '#2a332d';
        ctx.fillRect(0, 0, it.largura, it.altura);
      }
    } else if (it.tipo === 'traco') {
      const p = caminhoDe(it);
      if (p) {
        ctx.globalAlpha *= it.opacidade;
        ctx.fillStyle = it.cor;
        ctx.fill(p);
      }
    } else if (it.tipo === 'forma') {
      const fundo = fundoEfetivo(it, o.paleta);
      if (maiorTela < 10) {
        if (fundo && it.caixa.opacidade > 0) {
          ctx.globalAlpha *= it.caixa.opacidade;
          ctx.fillStyle = fundo;
          ctx.fillRect(0, 0, it.largura, it.altura);
        }
      } else {
        const p = caminhoDe(it);
        if (p) {
          if (fundo && it.caixa.opacidade > 0) {
            ctx.save();
            ctx.globalAlpha *= it.caixa.opacidade;
            ctx.fillStyle = fundo;
            ctx.fill(p);
            ctx.restore();
          }
          if (it.caixa.borda && it.caixa.espessuraBorda > 0) {
            ctx.strokeStyle = it.caixa.borda;
            ctx.lineWidth = Math.max(it.caixa.espessuraBorda, umPixel);
            ctx.stroke(p);
          }
        }
        desenharTextoLod(ctx, it, camera.zoom, fundo);
      }
    } else if (it.tipo === 'texto' || it.tipo === 'ref') {
      const fundo = it.tipo === 'texto' ? fundoEfetivo(it, o.paleta) : '#202b24';
      const opacidadeFundo = it.tipo === 'texto' ? it.caixa.opacidade : 1;
      if (fundo && opacidadeFundo > 0) {
        ctx.save();
        ctx.globalAlpha *= opacidadeFundo;
        ctx.fillStyle = fundo;
        ctx.fillRect(0, 0, it.largura, it.altura);
        ctx.restore();
      }
      if (it.tipo === 'texto' && maiorTela >= 10) {
        if (it.caixa.borda && it.caixa.espessuraBorda > 0) {
          ctx.strokeStyle = it.caixa.borda;
          ctx.lineWidth = Math.max(it.caixa.espessuraBorda, umPixel);
          ctx.strokeRect(0, 0, it.largura, it.altura);
        }
        desenharTextoLod(ctx, it, camera.zoom, fundo);
      }
    }
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

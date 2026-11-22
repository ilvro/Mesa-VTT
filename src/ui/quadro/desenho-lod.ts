import type { Camera, Tamanho } from '../../dominio/camera.ts';
import { caminhoDaForma } from '../../dominio/formas.ts';
import { fundoEfetivo, type PaletaDaCampanha } from '../../dominio/paleta.ts';
import type { Item, TipoSemantico } from '../../dominio/quadro.ts';
import { itemEhSecreto, itemPassaNoFiltro } from '../../dominio/busca-quadro.ts';
import { pontoDaPonta } from '../../dominio/setas.ts';
import { caminhoDoTraco } from '../../dominio/tracos.ts';
import { urlDaImagem } from '../../app/imagens-quadro.ts';

/*
 * Desenho de longe (zoom < 25% com muitos itens): um canvas só, no lugar do DOM.
 * Imagens aparecem de verdade (é por elas que se acha o caminho num quadro grande),
 * formas e traços com o contorno certo, tudo com rotação e na densidade da tela.
 */

const imagens = new Map<string, HTMLImageElement | 'carregando' | 'falhou'>();

function imagemPronta(imagemId: string, aoCarregar: () => void): HTMLImageElement | null {
  const atual = imagens.get(imagemId);
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
    img.onload = () => aoCarregar();
    img.onerror = () => imagens.set(imagemId, 'falhou');
    img.src = url;
    imagens.set(imagemId, img);
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

function linhasDeTexto(ctx: CanvasRenderingContext2D, it: Item & { caixa: { padding: number } }): void {
  ctx.fillStyle = 'rgba(160, 175, 165, 0.35)';
  const pad = Math.min(it.caixa.padding, it.largura * 0.1);
  const w = Math.max(4, it.largura - pad * 2);
  const h = Math.max(4, it.altura * 0.08);
  ctx.fillRect(pad, pad, w, h);
  ctx.fillRect(pad, pad + Math.max(8, it.altura * 0.16), w * 0.65, h);
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
      ctx.strokeStyle = it.cor;
      ctx.lineWidth = Math.max(it.espessura, umPixel);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
      continue;
    }

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
      const p = caminhoDe(it);
      const fundo = fundoEfetivo(it, o.paleta);
      if (p) {
        if (fundo) {
          ctx.fillStyle = fundo;
          ctx.fill(p);
        }
        if (it.caixa.borda && it.caixa.espessuraBorda > 0) {
          ctx.strokeStyle = it.caixa.borda;
          ctx.lineWidth = Math.max(it.caixa.espessuraBorda, umPixel);
          ctx.stroke(p);
        }
      }
      linhasDeTexto(ctx, it);
    } else if (it.tipo === 'texto' || it.tipo === 'ref') {
      const fundo = it.tipo === 'texto' ? fundoEfetivo(it, o.paleta) : '#202b24';
      if (fundo) {
        ctx.fillStyle = fundo;
        ctx.fillRect(0, 0, it.largura, it.altura);
      }
      if (it.tipo === 'texto') {
        if (it.caixa.borda && it.caixa.espessuraBorda > 0) {
          ctx.strokeStyle = it.caixa.borda;
          ctx.lineWidth = Math.max(it.caixa.espessuraBorda, umPixel);
          ctx.strokeRect(0, 0, it.largura, it.altura);
        }
        linhasDeTexto(ctx, it);
      }
    }
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

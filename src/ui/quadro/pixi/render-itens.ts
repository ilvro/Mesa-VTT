import { Container, Graphics, Sprite } from 'pixi.js';
import {
  caixaVisivel,
  ZOOM_MIN,
  type Camera,
  type Tamanho,
} from '../../../dominio/camera.ts';
import { itemEhSecreto, itemPassaNoFiltro } from '../../../dominio/busca-quadro.ts';
import {
  condicoesDoItem,
  itemAtendeCondicoes,
  type EstadoDoMundo,
} from '../../../dominio/estado-do-mundo.ts';
import {
  consultarCaixa,
  criarIndiceEspacial,
  type IndiceEspacial,
} from '../../../dominio/indice-espacial.ts';
import {
  PALETA_PADRAO,
  corDoTexto,
  fundoEfetivo,
  type PaletaDaCampanha,
} from '../../../dominio/paleta.ts';
import { areaUtil } from '../../../dominio/formas.ts';
import { docDeTexto, type Forma, type Item, type TipoSemantico } from '../../../dominio/quadro.ts';
import { caminhoDaSeta, setasLigadasA } from '../../../dominio/setas.ts';
import { nivelMipmapParaTela, type CacheImagensPixi } from './cache-imagens-pixi.ts';
import { desenharPolilinha, parsearCorPixi } from './cores-pixi.ts';
import { desenharSetaPixi } from './render-setas.ts';
import { CacheTextosPixi, type PedidoTextoPixi } from './render-textos.ts';
import { desenharTracoPixi } from './render-tracos.ts';

interface EntradaVisual {
  item: Item;
  container: Container;
  spriteImagem?: Sprite;
  spriteTexto?: Sprite;
  graficos?: Graphics;
}

export interface OpcoesSincroniaItens {
  itens: ReadonlyMap<string, Item>;
  camera: Camera;
  tamanho: Tamanho;
  paleta: PaletaDaCampanha;
  estadoDoMundo?: EstadoDoMundo;
  tiposFiltro?: ReadonlySet<TipoSemantico>;
  esconderSegredos: boolean;
  pular?: (it: Item) => boolean;
  aoFicarPendenteTexto?: () => void;
}

function pontosDaForma(forma: Forma, w: number, h: number): number[] {
  const rx = w / 2;
  const ry = h / 2;
  switch (forma) {
    case 'losango':
      return [rx, 0, w, ry, rx, h, 0, ry];
    case 'triangulo':
      return [rx, 0, w, h, 0, h];
    case 'paralelogramo': {
      const dx = w * 0.18;
      return [dx, 0, w, 0, w - dx, h, 0, h];
    }
    case 'hexagono': {
      const dx = w * 0.22;
      return [dx, 0, w - dx, 0, w, ry, w - dx, h, dx, h, 0, ry];
    }
    case 'estrela': {
      const pts: number[] = [];
      for (let i = 0; i < 10; i++) {
        const ang = -Math.PI / 2 + (i * Math.PI) / 5;
        const f = i % 2 === 0 ? 1 : 0.42;
        pts.push(rx + Math.cos(ang) * rx * f, ry + Math.sin(ang) * ry * f);
      }
      return pts;
    }
    default:
      return [0, 0, w, 0, w, h, 0, h];
  }
}

function desenharContornoForma(
  g: Graphics,
  forma: Forma,
  largura: number,
  altura: number,
  raio: number,
): void {
  const w = Math.max(1, largura);
  const h = Math.max(1, altura);
  if (forma === 'retangulo' || forma === 'arredondado') {
    const rBase = forma === 'arredondado' ? Math.max(raio, Math.min(w, h) * 0.18) : raio;
    const cr = Math.max(0, Math.min(rBase, w / 2, h / 2));
    if (cr > 0) g.roundRect(0, 0, w, h, cr);
    else g.rect(0, 0, w, h);
    return;
  }
  if (forma === 'elipse') {
    g.ellipse(w / 2, h / 2, w / 2, h / 2);
    return;
  }
  if (forma === 'nuvem') {
    g.moveTo(w * 0.25, h * 0.85)
      .bezierCurveTo(w * 0.05, h * 0.85, 0, h * 0.55, w * 0.14, h * 0.42)
      .bezierCurveTo(w * 0.1, h * 0.2, w * 0.32, h * 0.06, w * 0.5, h * 0.16)
      .bezierCurveTo(w * 0.65, h * 0.04, w * 0.9, h * 0.18, w * 0.86, h * 0.4)
      .bezierCurveTo(w, h * 0.54, w * 0.94, h * 0.85, w * 0.74, h * 0.85)
      .closePath();
    return;
  }
  g.poly(pontosDaForma(forma, w, h), true);
}

function aplicarRotacaoEPosicao(c: Container, item: Item): void {
  if (item.tipo === 'seta') {
    c.position.set(0, 0);
    c.pivot.set(0, 0);
    c.rotation = 0;
    return;
  }
  if (item.rotacao) {
    const cx = item.largura / 2;
    const cy = item.altura / 2;
    c.pivot.set(cx, cy);
    c.position.set(item.x + cx, item.y + cy);
    c.rotation = (item.rotacao * Math.PI) / 180;
  } else {
    c.pivot.set(0, 0);
    c.position.set(item.x, item.y);
    c.rotation = 0;
  }
}

function desenharCaixaRetangular(
  g: Graphics,
  largura: number,
  altura: number,
  raio: number,
  fundo: string | null,
  opacidadeFundo: number,
  borda: string | null,
  espessuraBorda: number,
  tracejado: 'solido' | 'tracejado' | 'pontilhado',
): void {
  const w = Math.max(1, largura);
  const h = Math.max(1, altura);
  const cr = Math.max(0, Math.min(raio, w / 2, h / 2));
  if (fundo && opacidadeFundo > 0) {
    const { color, alpha } = parsearCorPixi(fundo);
    if (cr > 0) g.roundRect(0, 0, w, h, cr);
    else g.rect(0, 0, w, h);
    g.fill({ color, alpha: alpha * opacidadeFundo });
  }
  if (borda && espessuraBorda > 0) {
    const { color, alpha } = parsearCorPixi(borda);
    if (tracejado === 'solido') {
      if (cr > 0) g.roundRect(0, 0, w, h, cr);
      else g.rect(0, 0, w, h);
    } else {
      desenharPolilinha(
        g,
        [
          { x: 0, y: 0 },
          { x: w, y: 0 },
          { x: w, y: h },
          { x: 0, y: h },
        ],
        tracejado,
        espessuraBorda,
        true,
      );
    }
    g.stroke({ color, alpha, width: espessuraBorda });
  }
}

/**
 * Sincroniza os itens do modelo com as camadas PixiJS de forma incremental
 * e aplica culling espacial para manter 60 FPS mesmo com 10.000+ itens.
 */
export class GerenciadorItensPixi {
  private readonly camadaMolduras: Container;
  private readonly camadaItens: Container;
  private readonly camadaSetas: Container;
  private readonly cacheImagens: CacheImagensPixi;
  private readonly cacheTextos: CacheTextosPixi;
  private readonly entradas = new Map<string, EntradaVisual>();
  private itensAnteriores: ReadonlyMap<string, Item> | null = null;
  private paletaAnterior: PaletaDaCampanha | null = null;
  private indice: IndiceEspacial<Item> | null = null;
  private ordemMudou = true;

  constructor(opcoes: {
    camadaMolduras: Container;
    camadaItens: Container;
    camadaSetas: Container;
    cacheImagens: CacheImagensPixi;
    cacheTextos?: CacheTextosPixi;
  }) {
    this.camadaMolduras = opcoes.camadaMolduras;
    this.camadaItens = opcoes.camadaItens;
    this.camadaSetas = opcoes.camadaSetas;
    this.cacheImagens = opcoes.cacheImagens;
    this.cacheTextos = opcoes.cacheTextos ?? new CacheTextosPixi();
  }

  sincronizar(op: OpcoesSincroniaItens): readonly Item[] {
    const itensMudaram = this.itensAnteriores !== op.itens;
    const paletaMudou = this.paletaAnterior !== op.paleta;

    if (itensMudaram || paletaMudou) {
      this.reconciliarItens(op.itens, op.paleta, paletaMudou);
      this.itensAnteriores = op.itens;
      this.paletaAnterior = op.paleta;
    }

    if (!this.indice) {
      this.indice = criarIndiceEspacial(op.itens.values());
    }

    this.cacheTextos.iniciarQuadro();
    const dpr = typeof window !== 'undefined' ? Math.max(1, Math.min(2, window.devicePixelRatio || 1)) : 1;
    const caixa = caixaVisivel(op.camera, op.tamanho);
    const margem = 120 / Math.max(ZOOM_MIN, op.camera.zoom);
    const visiveis = consultarCaixa(this.indice, caixa, margem);
    const conjuntoVisiveis = new Set<string>();

    const temFiltro = Boolean(op.tiposFiltro && op.tiposFiltro.size > 0);
    for (const item of visiveis) {
      if (op.pular?.(item)) continue;
      if (op.esconderSegredos && itemEhSecreto(item)) continue;
      if (item.tipo !== 'seta' && Math.max(item.largura, item.altura) * op.camera.zoom < 1.2) {
        continue;
      }

      conjuntoVisiveis.add(item.id);
      const ent = this.entradas.get(item.id);
      if (!ent) continue;

      ent.container.visible = true;
      const passaFiltro = !temFiltro || itemPassaNoFiltro(item, op.tiposFiltro!);
      const conds = condicoesDoItem(item);
      const condOk =
        conds.length > 0 && op.estadoDoMundo
          ? itemAtendeCondicoes(item, op.estadoDoMundo)
          : true;
      ent.container.alpha = (passaFiltro ? 1 : 0.15) * (condOk ? 1 : 0.35);

      if (item.tipo === 'imagem' && ent.spriteImagem) {
        const nivel = nivelMipmapParaTela(item.largura, item.altura, op.camera.zoom);
        const tex = this.cacheImagens.obter(item.imagemId, nivel);
        if (tex) {
          if (ent.spriteImagem.texture !== tex) ent.spriteImagem.texture = tex;
          ent.spriteImagem.visible = true;
          if (ent.graficos) ent.graficos.visible = false;
        } else {
          ent.spriteImagem.visible = false;
          if (ent.graficos) ent.graficos.visible = true;
        }
      } else {
        this.atualizarTextoItem(ent, item, op.itens, op.paleta, op.camera.zoom, dpr);
      }
    }

    for (const [id, ent] of this.entradas) {
      if (!conjuntoVisiveis.has(id)) {
        ent.container.visible = false;
      }
    }

    if (this.ordemMudou) {
      this.camadaMolduras.sortChildren();
      this.camadaItens.sortChildren();
      this.camadaSetas.sortChildren();
      this.ordemMudou = false;
    }

    if (this.cacheTextos.tevePendencia()) {
      op.aoFicarPendenteTexto?.();
    }

    return visiveis;
  }

  private atualizarTextoItem(
    ent: EntradaVisual,
    item: Item,
    todos: ReadonlyMap<string, Item>,
    paleta: PaletaDaCampanha,
    zoom: number,
    dpr: number,
  ): void {
    const pedido = montarPedidoTexto(item, todos, paleta, zoom);
    if (!pedido) {
      if (ent.spriteTexto) ent.spriteTexto.visible = false;
      return;
    }

    const res = this.cacheTextos.obter(pedido.pedido, zoom, dpr);
    if (!res) {
      if (ent.spriteTexto) ent.spriteTexto.visible = false;
      return;
    }

    if (!ent.spriteTexto) {
      ent.spriteTexto = new Sprite();
      ent.container.addChild(ent.spriteTexto);
    }
    if (ent.spriteTexto.texture !== res.textura) ent.spriteTexto.texture = res.textura;
    ent.spriteTexto.position.set(pedido.x, pedido.y);
    ent.spriteTexto.width = res.larguraCss;
    ent.spriteTexto.height = res.alturaCss;
    ent.spriteTexto.visible = true;
  }

  private camadaPara(tipo: Item['tipo']): Container {
    if (tipo === 'moldura') return this.camadaMolduras;
    if (tipo === 'seta') return this.camadaSetas;
    return this.camadaItens;
  }

  private reconciliarItens(
    itens: ReadonlyMap<string, Item>,
    paleta: PaletaDaCampanha,
    forcarTodos: boolean,
  ): void {
    const movidosOuAlterados: string[] = [];

    for (const [id, ent] of this.entradas) {
      const novo = itens.get(id);
      if (!novo || novo.tipo !== ent.item.tipo) {
        ent.container.destroy({ children: true });
        this.entradas.delete(id);
        this.ordemMudou = true;
      }
    }

    for (const [id, item] of itens) {
      const ant = this.entradas.get(id);
      if (!ant) {
        const criado = this.criarEntrada(item, itens, paleta);
        this.entradas.set(id, criado);
        this.camadaPara(item.tipo).addChild(criado.container);
        this.ordemMudou = true;
        continue;
      }
      if (forcarTodos || ant.item !== item) {
        if (ant.item.z !== item.z) this.ordemMudou = true;
        this.atualizarEntrada(ant, item, itens, paleta);
        ant.item = item;
        movidosOuAlterados.push(id);
      }
    }

    // Setas ligadas a itens que se moveram precisam ser redesenhadas mesmo que o objeto Seta seja igual.
    if (movidosOuAlterados.length > 0) {
      for (const seta of setasLigadasA(movidosOuAlterados, itens)) {
        const entSeta = this.entradas.get(seta.id);
        if (entSeta && entSeta.graficos) {
          desenharSetaPixi(entSeta.graficos, seta, itens);
        }
      }
    }

    this.indice = criarIndiceEspacial(itens.values());
  }

  private criarEntrada(
    item: Item,
    todos: ReadonlyMap<string, Item>,
    paleta: PaletaDaCampanha,
  ): EntradaVisual {
    const container = new Container();
    container.zIndex = item.z;
    const graficos = new Graphics();
    container.addChild(graficos);

    let spriteImagem: Sprite | undefined;
    if (item.tipo === 'imagem') {
      spriteImagem = new Sprite();
      spriteImagem.width = Math.max(1, item.largura);
      spriteImagem.height = Math.max(1, item.altura);
      spriteImagem.visible = false;
      container.addChild(spriteImagem);
    }

    const ent: EntradaVisual = { item, container, graficos, spriteImagem };
    this.atualizarEntrada(ent, item, todos, paleta);
    return ent;
  }

  private atualizarEntrada(
    ent: EntradaVisual,
    item: Item,
    todos: ReadonlyMap<string, Item>,
    paleta: PaletaDaCampanha,
  ): void {
    ent.container.zIndex = item.z;
    aplicarRotacaoEPosicao(ent.container, item);
    const g = ent.graficos!;
    g.clear();

    if (item.tipo === 'seta') {
      desenharSetaPixi(g, item, todos);
      return;
    }

    if (item.tipo === 'traco') {
      desenharTracoPixi(g, item);
      return;
    }

    if (item.tipo === 'imagem') {
      const c = item.caixa;
      if (ent.spriteImagem) {
        ent.spriteImagem.width = Math.max(1, item.largura);
        ent.spriteImagem.height = Math.max(1, item.altura);
        ent.spriteImagem.alpha = c.opacidade;
      }
      g.rect(0, 0, Math.max(1, item.largura), Math.max(1, item.altura)).fill({
        color: 0x2a332d,
        alpha: c.opacidade,
      });
      if (c.borda && c.espessuraBorda > 0) {
        const b = parsearCorPixi(c.borda);
        g.rect(0, 0, Math.max(1, item.largura), Math.max(1, item.altura)).stroke({
          color: b.color,
          alpha: b.alpha,
          width: c.espessuraBorda,
        });
      }
      return;
    }

    if (item.tipo === 'forma') {
      const c = item.caixa;
      const pal = item.semantica && !c.fundo ? paleta : PALETA_PADRAO;
      const fundo = fundoEfetivo(item, pal);
      if (fundo && c.opacidade > 0) {
        const f = parsearCorPixi(fundo);
        desenharContornoForma(g, item.forma, item.largura, item.altura, c.raio);
        g.fill({ color: f.color, alpha: f.alpha * c.opacidade });
      }
      if (c.borda && c.espessuraBorda > 0) {
        const b = parsearCorPixi(c.borda);
        if (c.tracejado === 'solido' || (item.forma !== 'retangulo' && item.forma !== 'arredondado')) {
          desenharContornoForma(g, item.forma, item.largura, item.altura, c.raio);
        } else {
          desenharPolilinha(
            g,
            [
              { x: 0, y: 0 },
              { x: item.largura, y: 0 },
              { x: item.largura, y: item.altura },
              { x: 0, y: item.altura },
            ],
            c.tracejado,
            c.espessuraBorda,
            true,
          );
        }
        g.stroke({ color: b.color, alpha: b.alpha, width: c.espessuraBorda });
      }
      return;
    }

    if (item.tipo === 'texto') {
      const c = item.caixa;
      const pal = item.semantica && !c.fundo ? paleta : PALETA_PADRAO;
      const fundo = fundoEfetivo(item, pal);
      desenharCaixaRetangular(
        g,
        item.largura,
        item.altura,
        c.raio,
        fundo,
        c.opacidade,
        c.borda,
        c.espessuraBorda,
        c.tracejado,
      );
      return;
    }

    if (item.tipo === 'moldura') {
      const c = item.caixa;
      desenharCaixaRetangular(
        g,
        item.largura,
        item.altura,
        c.raio,
        c.fundo ?? '#ffffff',
        c.fundo ? c.opacidade : 0.02,
        c.borda ?? '#4b5e53',
        c.borda ? c.espessuraBorda : 1.5,
        c.tracejado,
      );
      return;
    }

    if (item.tipo === 'ref') {
      desenharCaixaRetangular(
        g,
        item.largura,
        item.altura,
        8,
        '#202b24',
        1,
        '#4b5e53',
        1,
        'solido',
      );
    }
  }

  obterIndice(): IndiceEspacial<Item> | null {
    return this.indice;
  }

  quantidadeVisual(): number {
    return this.entradas.size;
  }

  quantidadeVisiveis(): number {
    let n = 0;
    for (const ent of this.entradas.values()) if (ent.container.visible) n++;
    return n;
  }

  destruir(): void {
    for (const ent of this.entradas.values()) {
      ent.container.destroy({ children: true });
    }
    this.entradas.clear();
    this.cacheTextos.destruir();
    this.indice = null;
    this.itensAnteriores = null;
  }
}

function montarPedidoTexto(
  item: Item,
  todos: ReadonlyMap<string, Item>,
  paleta: PaletaDaCampanha,
  zoom: number,
): { pedido: PedidoTextoPixi; x: number; y: number } | null {
  if (item.tipo === 'texto') {
    const pal = item.semantica && !item.caixa.fundo ? paleta : PALETA_PADRAO;
    const fundo = fundoEfetivo(item, pal);
    const corPadrao = item.semantica && !item.caixa.fundo && fundo ? corDoTexto(fundo) : item.texto.cor;
    return {
      x: 0,
      y: 0,
      pedido: {
        chave: item.id,
        versaoItem: item,
        doc: item.doc,
        largura: item.largura,
        altura: item.altura,
        padding: item.caixa.padding,
        fonte: item.texto.fonte,
        tamanhoFonte: item.texto.tamanho,
        corPadrao,
        alinhamento: item.texto.alinhamento,
        vertical: item.texto.vertical,
      },
    };
  }

  if (item.tipo === 'forma') {
    const pal = item.semantica && !item.caixa.fundo ? paleta : PALETA_PADRAO;
    const fundo = fundoEfetivo(item, pal);
    const corPadrao = item.semantica && !item.caixa.fundo && fundo ? corDoTexto(fundo) : item.texto.cor;
    const util = areaUtil(item.forma, { x: 0, y: 0, largura: item.largura, altura: item.altura });
    return {
      x: util.x,
      y: util.y,
      pedido: {
        chave: item.id,
        versaoItem: item,
        doc: item.doc,
        largura: util.largura,
        altura: util.altura,
        padding: item.caixa.padding,
        fonte: item.texto.fonte,
        tamanhoFonte: item.texto.tamanho,
        corPadrao,
        alinhamento: item.texto.alinhamento,
        vertical: item.texto.vertical,
      },
    };
  }

  if (item.tipo === 'moldura' && item.titulo.trim()) {
    const invZoom = 1 / Math.max(ZOOM_MIN, zoom);
    const tamFonte = 14 * invZoom;
    return {
      x: 0,
      y: -26 * invZoom,
      pedido: {
        chave: item.id,
        versaoItem: `${item.titulo}:${Math.round(invZoom * 100)}`,
        doc: docDeTexto(item.titulo),
        largura: Math.max(140 * invZoom, Math.min(item.largura, item.titulo.length * 10 * invZoom)),
        altura: 24 * invZoom,
        padding: 4 * invZoom,
        fonte: 'hanken',
        tamanhoFonte: tamFonte,
        corPadrao: '#e8efe9',
        alinhamento: 'esquerda',
        vertical: 'meio',
      },
    };
  }

  if (item.tipo === 'seta' && item.rotulo.trim()) {
    const cam = caminhoDaSeta(item, todos);
    const larg = Math.max(60, Math.min(260, item.rotulo.length * 9 + 16));
    const alt = 24;
    return {
      x: cam.meio[0] - larg / 2,
      y: cam.meio[1] - alt / 2,
      pedido: {
        chave: item.id,
        versaoItem: item,
        doc: docDeTexto(item.rotulo),
        largura: larg,
        altura: alt,
        padding: 4,
        fonte: 'hanken',
        tamanhoFonte: 13,
        corPadrao: '#e8efe9',
        alinhamento: 'centro',
        vertical: 'meio',
      },
    };
  }

  if (item.tipo === 'ref') {
    const texto = item.rotulo?.trim() || `${item.ref.tipo}: ${item.ref.id}`;
    return {
      x: 0,
      y: 0,
      pedido: {
        chave: item.id,
        versaoItem: item,
        doc: docDeTexto(texto),
        largura: item.largura,
        altura: item.altura,
        padding: 10,
        fonte: 'hanken',
        tamanhoFonte: 14,
        corPadrao: '#e8efe9',
        alinhamento: 'esquerda',
        vertical: 'meio',
      },
    };
  }

  return null;
}

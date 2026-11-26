import { Application, Container, Graphics } from 'pixi.js';
import type { Camera, Ponto, Tamanho } from '../../../dominio/camera.ts';
import type { IndiceEspacial } from '../../../dominio/indice-espacial.ts';
import type { Item } from '../../../dominio/quadro.ts';
import { CacheImagensPixi } from './cache-imagens-pixi.ts';
import { desenharGradePixi, type ConfigFundoGrade } from './grade-pixi.ts';
import { itemNoPontoEspacial } from './hittest-pixi.ts';
import { GerenciadorItensPixi, type OpcoesSincroniaItens } from './render-itens.ts';
import { CamadaSelecaoPixi, type OpcoesSelecaoPixi } from './selecao-pixi.ts';

export interface OpcoesViewportQuadro {
  canvas: HTMLCanvasElement;
  tamanho: Tamanho;
  camera: Camera;
  fundo: ConfigFundoGrade;
  aoAtualizarAssincrono?: () => void;
}

/**
 * Viewport PixiJS 8 para o quadro da Mesa: mantém uma única instância de `Application`,
 * move/escala `camadaMundo` em O(1) e renderiza sob demanda via `requestAnimationFrame`.
 */
export class ViewportQuadro {
  readonly app = new Application();
  readonly camadaGrade = new Graphics();
  readonly camadaMundo = new Container();
  readonly camadaMolduras = new Container();
  readonly camadaItens = new Container();
  readonly camadaSetas = new Container();
  readonly camadaSelecao = new Container();
  readonly cacheImagens: CacheImagensPixi;
  readonly gerenciadorItens: GerenciadorItensPixi;
  readonly selecaoPixi: CamadaSelecaoPixi;

  private readonly opcoes: OpcoesViewportQuadro;
  private cameraAtual: Camera;
  private tamanhoAtual: Tamanho;
  private fundoAtual: ConfigFundoGrade;
  private ultimasOpcoesCena: Omit<OpcoesSincroniaItens, 'aoFicarPendenteTexto'> | null = null;
  private ultimaSelecao: OpcoesSelecaoPixi | null = null;
  private pronto = false;
  private destruido = false;
  private rafPendente: number | null = null;

  constructor(opcoes: OpcoesViewportQuadro) {
    this.opcoes = opcoes;
    this.cameraAtual = opcoes.camera;
    this.tamanhoAtual = opcoes.tamanho;
    this.fundoAtual = opcoes.fundo;
    this.cacheImagens = new CacheImagensPixi({
      aoCarregar: () => this.agendarSincronia(),
    });
    this.gerenciadorItens = new GerenciadorItensPixi({
      camadaMolduras: this.camadaMolduras,
      camadaItens: this.camadaItens,
      camadaSetas: this.camadaSetas,
      cacheImagens: this.cacheImagens,
    });
    this.selecaoPixi = new CamadaSelecaoPixi(this.camadaSelecao);
  }

  async iniciar(): Promise<void> {
    await this.app.init({
      canvas: this.opcoes.canvas,
      preference: 'webgl',
      antialias: true,
      autoDensity: true,
      autoStart: false,
      resolution: Math.max(1, Math.min(2, window.devicePixelRatio || 1)),
      width: Math.max(1, this.tamanhoAtual.largura),
      height: Math.max(1, this.tamanhoAtual.altura),
      background: this.fundoAtual.cor,
      backgroundAlpha: 1,
    });

    if (this.destruido) {
      this.app.destroy(false, { children: true });
      return;
    }

    this.camadaMundo.addChild(
      this.camadaMolduras,
      this.camadaItens,
      this.camadaSetas,
      this.camadaSelecao,
    );
    this.app.stage.addChild(this.camadaGrade, this.camadaMundo);
    this.pronto = true;
    this.aplicarCamera(this.cameraAtual);
    if (this.ultimasOpcoesCena) {
      this.sincronizarCena(this.ultimasOpcoesCena, this.ultimaSelecao ?? undefined);
    }
  }

  estaPronto(): boolean {
    return this.pronto && !this.destruido;
  }

  definirTamanho(tamanho: Tamanho): void {
    this.tamanhoAtual = tamanho;
    if (!this.estaPronto()) return;
    this.app.renderer.resize(
      Math.max(1, Math.round(tamanho.largura)),
      Math.max(1, Math.round(tamanho.altura)),
    );
    desenharGradePixi(this.camadaGrade, this.fundoAtual, this.cameraAtual, this.tamanhoAtual);
    if (this.ultimasOpcoesCena) {
      this.sincronizarCena(
        { ...this.ultimasOpcoesCena, tamanho: this.tamanhoAtual },
        this.ultimaSelecao ?? undefined,
      );
    } else {
      this.renderizar();
    }
  }

  definirFundo(fundo: ConfigFundoGrade): void {
    this.fundoAtual = fundo;
    if (!this.estaPronto()) return;
    this.app.renderer.background.color = fundo.cor;
    desenharGradePixi(this.camadaGrade, this.fundoAtual, this.cameraAtual, this.tamanhoAtual);
    this.renderizar();
  }

  aplicarCamera(camera: Camera): void {
    this.cameraAtual = camera;
    if (!this.estaPronto()) return;
    this.camadaMundo.position.set(-camera.x * camera.zoom, -camera.y * camera.zoom);
    this.camadaMundo.scale.set(camera.zoom);
    desenharGradePixi(this.camadaGrade, this.fundoAtual, this.cameraAtual, this.tamanhoAtual);
    this.renderizar();
  }

  sincronizarCena(
    opCena: Omit<OpcoesSincroniaItens, 'aoFicarPendenteTexto'>,
    opSelecao?: OpcoesSelecaoPixi,
  ): void {
    this.ultimasOpcoesCena = opCena;
    if (opSelecao !== undefined) this.ultimaSelecao = opSelecao;
    this.cameraAtual = opCena.camera;
    this.tamanhoAtual = opCena.tamanho;

    if (!this.estaPronto()) return;
    this.camadaMundo.position.set(
      -opCena.camera.x * opCena.camera.zoom,
      -opCena.camera.y * opCena.camera.zoom,
    );
    this.camadaMundo.scale.set(opCena.camera.zoom);
    desenharGradePixi(this.camadaGrade, this.fundoAtual, this.cameraAtual, this.tamanhoAtual);

    this.gerenciadorItens.sincronizar({
      ...opCena,
      aoFicarPendenteTexto: () => this.agendarSincronia(),
    });
    if (this.ultimaSelecao) {
      this.selecaoPixi.atualizar(this.ultimaSelecao);
    }
    this.renderizar();
  }

  indiceEspacial(): IndiceEspacial<Item> | null {
    return this.gerenciadorItens.obterIndice();
  }

  itemNoPonto(
    ponto: Ponto,
    permitirMoldura = false,
    esconderSegredos = false,
  ): Item | null {
    const cena = this.ultimasOpcoesCena;
    const indice = this.indiceEspacial();
    if (!cena || !indice) return null;
    return itemNoPontoEspacial(
      indice,
      cena.itens,
      ponto,
      this.cameraAtual.zoom,
      permitirMoldura,
      esconderSegredos,
    );
  }

  private agendarSincronia(): void {
    if (this.destruido || this.rafPendente !== null) return;
    if (typeof requestAnimationFrame !== 'function') return;
    this.rafPendente = requestAnimationFrame(() => {
      this.rafPendente = null;
      if (this.destruido || !this.estaPronto()) return;
      if (this.ultimasOpcoesCena) {
        this.sincronizarCena(this.ultimasOpcoesCena, this.ultimaSelecao ?? undefined);
      }
      this.opcoes.aoAtualizarAssincrono?.();
    });
  }

  private renderizar(): void {
    if (this.estaPronto()) {
      this.app.render();
    }
  }

  destruir(): void {
    if (this.destruido) return;
    this.destruido = true;
    if (this.rafPendente !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this.rafPendente);
      this.rafPendente = null;
    }
    this.gerenciadorItens.destruir();
    this.selecaoPixi.destruir();
    this.cacheImagens.destruir();
    if (this.pronto) {
      this.pronto = false;
      this.app.destroy(false, { children: true });
    }
  }
}

import { Application, Container, Graphics } from 'pixi.js';
import type { Camera, Tamanho } from '../../../dominio/camera.ts';
import { CacheImagensPixi } from './cache-imagens-pixi.ts';
import { desenharGradePixi, type ConfigFundoGrade } from './grade-pixi.ts';

export interface OpcoesViewportQuadro {
  canvas: HTMLCanvasElement;
  tamanho: Tamanho;
  camera: Camera;
  fundo: ConfigFundoGrade;
  aoCarregarImagem?: () => void;
}

/**
 * Viewport PixiJS 8 para o quadro da Mesa: mantém uma única instância de `Application`
 * e move/escala `camadaMundo` em O(1) durante pan e zoom.
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

  private readonly opcoes: OpcoesViewportQuadro;
  private cameraAtual: Camera;
  private tamanhoAtual: Tamanho;
  private fundoAtual: ConfigFundoGrade;
  private pronto = false;
  private destruido = false;

  constructor(opcoes: OpcoesViewportQuadro) {
    this.opcoes = opcoes;
    this.cameraAtual = opcoes.camera;
    this.tamanhoAtual = opcoes.tamanho;
    this.fundoAtual = opcoes.fundo;
    this.cacheImagens = new CacheImagensPixi({
      aoCarregar: () => {
        if (!this.destruido) opcoes.aoCarregarImagem?.();
      },
    });
  }

  async iniciar(): Promise<void> {
    await this.app.init({
      canvas: this.opcoes.canvas,
      preference: 'webgl',
      antialias: true,
      autoDensity: true,
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
  }

  definirFundo(fundo: ConfigFundoGrade): void {
    this.fundoAtual = fundo;
    if (!this.estaPronto()) return;
    this.app.renderer.background.color = fundo.cor;
    desenharGradePixi(this.camadaGrade, this.fundoAtual, this.cameraAtual, this.tamanhoAtual);
  }

  aplicarCamera(camera: Camera): void {
    this.cameraAtual = camera;
    if (!this.estaPronto()) return;
    this.camadaMundo.position.set(-camera.x * camera.zoom, -camera.y * camera.zoom);
    this.camadaMundo.scale.set(camera.zoom);
    desenharGradePixi(this.camadaGrade, this.fundoAtual, this.cameraAtual, this.tamanhoAtual);
  }

  destruir(): void {
    if (this.destruido) return;
    this.destruido = true;
    this.cacheImagens.destruir();
    if (this.pronto) {
      this.pronto = false;
      this.app.destroy(false, { children: true });
    }
  }
}

// Captura de uma região do quadro como JPEG, fora da tela (Q9c). Funciona com o quadro aberto ou fechado:
// monta um palco Pixi próprio, espera textos e imagens, exporta e destrói tudo.
import { Application, Container, Graphics, Rectangle } from 'pixi.js';
import type { Caixa } from '../../../dominio/camera.ts';
import { escalaDaCaptura, itensDaRegiao } from '../../../dominio/caixa-da-captura.ts';
import type { PaletaDaCampanha } from '../../../dominio/paleta.ts';
import type { Item } from '../../../dominio/quadro.ts';
import { CacheImagensPixi } from './cache-imagens-pixi.ts';
import { parsearCorPixi } from './cores-pixi.ts';
import { GerenciadorItensPixi } from './render-itens.ts';

export interface OpcoesDaCaptura {
  lado: number;
  fundo: string;
  paleta: PaletaDaCampanha;
  /** Tempo máximo esperando imagens e textos (ms). Padrão 3000. */
  prazo?: number;
}

// setTimeout, não requestAnimationFrame: o WebKit suspende o rAF com a janela escondida (o mestre está em outra
// janela quando o assistente captura), e a captura ficava parada para sempre.
const esperarQuadro = () => new Promise<void>((r) => setTimeout(r, 30));

/** Data URL JPEG (qualidade 0,8) da `caixa`, com o maior lado em `lado` px. */
export async function capturarRegiao(itens: ReadonlyMap<string, Item>, caixa: Caixa, opcoes: OpcoesDaCaptura): Promise<string> {
  const { zoom, largura, altura } = escalaDaCaptura(caixa, opcoes.lado);
  const regiao = itensDaRegiao(itens, caixa);
  const app = new Application();
  await app.init({
    canvas: document.createElement('canvas'),
    preference: 'webgl',
    antialias: true,
    autoStart: false,
    resolution: 1,
    width: largura,
    height: altura,
    background: opcoes.fundo,
    backgroundAlpha: 1,
  });
  let mudou = true;
  const cacheImagens = new CacheImagensPixi({ aoCarregar: () => { mudou = true; } });
  const mundo = new Container();
  const molduras = new Container();
  const camadaItens = new Container();
  const setas = new Container();
  mundo.addChild(molduras, camadaItens, setas);
  // O extract não usa o fundo do renderer (sai transparente, e o JPEG fica preto): o fundo vai num retângulo.
  const f = parsearCorPixi(opcoes.fundo, 0x161d19);
  const fundo = new Graphics().rect(0, 0, largura, altura).fill({ color: f.color, alpha: 1 });
  app.stage.addChild(fundo, mundo);
  mundo.position.set(-caixa.x * zoom, -caixa.y * zoom);
  mundo.scale.set(zoom);
  const gerenciador = new GerenciadorItensPixi({ camadaMolduras: molduras, camadaItens, camadaSetas: setas, cacheImagens });
  try {
    const limite = Date.now() + (opcoes.prazo ?? 3000);
    // Imagens: a primeira passada só agenda as miniaturas; as seguintes pedem a completa.
    for (let passada = 0; Date.now() < limite; passada++) {
      let pendenteTexto = false;
      mudou = false;
      gerenciador.sincronizar({
        itens: regiao,
        camera: { x: caixa.x, y: caixa.y, zoom },
        tamanho: { largura, altura },
        paleta: opcoes.paleta,
        esconderSegredos: false,
        aoFicarPendenteTexto: () => { pendenteTexto = true; },
      });
      if (passada > 1 && !pendenteTexto && !mudou && cacheImagens.emCarregamento() === 0) break;
      await esperarQuadro();
    }
    app.render();
    return await app.renderer.extract.base64({ target: app.stage, format: 'jpg', quality: 0.8, frame: new Rectangle(0, 0, largura, altura) });
  } finally {
    gerenciador.destruir();
    cacheImagens.destruir();
    app.destroy(true, { children: true });
  }
}

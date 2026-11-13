import { useSignal } from '@preact/signals';
import { useEffect, useRef } from 'preact/hooks';
import {
  caixaEnvolventeDeItem,
  caixaEnvolventeTotal,
  enquadrar,
  zoomEm,
  type Camera,
  type Tamanho,
} from '../../dominio/camera.ts';
import {
  fecharQuadro,
  itemPendente,
  itens,
  mudarFundo,
  quadroAberto,
  renomearQuadro,
} from '../../app/quadros.ts';
import { navegarParaQuadro } from '../../app/rotas.ts';
import { cx } from '../cx.ts';
import { Mundo } from './Mundo.tsx';
import { PainelDoFundo, type ModoRoda } from './PainelDoFundo.tsx';

const CHAVE_RODA = 'mesa:quadro:roda';
const CHAVE_CAMERA = (id: string) => `mesa:quadro-camera:${id}`;
const CAMERA_PADRAO: Camera = { x: -200, y: -150, zoom: 1 };

function lerModoRoda(): ModoRoda {
  try {
    return localStorage.getItem(CHAVE_RODA) === 'rolagem' ? 'rolagem' : 'zoom';
  } catch {
    return 'zoom';
  }
}

function gravarModoRoda(modo: ModoRoda): void {
  try {
    localStorage.setItem(CHAVE_RODA, modo);
  } catch {
    /* ignora */
  }
}

function lerCameraSalva(id: string): Camera {
  try {
    const bruto = localStorage.getItem(CHAVE_CAMERA(id));
    if (!bruto) return CAMERA_PADRAO;
    const obj = JSON.parse(bruto) as Partial<Camera>;
    if (
      typeof obj.x === 'number' &&
      Number.isFinite(obj.x) &&
      typeof obj.y === 'number' &&
      Number.isFinite(obj.y) &&
      typeof obj.zoom === 'number' &&
      Number.isFinite(obj.zoom) &&
      obj.zoom > 0
    ) {
      return { x: obj.x, y: obj.y, zoom: obj.zoom };
    }
  } catch {
    /* ignora */
  }
  return CAMERA_PADRAO;
}

function gravarCamera(id: string, cam: Camera): void {
  try {
    localStorage.setItem(CHAVE_CAMERA(id), JSON.stringify(cam));
  } catch {
    /* ignora */
  }
}

function corFundoClara(hex: string): boolean {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return false;
  const n = parseInt(m[1]!, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return (r * 299 + g * 587 + b * 114) / 1000 > 140;
}

function estiloGrade(
  fundo: { cor: string; grade: 'nenhuma' | 'pontos' | 'linhas'; passo: number },
  cam: Camera,
): Record<string, string | undefined> {
  const passoTela = fundo.passo * cam.zoom;
  if (fundo.grade === 'nenhuma' || passoTela < 6) {
    return { backgroundColor: fundo.cor };
  }
  const clara = corFundoClara(fundo.cor);
  const traco = clara ? 'rgba(0, 0, 0, 0.14)' : 'rgba(255, 255, 255, 0.14)';
  const ponto = clara ? 'rgba(0, 0, 0, 0.22)' : 'rgba(255, 255, 255, 0.2)';
  const ox = ((-cam.x * cam.zoom) % passoTela + passoTela) % passoTela;
  const oy = ((-cam.y * cam.zoom) % passoTela + passoTela) % passoTela;

  const backgroundImage =
    fundo.grade === 'pontos'
      ? `radial-gradient(circle, ${ponto} 1px, transparent 1px)`
      : `linear-gradient(to right, ${traco} 1px, transparent 1px), linear-gradient(to bottom, ${traco} 1px, transparent 1px)`;

  return {
    backgroundColor: fundo.cor,
    backgroundImage,
    backgroundSize: `${passoTela}px ${passoTela}px`,
    backgroundPosition: `${ox}px ${oy}px`,
  };
}

function emCampoDeTexto(alvo: EventTarget | null): boolean {
  if (!(alvo instanceof HTMLElement)) return false;
  const tag = alvo.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || alvo.isContentEditable;
}

export function Quadro() {
  const q = quadroAberto.value;
  if (!q) return null;

  const areaRef = useRef<HTMLDivElement>(null);
  const camera = useSignal<Camera>(lerCameraSalva(q.id));
  const tamanhoTela = useSignal<Tamanho>({ largura: 1280, altura: 720 });
  const painelFundoAberto = useSignal(false);
  const ferramentaMao = useSignal(false);
  const espacoPressionado = useSignal(false);
  const modoRoda = useSignal<ModoRoda>(lerModoRoda());
  const arrastando = useRef<{ x: number; y: number; camX: number; camY: number } | null>(null);

  // Recarrega câmera salva ao trocar de quadro
  useEffect(() => {
    camera.value = lerCameraSalva(q.id);
  }, [q.id]);

  // Persiste câmera por quadro
  useEffect(() => {
    gravarCamera(q.id, camera.value);
  }, [q.id, camera.value]);

  // Observa o tamanho da área do quadro
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const atualizarTamanho = () => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        tamanhoTela.value = { largura: r.width, altura: r.height };
      }
    };
    atualizarTamanho();
    const obs = new ResizeObserver(atualizarTamanho);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Enquadra item pendente vindo da rota #/quadro/<id>/item/<itemId>
  useEffect(() => {
    const pendenteId = itemPendente.value;
    if (!pendenteId) return;
    const alvo = itens.value.get(pendenteId);
    if (!alvo) return;
    camera.value = enquadrar(caixaEnvolventeDeItem(alvo), tamanhoTela.value, 80);
    itemPendente.value = null;
  }, [itemPendente.value, itens.value, tamanhoTela.value]);

  // Roda do mouse (non-passive para impedir zoom do navegador)
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const cam = camera.value;
      if (e.ctrlKey || e.metaKey || modoRoda.value === 'zoom') {
        const rect = el.getBoundingClientRect();
        const ponto = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        const fator = Math.exp(-e.deltaY * 0.002);
        camera.value = zoomEm(cam, ponto, fator);
      } else {
        camera.value = {
          ...cam,
          x: cam.x + e.deltaX / cam.zoom,
          y: cam.y + e.deltaY / cam.zoom,
        };
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // Atalhos de teclado
  useEffect(() => {
    const verTudo = () => {
      const caixa = caixaEnvolventeTotal(itens.value.values());
      if (caixa) {
        camera.value = enquadrar(caixa, tamanhoTela.value, 64);
      } else {
        camera.value = CAMERA_PADRAO;
      }
    };

    const zoomNoCentro = (novoFatorOuZoom: { fator?: number; zoomExato?: number }) => {
      const cam = camera.value;
      const centro = {
        x: tamanhoTela.value.largura / 2,
        y: tamanhoTela.value.altura / 2,
      };
      const fator =
        novoFatorOuZoom.zoomExato !== undefined
          ? novoFatorOuZoom.zoomExato / cam.zoom
          : (novoFatorOuZoom.fator ?? 1);
      camera.value = zoomEm(cam, centro, fator);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (emCampoDeTexto(e.target)) return;
      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        espacoPressionado.value = true;
        return;
      }
      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        if (e.key === 'h' || e.key === 'H') {
          ferramentaMao.value = !ferramentaMao.value;
          return;
        }
        if (e.shiftKey && (e.code === 'Digit1' || e.key === '!')) {
          e.preventDefault();
          verTudo();
          return;
        }
      }
      if (e.ctrlKey || e.metaKey) {
        if (e.key === '0') {
          e.preventDefault();
          zoomNoCentro({ zoomExato: 1 });
        } else if (e.key === '=' || e.key === '+') {
          e.preventDefault();
          zoomNoCentro({ fator: 1.25 });
        } else if (e.key === '-') {
          e.preventDefault();
          zoomNoCentro({ fator: 1 / 1.25 });
        }
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        espacoPressionado.value = false;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  const modoPanAtivo = ferramentaMao.value || espacoPressionado.value;

  const aoPressionar = (e: PointerEvent) => {
    const ehBotaoMeio = e.button === 1;
    const ehPanEsquerdo = e.button === 0 && modoPanAtivo;
    if (!ehBotaoMeio && !ehPanEsquerdo) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    arrastando.current = {
      x: e.clientX,
      y: e.clientY,
      camX: camera.value.x,
      camY: camera.value.y,
    };
  };

  const aoMover = (e: PointerEvent) => {
    const a = arrastando.current;
    if (!a) return;
    const cam = camera.value;
    camera.value = {
      ...cam,
      x: a.camX - (e.clientX - a.x) / cam.zoom,
      y: a.camY - (e.clientY - a.y) / cam.zoom,
    };
  };

  const aoSoltar = (e: PointerEvent) => {
    if (!arrastando.current) return;
    arrastando.current = null;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignora */
    }
  };

  return (
    <section class="tela-quadro" data-testid="tela-quadro">
      <div class="barra-quadro" data-testid="barra-quadro">
        <button
          type="button"
          class="botao-pilula"
          data-testid="voltar-quadros"
          onClick={() => {
            void fecharQuadro().then(() => navegarParaQuadro(null));
          }}
        >
          ← Quadros
        </button>
        <input
          type="text"
          class="quadro-nome-input"
          aria-label="Nome do quadro"
          data-testid="quadro-nome"
          value={q.nome}
          onBlur={(e) => {
            const v = e.currentTarget.value.trim();
            if (v && v !== q.nome) {
              void renomearQuadro(q.id, v);
            } else {
              e.currentTarget.value = q.nome;
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
        />
        <span class="espaco" />
        <button
          type="button"
          class={cx('botao-pilula', ferramentaMao.value && 'destaque')}
          aria-pressed={ferramentaMao.value}
          title="Ferramenta Mão (H ou segure Espaço)"
          data-testid="ferramenta-mao"
          onClick={() => {
            ferramentaMao.value = !ferramentaMao.value;
          }}
        >
          Mão
        </button>
        <button
          type="button"
          class="botao-pilula"
          aria-pressed={painelFundoAberto.value}
          data-testid="botao-fundo"
          onClick={() => {
            painelFundoAberto.value = !painelFundoAberto.value;
          }}
        >
          Fundo e grade
        </button>
        <button
          type="button"
          class="selo"
          title="Clique para voltar a 100% (Ctrl+0)"
          data-testid="quadro-zoom"
          onClick={() => {
            const cam = camera.value;
            const centro = {
              x: tamanhoTela.value.largura / 2,
              y: tamanhoTela.value.altura / 2,
            };
            camera.value = zoomEm(cam, centro, 1 / cam.zoom);
          }}
        >
          {Math.round(camera.value.zoom * 100)}%
        </button>
      </div>

      <div
        ref={areaRef}
        class={cx('area-quadro', modoPanAtivo && 'modo-mao')}
        data-testid="area-quadro"
        style={estiloGrade(q.fundo, camera.value)}
        onPointerDown={aoPressionar}
        onPointerMove={aoMover}
        onPointerUp={aoSoltar}
        onPointerCancel={aoSoltar}
      >
        <Mundo camera={camera.value} tamanhoTela={tamanhoTela.value} itens={itens.value} />

        {painelFundoAberto.value ? (
          <PainelDoFundo
            fundo={q.fundo}
            roda={modoRoda.value}
            onMudarFundo={(parcial) => {
              void mudarFundo(parcial);
            }}
            onMudarRoda={(modo) => {
              modoRoda.value = modo;
              gravarModoRoda(modo);
            }}
            onFechar={() => {
              painelFundoAberto.value = false;
            }}
          />
        ) : null}
      </div>
    </section>
  );
}

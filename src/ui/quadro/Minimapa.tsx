import { useSignal } from '@preact/signals';
import { useEffect, useRef } from 'preact/hooks';
import {
  caixaEnvolventeTotal,
  caixaVisivel,
  type Camera,
  type Tamanho,
} from '../../dominio/camera.ts';
import { fundoEfetivo } from '../../dominio/paleta.ts';
import type { Item } from '../../dominio/quadro.ts';
import { paletaDaCampanha } from '../../app/quadros.ts';

interface MinimapaProps {
  itens: ReadonlyMap<string, Item>;
  camera: Camera;
  tamanhoTela: Tamanho;
  onMoverCamera: (cam: Camera) => void;
}

const LARGURA_MINIMAPA = 180;
const ALTURA_MINIMAPA = 116;

export function Minimapa({
  itens,
  camera,
  tamanhoTela,
  onMoverCamera,
}: MinimapaProps) {
  const recolhido = useSignal(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const arrastandoRef = useRef(false);
  const ultimoDesenhoRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const projecaoRef = useRef({ minX: 0, minY: 0, escala: 1 });

  const desenhar = () => {
    const canvas = canvasRef.current;
    if (!canvas || recolhido.value) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ultimoDesenhoRef.current = performance.now();
    ctx.clearRect(0, 0, LARGURA_MINIMAPA, ALTURA_MINIMAPA);

    const vis = caixaVisivel(camera, tamanhoTela);
    const total = caixaEnvolventeTotal(itens.values());
    const minX = total ? Math.min(total.x, vis.x) : vis.x;
    const minY = total ? Math.min(total.y, vis.y) : vis.y;
    const maxX = total ? Math.max(total.x + total.largura, vis.x + vis.largura) : vis.x + vis.largura;
    const maxY = total ? Math.max(total.y + total.altura, vis.y + vis.altura) : vis.y + vis.altura;

    const mundoW = Math.max(100, maxX - minX);
    const mundoH = Math.max(100, maxY - minY);
    const escala = Math.min(
      (LARGURA_MINIMAPA - 12) / mundoW,
      (ALTURA_MINIMAPA - 12) / mundoH,
    );
    const offX = (LARGURA_MINIMAPA - mundoW * escala) / 2 - minX * escala;
    const offY = (ALTURA_MINIMAPA - mundoH * escala) / 2 - minY * escala;

    projecaoRef.current = {
      minX: -offX / escala,
      minY: -offY / escala,
      escala,
    };

    for (const it of itens.values()) {
      if (it.tipo === 'moldura') {
        ctx.strokeStyle = 'rgba(200, 212, 203, 0.35)';
        ctx.lineWidth = 1;
        ctx.strokeRect(
          it.x * escala + offX,
          it.y * escala + offY,
          Math.max(2, it.largura * escala),
          Math.max(2, it.altura * escala),
        );
        continue;
      }
      const fundo = 'caixa' in it ? fundoEfetivo(it, paletaDaCampanha.value) : null;
      ctx.fillStyle =
        fundo
          ? fundo
          : it.tipo === 'seta' || it.tipo === 'traco'
            ? it.cor
            : '#8fa396';
      ctx.fillRect(
        it.x * escala + offX,
        it.y * escala + offY,
        Math.max(2, it.largura * escala),
        Math.max(2, it.altura * escala),
      );
    }

    ctx.strokeStyle = '#d9b44a';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(
      vis.x * escala + offX,
      vis.y * escala + offY,
      Math.max(4, vis.largura * escala),
      Math.max(4, vis.altura * escala),
    );
  };

  useEffect(() => {
    if (recolhido.value) return;
    const agora = performance.now();
    const decorrido = agora - ultimoDesenhoRef.current;
    if (decorrido >= 250) {
      desenhar();
    } else if (timerRef.current === null) {
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        desenhar();
      }, 250 - decorrido);
    }
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [itens, camera, tamanhoTela, recolhido.value]);

  const irParaPontoCanvas = (e: PointerEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const { minX, minY, escala } = projecaoRef.current;
    const mundoX = minX + cx / escala;
    const mundoY = minY + cy / escala;
    onMoverCamera({
      ...camera,
      x: mundoX - tamanhoTela.largura / (2 * camera.zoom),
      y: mundoY - tamanhoTela.altura / (2 * camera.zoom),
    });
  };

  return (
    <div
      class="minimapa-quadro"
      data-testid="minimapa"
      onPointerDown={(e) => e.stopPropagation()}
      onDblClick={(e) => e.stopPropagation()}
    >
      <div class="minimapa-cabecalho">
        <span class="meta">Minimapa</span>
        <button
          type="button"
          class="fmt-btn"
          data-testid="minimapa-toggle"
          title={recolhido.value ? 'Expandir minimapa' : 'Recolher minimapa'}
          onClick={() => {
            recolhido.value = !recolhido.value;
          }}
        >
          {recolhido.value ? '▢' : '—'}
        </button>
      </div>
      {!recolhido.value ? (
        <canvas
          ref={canvasRef}
          width={LARGURA_MINIMAPA}
          height={ALTURA_MINIMAPA}
          class="minimapa-canvas"
          data-testid="minimapa-canvas"
          onPointerDown={(e) => {
            e.stopPropagation();
            arrastandoRef.current = true;
            e.currentTarget.setPointerCapture(e.pointerId);
            irParaPontoCanvas(e);
          }}
          onPointerMove={(e) => {
            if (!arrastandoRef.current) return;
            irParaPontoCanvas(e);
          }}
          onPointerUp={(e) => {
            arrastandoRef.current = false;
            try {
              e.currentTarget.releasePointerCapture(e.pointerId);
            } catch {
              /* ignora */
            }
          }}
        />
      ) : null}
    </div>
  );
}

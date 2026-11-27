import { signal } from '@preact/signals';
import { useEffect, useRef } from 'preact/hooks';
import type { Ref } from '#mesa';
import { abrirNoApp } from '../app/barramento.ts';
import {
  idDaPistaDoAtelie,
  obterPistaDoAtelie,
  type PistaDoAtelie,
} from '../app/pistas-atelie.ts';
import { avisar } from '../app/toasts.ts';
import {
  RAIO_DA_LANTERNA,
  VISTA_INICIAL,
  arrastar,
  encaixe,
  paraFracao,
  paraTela,
  zoomEm,
  type Vista,
} from '../dominio/inspecao.ts';
import './fase-8.css';

export interface PistaAberta {
  pista: PistaDoAtelie;
  normal: ImageBitmap;
  uv: ImageBitmap | null;
}

export const pistaEmInspecao = signal<PistaAberta | null>(null);
export const mostrandoAosJogadores = signal(false);

const uvLigada = signal(false);

const CANAL_PROJETOR_GLOBAL = 'atlas:projetor:ativo';
const CANAL_PROJETOR_REMOTO = 'atlas:projetor:remoto';

let canalGlobal: BroadcastChannel | null = null;
let canalRemoto: BroadcastChannel | null = null;
let rascunhoUv: HTMLCanvasElement | null = null;

function publicarNosProjetores(mensagem: Record<string, unknown>): void {
  if (typeof BroadcastChannel !== 'function') return;
  try {
    canalGlobal ??= new BroadcastChannel(CANAL_PROJETOR_GLOBAL);
    canalGlobal.postMessage(mensagem);
  } catch {
    // ambiente sem suporte ou canal fechado
  }
  try {
    canalRemoto ??= new BroadcastChannel(CANAL_PROJETOR_REMOTO);
    canalRemoto.postMessage(mensagem);
  } catch {
    // ambiente sem suporte ou canal fechado
  }
}

function encerrarCanaisProjetor(): void {
  try { canalGlobal?.close(); } catch { /* ignora */ }
  try { canalRemoto?.close(); } catch { /* ignora */ }
  canalGlobal = null;
  canalRemoto = null;
}

function pararDeMostrarAosJogadores(): void {
  if (!mostrandoAosJogadores.peek()) return;
  publicarNosProjetores({ tipo: 'inspecao-fim' });
  encerrarCanaisProjetor();
  mostrandoAosJogadores.value = false;
}

function mostrarAosJogadores(
  d: PistaAberta,
  vista: Vista,
  lanterna: { x: number; y: number } | null,
): void {
  publicarNosProjetores({
    tipo: 'inspecao',
    nome: d.pista.name,
    normal: d.pista.normal,
    uv: d.pista.uv,
  });
  publicarNosProjetores({
    tipo: 'inspecao-estado',
    vista,
    lanterna,
  });
  mostrandoAosJogadores.value = true;
}

function enviarEstadoAosJogadores(
  vista: Vista,
  lanterna: { x: number; y: number } | null,
): void {
  if (!mostrandoAosJogadores.peek()) return;
  publicarNosProjetores({
    tipo: 'inspecao-estado',
    vista,
    lanterna,
  });
}

function liberarBitmapsComAtraso(aberta: PistaAberta | null): void {
  if (!aberta) return;
  setTimeout(() => {
    try { aberta.normal.close(); } catch { /* ignora */ }
    try { aberta.uv?.close(); } catch { /* ignora */ }
  }, 400);
}

/**
 * Abre o modal de inspeção 3D com lanterna UV dentro da Mesa para uma pista do Ateliê.
 * Retorna `false` (com aviso) se o documento não existir no banco `mesa-handouts-v1`.
 */
export async function abrirInspecaoNaMesa(refOuId: Ref | string): Promise<boolean> {
  const documentoId = typeof refOuId === 'string' ? refOuId : idDaPistaDoAtelie(refOuId);
  if (!documentoId) {
    avisar('Documento não encontrado no banco do Ateliê.', true);
    return false;
  }

  const pista = await obterPistaDoAtelie(documentoId);
  if (!pista) {
    avisar('Documento não encontrado no banco do Ateliê.', true);
    return false;
  }

  let normal: ImageBitmap;
  let uv: ImageBitmap | null = null;
  try {
    normal = await createImageBitmap(pista.normal);
    if (pista.uv) {
      uv = await createImageBitmap(pista.uv);
    }
  } catch {
    avisar('Não foi possível abrir a imagem da pista.', true);
    return false;
  }

  const anterior = pistaEmInspecao.peek();
  if (mostrandoAosJogadores.peek()) {
    pararDeMostrarAosJogadores();
  }
  uvLigada.value = false;
  pistaEmInspecao.value = { pista, normal, uv };
  liberarBitmapsComAtraso(anterior);
  return true;
}

/** Fecha o modal de inspeção, encerra a projeção aos jogadores e libera os bitmaps. */
export function fecharInspecaoNaMesa(): void {
  pararDeMostrarAosJogadores();
  const anterior = pistaEmInspecao.peek();
  pistaEmInspecao.value = null;
  uvLigada.value = false;
  liberarBitmapsComAtraso(anterior);
}

interface EstadoDoVisor {
  vista: Vista;
  lanterna: { x: number; y: number } | null;
}

function desenharDocumento(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  normal: ImageBitmap,
  uv: ImageBitmap | null,
  estado: EstadoDoVisor,
): void {
  ctx.clearRect(0, 0, W, H);
  const tela = { largura: W, altura: H };
  const img = { largura: normal.width, altura: normal.height };
  const r = encaixe(estado.vista, tela, img);
  ctx.imageSmoothingQuality = 'high';
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.65)';
  ctx.shadowBlur = 28;
  ctx.drawImage(normal, r.x, r.y, r.w, r.h);
  ctx.restore();

  if (!uv || !estado.lanterna) return;

  ctx.fillStyle = 'rgba(10, 6, 28, 0.58)';
  ctx.fillRect(r.x, r.y, r.w, r.h);

  rascunhoUv ??= document.createElement('canvas');
  if (rascunhoUv.width !== W || rascunhoUv.height !== H) {
    rascunhoUv.width = W;
    rascunhoUv.height = H;
  }
  const g = rascunhoUv.getContext('2d');
  if (!g) return;

  const [lx, ly] = paraTela([estado.lanterna.x, estado.lanterna.y], estado.vista, tela, img);
  const raio = RAIO_DA_LANTERNA * r.w;

  g.clearRect(0, 0, W, H);
  g.globalCompositeOperation = 'source-over';
  g.imageSmoothingQuality = 'high';
  g.drawImage(uv, r.x, r.y, r.w, r.h);
  g.globalCompositeOperation = 'destination-in';
  const grad = g.createRadialGradient(lx, ly, 0, lx, ly, raio);
  grad.addColorStop(0, 'rgba(0, 0, 0, 1)');
  grad.addColorStop(0.72, 'rgba(0, 0, 0, 1)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  ctx.drawImage(rascunhoUv, 0, 0);

  const halo = ctx.createRadialGradient(lx, ly, raio * 0.7, lx, ly, raio * 1.08);
  halo.addColorStop(0, 'rgba(160, 110, 255, 0)');
  halo.addColorStop(0.6, 'rgba(160, 110, 255, 0.22)');
  halo.addColorStop(1, 'rgba(160, 110, 255, 0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(lx, ly, raio * 1.08, 0, Math.PI * 2);
  ctx.fill();
}

export function InspecaoDePista() {
  const d = pistaEmInspecao.value;
  const area = useRef<HTMLDivElement>(null);
  const palco = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const vivo = useRef<{
    vista: Vista;
    lanterna: { x: number; y: number } | null;
    ultimoEnvio: number;
    arraste: { x: number; y: number } | null;
  }>({
    vista: VISTA_INICIAL,
    lanterna: null,
    ultimoEnvio: 0,
    arraste: null,
  });

  useEffect(() => {
    vivo.current.vista = VISTA_INICIAL;
    vivo.current.lanterna = null;
    vivo.current.arraste = null;
    uvLigada.value = false;
  }, [d?.pista.id]);

  useEffect(() => {
    if (!d) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        fecharInspecaoNaMesa();
      }
    };
    window.addEventListener('keydown', aoTeclar, true);
    return () => window.removeEventListener('keydown', aoTeclar, true);
  }, [d]);

  useEffect(() => {
    if (!d) return;
    const c = canvasRef.current;
    const g = c?.getContext('2d');
    if (!c || !g) return;

    let quadro = 0;
    const laco = () => {
      const dpr = typeof devicePixelRatio === 'number' ? devicePixelRatio : 1;
      const w = Math.max(1, Math.round(c.clientWidth * dpr));
      const h = Math.max(1, Math.round(c.clientHeight * dpr));
      if (c.width !== w || c.height !== h) {
        c.width = w;
        c.height = h;
      }
      const estado: EstadoDoVisor = {
        vista: vivo.current.vista,
        lanterna: uvLigada.peek() ? (vivo.current.lanterna ?? { x: 0.5, y: 0.5 }) : null,
      };
      try {
        desenharDocumento(g, w, h, d.normal, d.uv, estado);
      } catch {
        // bitmap pode ter sido liberado durante a transição de fechamento
      }
      c.dataset.uv = estado.lanterna ? '1' : '0';
      if (estado.lanterna) {
        c.dataset.lx = estado.lanterna.x.toFixed(3);
        c.dataset.ly = estado.lanterna.y.toFixed(3);
      }
      c.dataset.zoom = estado.vista.zoom.toFixed(2);
      quadro = requestAnimationFrame(laco);
    };
    quadro = requestAnimationFrame(laco);
    return () => cancelAnimationFrame(quadro);
  }, [d]);

  if (!d) return null;

  const temUv = d.pista.hasUv && d.uv !== null;
  const imagem = { largura: d.normal.width, altura: d.normal.height };

  const tela = () => {
    const r = area.current!.getBoundingClientRect();
    return { largura: r.width, altura: r.height, r };
  };

  const lanternaAtual = () =>
    uvLigada.peek() ? (vivo.current.lanterna ?? { x: 0.5, y: 0.5 }) : null;

  const enviar = (forcar = false) => {
    const agora = performance.now();
    if (!forcar && agora - vivo.current.ultimoEnvio < 33) return;
    vivo.current.ultimoEnvio = agora;
    enviarEstadoAosJogadores(vivo.current.vista, lanternaAtual());
  };

  const aoMover = (e: PointerEvent) => {
    const t = tela();
    const p: [number, number] = [e.clientX - t.r.left, e.clientY - t.r.top];
    const v = vivo.current;
    if (v.arraste) {
      v.vista = arrastar(v.vista, p[0] - v.arraste.x, p[1] - v.arraste.y, t, imagem);
      v.arraste = { x: p[0], y: p[1] };
    } else {
      const f = paraFracao(p, v.vista, t, imagem);
      v.lanterna = { x: f[0], y: f[1] };
    }
    if (palco.current && t.largura > 0 && t.altura > 0) {
      const nx = (p[0] / t.largura - 0.5) * 2;
      const ny = (p[1] / t.altura - 0.5) * 2;
      palco.current.style.setProperty('--tilt-x', `${(-ny * 10).toFixed(2)}deg`);
      palco.current.style.setProperty('--tilt-y', `${(nx * 12).toFixed(2)}deg`);
      palco.current.style.setProperty('--glare-x', `${((nx + 1) * 50).toFixed(1)}%`);
      palco.current.style.setProperty('--glare-y', `${((ny + 1) * 50).toFixed(1)}%`);
    }
    enviar();
  };

  const aoSair = () => {
    if (palco.current) {
      palco.current.style.setProperty('--tilt-x', '0deg');
      palco.current.style.setProperty('--tilt-y', '0deg');
    }
  };

  return (
    <div
      class="mesa-inspecao"
      role="dialog"
      aria-modal="true"
      aria-label={`Inspeção: ${d.pista.name}`}
      data-testid="inspecao-pista-mesa"
    >
      <div class="mesa-inspecao-barra">
        <strong class="mesa-inspecao-nome">{d.pista.name}</strong>
        <button
          type="button"
          class={`botao-pilula${uvLigada.value ? ' destaque' : ''}`}
          aria-pressed={uvLigada.value}
          disabled={!temUv}
          title={
            temUv
              ? 'Acende a lanterna de luz ultravioleta'
              : 'Este documento não tem camada UV'
          }
          data-testid="mesa-inspecao-uv"
          onClick={() => {
            uvLigada.value = !uvLigada.value;
            enviar(true);
          }}
        >
          🔦 Luz UV
        </button>
        <button
          type="button"
          class={`botao-pilula${mostrandoAosJogadores.value ? ' destaque' : ''}`}
          aria-pressed={mostrandoAosJogadores.value}
          data-testid="mesa-inspecao-mostrar"
          onClick={() => {
            if (mostrandoAosJogadores.value) {
              pararDeMostrarAosJogadores();
            } else {
              mostrarAosJogadores(d, vivo.current.vista, lanternaAtual());
            }
          }}
        >
          {mostrandoAosJogadores.value ? 'Parar de mostrar' : 'Mostrar aos jogadores'}
        </button>
        <button
          type="button"
          class="botao-pilula"
          data-testid="mesa-inspecao-editar"
          onClick={() => {
            void abrirNoApp({ app: 'atelie', tipo: 'documento', id: d.pista.id });
          }}
        >
          Editar no Ateliê ↗
        </button>
        <span class="espaco" />
        <button
          type="button"
          class="botao-pilula"
          data-testid="mesa-inspecao-fechar"
          onClick={fecharInspecaoNaMesa}
        >
          Fechar (Esc)
        </button>
      </div>

      <div
        class="mesa-inspecao-area"
        ref={area}
        onPointerMove={aoMover}
        onPointerLeave={aoSair}
        onPointerDown={(e) => {
          const t = tela();
          vivo.current.arraste = { x: e.clientX - t.r.left, y: e.clientY - t.r.top };
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onPointerUp={() => {
          vivo.current.arraste = null;
        }}
        onPointerCancel={() => {
          vivo.current.arraste = null;
        }}
        onWheel={(e) => {
          e.preventDefault();
          const t = tela();
          vivo.current.vista = zoomEm(
            vivo.current.vista,
            Math.exp(-e.deltaY * 0.0015),
            [e.clientX - t.r.left, e.clientY - t.r.top],
            t,
            imagem,
          );
          enviar(true);
        }}
      >
        <div class="mesa-inspecao-palco-3d" ref={palco}>
          <canvas
            ref={canvasRef}
            class="mesa-inspecao-visor"
            data-testid="mesa-inspecao-visor"
          />
          <div class="mesa-inspecao-glare" aria-hidden="true" />
        </div>
      </div>

      <p class="mesa-inspecao-dica">
        Role para aproximar, arraste para mover e inspecionar em 3D
        {temUv ? '. Com a luz UV, a lanterna segue o ponteiro.' : '.'}
      </p>
    </div>
  );
}

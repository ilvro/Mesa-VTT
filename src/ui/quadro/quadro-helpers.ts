import type { Camera, Ponto } from '../../dominio/camera.ts';
import { contemPonto } from '../../dominio/geometria.ts';
import type { Item } from '../../dominio/quadro.ts';
import type { ConfigTraco } from './BarraDeFerramentas.tsx';
import type { ModoRoda } from './PainelDoFundo.tsx';

const CHAVE_RODA = 'mesa:quadro:roda';
const CHAVE_TRACO = 'mesa:quadro:traco';
const CHAVE_CAMERA = (id: string) => `mesa:quadro-camera:${id}`;
export const CAMERA_PADRAO: Camera = { x: -200, y: -150, zoom: 1 };

export interface ConfigTracos {
  caneta: ConfigTraco;
  'marca-texto': ConfigTraco;
}

const CONFIG_TRACOS_PADRAO: ConfigTracos = {
  caneta: { cor: '#e8efe9', espessura: 4 },
  'marca-texto': { cor: '#f7e48c', espessura: 18 },
};

export function lerConfigTracos(): ConfigTracos {
  try {
    const raw = localStorage.getItem(CHAVE_TRACO);
    if (!raw) return CONFIG_TRACOS_PADRAO;
    const parsed = JSON.parse(raw) as Partial<ConfigTracos>;
    return {
      caneta: parsed.caneta ?? CONFIG_TRACOS_PADRAO.caneta,
      'marca-texto': parsed['marca-texto'] ?? CONFIG_TRACOS_PADRAO['marca-texto'],
    };
  } catch {
    return CONFIG_TRACOS_PADRAO;
  }
}

export function gravarConfigTracos(cfg: ConfigTracos): void {
  try {
    localStorage.setItem(CHAVE_TRACO, JSON.stringify(cfg));
  } catch {
    /* ignora */
  }
}

export function novoIdItem(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `it-${crypto.randomUUID()}`;
  }
  return `it-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function lerModoRoda(): ModoRoda {
  try {
    return localStorage.getItem(CHAVE_RODA) === 'rolagem' ? 'rolagem' : 'zoom';
  } catch {
    return 'zoom';
  }
}

export function gravarModoRoda(modo: ModoRoda): void {
  try {
    localStorage.setItem(CHAVE_RODA, modo);
  } catch {
    /* ignora */
  }
}

export function lerCameraSalva(id: string): Camera {
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

export function gravarCamera(id: string, cam: Camera): void {
  try {
    localStorage.setItem(CHAVE_CAMERA(id), JSON.stringify(cam));
  } catch {
    /* ignora */
  }
}

export function corFundoClara(hex: string): boolean {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return false;
  const n = parseInt(m[1]!, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return (r * 299 + g * 587 + b * 114) / 1000 > 140;
}

export function estiloGrade(
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

export function emCampoDeTexto(alvo: EventTarget | null): boolean {
  if (!(alvo instanceof HTMLElement)) return false;
  const tag = alvo.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || alvo.isContentEditable;
}

export function itemNoPonto(
  mapa: ReadonlyMap<string, Item>,
  ponto: Ponto,
  ignorarSetas = false,
): Item | null {
  const ordenados = [...mapa.values()].sort(
    (a, b) => b.z - a.z || b.id.localeCompare(a.id),
  );
  for (const item of ordenados) {
    if (ignorarSetas && item.tipo === 'seta') continue;
    if (contemPonto(item, ponto)) return item;
  }
  return null;
}

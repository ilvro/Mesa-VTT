import { urlDoProjetor, escolherMonitorParaProjetor, opcoesJanelaMonitor, type InfoMonitor } from '../dominio/desktop.ts';
import { baseDoApp } from './inventario.ts';

declare global {
  interface Window {
    __TAURI__?: {
      core?: {
        invoke?: <T = unknown>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
      };
    };
    __TAURI_INTERNALS__?: unknown;
    getScreenDetails?: () => Promise<{
      screens: Array<{
        left: number;
        top: number;
        width: number;
        height: number;
        isPrimary?: boolean;
        label?: string;
      }>;
      currentScreen?: {
        left: number;
        top: number;
      };
    }>;
  }
}

/** Detecta se o aplicativo está executando dentro do runtime nativo Tauri Desktop. */
export function ehAmbienteDesktop(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(window.__TAURI__ || window.__TAURI_INTERNALS__);
}

export interface ResultadoAberturaProjetor {
  ok: boolean;
  metodo: 'tauri' | 'multi-screen' | 'popup';
  detalhe?: string;
}

export interface OpcoesAberturaProjetor {
  baseAtlas?: string;
  invoke?: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
  getScreenDetails?: () => Promise<unknown>;
  openWindow?: (url: string, target: string, features: string) => Window | null;
}

/**
 * Abre o Projetor do Atlas no segundo monitor físico.
 * Suporta Tauri v2 desktop (Rust), Screen Details API moderna do navegador e fallback para popup.
 */
export async function abrirProjetorNoSegundoMonitor(
  mapaId: string | null,
  opcoes: OpcoesAberturaProjetor = {}
): Promise<ResultadoAberturaProjetor> {
  const base = opcoes.baseAtlas ?? (typeof location !== 'undefined' ? baseDoApp('atlas', location.href) : '../Atlas/');
  const url = urlDoProjetor(base, mapaId);

  // 1. Caminho Tauri Desktop nativo
  const invokeTauri = opcoes.invoke ?? (typeof window !== 'undefined' ? window.__TAURI__?.core?.invoke : undefined);
  if (ehAmbienteDesktop() || opcoes.invoke) {
    if (invokeTauri) {
      try {
        const res = await invokeTauri('abrir_projetor_segundo_monitor', { url });
        return { ok: true, metodo: 'tauri', detalhe: String(res) };
      } catch (erro) {
        console.warn('Falha ao abrir Projetor via Tauri, tentando fallback no navegador:', erro);
      }
    }
  }

  const openFn = opcoes.openWindow ?? (typeof window !== 'undefined' ? window.open.bind(window) : undefined);
  if (!openFn) {
    return { ok: false, metodo: 'popup', detalhe: 'Ambiente sem window.open disponível' };
  }

  // 2. Window Management / Multi-Screen API moderna
  const getScreens = opcoes.getScreenDetails ?? (typeof window !== 'undefined' ? window.getScreenDetails?.bind(window) : undefined);
  if (getScreens) {
    try {
      const details = (await getScreens()) as {
        screens: Array<{ left: number; top: number; width: number; height: number; isPrimary?: boolean; label?: string }>;
        currentScreen?: { left: number; top: number };
      };
      if (details?.screens && details.screens.length > 0) {
        const monitores: InfoMonitor[] = details.screens.map((s, idx) => ({
          id: String(idx),
          nome: s.label,
          primario: s.isPrimary,
          x: s.left,
          y: s.top,
          largura: s.width,
          altura: s.height,
        }));
        const atualId = details.currentScreen
          ? String(details.screens.findIndex(s => s.left === details.currentScreen?.left && s.top === details.currentScreen?.top))
          : null;
        const monitorAlvo = escolherMonitorParaProjetor(monitores, atualId);
        const features = opcoesJanelaMonitor(monitorAlvo);
        openFn(url, 'atlas-projetor', features);
        return { ok: true, metodo: 'multi-screen', detalhe: monitorAlvo?.nome ?? 'Monitor secundário' };
      }
    } catch {
      // Ignora erro ou recusa de permissão da API de multi-screen e usa popup
    }
  }

  // 3. Fallback: janela popup comum para ser arrastada à outra tela
  openFn(url, 'atlas-projetor', 'popup,width=1280,height=720');
  return { ok: true, metodo: 'popup', detalhe: 'Janela aberta (arraste para a TV ou 2º monitor)' };
}

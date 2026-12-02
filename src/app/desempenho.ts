import { effect, signal } from '@preact/signals';

const CHAVE_MODO_LEVE = 'mesa:modo-leve';

interface NavigatorComMemoria extends Navigator {
  deviceMemory?: number;
}

function detectarDispositivoModesto(): boolean {
  if (typeof navigator === 'undefined') return false;
  const nav = navigator as NavigatorComMemoria;
  if (typeof nav.deviceMemory === 'number' && nav.deviceMemory <= 4) return true;
  if (typeof nav.hardwareConcurrency === 'number' && nav.hardwareConcurrency <= 4) return true;
  return false;
}

function lerPreferenciaInicial(): boolean {
  try {
    if (typeof localStorage !== 'undefined') {
      const salvo = localStorage.getItem(CHAVE_MODO_LEVE);
      if (salvo === '1') return true;
      if (salvo === '0') return false;
    }
  } catch {
    /* sem armazenamento: usa heurística */
  }
  return detectarDispositivoModesto();
}

/** Preferência de Modo Leve para computadores modestos (resolução de canvas, caches e blur). */
export const modoLeve = signal<boolean>(lerPreferenciaInicial());

/** Atualiza e persiste a preferência de Modo Leve em `localStorage['mesa:modo-leve']`. */
export function definirModoLeve(ativo: boolean): void {
  modoLeve.value = ativo;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(CHAVE_MODO_LEVE, ativo ? '1' : '0');
    }
  } catch {
    /* sem armazenamento: vale só nesta aba */
  }
}

effect(() => {
  const ativo = modoLeve.value;
  if (typeof document !== 'undefined') {
    document.documentElement.classList.toggle('modo-leve', ativo);
  }
});

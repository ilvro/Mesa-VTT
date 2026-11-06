import { signal } from '@preact/signals';
import { aplicarTema, gravarTema, lerTema, observarTema, type Tema } from '#mesa';

/** O tema vem do localStorage compartilhado da mesa (`mesa:tema`); trocar aqui troca em todas as abas e aplicativos abertos. */
const PADRAO: Tema = { id: 'mesa' };
const storage = typeof localStorage !== 'undefined' ? localStorage : undefined;
export const tema = signal<Tema>(storage ? lerTema(storage, PADRAO) : PADRAO);

export function iniciarTema(): () => void {
  if (typeof document !== 'undefined') aplicarTema(document.documentElement, tema.value);
  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    return observarTema(window, localStorage, novo => {
      tema.value = novo;
      if (typeof document !== 'undefined') aplicarTema(document.documentElement, novo);
    });
  }
  return () => {};
}

export function trocarTema(novo: Tema): void {
  if (typeof localStorage !== 'undefined') gravarTema(localStorage, novo);
  tema.value = novo;
  if (typeof document !== 'undefined') aplicarTema(document.documentElement, novo);
}

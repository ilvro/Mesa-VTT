import { signal } from '@preact/signals';
import { aplicarTema, gravarTema, lerTema, observarTema, type Tema } from '#mesa';

/** O tema vem do localStorage compartilhado da mesa (`mesa:tema`); trocar aqui troca em todas as abas e aplicativos abertos. */
export const tema = signal<Tema>(lerTema(localStorage));

export function iniciarTema(): () => void {
  aplicarTema(document.documentElement, tema.value);
  return observarTema(window, localStorage, novo => { tema.value = novo; aplicarTema(document.documentElement, novo); });
}

export function trocarTema(novo: Tema): void {
  gravarTema(localStorage, novo);
  tema.value = novo;
  aplicarTema(document.documentElement, novo);
}

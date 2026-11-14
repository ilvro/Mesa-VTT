import { aplicarTema, TEMA_PADRAO } from '#mesa';

/** A Mesa tem um tema só (`atlas`): não lê, não grava e não observa `mesa:tema`. */
export function iniciarTema(): () => void {
  if (typeof document !== 'undefined') aplicarTema(document.documentElement, TEMA_PADRAO);
  return () => {};
}

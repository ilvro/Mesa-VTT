import { signal } from '@preact/signals';

/**
 * Espelho do estado local do `Quadro.tsx` (a ferramenta e o modo Ler), para o tutor ler sem tocar na UI.
 * Só o `Quadro.tsx` escreve aqui; ao desmontar, volta aos padrões.
 */
export const ferramentaDoQuadro = signal<string>('selecionar');
export const modoDoQuadro = signal<'quadro' | 'ler'>('quadro');

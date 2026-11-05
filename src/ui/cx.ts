/** Junta classes CSS, ignorando as falsas: `cx('chip', ativo && 'ativa')`. */
export const cx = (...partes: (string | false | null | undefined)[]): string => partes.filter(Boolean).join(' ');

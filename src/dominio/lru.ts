/**
 * Utilitário puro de cache LRU (Least Recently Used) por ordem de acesso.
 * O índice 0 representa o item mais recente ("topo dos recentes").
 */

export interface ResultadoAcessoLru {
  ordem: string[];
  despejados: string[];
}

/**
 * Registra o acesso a `id`, promovendo-o ao topo dos recentes (`ordem[0]`),
 * e despeja os itens mais antigos que excederem `limite`.
 */
export function registrarAcessoLru(
  ordemAtual: readonly string[],
  id: string,
  limite: number,
): ResultadoAcessoLru {
  const limiteValido = Number.isFinite(limite) ? Math.max(0, Math.floor(limite)) : 0;
  const semId = ordemAtual.filter((item) => item !== id);
  if (limiteValido === 0) {
    return {
      ordem: [],
      despejados: [id, ...semId],
    };
  }
  const novaOrdem = [id, ...semId];
  return {
    ordem: novaOrdem.slice(0, limiteValido),
    despejados: novaOrdem.slice(limiteValido),
  };
}

/** Remove `id` da lista de ordem LRU sem alterar a ordem relativa dos restantes. */
export function removerDaLru(ordemAtual: readonly string[], id: string): string[] {
  return ordemAtual.filter((item) => item !== id);
}

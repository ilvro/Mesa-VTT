import type { Ponto } from './camera.ts';
import { colar, PREFIXO_CLIPBOARD } from './area-de-transferencia.ts';
import type { Item } from './quadro.ts';

/** Uma seleção guardada para carimbar de novo: o texto de `copiar(comConteudo(seleção))`. */
export interface ModeloDeCena {
  id: string;
  nome: string;
  /** `null`: vale para todas as campanhas. */
  campanhaId: string | null;
  conteudo: string;
  criadoEm: number;
}

export function nomeDeModeloValido(nome: string): boolean {
  return nome.trim().length > 0 && nome.trim().length <= 80;
}

export function validarModelo(valor: unknown): asserts valor is ModeloDeCena {
  const m = valor as Partial<ModeloDeCena> | null;
  if (!m || typeof m !== 'object') throw new Error('Modelo inválido.');
  if (typeof m.id !== 'string' || m.id === '') throw new Error('Modelo sem id.');
  if (typeof m.nome !== 'string' || !nomeDeModeloValido(m.nome)) throw new Error('Modelo sem nome.');
  if (m.campanhaId !== null && typeof m.campanhaId !== 'string') throw new Error('Modelo com campanha inválida.');
  if (typeof m.conteudo !== 'string' || !m.conteudo.startsWith(PREFIXO_CLIPBOARD)) {
    throw new Error('Conteúdo do modelo inválido.');
  }
  if (typeof m.criadoEm !== 'number') throw new Error('Modelo sem data.');
}

/** Os modelos da campanha e os de todas, em ordem alfabética. */
export function modelosDaCampanha(
  modelos: readonly ModeloDeCena[],
  campanhaId: string | null,
): ModeloDeCena[] {
  return modelos
    .filter((m) => m.campanhaId === null || (campanhaId !== null && m.campanhaId === campanhaId))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

/** Ids de imagem usados pelo conteúdo do modelo (para a coleta de imagens sem uso). */
export function imagensDoModelo(conteudo: string): Set<string> {
  const ids = new Set<string>();
  if (!conteudo.startsWith(PREFIXO_CLIPBOARD)) return ids;
  try {
    const dado = JSON.parse(conteudo.slice(PREFIXO_CLIPBOARD.length)) as { itens?: unknown };
    if (!Array.isArray(dado.itens)) return ids;
    for (const it of dado.itens as { tipo?: unknown; imagemId?: unknown }[]) {
      if (it?.tipo === 'imagem' && typeof it.imagemId === 'string') ids.add(it.imagemId);
    }
  } catch {
    /* conteúdo ilegível: nada a proteger */
  }
  return ids;
}

/** Itens novos (ids novos, religados) com o centro no ponto; `null` se o conteúdo não é legível. */
export function carimbarModelo(
  modelo: ModeloDeCena,
  novoId: () => string,
  destino: { quadroId: string; centro: Ponto; zBase?: number },
  agora = Date.now(),
): Item[] | null {
  return colar(modelo.conteudo, novoId, { ...destino, deslocamento: 0 }, agora);
}

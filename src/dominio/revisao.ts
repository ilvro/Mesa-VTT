// Revisão em massa dos itens importados (E2c). Puro: sem UI, sem DOM.
import type { Passo } from './quadro-operacoes.ts';
import type { Item, TipoSemantico } from './quadro.ts';

// Os motivos que a atualização do Miro (sincronia-miro.ts) grava em conflitos e saídas.
export const MOTIVO_CONFLITO_MIRO = 'Mudou no Miro e aqui; ficou a versão daqui';
export const MOTIVO_SAIU_DO_MIRO = 'Saiu do Miro';

/** Conflito de sincronia ou item que saiu do Miro: exige decisão individual. */
export function ehConflitoOuSaida(item: Item): boolean {
  const motivos = item.revisao?.motivos ?? [];
  return motivos.includes(MOTIVO_CONFLITO_MIRO) || motivos.includes(MOTIVO_SAIU_DO_MIRO);
}

export interface ResumoPorTipo {
  /** `null` = sem sugestão. */
  tipo: TipoSemantico | null;
  quantidade: number;
  ids: string[];
}

export interface ResumoDaRevisao {
  /** Itens aceitáveis em massa, agrupados pelo tipo sugerido (sem sugestão por último). */
  porTipo: ResumoPorTipo[];
  /** Conflitos e "saiu do Miro": fora do aceite em massa. */
  conflitos: string[];
}

const ORDEM_TIPOS: readonly TipoSemantico[] = [
  'leitura', 'teste', 'segredo', 'loot', 'evento', 'fala', 'tarefa', 'rever', 'titulo',
];

export function resumoDaRevisao(itens: Iterable<Item>): ResumoDaRevisao {
  const mapa = new Map<TipoSemantico | null, string[]>();
  const conflitos: string[] = [];
  for (const item of itens) {
    if (!item.revisao) continue;
    if (ehConflitoOuSaida(item)) {
      conflitos.push(item.id);
      continue;
    }
    const tipo = item.revisao.tipoSugerido ?? null;
    const lista = mapa.get(tipo);
    if (lista) lista.push(item.id);
    else mapa.set(tipo, [item.id]);
  }
  const porTipo: ResumoPorTipo[] = [];
  for (const tipo of [...ORDEM_TIPOS, null]) {
    const ids = mapa.get(tipo);
    if (ids) porTipo.push({ tipo, quantidade: ids.length, ids });
  }
  return { porTipo, conflitos };
}

/**
 * Aceita os `ids` num único passo, como o "Aceitar" individual: textos e formas
 * recebem `tipo` em `semantica`; os demais só perdem a `revisao`. Ids sem revisão,
 * inexistentes ou em conflito são ignorados. Passo sem ops quando nada se aplica.
 */
export function passoDeRevisaoEmMassa(
  itens: ReadonlyMap<string, Item>,
  ids: readonly string[],
  tipo: TipoSemantico | null,
  rotulo = 'Aceitar revisão em massa',
): Passo {
  const alterar: { id: string; antes: Partial<Item>; depois: Partial<Item> }[] = [];
  for (const id of ids) {
    const item = itens.get(id);
    if (!item || !item.revisao || ehConflitoOuSaida(item)) continue;
    if (item.tipo === 'texto' || item.tipo === 'forma') {
      alterar.push({
        id,
        antes: { semantica: item.semantica, revisao: item.revisao },
        depois: { semantica: tipo, revisao: undefined },
      });
    } else {
      alterar.push({ id, antes: { revisao: item.revisao }, depois: { revisao: undefined } });
    }
  }
  return { rotulo, ops: alterar.length > 0 ? [{ alterar }] : [] };
}

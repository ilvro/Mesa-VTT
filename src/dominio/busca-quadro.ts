import { semAcento } from './entidades.ts';
import { textoPuro, type Item, type TipoSemantico } from './quadro.ts';

export interface ResultadoBuscaQuadro {
  item: Item;
  trecho: string;
}

export function textoBuscavel(item: Item): string {
  switch (item.tipo) {
    case 'texto':
    case 'forma':
      return textoPuro(item.doc);
    case 'moldura':
      return item.titulo;
    case 'seta':
      return item.rotulo;
    default:
      return '';
  }
}

export function itemEhSecreto(item: Item): boolean {
  if (item.soMestre) return true;
  return 'semantica' in item && item.semantica === 'segredo';
}

export function itemPassaNoFiltro(
  item: Item,
  tiposAtivos: ReadonlySet<TipoSemantico>,
): boolean {
  if (tiposAtivos.size === 0) return true;
  return (
    'semantica' in item &&
    item.semantica !== null &&
    tiposAtivos.has(item.semantica)
  );
}

export function buscarNoQuadro(
  itens: Iterable<Item>,
  termo: string,
  opcoes?: { esconderSegredos?: boolean },
): ResultadoBuscaQuadro[] {
  const q = semAcento(termo).trim();
  if (!q) return [];

  const esconderSegredos = opcoes?.esconderSegredos ?? false;
  const encontrados: ResultadoBuscaQuadro[] = [];

  for (const item of itens) {
    if (esconderSegredos && itemEhSecreto(item)) continue;
    const bruto = textoBuscavel(item).trim();
    if (!bruto) continue;
    if (semAcento(bruto).includes(q)) {
      encontrados.push({ item, trecho: bruto });
    }
  }

  encontrados.sort((a, b) => a.item.y - b.item.y || a.item.x - b.item.x);
  return encontrados;
}

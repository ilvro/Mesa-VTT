import { textoPuro, type Item, type Quadro } from './quadro.ts';

export interface MarcoDaLinhaDoTempo {
  ano: number;
  mes: number | null;
  dia: number | null;
  dataTexto: string;
  trecho: string;
  quadroId: string;
  quadroTitulo: string;
  itemId: string;
}

const REGEX_DATA = /\[DATA\s+([^\]]+)\]/gi;

export function parsearDataLore(
  bruto: string,
): { ano: number; mes: number | null; dia: number | null; dataTexto: string } | null {
  const limpo = bruto.trim();
  const m = /^(-?\d{1,6})(?:[-/](\d{1,2})(?:[-/](\d{1,2}))?)?$/.exec(limpo);
  if (!m) return null;
  const ano = Number(m[1]);
  const mes = m[2] !== undefined ? Number(m[2]) : null;
  const dia = m[3] !== undefined ? Number(m[3]) : null;
  if (!Number.isFinite(ano)) return null;
  if (mes !== null && (mes < 1 || mes > 12)) return null;
  if (dia !== null && (dia < 1 || dia > 31)) return null;
  return { ano, mes, dia, dataTexto: limpo };
}

function textoDoItem(item: Item): string {
  if (item.tipo === 'texto' || item.tipo === 'forma') return textoPuro(item.doc);
  if (item.tipo === 'moldura') return item.titulo;
  if (item.tipo === 'seta') return item.rotulo;
  return '';
}

export function extrairLinhaDoTempo(
  itens: Iterable<Item>,
  quadros: readonly Pick<Quadro, 'id' | 'nome'>[],
): MarcoDaLinhaDoTempo[] {
  const titulos = new Map(quadros.map((q) => [q.id, q.nome]));
  const marcos: MarcoDaLinhaDoTempo[] = [];

  for (const item of itens) {
    const texto = textoDoItem(item);
    if (!texto) continue;
    REGEX_DATA.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = REGEX_DATA.exec(texto)) !== null) {
      const parsed = parsearDataLore(match[1] ?? '');
      if (!parsed) continue;
      const semTag = texto.replace(match[0], '').replace(/\s+/g, ' ').trim();
      const trecho = semTag.slice(0, 140) || '(sem descrição)';
      marcos.push({
        ...parsed,
        trecho,
        quadroId: item.quadroId,
        quadroTitulo: titulos.get(item.quadroId) ?? 'Quadro',
        itemId: item.id,
      });
    }
  }

  marcos.sort(
    (a, b) =>
      a.ano - b.ano ||
      (a.mes ?? 0) - (b.mes ?? 0) ||
      (a.dia ?? 0) - (b.dia ?? 0) ||
      a.quadroTitulo.localeCompare(b.quadroTitulo, 'pt-BR') ||
      a.itemId.localeCompare(b.itemId),
  );
  return marcos;
}

/**
 * O layout do modo sessão: três painéis lado a lado (o Atlas, as fichas e o Jukebox), cada um com um peso (a largura relativa) e
 * podendo ser escondido. Tudo puro: a tela só mede a largura e aplica o resultado.
 */
export const PAINEIS = ['atlas', 'fichas', 'jukebox', 'diario'] as const;
export type PainelId = (typeof PAINEIS)[number];

export interface PainelDoLayout { id: PainelId; peso: number; visivel: boolean }
export type Layout = readonly PainelDoLayout[];

export const ROTULO_DO_PAINEL: Readonly<Record<PainelId, string>> = { atlas: 'Mapa', fichas: 'Fichas', jukebox: 'Música', diario: 'Diário' };

export type PresetId = 'padrao' | 'mapa-grande' | 'mapa-e-fichas' | 'com-diario' | 'so-mapa';
export const ROTULO_DO_PRESET: Readonly<Record<PresetId, string>> = { padrao: 'Padrão', 'mapa-grande': 'Mapa grande', 'mapa-e-fichas': 'Mapa e fichas', 'com-diario': 'Com diário', 'so-mapa': 'Só o mapa' };
const P = (atlas: [number, boolean], fichas: [number, boolean], jukebox: [number, boolean], diario: [number, boolean]): Layout => [
  { id: 'atlas', peso: atlas[0], visivel: atlas[1] }, { id: 'fichas', peso: fichas[0], visivel: fichas[1] }, { id: 'jukebox', peso: jukebox[0], visivel: jukebox[1] }, { id: 'diario', peso: diario[0], visivel: diario[1] },
];
export const PRESETS: Readonly<Record<PresetId, Layout>> = {
  padrao: P([3, true], [2, true], [1.1, true], [1.3, false]),
  'mapa-grande': P([6, true], [1.6, true], [1, true], [1.3, false]),
  'mapa-e-fichas': P([3, true], [2, true], [1, false], [1.3, false]),
  'com-diario': P([3, true], [1.8, true], [1, false], [1.5, true]),
  'so-mapa': P([1, true], [1, false], [1, false], [1, false]),
};

export const LAYOUT_PADRAO: Layout = PRESETS.padrao;
/** Largura mínima de um painel, em pixels: abaixo disso uma ficha ou o Jukebox deixam de ser usáveis. */
export const LARGURA_MINIMA = 200;

export const visiveis = (l: Layout): PainelDoLayout[] => l.filter(p => p.visivel);

/** O preset que o layout é (ignorando os painéis escondidos e a escala dos pesos), ou `null` se foi ajustado à mão. */
export function presetDe(l: Layout): PresetId | null {
  const forma = (x: Layout) => { const v = visiveis(x), total = v.reduce((a, p) => a + p.peso, 0); return v.map(p => `${p.id}:${(p.peso / total).toFixed(2)}`).join('|'); };
  return (Object.keys(PRESETS) as PresetId[]).find(id => forma(PRESETS[id]) === forma(l)) ?? null;
}

/**
 * Arrasta o divisor entre o `indice`-ésimo painel visível e o seguinte por `deltaPx`: um cresce, o outro encolhe, o resto fica.
 * Nenhum passa de `minimoPx`; o total dos pesos visíveis não muda. `larguraPx` é a largura que os painéis visíveis ocupam juntos.
 */
export function redimensionar(l: Layout, indice: number, deltaPx: number, larguraPx: number, minimoPx = LARGURA_MINIMA): Layout {
  const v = visiveis(l), esq = v[indice], dir = v[indice + 1];
  if (!esq || !dir || !(larguraPx > 0)) return l;
  const total = v.reduce((a, p) => a + p.peso, 0), pxPorPeso = larguraPx / total;
  const juntos = (esq.peso + dir.peso) * pxPorPeso;
  const minimo = Math.min(minimoPx, juntos / 2);
  const novaEsq = Math.min(juntos - minimo, Math.max(minimo, esq.peso * pxPorPeso + deltaPx));
  const pesoEsq = novaEsq / pxPorPeso, pesoDir = esq.peso + dir.peso - pesoEsq;
  return l.map(p => p.id === esq.id ? { ...p, peso: pesoEsq } : p.id === dir.id ? { ...p, peso: pesoDir } : p);
}

/** Mostra ou esconde um painel; nunca deixa a tela sem nenhum. */
export function alternarPainel(l: Layout, id: PainelId): Layout {
  const alvo = l.find(p => p.id === id);
  if (!alvo) return l;
  if (alvo.visivel && visiveis(l).length === 1) return l;
  return l.map(p => p.id === id ? { ...p, visivel: !p.visivel } : p);
}

/** Lê um layout guardado (JSON do armazenamento); qualquer coisa fora do formato volta ao padrão. */
export function lerLayout(bruto: unknown): Layout {
  if (!Array.isArray(bruto) || bruto.length !== PAINEIS.length) return LAYOUT_PADRAO;
  const lidos: PainelDoLayout[] = [];
  for (const x of bruto as Record<string, unknown>[]) {
    if (!x || typeof x !== 'object' || !(PAINEIS as readonly unknown[]).includes(x.id) || typeof x.peso !== 'number' || !Number.isFinite(x.peso) || x.peso <= 0 || typeof x.visivel !== 'boolean') return LAYOUT_PADRAO;
    lidos.push({ id: x.id as PainelId, peso: x.peso, visivel: x.visivel });
  }
  if (new Set(lidos.map(p => p.id)).size !== PAINEIS.length || !lidos.some(p => p.visivel)) return LAYOUT_PADRAO;
  return lidos;
}

/**
 * A largura lógica mínima de cada painel, em pixels: abaixo dela o aplicativo dentro do `iframe` fica apertado (o Atlas sobrepõe as ferramentas
 * e o Jukebox corta os menus). Em vez de mexer neles, a Mesa os desenha nessa largura e reduz a escala para caber no painel.
 * A Ficha se adapta sozinha à largura e fica sem mínimo.
 */
export const LARGURA_LOGICA_MINIMA: Readonly<Partial<Record<PainelId, number>>> = { atlas: 900, jukebox: 520 };
/** O quanto se reduz no máximo: abaixo de metade o texto deixa de ser legível, então o painel passa a mostrar menos em vez de encolher mais. */
export const ESCALA_MINIMA = 0.5;

/** A escala para um painel de `larguraPx` que pede `minimoPx` de largura lógica: 1 se cabe, senão a razão, nunca abaixo de `ESCALA_MINIMA`. */
export function escalaDoPainel(larguraPx: number, minimoPx: number | undefined): number {
  if (!minimoPx || !(larguraPx > 0) || larguraPx >= minimoPx) return 1;
  return Math.max(ESCALA_MINIMA, larguraPx / minimoPx);
}

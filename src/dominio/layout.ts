/**
 * O layout do modo sessão: colunas lado a lado, cada uma com um peso (largura relativa) e 1 ou mais painéis
 * empilhados verticalmente com alturas relativas. Tudo puro: a tela só mede as dimensões e aplica o resultado.
 */
export const PAINEIS = ['atlas', 'fichas', 'jukebox', 'diario', 'quadro'] as const;
export type PainelId = (typeof PAINEIS)[number];

export interface PainelDoLayout { id: PainelId; peso: number; visivel: boolean }

export interface ColunaDoLayout {
  readonly peso: number;
  readonly paineis: readonly PainelId[];
  readonly alturas: Readonly<Partial<Record<PainelId, number>>>;
}

export interface LayoutSessao {
  readonly colunas: readonly ColunaDoLayout[];
  readonly ocultos: readonly PainelId[];
  readonly pesosOcultos?: Readonly<Partial<Record<PainelId, number>>>;
}

export type Layout = LayoutSessao;

export const ROTULO_DO_PAINEL: Readonly<Record<PainelId, string>> = {
  atlas: 'Mapa',
  fichas: 'Fichas',
  jukebox: 'Música',
  diario: 'Diário',
  quadro: 'Quadro',
};

export const PESO_PADRAO: Readonly<Record<PainelId, number>> = {
  atlas: 3,
  fichas: 2,
  jukebox: 1.1,
  diario: 1.3,
  quadro: 2,
};

export type PresetId = 'padrao' | 'mapa-lateral' | 'mapa-grande' | 'mapa-e-fichas' | 'com-diario' | 'com-quadro' | 'so-mapa';
export const ROTULO_DO_PRESET: Readonly<Record<PresetId, string>> = {
  padrao: 'Lado a lado',
  'mapa-lateral': 'Mapa + Pilha lateral',
  'mapa-grande': 'Mapa grande',
  'mapa-e-fichas': 'Mapa e fichas',
  'com-diario': 'Com diário',
  'com-quadro': 'Com quadro',
  'so-mapa': 'Foco no Mapa',
};

function criarColuna(peso: number, paineis: readonly PainelId[], alturas?: Readonly<Partial<Record<PainelId, number>>>): ColunaDoLayout {
  const normAlturas: Partial<Record<PainelId, number>> = {};
  for (const id of paineis) {
    const h = alturas?.[id];
    normAlturas[id] = typeof h === 'number' && Number.isFinite(h) && h > 0 ? h : 1;
  }
  return { peso, paineis: [...paineis], alturas: normAlturas };
}

function criarLayout(colunas: readonly ColunaDoLayout[]): LayoutSessao {
  const presentes = new Set(colunas.flatMap(c => c.paineis));
  const ocultos = PAINEIS.filter(id => !presentes.has(id));
  return { colunas, ocultos };
}

export const PRESETS: Readonly<Record<PresetId, LayoutSessao>> = {
  padrao: criarLayout([
    criarColuna(3, ['atlas']),
    criarColuna(2, ['fichas']),
    criarColuna(1.1, ['jukebox']),
  ]),
  'mapa-lateral': criarLayout([
    criarColuna(0.65, ['atlas']),
    criarColuna(0.35, ['fichas', 'jukebox'], { fichas: 0.55, jukebox: 0.45 }),
  ]),
  'mapa-grande': criarLayout([
    criarColuna(6, ['atlas']),
    criarColuna(1.6, ['fichas']),
    criarColuna(1, ['jukebox']),
  ]),
  'mapa-e-fichas': criarLayout([
    criarColuna(3, ['atlas']),
    criarColuna(2, ['fichas']),
  ]),
  'com-diario': criarLayout([
    criarColuna(3, ['atlas']),
    criarColuna(1.8, ['fichas']),
    criarColuna(1.5, ['diario']),
  ]),
  'com-quadro': criarLayout([
    criarColuna(3, ['atlas']),
    criarColuna(1.8, ['fichas']),
    criarColuna(2, ['quadro']),
  ]),
  'so-mapa': criarLayout([
    criarColuna(1, ['atlas']),
  ]),
};

export const LAYOUT_PADRAO: LayoutSessao = PRESETS.padrao;
/** Largura mínima de uma coluna, em pixels: abaixo disso uma ficha ou o Jukebox deixam de ser usáveis. */
export const LARGURA_MINIMA = 200;
/** Altura mínima de um painel empilhado verticalmente, em pixels. */
export const ALTURA_MINIMA = 120;

export function painelVisivel(l: LayoutSessao, id: PainelId): boolean {
  return l.colunas.some(c => c.paineis.includes(id));
}

export function totalPaineisVisiveis(l: LayoutSessao): number {
  return l.colunas.reduce((acc, c) => acc + c.paineis.length, 0);
}

/** Lista plana dos painéis visíveis na ordem das colunas (e de cima para baixo em cada coluna). */
export const visiveis = (l: LayoutSessao): PainelDoLayout[] =>
  l.colunas.flatMap(c => c.paineis.map(id => ({ id, peso: c.peso, visivel: true })));

/** O preset que o layout é (ignorando a escala dos pesos e alturas), ou `null` se foi ajustado à mão. */
export function presetDe(l: LayoutSessao): PresetId | null {
  const forma = (x: LayoutSessao) => {
    const totalCols = x.colunas.reduce((a, c) => a + c.peso, 0);
    return x.colunas.map(c => {
      const totalAlt = c.paineis.reduce((a, id) => a + (c.alturas[id] ?? 1), 0);
      const pilha = c.paineis.map(id => `${id}:${((c.alturas[id] ?? 1) / totalAlt).toFixed(2)}`).join('+');
      return `${(c.peso / totalCols).toFixed(2)}[${pilha}]`;
    }).join('|');
  };
  const alvo = forma(l);
  return (Object.keys(PRESETS) as PresetId[]).find(id => forma(PRESETS[id]) === alvo) ?? null;
}

export function aplicarPresetLayout(presetId: PresetId | 'mapa-foco'): LayoutSessao {
  if (presetId === 'mapa-foco') return PRESETS['so-mapa'];
  return PRESETS[presetId] ?? LAYOUT_PADRAO;
}

/**
 * Arrasta o divisor entre a `idxEsquerda`-ésima coluna e a seguinte por `deltaPx`: uma cresce, a outra encolhe, o resto fica.
 * Nenhuma passa de `minimoPx`; o total dos pesos das colunas não muda.
 */
export function redimensionarColunas(
  l: LayoutSessao,
  idxEsquerda: number,
  deltaPx: number,
  larguraTotal: number,
  minimoPx = LARGURA_MINIMA,
): LayoutSessao {
  const esq = l.colunas[idxEsquerda], dir = l.colunas[idxEsquerda + 1];
  if (!esq || !dir || !(larguraTotal > 0)) return l;
  const total = l.colunas.reduce((a, c) => a + c.peso, 0);
  if (!(total > 0)) return l;
  const pxPorPeso = larguraTotal / total;
  const juntos = (esq.peso + dir.peso) * pxPorPeso;
  const minimo = Math.min(minimoPx, juntos / 2);
  const novaEsq = Math.min(juntos - minimo, Math.max(minimo, esq.peso * pxPorPeso + deltaPx));
  const pesoEsq = novaEsq / pxPorPeso;
  const pesoDir = esq.peso + dir.peso - pesoEsq;
  return {
    ...l,
    colunas: l.colunas.map((c, i) => (i === idxEsquerda ? { ...c, peso: pesoEsq } : i === idxEsquerda + 1 ? { ...c, peso: pesoDir } : c)),
  };
}

export const redimensionar = redimensionarColunas;

/**
 * Arrasta o divisor vertical entre dois painéis empilhados na coluna `colIdx` (`idxSuperior` e `idxSuperior + 1`) por `deltaPx`.
 */
export function redimensionarPilhaVertical(
  l: LayoutSessao,
  colIdx: number,
  idxSuperior: number,
  deltaPx: number,
  alturaTotal: number,
  minimoPx = ALTURA_MINIMA,
): LayoutSessao {
  const col = l.colunas[colIdx];
  if (!col || !(alturaTotal > 0)) return l;
  const supId = col.paineis[idxSuperior], infId = col.paineis[idxSuperior + 1];
  if (!supId || !infId) return l;
  const total = col.paineis.reduce((a, id) => a + (col.alturas[id] ?? 1), 0);
  if (!(total > 0)) return l;
  const pxPorAltura = alturaTotal / total;
  const altSup = col.alturas[supId] ?? 1;
  const altInf = col.alturas[infId] ?? 1;
  const juntos = (altSup + altInf) * pxPorAltura;
  const minimo = Math.min(minimoPx, juntos / 2);
  const novaSupPx = Math.min(juntos - minimo, Math.max(minimo, altSup * pxPorAltura + deltaPx));
  const novaSup = novaSupPx / pxPorAltura;
  const novaInf = altSup + altInf - novaSup;
  return {
    ...l,
    colunas: l.colunas.map((c, i) => (i === colIdx ? { ...c, alturas: { ...c.alturas, [supId]: novaSup, [infId]: novaInf } } : c)),
  };
}

function removerPainelDeColunas(l: LayoutSessao, id: PainelId): {
  colunas: ColunaDoLayout[];
  pesoOriginal: number;
  alturaOriginal: number;
} {
  let pesoOriginal = PESO_PADRAO[id];
  let alturaOriginal = 1;
  const colunas: ColunaDoLayout[] = [];
  for (const c of l.colunas) {
    if (!c.paineis.includes(id)) {
      colunas.push(c);
      continue;
    }
    alturaOriginal = c.alturas[id] ?? 1;
    if (c.paineis.length === 1) {
      pesoOriginal = c.peso;
      continue;
    }
    const restantes = c.paineis.filter(p => p !== id);
    const novasAlturas: Partial<Record<PainelId, number>> = {};
    for (const p of restantes) novasAlturas[p] = c.alturas[p] ?? 1;
    pesoOriginal = Math.max(0.8, c.peso / c.paineis.length);
    colunas.push({ ...c, paineis: restantes, alturas: novasAlturas });
  }
  return { colunas, pesoOriginal, alturaOriginal };
}

/** Mostra ou esconde um painel; nunca deixa a tela sem nenhum. */
export function alternarPainelLayout(l: LayoutSessao, id: PainelId): LayoutSessao {
  if (!PAINEIS.includes(id)) return l;
  if (painelVisivel(l, id)) {
    if (totalPaineisVisiveis(l) <= 1) return l;
    const { colunas, pesoOriginal } = removerPainelDeColunas(l, id);
    return {
      colunas,
      ocultos: l.ocultos.includes(id) ? l.ocultos : [...l.ocultos, id],
      pesosOcultos: { ...(l.pesosOcultos ?? {}), [id]: pesoOriginal },
    };
  }
  const peso = l.pesosOcultos?.[id] ?? PESO_PADRAO[id];
  return {
    colunas: [...l.colunas, criarColuna(peso, [id])],
    ocultos: l.ocultos.filter(p => p !== id),
    pesosOcultos: l.pesosOcultos,
  };
}

export const alternarPainel = alternarPainelLayout;

export type ModoMoverPainel = 'antes' | 'depois' | 'empilhar' | 'empilhar-acima' | 'empilhar-abaixo' | 'trocar';

/** Move ou empilha um painel visível em relação a outro painel visível. */
export function moverPainel(l: LayoutSessao, origem: PainelId, destino: PainelId, modo: ModoMoverPainel): LayoutSessao {
  if (origem === destino || !painelVisivel(l, origem) || !painelVisivel(l, destino)) return l;

  if (modo === 'trocar') {
    const colOrigemIdx = l.colunas.findIndex(c => c.paineis.includes(origem));
    const colDestinoIdx = l.colunas.findIndex(c => c.paineis.includes(destino));
    if (colOrigemIdx === -1 || colDestinoIdx === -1) return l;
    return {
      ...l,
      colunas: l.colunas.map((c, idx) => {
        if (idx !== colOrigemIdx && idx !== colDestinoIdx) return c;
        const novosPaineis = c.paineis.map(p => (p === origem ? destino : p === destino ? origem : p));
        const novasAlturas: Partial<Record<PainelId, number>> = {};
        c.paineis.forEach((p, i) => {
          const novoId = novosPaineis[i]!;
          novasAlturas[novoId] = c.alturas[p] ?? 1;
        });
        return { ...c, paineis: novosPaineis, alturas: novasAlturas };
      }),
    };
  }

  const { colunas: semOrigem, pesoOriginal } = removerPainelDeColunas(l, origem);
  const destColIdx = semOrigem.findIndex(c => c.paineis.includes(destino));
  if (destColIdx === -1) return l;

  if (modo === 'antes' || modo === 'depois') {
    const novaCol = criarColuna(pesoOriginal, [origem]);
    const inserirEm = modo === 'antes' ? destColIdx : destColIdx + 1;
    const novasColunas = [...semOrigem];
    novasColunas.splice(inserirEm, 0, novaCol);
    return { ...l, colunas: novasColunas };
  }

  // empilhar / empilhar-acima / empilhar-abaixo
  const colDest = semOrigem[destColIdx]!;
  const destPos = colDest.paineis.indexOf(destino);
  const inserirPos = modo === 'empilhar-acima' ? destPos : destPos + 1;
  const novosPaineis = [...colDest.paineis];
  novosPaineis.splice(inserirPos, 0, origem);
  const mediaAlt = colDest.paineis.reduce((a, p) => a + (colDest.alturas[p] ?? 1), 0) / colDest.paineis.length;
  const novasAlturas: Partial<Record<PainelId, number>> = { ...colDest.alturas, [origem]: mediaAlt || 1 };

  return {
    ...l,
    colunas: semOrigem.map((c, idx) => (idx === destColIdx ? { ...c, paineis: novosPaineis, alturas: novasAlturas } : c)),
  };
}

/** Separa um painel empilhado em sua própria coluna imediatamente após a coluna atual. */
export function separarPainelEmColuna(l: LayoutSessao, painelId: PainelId): LayoutSessao {
  const colIdx = l.colunas.findIndex(c => c.paineis.includes(painelId));
  if (colIdx === -1) return l;
  const col = l.colunas[colIdx]!;
  if (col.paineis.length <= 1) return l;
  const restantes = col.paineis.filter(p => p !== painelId);
  const novasAlturas: Partial<Record<PainelId, number>> = {};
  for (const p of restantes) novasAlturas[p] = col.alturas[p] ?? 1;
  const pesoNovo = Math.max(0.8, col.peso / col.paineis.length);
  const pesoRestante = Math.max(0.8, col.peso - pesoNovo);
  const novasColunas = [...l.colunas];
  novasColunas.splice(
    colIdx,
    1,
    { ...col, peso: pesoRestante, paineis: restantes, alturas: novasAlturas },
    criarColuna(pesoNovo, [painelId]),
  );
  return { ...l, colunas: novasColunas };
}

/** Move a coluna que contém `painelId` uma posição para a esquerda (-1) ou direita (+1). */
export function moverColuna(l: LayoutSessao, painelId: PainelId, direcao: -1 | 1): LayoutSessao {
  const idx = l.colunas.findIndex(c => c.paineis.includes(painelId));
  if (idx === -1) return l;
  const alvo = idx + direcao;
  if (alvo < 0 || alvo >= l.colunas.length) return l;
  const novas = [...l.colunas];
  const [movida] = novas.splice(idx, 1);
  novas.splice(alvo, 0, movida!);
  return { ...l, colunas: novas };
}

/** Empilha na coluna vizinha se estiver sozinho, ou desempilha se já estiver em pilha. */
export function alternarEmpilhamentoPainel(l: LayoutSessao, painelId: PainelId): LayoutSessao {
  const colIdx = l.colunas.findIndex(c => c.paineis.includes(painelId));
  if (colIdx === -1) return l;
  const col = l.colunas[colIdx]!;
  if (col.paineis.length > 1) return separarPainelEmColuna(l, painelId);
  if (l.colunas.length <= 1) return l;
  const vizinhaIdx = colIdx < l.colunas.length - 1 ? colIdx + 1 : colIdx - 1;
  const vizinha = l.colunas[vizinhaIdx]!;
  const destino = vizinha.paineis[vizinha.paineis.length - 1]!;
  return moverPainel(l, painelId, destino, 'empilhar-abaixo');
}

function ehPainelValido(v: unknown): v is PainelId {
  return typeof v === 'string' && (PAINEIS as readonly string[]).includes(v);
}

/** Lê um layout guardado (JSON do armazenamento); aceita formato novo em colunas ou legado plano e normaliza painéis ausentes. */
export function lerLayout(bruto: unknown): LayoutSessao {
  if (!bruto) return LAYOUT_PADRAO;

  // Formato novo: { colunas: [...], ocultos?: [...], pesosOcultos?: {...} }
  if (typeof bruto === 'object' && !Array.isArray(bruto)) {
    const obj = bruto as Record<string, unknown>;
    if (!Array.isArray(obj.colunas) || obj.colunas.length === 0) return LAYOUT_PADRAO;
    const vistos = new Set<PainelId>();
    const colunas: ColunaDoLayout[] = [];
    for (const colBruta of obj.colunas) {
      if (!colBruta || typeof colBruta !== 'object') return LAYOUT_PADRAO;
      const c = colBruta as Record<string, unknown>;
      if (typeof c.peso !== 'number' || !Number.isFinite(c.peso) || c.peso <= 0) return LAYOUT_PADRAO;
      if (!Array.isArray(c.paineis) || c.paineis.length === 0) return LAYOUT_PADRAO;
      const paineis: PainelId[] = [];
      for (const p of c.paineis) {
        if (!ehPainelValido(p) || vistos.has(p)) return LAYOUT_PADRAO;
        vistos.add(p);
        paineis.push(p);
      }
      const alturasBrutas = (c.alturas && typeof c.alturas === 'object' ? c.alturas : {}) as Record<string, unknown>;
      const alturas: Partial<Record<PainelId, number>> = {};
      for (const p of paineis) {
        const h = alturasBrutas[p];
        alturas[p] = typeof h === 'number' && Number.isFinite(h) && h > 0 ? h : 1;
      }
      colunas.push({ peso: c.peso, paineis, alturas });
    }
    if (vistos.size === 0) return LAYOUT_PADRAO;
    const ocultos = PAINEIS.filter(id => !vistos.has(id));
    const pesosOcultos: Partial<Record<PainelId, number>> = {};
    if (obj.pesosOcultos && typeof obj.pesosOcultos === 'object') {
      const po = obj.pesosOcultos as Record<string, unknown>;
      for (const id of PAINEIS) {
        const w = po[id];
        if (typeof w === 'number' && Number.isFinite(w) && w > 0) pesosOcultos[id] = w;
      }
    }
    return Object.keys(pesosOcultos).length > 0 ? { colunas, ocultos, pesosOcultos } : { colunas, ocultos };
  }

  // Formato legado: array plano [{ id, peso, visivel }, ...]
  if (!Array.isArray(bruto) || (bruto.length !== PAINEIS.length && bruto.length !== PAINEIS.length - 1)) return LAYOUT_PADRAO;
  const lidos: PainelDoLayout[] = [];
  for (const x of bruto as Record<string, unknown>[]) {
    if (!x || typeof x !== 'object' || !ehPainelValido(x.id) || typeof x.peso !== 'number' || !Number.isFinite(x.peso) || x.peso <= 0 || typeof x.visivel !== 'boolean') {
      return LAYOUT_PADRAO;
    }
    lidos.push({ id: x.id, peso: x.peso, visivel: x.visivel });
  }
  if (!lidos.some(p => p.id === 'quadro')) {
    lidos.push({ id: 'quadro', peso: 2, visivel: false });
  }
  if (lidos.length !== PAINEIS.length || new Set(lidos.map(p => p.id)).size !== PAINEIS.length || !lidos.some(p => p.visivel)) {
    return LAYOUT_PADRAO;
  }

  const colunas: ColunaDoLayout[] = [];
  const ocultos: PainelId[] = [];
  const pesosOcultos: Partial<Record<PainelId, number>> = {};
  for (const item of lidos) {
    if (item.visivel) {
      colunas.push(criarColuna(item.peso, [item.id]));
    } else {
      ocultos.push(item.id);
      pesosOcultos[item.id] = item.peso;
    }
  }
  return { colunas, ocultos, pesosOcultos };
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

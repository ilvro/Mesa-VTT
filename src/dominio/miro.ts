import {
  decodificarEntidadesHtml,
  extrairCorDominanteHtml,
  htmlParaDocRico,
  mapearFonteMiro,
  normalizarCorCssParaHex,
} from './html-miro.ts'
import { analisarMarcadores } from './marcadores.ts'
import { molduraQueContem } from './molduras.ts'
import { NOMES_SEMANTICOS, PALETA_PADRAO, tipoMaisProximo, type PaletaDaCampanha } from './paleta.ts'
import {
  docDeTexto,
  novaForma,
  novaImagem,
  novaMoldura,
  novaSeta,
  novoTexto,
  textoPuro,
  type CABECAS_SETA,
  type DocRico,
  type NoRico,
  type Forma,
  type Item,
  type LADOS_PONTA,
  type Ponta,
  type Revisao,
  type ROTAS_SETA,
  type TipoSemantico,
  type TRACEJADOS,
} from './quadro.ts'
import { caixaDaSeta } from './setas.ts'
import { assinaturaDoMiro } from './sincronia-miro.ts'

export const CORES_DE_NOTA_DO_MIRO: Record<string, string> = {
  gray: '#f5f6f8',
  light_yellow: '#fff9b1',
  yellow: '#f5d128',
  orange: '#ff9d48',
  light_green: '#d5f692',
  green: '#c9df56',
  dark_green: '#93d275',
  cyan: '#67c6c0',
  light_pink: '#ffcee0',
  pink: '#ea94bb',
  violet: '#c6a2d2',
  red: '#f09393',
  light_blue: '#a6ccf5',
  blue: '#6cd8fa',
  dark_blue: '#9ea9ff',
  black: '#000000',
}

export interface ItemMiroBruto {
  id: string
  type: string
  data?: Record<string, unknown>
  style?: Record<string, unknown>
  position?: {
    x?: number
    y?: number
    origin?: string
    relativeTo?: string
  }
  geometry?: {
    width?: number
    height?: number
    rotation?: number
  }
  parent?: {
    id?: string
  }
  /** Ids de tags (preenchido pelo script de download); aceita também objetos `{ id }`. */
  tagIds?: unknown
  arquivoLocal?: string
}

export interface ConectorMiroBruto {
  id: string
  shape?: string
  startItem?: {
    id?: string
    snapTo?: string
    position?: { x?: string | number; y?: string | number }
  }
  endItem?: {
    id?: string
    snapTo?: string
    position?: { x?: string | number; y?: string | number }
  }
  style?: Record<string, unknown>
  captions?: { content?: string }[]
}

export interface TagMiroBruta {
  id?: string
  title?: string
  fillColor?: string
}

export interface GrupoMiroBruto {
  id?: string
  /** Forma da API v2: `data.items` (ids). `items` solto também é aceito. */
  data?: { items?: unknown }
  items?: unknown
}

export interface PacoteMiroBruto {
  formato?: string
  versao?: number
  baixadoEm?: number
  board?: { id?: string; name?: string }
  items?: ItemMiroBruto[]
  connectors?: ConectorMiroBruto[]
  tags?: TagMiroBruta[]
  groups?: GrupoMiroBruto[]
}

/** Título do item `image` do Miro sem a extensão do arquivo e sem espaços extras; vazio vira `undefined`. */
export function legendaDaImagemMiro(titulo: unknown): string | undefined {
  if (typeof titulo !== 'string') return undefined
  const limpo = titulo
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\.(png|jpe?g|gif|webp|bmp|svg|avif|heic|tiff?)$/i, '')
    .trim()
    .slice(0, 300)
    .trim()
  return limpo === '' ? undefined : limpo
}

export interface MetadadosImagemImportada {
  imagemId: string
  larguraOriginal: number
  alturaOriginal: number
}

export interface OpcoesConverterMiro {
  quadroId: string
  agora: number
  novoId: () => string
  /** Id já usado na Mesa para um item/conector do Miro (reimportação). */
  idExistente?: (miroId: string) => string | undefined
  paleta?: PaletaDaCampanha
  imagensPorItemId?: ReadonlyMap<string, MetadadosImagemImportada>
}

export interface ResultadoConversaoMiro {
  nomeDoQuadro: string
  itens: Item[]
  avisos: string[]
  mapaId: Map<string, string>
}

function resolverCorMiro(valor: unknown): string | null {
  if (typeof valor !== 'string' || !valor.trim()) return null
  const chave = valor.trim().toLowerCase()
  if (CORES_DE_NOTA_DO_MIRO[chave]) {
    return CORES_DE_NOTA_DO_MIRO[chave]!
  }
  return normalizarCorCssParaHex(chave)
}

function mapearAlinhamentoTexto(align: unknown): 'esquerda' | 'centro' | 'direita' | 'justificado' {
  if (typeof align !== 'string') return 'esquerda'
  const v = align.toLowerCase()
  if (v === 'center') return 'centro'
  if (v === 'right') return 'direita'
  if (v === 'justified' || v === 'justify') return 'justificado'
  return 'esquerda'
}

function mapearAlinhamentoVertical(align: unknown): 'topo' | 'meio' | 'base' {
  if (typeof align !== 'string') return 'topo'
  const v = align.toLowerCase()
  if (v === 'middle' || v === 'center') return 'meio'
  if (v === 'bottom') return 'base'
  return 'topo'
}

function mapearTracejado(estilo: unknown): (typeof TRACEJADOS)[number] {
  if (typeof estilo !== 'string') return 'solido'
  const v = estilo.toLowerCase()
  if (v === 'dashed') return 'tracejado'
  if (v === 'dotted') return 'pontilhado'
  return 'solido'
}

function mapearFormaMiro(
  shape: unknown,
  idMiro: string,
  avisos: string[],
): Forma {
  if (typeof shape !== 'string' || !shape.trim()) return 'retangulo'
  const s = shape.toLowerCase().trim()
  switch (s) {
    case 'rectangle':
      return 'retangulo'
    case 'round_rectangle':
    case 'rounded_rectangle':
      return 'arredondado'
    case 'circle':
    case 'ellipse':
      return 'elipse'
    case 'rhombus':
    case 'diamond':
      return 'losango'
    case 'triangle':
    case 'wedge_round_rectangle_callout':
      return 'triangulo'
    case 'parallelogram':
    case 'trapezoid':
      return 'paralelogramo'
    case 'hexagon':
    case 'octagon':
      return 'hexagono'
    case 'star':
      return 'estrela'
    case 'cloud':
      return 'nuvem'
    default:
      avisos.push(`Forma desconhecida "${shape}" no item ${idMiro}; convertida para retângulo.`)
      return 'retangulo'
  }
}

function mapearRotaSeta(shape: unknown): (typeof ROTAS_SETA)[number] {
  if (typeof shape !== 'string') return 'curva'
  const s = shape.toLowerCase().trim()
  if (s === 'straight') return 'reta'
  if (s === 'elbowed') return 'cotovelo'
  return 'curva'
}

function mapearCabecaSeta(cap: unknown): (typeof CABECAS_SETA)[number] {
  if (typeof cap !== 'string') return 'nenhuma'
  const c = cap.toLowerCase().trim()
  if (c === 'none') return 'nenhuma'
  if (c === 'stealth' || c === 'arrow' || c === 'open_arrow' || c === 'thin_arrow') return 'seta'
  if (c === 'triangle' || c === 'filled_triangle') return 'triangulo'
  if (c === 'oval' || c === 'filled_oval' || c === 'circle') return 'circulo'
  if (c === 'diamond' || c === 'filled_diamond') return 'losango'
  return 'seta'
}

function mapearLadoSnap(snapTo: unknown): (typeof LADOS_PONTA)[number] {
  if (typeof snapTo !== 'string') return 'auto'
  const s = snapTo.toLowerCase().trim()
  if (s === 'top') return 'cima'
  if (s === 'bottom') return 'baixo'
  if (s === 'left') return 'esquerda'
  if (s === 'right') return 'direita'
  return 'auto'
}

/** Nome de tag (sem acento, minúsculo, sem espaços nas pontas) -> tipo. */
export const TAGS_PARA_TIPO: Record<string, TipoSemantico> = {
  teste: 'teste',
  pericia: 'teste',
  percepcao: 'teste',
  segredo: 'segredo',
  loot: 'loot',
  tesouro: 'loot',
  item: 'loot',
  npc: 'fala',
  fala: 'fala',
  dialogo: 'fala',
  leitura: 'leitura',
  ler: 'leitura',
  narracao: 'leitura',
  evento: 'evento',
  tarefa: 'tarefa',
  todo: 'tarefa',
  rever: 'rever',
  revisar: 'rever',
  titulo: 'titulo',
}

export function normalizarNomeDeTag(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

export function sugerirRevisaoMiro(
  doc: DocRico | null,
  corFundoCaixa: string | null,
  htmlOriginal: string | null,
  paleta: PaletaDaCampanha = PALETA_PADRAO,
  tags: readonly string[] = [],
): Revisao {
  const motivos: string[] = []
  let tipoSugerido: TipoSemantico | null = null

  if (doc) {
    const texto = textoPuro(doc)
    if (texto.trim()) {
      const trechos = analisarMarcadores(texto)
      for (const t of trechos) {
        if (t.tipo !== 'marcador' || !t.marcador) continue
        const m = t.marcador
        if (m.tipo === 'teste') {
          tipoSugerido = 'teste'
          motivos.push(`Contém marcador de teste [${m.pericias.join('/')} ${m.dificuldade}]`)
          break
        }
        if (m.tipo === 'segredo') {
          tipoSugerido = 'segredo'
          motivos.push('Contém marcador de segredo')
          break
        }
        if (m.tipo === 'loot') {
          tipoSugerido = 'loot'
          motivos.push('Contém marcador de loot')
          break
        }
        if (m.tipo === 'rever') {
          tipoSugerido = 'rever'
          motivos.push('Contém marcador [REVER]')
          break
        }
        if (m.tipo === 'tarefa') {
          tipoSugerido = 'tarefa'
          motivos.push('Contém marcador de tarefa')
          break
        }
        if (m.tipo === 'fala') {
          tipoSugerido = m.para ? 'segredo' : 'fala'
          motivos.push(
            m.para
              ? `Contém marcador [${m.quem} PARA ${m.para}]`
              : `Contém fala de ${m.quem}`,
          )
          break
        }
        if (m.tipo === 'evento' || m.tipo === 'data' || m.condicao) {
          tipoSugerido = 'evento'
          motivos.push('Contém marcador de evento ou condição')
          break
        }
      }
    }
  }

  // Prioridade: marcador no texto > tag > cor
  if (tags.length > 0) {
    const desconhecidas: string[] = []
    for (const nome of tags) {
      const tipo = TAGS_PARA_TIPO[normalizarNomeDeTag(nome)]
      if (!tipo) {
        desconhecidas.push(nome.trim())
        continue
      }
      if (!tipoSugerido) {
        tipoSugerido = tipo
        motivos.push(`tag "${nome.trim()}"`)
      }
    }
    if (desconhecidas.length > 0) motivos.push(`tags: ${desconhecidas.join(', ')}`)
  }

  const corDominante = corFundoCaixa || extrairCorDominanteHtml(htmlOriginal)
  if (corDominante) {
    const porCor = tipoMaisProximo(corDominante, paleta)
    if (porCor) {
      if (!tipoSugerido) {
        tipoSugerido = porCor
      }
      motivos.push(`Cor de fundo (${corDominante}) próxima de ${NOMES_SEMANTICOS[porCor]}`)
    }
  }

  if (motivos.length === 0) {
    motivos.push('Item importado do Miro para revisão')
  }

  return {
    tipoSugerido,
    motivos,
    origem: 'miro',
  }
}

function nomesDasTagsDoItem(item: ItemMiroBruto, tagsPorId: ReadonlyMap<string, string>): string[] {
  const bruto = item.tagIds
  if (!Array.isArray(bruto)) return []
  const nomes: string[] = []
  for (const t of bruto) {
    const id = typeof t === 'string' || typeof t === 'number' ? String(t) : t && typeof t === 'object' ? String((t as { id?: unknown }).id ?? '') : ''
    const nome = tagsPorId.get(id)
    if (nome && !nomes.includes(nome)) nomes.push(nome)
  }
  return nomes
}

function idsDoGrupo(g: GrupoMiroBruto | null | undefined): string[] {
  const lista = g?.data?.items ?? g?.items
  if (!Array.isArray(lista)) return []
  const ids: string[] = []
  for (const x of lista) {
    if (typeof x === 'string' || typeof x === 'number') ids.push(String(x))
    else if (x && typeof x === 'object' && (x as { id?: unknown }).id !== undefined) ids.push(String((x as { id: unknown }).id))
  }
  return ids
}

function docDeCardMiro(data: Record<string, unknown> | undefined): DocRico {
  const titulo = typeof data?.title === 'string' ? decodificarEntidadesHtml(data.title.replace(/<[^>]+>/g, '')).trim() : ''
  const descHtml = typeof data?.description === 'string' ? data.description : ''
  const campos = Array.isArray(data?.fields)
    ? data.fields
        .map((f) => (f && typeof f === 'object' && typeof (f as { value?: unknown }).value === 'string' ? (f as { value: string }).value : ''))
        .filter(Boolean)
    : []

  const partesHtml: string[] = []
  if (titulo) partesHtml.push(`<p><strong>${titulo}</strong></p>`)
  if (descHtml) partesHtml.push(descHtml.startsWith('<') ? descHtml : `<p>${descHtml}</p>`)
  for (const c of campos) {
    partesHtml.push(`<p>${c}</p>`)
  }
  return htmlParaDocRico(partesHtml.join(''))
}

const BLOCOS_DE_TEXTO = new Set(['paragraph', 'heading'])
const FATOR_CABECALHO: Record<number, number> = { 1: 1.6, 2: 1.35, 3: 1.15 }

function textoDoBloco(no: NoRico): string {
  if (no.type === 'text') return no.text ?? ''
  if (no.type === 'hardBreak') return '\n'
  return (no.content ?? []).map(textoDoBloco).join('')
}

function maiorFonteDoBloco(no: NoRico): number {
  let maior = 0
  for (const m of no.marks ?? []) {
    if (m.type === 'textStyle') {
      const n = parseFloat(String(m.attrs?.fontSize ?? ''))
      if (Number.isFinite(n) && n > maior) maior = n
    }
  }
  for (const f of no.content ?? []) maior = Math.max(maior, maiorFonteDoBloco(f))
  return maior
}

function blocosDeTexto(nos: NoRico[], saida: NoRico[]): void {
  for (const no of nos) {
    if (BLOCOS_DE_TEXTO.has(no.type)) saida.push(no)
    else if (no.content) blocosDeTexto(no.content, saida)
  }
}

/**
 * Estima a altura (px do quadro) de um texto do Miro, que a API entrega sem
 * `geometry.height`. Heurística: ~0,52 em de largura por caractere, 1,4 de
 * entrelinha, 16 px de margem.
 */
export function alturaEstimadaDoTexto(doc: DocRico, largura: number, tamanhoFonte: number): number {
  const blocos: NoRico[] = []
  blocosDeTexto(doc.content ?? [], blocos)
  let soma = 0
  for (const b of blocos) {
    let tam = maiorFonteDoBloco(b)
    if (tam <= 0) {
      const nivel = Number(b.attrs?.level)
      tam = tamanhoFonte * (b.type === 'heading' ? (FATOR_CABECALHO[nivel] ?? 1) : 1)
    }
    const porLinha = Math.max(1, Math.floor(largura / (tam * 0.52)))
    const linhas = Math.max(1, Math.ceil(textoDoBloco(b).length / porLinha))
    soma += linhas * tam * 1.4
  }
  if (blocos.length === 0) soma = tamanhoFonte * 1.4
  return soma + 16
}

export function converterMiro(
  bruto: PacoteMiroBruto,
  opcoes: OpcoesConverterMiro,
): ResultadoConversaoMiro {
  const { quadroId, agora, paleta = PALETA_PADRAO, imagensPorItemId } = opcoes
  const idParaMiro = (miroId: string): string => opcoes.idExistente?.(miroId) ?? opcoes.novoId()
  const nomeDoQuadro =
    typeof bruto.board?.name === 'string' && bruto.board.name.trim()
      ? bruto.board.name.trim()
      : 'Quadro do Miro'

  const rawItems = Array.isArray(bruto.items) ? bruto.items : []
  const rawConnectors = Array.isArray(bruto.connectors) ? bruto.connectors : []
  const avisos: string[] = []
  const mapaId = new Map<string, string>()
  const tagsPorId = new Map<string, string>()
  for (const t of Array.isArray(bruto.tags) ? bruto.tags : []) {
    if (t && t.id !== undefined && typeof t.title === 'string' && t.title.trim()) {
      tagsPorId.set(String(t.id), t.title.trim())
    }
  }

  const toposDasMolduras = new Map<
    string,
    { x: number; y: number; largura: number; altura: number; idMesa: string }
  >()

  let zContador = 1
  const itensConvertidos: Item[] = []

  // 1ª passagem: converter molduras (frames) para conhecer seus cantos superiores esquerdos
  for (const item of rawItems) {
    if (!item || typeof item.id !== 'string') continue
    if (item.type !== 'frame') continue

    const idMesa = idParaMiro(item.id)
    mapaId.set(item.id, idMesa)

    const largura = Math.max(40, Number(item.geometry?.width) || 640)
    const altura = Math.max(40, Number(item.geometry?.height) || 420)
    const cx = Number(item.position?.x) || 0
    const cy = Number(item.position?.y) || 0
    const x = cx - largura / 2
    const y = cy - altura / 2

    toposDasMolduras.set(item.id, { x, y, largura, altura, idMesa })

    const rawTitle = typeof item.data?.title === 'string' ? item.data.title : ''
    const tituloLimpo = textoPuro(htmlParaDocRico(rawTitle)).trim() || 'Moldura'
    const moldura = novaMoldura(
      {
        quadroId,
        x,
        y,
        largura,
        altura,
        titulo: tituloLimpo,
        z: zContador++,
      },
      agora,
      idMesa,
    )
    const corFundo = resolverCorMiro(item.style?.fillColor)
    if (corFundo) {
      moldura.caixa.fundo = corFundo
    }
    itensConvertidos.push(moldura)
  }

  // 2ª passagem: converter os demais itens
  for (const item of rawItems) {
    if (!item || typeof item.id !== 'string') continue
    if (item.type === 'frame') continue

    const idMesa = idParaMiro(item.id)
    mapaId.set(item.id, idMesa)

    const padraoLargura = item.type === 'sticky_note' ? 200 : 240
    const padraoAltura = item.type === 'sticky_note' ? 200 : 120
    const largura = Math.max(20, Number(item.geometry?.width) || padraoLargura)
    const alturaMiro = Number(item.geometry?.height)
    const docDoTexto =
      item.type === 'text'
        ? htmlParaDocRico(typeof item.data?.content === 'string' ? item.data.content : '')
        : null
    const alturaDoTexto =
      docDoTexto && !alturaMiro
        ? alturaEstimadaDoTexto(docDoTexto, largura, Number(item.style?.fontSize) || 16)
        : 0
    const altura = Math.max(20, alturaMiro || alturaDoTexto || padraoAltura)
    const rotacao = Number(item.geometry?.rotation) || 0

    let cx = Number(item.position?.x) || 0
    let cy = Number(item.position?.y) || 0
    let molduraId: string | null = null

    const parentMiroId = item.parent?.id ? String(item.parent.id) : null
    if (parentMiroId && toposDasMolduras.has(parentMiroId)) {
      const mInfo = toposDasMolduras.get(parentMiroId)!
      molduraId = mInfo.idMesa
      if (item.position?.relativeTo !== 'canvas_center') {
        cx += mInfo.x
        cy += mInfo.y
      }
    }

    const x = cx - largura / 2
    const y = cy - altura / 2
    const st = item.style || {}
    const dt = item.data || {}
    const nomesDasTags = nomesDasTagsDoItem(item, tagsPorId)

    if (item.type === 'text') {
      const doc = docDoTexto!
      const corFundo = resolverCorMiro(st.fillColor)
      const opacidade = st.fillOpacity !== undefined ? Math.min(1, Math.max(0, Number(st.fillOpacity))) : 1
      const corTexto = resolverCorMiro(st.color) || '#e8efe9'
      const tam = Math.min(128, Math.max(8, Number(st.fontSize) || 16))
      const fonte = mapearFonteMiro(typeof st.fontFamily === 'string' ? st.fontFamily : undefined)
      const alinhamento = mapearAlinhamentoTexto(st.textAlign)

      const criado = novoTexto(
        {
          quadroId,
          x,
          y,
          largura,
          altura,
          z: zContador++,
          doc,
          semantica: null,
        },
        agora,
        idMesa,
      )
      criado.rotacao = rotacao
      criado.molduraId = molduraId
      criado.texto = {
        ...criado.texto,
        fonte,
        tamanho: tam,
        cor: corTexto,
        alinhamento,
      }
      criado.caixa = {
        ...criado.caixa,
        fundo: corFundo,
        opacidade: Number.isFinite(opacidade) ? opacidade : 1,
      }
      criado.revisao = sugerirRevisaoMiro(doc, corFundo, typeof dt.content === 'string' ? dt.content : '', paleta, nomesDasTags)
      itensConvertidos.push(criado)
      continue
    }

    if (item.type === 'sticky_note') {
      const html = typeof dt.content === 'string' ? dt.content : ''
      const doc = htmlParaDocRico(html)
      const corFundo = resolverCorMiro(st.fillColor) || CORES_DE_NOTA_DO_MIRO.light_yellow!
      const alinhamento = mapearAlinhamentoTexto(st.textAlign)
      const vertical = mapearAlinhamentoVertical(st.textAlignVertical)

      const criado = novaForma(
        {
          quadroId,
          x,
          y,
          largura,
          altura,
          forma: 'retangulo',
          z: zContador++,
          doc,
          semantica: null,
        },
        agora,
        idMesa,
      )
      criado.rotacao = rotacao
      criado.molduraId = molduraId
      criado.texto = {
        ...criado.texto,
        alinhamento,
        vertical,
        cor: '#111111',
      }
      criado.caixa = {
        ...criado.caixa,
        fundo: corFundo,
        borda: null,
        espessuraBorda: 0,
        sombra: true,
        raio: 4,
      }
      criado.revisao = sugerirRevisaoMiro(doc, corFundo, html, paleta, nomesDasTags)
      itensConvertidos.push(criado)
      continue
    }

    if (item.type === 'shape') {
      const html = typeof dt.content === 'string' ? dt.content : ''
      const doc = htmlParaDocRico(html)
      const forma = mapearFormaMiro(dt.shape, item.id, avisos)
      const corFundo = resolverCorMiro(st.fillColor)
      const opacidade = st.fillOpacity !== undefined ? Math.min(1, Math.max(0, Number(st.fillOpacity))) : 1
      const corBorda = resolverCorMiro(st.borderColor)
      const espessuraBorda = st.borderWidth !== undefined ? Math.min(24, Math.max(0, Number(st.borderWidth))) : 2
      const tracejado = mapearTracejado(st.borderStyle)
      const corTexto = resolverCorMiro(st.color) || (corFundo ? '#111111' : '#e8efe9')
      const tam = Math.min(128, Math.max(8, Number(st.fontSize) || 16))
      const fonte = mapearFonteMiro(typeof st.fontFamily === 'string' ? st.fontFamily : undefined)
      const alinhamento = mapearAlinhamentoTexto(st.textAlign)
      const vertical = mapearAlinhamentoVertical(st.textAlignVertical)

      const criado = novaForma(
        {
          quadroId,
          x,
          y,
          largura,
          altura,
          forma,
          z: zContador++,
          doc,
          semantica: null,
        },
        agora,
        idMesa,
      )
      criado.rotacao = rotacao
      criado.molduraId = molduraId
      criado.texto = {
        ...criado.texto,
        fonte,
        tamanho: tam,
        cor: corTexto,
        alinhamento,
        vertical,
      }
      criado.caixa = {
        ...criado.caixa,
        fundo: corFundo,
        opacidade: Number.isFinite(opacidade) ? opacidade : 1,
        borda: corBorda,
        espessuraBorda: Number.isFinite(espessuraBorda) ? espessuraBorda : 2,
        tracejado,
      }
      criado.revisao = sugerirRevisaoMiro(doc, corFundo, html, paleta, nomesDasTags)
      itensConvertidos.push(criado)
      continue
    }

    if (item.type === 'image') {
      const meta = imagensPorItemId?.get(item.id)
      const imagemId = meta?.imagemId || `miro-img-${item.id}`
      const larguraOriginal = meta?.larguraOriginal || largura
      const alturaOriginal = meta?.alturaOriginal || altura
      const criado = novaImagem(
        {
          quadroId,
          x,
          y,
          imagemId,
          larguraOriginal,
          alturaOriginal,
          largura,
          altura,
          z: zContador++,
        },
        agora,
        idMesa,
      )
      criado.rotacao = rotacao
      criado.molduraId = molduraId
      const legenda = legendaDaImagemMiro(dt.title)
      if (legenda) criado.legenda = legenda
      itensConvertidos.push(criado)
      continue
    }

    if (item.type === 'card' || item.type === 'app_card') {
      const doc = docDeCardMiro(dt)
      const corBorda = resolverCorMiro(st.cardTheme) || '#4b5e53'
      const criado = novoTexto(
        {
          quadroId,
          x,
          y,
          largura,
          altura,
          z: zContador++,
          doc,
          semantica: null,
        },
        agora,
        idMesa,
      )
      criado.rotacao = rotacao
      criado.molduraId = molduraId
      criado.caixa = {
        ...criado.caixa,
        fundo: '#1c2420',
        borda: corBorda,
        espessuraBorda: 2,
        raio: 6,
      }
      criado.revisao = sugerirRevisaoMiro(doc, null, null, paleta, nomesDasTags)
      itensConvertidos.push(criado)
      continue
    }

    if (item.type === 'document' || item.type === 'embed') {
      const titulo = typeof dt.title === 'string' && dt.title.trim() ? dt.title.trim() : item.type
      const url =
        (typeof dt.url === 'string' && dt.url) ||
        (typeof dt.documentUrl === 'string' && dt.documentUrl) ||
        ''
      avisos.push(`Item "${titulo}" (${item.type} ${item.id}) convertido como texto com link.`)
      const doc = docDeTexto(url ? `${titulo}\n${url}` : titulo)
      const criado = novoTexto(
        {
          quadroId,
          x,
          y,
          largura,
          altura,
          z: zContador++,
          doc,
          semantica: null,
        },
        agora,
        idMesa,
      )
      criado.rotacao = rotacao
      criado.molduraId = molduraId
      criado.caixa = {
        ...criado.caixa,
        fundo: '#1c2420',
        borda: '#4b5e53',
        espessuraBorda: 1,
        tracejado: 'tracejado',
      }
      criado.revisao = sugerirRevisaoMiro(doc, null, null, paleta, nomesDasTags)
      itensConvertidos.push(criado)
      continue
    }

    avisos.push(`Tipo de item Miro não suportado ("${item.type}" em ${item.id}); ignorado.`)
  }

  // Atribuir molduraId geométrico para itens sem parent explícito mas contidos numa moldura
  const moldurasMesa = itensConvertidos.filter(
    (it): it is Extract<Item, { tipo: 'moldura' }> => it.tipo === 'moldura',
  )
  if (moldurasMesa.length > 0) {
    for (const it of itensConvertidos) {
      if (it.tipo === 'moldura' || it.molduraId) continue
      const m = molduraQueContem(it, moldurasMesa)
      if (m) it.molduraId = m.id
    }
  }

  // Mapa rápido de itens por id para posicionar e calcular caixa das setas
  const mapaItensMesa = new Map<string, Item>()
  for (const it of itensConvertidos) {
    mapaItensMesa.set(it.id, it)
  }

  // 3ª passagem: converter conectores (connectors) em setas
  for (const conn of rawConnectors) {
    if (!conn || typeof conn.id !== 'string') continue
    const idMesa = idParaMiro(conn.id)
    mapaId.set(conn.id, idMesa)

    const resolverPonta = (
      end: ConectorMiroBruto['startItem'],
      padraoPonto: [number, number],
    ): Ponta => {
      if (end?.id && mapaId.has(String(end.id))) {
        const alvoId = mapaId.get(String(end.id))!
        return {
          itemId: alvoId,
          lado: mapearLadoSnap(end.snapTo),
        }
      }
      const px = Number(end?.position?.x)
      const py = Number(end?.position?.y)
      if (Number.isFinite(px) && Number.isFinite(py)) {
        return { ponto: [px, py] }
      }
      return { ponto: padraoPonto }
    }

    const de = resolverPonta(conn.startItem, [0, 0])
    const para = resolverPonta(conn.endItem, [120, 0])
    const rota = mapearRotaSeta(conn.shape)
    const st = conn.style || {}
    const cor = resolverCorMiro(st.strokeColor) || '#a8b8ad'
    const espessura = Math.min(24, Math.max(1, Number(st.strokeWidth) || 2))
    const tracejado = mapearTracejado(st.strokeStyle)
    const inicio = mapearCabecaSeta(st.startStrokeCap)
    const fim = st.endStrokeCap !== undefined ? mapearCabecaSeta(st.endStrokeCap) : 'seta'

    const legendas = Array.isArray(conn.captions)
      ? conn.captions
          .map((c) => (typeof c?.content === 'string' ? textoPuro(htmlParaDocRico(c.content)).trim() : ''))
          .filter(Boolean)
      : []
    const rotulo = legendas.join(' — ')

    const caixa = caixaDaSeta({ de, para, rota }, mapaItensMesa)
    const seta = novaSeta(
      {
        quadroId,
        de,
        para,
        x: caixa.x,
        y: caixa.y,
        largura: caixa.largura,
        altura: caixa.altura,
        z: zContador++,
        rota,
        cor,
        rotulo,
      },
      agora,
      idMesa,
    )
    seta.espessura = espessura
    seta.tracejado = tracejado
    seta.inicio = inicio
    seta.fim = fim

    itensConvertidos.push(seta)
    mapaItensMesa.set(seta.id, seta)
  }

  // Grupos do Miro -> grupoId comum (um id novo por grupo; menos de 2 itens convertidos: ignora)
  const itemPorId = new Map(itensConvertidos.map((it) => [it.id, it]))
  for (const g of Array.isArray(bruto.groups) ? bruto.groups : []) {
    const membros: Item[] = []
    for (const miroId of idsDoGrupo(g)) {
      const idMesa = mapaId.get(miroId)
      const it = idMesa ? itemPorId.get(idMesa) : undefined
      if (it && !it.grupoId && !membros.includes(it)) membros.push(it)
    }
    if (membros.length < 2) continue
    const grupoId = opcoes.novoId()
    for (const it of membros) it.grupoId = grupoId
  }

  // Origem e assinatura, com o item completo (posição, moldura, pontas)
  const miroPorIdMesa = new Map<string, string>()
  for (const [miroId, idMesa] of mapaId) miroPorIdMesa.set(idMesa, miroId)
  for (const it of itensConvertidos) {
    const miro = miroPorIdMesa.get(it.id)
    if (miro !== undefined) it.origem = { miro, assinatura: assinaturaDoMiro(it) }
  }

  return {
    nomeDoQuadro,
    itens: itensConvertidos,
    avisos,
    mapaId,
  }
}

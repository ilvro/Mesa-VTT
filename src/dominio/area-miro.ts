import type { ConectorMiroBruto, ItemMiroBruto, PacoteMiroBruto } from './miro.ts'

/** Objeto da área de transferência do Miro (`miro-data-v1`); só as chaves lidas aqui. */
export interface ObjetoAreaMiro {
  id?: number
  initialId: string
  widgetData: { type: string; json: Record<string, unknown> }
}

export interface AreaMiro {
  boardId: string | null
  objects: ObjetoAreaMiro[]
}

const MARCADOR = /\(miro-data-v1\)([\s\S]*?)\(\/miro-data-v1\)/

function registro(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}

/** Lê o `text/html` copiado no Miro; `null` se não for do Miro ou estiver ilegível. */
export function lerAreaDoMiro(html: string): AreaMiro | null {
  const m = MARCADOR.exec(html)
  if (!m) return null
  try {
    const binario = atob(m[1]!.trim())
    if (binario.length === 0) return null
    const bytes = new Uint8Array(binario.length)
    for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i)
    // O JSON começa com `{`; o deslocamento é o que sobrou do primeiro byte.
    const desloc = bytes[0]! - 0x7b
    for (let i = 0; i < bytes.length; i++) bytes[i] = (bytes[i]! - desloc + 256) % 256
    const json = registro(JSON.parse(new TextDecoder('utf-8').decode(bytes)))
    const data = registro(json?.data)
    if (!json || !data || !Array.isArray(data.objects)) return null
    const objects: ObjetoAreaMiro[] = []
    for (const o of data.objects) {
      const obj = registro(o)
      const wd = registro(obj?.widgetData)
      const j = registro(wd?.json)
      if (!obj || !wd || !j || typeof wd.type !== 'string') continue
      objects.push({
        id: num(obj.id),
        initialId: String(obj.initialId ?? obj.id ?? ''),
        widgetData: { type: wd.type, json: j },
      })
    }
    return { boardId: typeof json.boardId === 'string' ? json.boardId : null, objects }
  } catch {
    return null
  }
}

function estiloDe(json: Record<string, unknown>): Record<string, unknown> {
  const s = json.style
  if (typeof s === 'string') {
    try {
      return registro(JSON.parse(s)) ?? {}
    } catch {
      return {}
    }
  }
  return registro(s) ?? {}
}

function escalaDe(json: Record<string, unknown>): number {
  const e = num(registro(json.scale)?.scale) ?? num(json.relativeScale)
  return e !== undefined && e > 0 ? e : 1
}

function centroDe(json: Record<string, unknown>): { x: number; y: number } | null {
  const off = registro(registro(json._position)?.offsetPx)
  const x = num(off?.x)
  const y = num(off?.y)
  return x === undefined || y === undefined ? null : { x, y }
}

function hex(n: number): string {
  return '#' + (Math.max(0, Math.floor(n)) & 0xffffff).toString(16).padStart(6, '0')
}

function temTexto(json: Record<string, unknown>): boolean {
  return typeof json.text === 'string' && json.text.replace(/<[^>]*>/g, '').trim() !== ''
}

/**
 * Fator que faz o texto de corpo do Miro chegar com a fonte do próprio Miro: 1 / escala que cobre
 * mais caracteres de texto; sem textos, a mediana das escalas. Sempre finito e > 0.
 */
export function fatorDeEscala(area: AreaMiro): number {
  const caracteres = new Map<number, number>()
  const escalas: number[] = []
  for (const o of area.objects) {
    const j = o.widgetData.json
    if (o.widgetData.type === 'line' || centroDe(j) === null) continue
    const e = escalaDe(j)
    escalas.push(e)
    if (typeof j.text === 'string') {
      const n = j.text.replace(/<[^>]*>/g, '').trim().length
      if (n > 0) caracteres.set(e, (caracteres.get(e) ?? 0) + n)
    }
  }
  let escala = 0
  let melhor = 0
  for (const [e, n] of caracteres) {
    if (n > melhor) {
      melhor = n
      escala = e
    }
  }
  if (escala === 0 && escalas.length > 0) {
    escalas.sort((a, b) => a - b)
    const meio = escalas.length >> 1
    escala = escalas.length % 2 ? escalas[meio]! : (escalas[meio - 1]! + escalas[meio]!) / 2
  }
  const fator = escala > 0 ? 1 / escala : 1
  return Number.isFinite(fator) && fator > 0 ? fator : 1
}

const ALINHAMENTOS: Record<string, string> = { l: 'left', c: 'center', r: 'right', j: 'justify' }

function estiloDeTexto(json: Record<string, unknown>, fator: number): Record<string, unknown> {
  const st = estiloDe(json)
  const bc = num(st.bc)
  const tc = num(st.tc)
  return {
    fontSize: (num(st.st) ?? 14) * escalaDe(json) * fator,
    color: tc !== undefined ? hex(tc) : undefined,
    fillColor: bc !== undefined && bc >= 0 ? hex(bc) : undefined,
    fillOpacity: num(st.bo),
    fontFamily: typeof st.ffn === 'string' ? st.ffn : undefined,
    textAlign: typeof st.ta === 'string' ? ALINHAMENTOS[st.ta] : undefined,
  }
}

/** Quantos objetos a conversão ignora (sem posição ou de tipo sem texto que não é conhecido). */
export function contarIgnoradosDaArea(area: AreaMiro): number {
  let n = 0
  for (const o of area.objects) {
    const t = o.widgetData.type
    const j = o.widgetData.json
    if (t === 'line') continue
    if (centroDe(j) === null) n++
    else if (t !== 'text' && t !== 'image' && t !== 'frame' && !temTexto(j)) n++
  }
  return n
}

/** Traduz a área para o formato da API do Miro que `converterMiro` entende, tudo multiplicado por `fator`. */
export function areaMiroParaPacote(area: AreaMiro, fator: number): PacoteMiroBruto {
  const items: ItemMiroBruto[] = []
  const connectors: ConectorMiroBruto[] = []

  const ponta = (p: unknown): ConectorMiroBruto['startItem'] => {
    const reg = registro(p)
    const pt = registro(reg?.point)
    const idx = num(reg?.widgetIndex)
    if (idx !== undefined && idx >= 0) {
      const alvo = area.objects[idx]
      if (alvo) {
        const x = num(pt?.x)
        const y = num(pt?.y)
        let snapTo: string | undefined
        if (x === 0) snapTo = 'left'
        else if (x === 1) snapTo = 'right'
        else if (y === 0) snapTo = 'top'
        else if (y === 1) snapTo = 'bottom'
        return { id: alvo.initialId, snapTo }
      }
    }
    const x = num(pt?.x)
    const y = num(pt?.y)
    return x !== undefined && y !== undefined ? { position: { x: x * fator, y: y * fator } } : undefined
  }

  for (const o of area.objects) {
    const t = o.widgetData.type
    const j = o.widgetData.json
    if (t === 'line') {
      const st = estiloDe(j)
      const cap = (v: unknown): string => (num(v) === 0 ? 'none' : 'arrow')
      const lt = num(st.lt)
      const lc = num(st.lc)
      connectors.push({
        id: o.initialId,
        shape: lt === 0 ? 'straight' : lt === 1 ? 'elbowed' : 'curved',
        startItem: ponta(j.primary),
        endItem: ponta(j.secondary),
        style: {
          strokeColor: lc !== undefined ? hex(lc) : undefined,
          strokeWidth: num(st.t),
          startStrokeCap: cap(st.a_start),
          endStrokeCap: cap(st.a_end),
        },
      })
      continue
    }
    const centro = centroDe(j)
    if (!centro) continue
    const escala = escalaDe(j)
    const base = {
      id: o.initialId,
      position: { x: centro.x * fator, y: centro.y * fator },
      geometry: { rotation: num(registro(j.rotation)?.rotation) ?? 0 } as NonNullable<ItemMiroBruto['geometry']>,
    }
    if (t === 'image') {
      const crop = registro(j.crop)
      base.geometry.width = (num(crop?.width) ?? 0) * escala * fator
      base.geometry.height = (num(crop?.height) ?? 0) * escala * fator
      items.push({ ...base, type: 'image', data: { title: typeof j.title === 'string' ? j.title : '' } })
      continue
    }
    const tam = registro(j.size)
    base.geometry.width = (num(tam?.width) ?? 0) * escala * fator
    base.geometry.height = (num(tam?.height) ?? 0) * escala * fator
    if (t === 'frame') {
      items.push({ ...base, type: 'frame', data: typeof j.title === 'string' ? { title: j.title } : {} })
    } else if (t === 'text') {
      items.push({ ...base, type: 'text', data: { content: String(j.text ?? '') }, style: estiloDeTexto(j, fator) })
    } else if (temTexto(j)) {
      items.push({
        ...base,
        type: 'shape',
        data: { shape: 'rectangle', content: String(j.text) },
        style: estiloDeTexto(j, fator),
      })
    }
  }

  return { board: { name: 'Colado do Miro' }, items, connectors }
}

import type { ConectorMiroBruto, ItemMiroBruto, PacoteMiroBruto } from './miro.ts'

// Escolha de molduras do Miro: lista as molduras de um pacote bruto e filtra o
// pacote antes da conversão (importação e atualização usam o mesmo filtro).

export interface MolduraDoPacote {
  id: string
  titulo: string
  /** Itens (fora a própria moldura) que pertencem a ela. */
  itens: number
}

export interface FiltroMolduras {
  /** Ids das molduras do Miro que ficam. */
  molduras: string[]
  /** Se os itens fora de qualquer moldura ficam. */
  soltos: boolean
}

interface Caixa {
  x: number
  y: number
  w: number
  h: number
}

function tituloLimpo(bruto: unknown): string {
  const t = typeof bruto === 'string' ? bruto : ''
  const puro = t
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
  return puro || 'Moldura'
}

function caixaDaMoldura(m: ItemMiroBruto): Caixa {
  const w = Math.max(40, Number(m.geometry?.width) || 640)
  const h = Math.max(40, Number(m.geometry?.height) || 420)
  return { x: (Number(m.position?.x) || 0) - w / 2, y: (Number(m.position?.y) || 0) - h / 2, w, h }
}

function dentro(c: Caixa, x: number, y: number): boolean {
  return x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h
}

function itensDe(bruto: PacoteMiroBruto): ItemMiroBruto[] {
  return (Array.isArray(bruto.items) ? bruto.items : []).filter(
    (i): i is ItemMiroBruto => Boolean(i) && typeof i.id === 'string',
  )
}

interface Classificacao {
  /** Molduras em ordem de leitura (de cima para baixo, da esquerda para a direita). */
  molduras: { item: ItemMiroBruto; caixa: Caixa }[]
  /** Item não-moldura -> id da moldura dona (ou null se solto). */
  dono: Map<string, string | null>
}

function classificar(bruto: PacoteMiroBruto): Classificacao {
  const todos = itensDe(bruto)
  const molduras = todos
    .filter((i) => i.type === 'frame')
    .map((item) => ({ item, caixa: caixaDaMoldura(item) }))
    .sort((a, b) => a.caixa.y - b.caixa.y || a.caixa.x - b.caixa.x)
  const porId = new Map(molduras.map((m) => [m.item.id, m]))
  const dono = new Map<string, string | null>()
  for (const it of todos) {
    if (it.type === 'frame') continue
    const pai = it.parent?.id ? porId.get(String(it.parent.id)) : undefined
    if (pai) {
      dono.set(it.id, pai.item.id)
      continue
    }
    const cx = Number(it.position?.x) || 0
    const cy = Number(it.position?.y) || 0
    const m = molduras.find((f) => dentro(f.caixa, cx, cy))
    dono.set(it.id, m ? m.item.id : null)
  }
  return { molduras, dono }
}

/** Molduras do pacote, em ordem de leitura, com a contagem de itens de cada uma. */
export function moldurasDoPacote(bruto: PacoteMiroBruto): MolduraDoPacote[] {
  const { molduras, dono } = classificar(bruto)
  const contagem = new Map<string, number>()
  for (const d of dono.values()) if (d) contagem.set(d, (contagem.get(d) ?? 0) + 1)
  return molduras.map((m) => ({
    id: m.item.id,
    titulo: tituloLimpo(m.item.data?.title),
    itens: contagem.get(m.item.id) ?? 0,
  }))
}

/** Quantos itens (fora as molduras) não estão em nenhuma moldura. */
export function itensSoltosDoPacote(bruto: PacoteMiroBruto): number {
  let n = 0
  for (const d of classificar(bruto).dono.values()) if (!d) n++
  return n
}

/** Pacote só com o que o filtro mantém. Não altera o original. */
export function filtrarPacote(bruto: PacoteMiroBruto, filtro: FiltroMolduras): PacoteMiroBruto {
  const { molduras, dono } = classificar(bruto)
  const escolhidas = new Set(filtro.molduras)
  const caixasEscolhidas = molduras.filter((m) => escolhidas.has(m.item.id)).map((m) => m.caixa)
  const todasCaixas = molduras.map((m) => m.caixa)

  const manter = new Set<string>()
  const itens = itensDe(bruto).filter((it) => {
    let fica: boolean
    if (it.type === 'frame') fica = escolhidas.has(it.id)
    else {
      const d = dono.get(it.id) ?? null
      fica = d ? escolhidas.has(d) : filtro.soltos
    }
    if (fica) manter.add(it.id)
    return fica
  })
  const idsDoPacote = new Set(itensDe(bruto).map((i) => i.id))

  const pontaOk = (p: ConectorMiroBruto['startItem']): boolean => {
    if (p?.id && idsDoPacote.has(String(p.id))) return manter.has(String(p.id))
    const x = Number(p?.position?.x)
    const y = Number(p?.position?.y)
    if (Number.isFinite(x) && Number.isFinite(y)) {
      if (caixasEscolhidas.some((c) => dentro(c, x, y))) return true
      return filtro.soltos && !todasCaixas.some((c) => dentro(c, x, y))
    }
    return filtro.soltos
  }
  const conectores = (Array.isArray(bruto.connectors) ? bruto.connectors : []).filter(
    (c) => Boolean(c) && pontaOk(c.startItem) && pontaOk(c.endItem),
  )
  return { ...bruto, items: itens, connectors: conectores }
}

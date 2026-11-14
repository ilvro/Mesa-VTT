import { ehRef, lerRef, mesmaRef, type Ligacao, type Ref } from '#mesa'
import { parsearRefDeItemDeQuadro } from './ligacoes-quadro.ts'
import { ordemDeLeitura, type ItemMoldura } from './molduras.ts'
import type { Item, Quadro } from './quadro.ts'

export interface ItemAncorado {
  quadroId: string
  nomeDoQuadro: string
  item: Item
  tipoLigacao: string
}

export function parsearRefAncora(texto: string): Ref | null {
  const limpo = texto.trim()
  if (!limpo) return null
  const r = lerRef(limpo)
  return r && ehRef(r) ? r : null
}

function ordenarItensEmLeituraNoQuadro(
  lista: Item[],
  todosDoQuadro: ReadonlyMap<string, Item>,
): Item[] {
  if (lista.length <= 1) return [...lista]

  const molduras = [...todosDoQuadro.values()].filter(
    (i): i is ItemMoldura => i.tipo === 'moldura',
  )
  const moldurasOrdenadas = ordemDeLeitura(molduras)
  const ordemMoldura = new Map<string, number>()
  moldurasOrdenadas.forEach((m, idx) => ordemMoldura.set(m.id, idx))

  return [...lista].sort((a, b) => {
    const ma = a.molduraId && ordemMoldura.has(a.molduraId) ? ordemMoldura.get(a.molduraId)! : 999999
    const mb = b.molduraId && ordemMoldura.has(b.molduraId) ? ordemMoldura.get(b.molduraId)! : 999999
    if (ma !== mb) return ma - mb
    return a.y - b.y || a.x - b.x || a.id.localeCompare(b.id)
  })
}

export function itensAncoradosEm(
  alvo: Ref,
  ligacoes: readonly Ligacao[],
  itensPorQuadro: ReadonlyMap<string, ReadonlyMap<string, Item>>,
  quadros: readonly Quadro[],
  quadroAbertoId?: string | null,
): ItemAncorado[] {
  const porQuadro = new Map<string, { item: Item; tipoLigacao: string }[]>()
  const vistos = new Set<string>()

  for (const lig of ligacoes) {
    if (lig.tipo !== 'esta-em' && lig.tipo !== 'menciona') continue
    if (!mesmaRef(lig.para, alvo)) continue
    const parsed = parsearRefDeItemDeQuadro(lig.de)
    if (!parsed) continue
    const chave = `${parsed.quadroId}/${parsed.itemId}`
    if (vistos.has(chave)) continue
    const mapaQuadro = itensPorQuadro.get(parsed.quadroId)
    const item = mapaQuadro?.get(parsed.itemId)
    if (!item) continue
    vistos.add(chave)
    const grupo = porQuadro.get(parsed.quadroId) ?? []
    grupo.push({ item, tipoLigacao: lig.tipo })
    porQuadro.set(parsed.quadroId, grupo)
  }

  const nomesQuadro = new Map<string, string>()
  for (const q of quadros) {
    nomesQuadro.set(q.id, q.nome)
  }

  const idsQuadroOrdenados = [...porQuadro.keys()].sort((a, b) => {
    if (quadroAbertoId) {
      if (a === quadroAbertoId && b !== quadroAbertoId) return -1
      if (b === quadroAbertoId && a !== quadroAbertoId) return 1
    }
    const idxA = quadros.findIndex((q) => q.id === a)
    const idxB = quadros.findIndex((q) => q.id === b)
    if (idxA >= 0 && idxB >= 0) return idxA - idxB
    return a.localeCompare(b)
  })

  const resultado: ItemAncorado[] = []
  for (const qId of idsQuadroOrdenados) {
    const entradas = porQuadro.get(qId) ?? []
    const mapaQuadro = itensPorQuadro.get(qId) ?? new Map<string, Item>()
    const itensOrdenados = ordenarItensEmLeituraNoQuadro(
      entradas.map((e) => e.item),
      mapaQuadro,
    )
    const tipoPorItemId = new Map(entradas.map((e) => [e.item.id, e.tipoLigacao]))
    for (const item of itensOrdenados) {
      resultado.push({
        quadroId: qId,
        nomeDoQuadro: nomesQuadro.get(qId) ?? qId,
        item,
        tipoLigacao: tipoPorItemId.get(item.id) ?? 'esta-em',
      })
    }
  }

  return resultado
}

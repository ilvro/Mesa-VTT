import { MOTIVO_CONFLITO_MIRO, MOTIVO_SAIU_DO_MIRO } from './revisao.ts'
import { TIPOS_SEMANTICOS, type Item, type Ponta, type Revisao, type TipoSemantico } from './quadro.ts'
import type { Operacao, Passo } from './quadro-operacoes.ts'

// Assinatura do conteúdo que veio do Miro. Estilos de texto e de caixa ficam de
// fora de propósito: o mestre pode repintar sem gerar conflito na reimportação.

function meio(n: number): number {
  return Math.round(n * 2) / 2
}

/** JSON com chaves em ordem alfabética em qualquer profundidade. */
function jsonEstavel(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null'
  if (Array.isArray(v)) return `[${v.map(jsonEstavel).join(',')}]`
  const obj = v as Record<string, unknown>
  const partes: string[] = []
  for (const k of Object.keys(obj).sort()) {
    if (obj[k] === undefined) continue
    partes.push(`${JSON.stringify(k)}:${jsonEstavel(obj[k])}`)
  }
  return `{${partes.join(',')}}`
}

function ponta(p: Ponta): unknown {
  if ('itemId' in p) return { itemId: p.itemId, lado: p.lado }
  return { ponto: [meio(p.ponto[0]), meio(p.ponto[1])] }
}

function fnv1a(texto: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

export function assinaturaDoMiro(item: Item): string {
  // A caixa da seta é derivada das pontas e muda sozinha quando um item ligado
  // se move; o que define a seta são as próprias pontas.
  const conteudo: Record<string, unknown> =
    item.tipo === 'seta'
      ? { tipo: item.tipo }
      : {
          tipo: item.tipo,
          x: meio(item.x),
          y: meio(item.y),
          largura: meio(item.largura),
          altura: meio(item.altura),
          rotacao: meio(item.rotacao),
        }
  switch (item.tipo) {
    case 'texto':
      conteudo.doc = item.doc
      break
    case 'forma':
      conteudo.doc = item.doc
      conteudo.forma = item.forma
      break
    case 'moldura':
      conteudo.titulo = item.titulo
      break
    case 'imagem':
      conteudo.imagemId = item.imagemId
      break
    case 'seta':
      conteudo.de = ponta(item.de)
      conteudo.para = ponta(item.para)
      conteudo.rota = item.rota
      conteudo.rotulo = item.rotulo
      break
    default:
      break
  }
  return fnv1a(jsonEstavel(conteudo))
}

// ---------------------------------------------------------------------------
// Plano de atualização: quadro atual x conversão nova do mesmo quadro do Miro
// ---------------------------------------------------------------------------

export interface RelatorioDaAtualizacao {
  novos: number
  /** Itens que continuam no Miro mas foram apagados na Mesa: não voltam. */
  apagadosAqui: number
  atualizados: number
  removidos: number
  conflitos: number
  saiuDoMiro: number
}

/** Campos que são da Mesa: sobrevivem à atualização. */
const CAMPOS_DA_MESA = new Set([
  'semantica',
  'revisao',
  'feito',
  'travado',
  'soMestre',
  'grupoId',
  'z',
  'aoFocar',
  'criadoEm',
  // Estilos ficam fora da assinatura para o mestre poder repintar; pelo mesmo
  // motivo, uma atualização do Miro não desfaz a pintura feita aqui.
  'caixa',
  'texto',
  'cor',
  'espessura',
  'tracejado',
  'inicio',
  'fim',
])
/** Campos que nunca entram na comparação campo a campo. */
const CAMPOS_FIXOS = new Set(['id', 'quadroId', 'atualizadoEm'])

type Alteracao = { id: string; antes: Partial<Item>; depois: Partial<Item> }

function revisaoDe(atual: Item, motivo: string): Revisao {
  const sem = (atual as { semantica?: unknown }).semantica
  const tipoSugerido = (TIPOS_SEMANTICOS as readonly unknown[]).includes(sem)
    ? (sem as TipoSemantico)
    : null
  return { tipoSugerido, motivos: [motivo], origem: 'miro' }
}

function marcarParaRevisao(atual: Item, motivo: string, assinatura: string | null, agora: number): Alteracao {
  const antes: Record<string, unknown> = { revisao: atual.revisao, atualizadoEm: atual.atualizadoEm }
  const depois: Record<string, unknown> = { revisao: revisaoDe(atual, motivo), atualizadoEm: agora }
  if (assinatura !== null && atual.origem) {
    antes.origem = atual.origem
    depois.origem = { miro: atual.origem.miro, assinatura }
  }
  return { id: atual.id, antes: antes as Partial<Item>, depois: depois as Partial<Item> }
}

function alteracaoDeAtualizacao(atual: Item, novo: Item, agora: number): Alteracao {
  const a = atual as unknown as Record<string, unknown>
  const n = novo as unknown as Record<string, unknown>
  const antes: Record<string, unknown> = {}
  const depois: Record<string, unknown> = {}
  const chaves = new Set([...Object.keys(a), ...Object.keys(n)])
  for (const k of chaves) {
    if (CAMPOS_DA_MESA.has(k) || CAMPOS_FIXOS.has(k)) continue
    if (jsonEstavel(a[k]) !== jsonEstavel(n[k])) {
      antes[k] = a[k]
      depois[k] = n[k]
    }
  }
  antes.atualizadoEm = atual.atualizadoEm
  depois.atualizadoEm = agora
  return { id: atual.id, antes: antes as Partial<Item>, depois: depois as Partial<Item> }
}

/**
 * Compara o quadro atual com a conversão nova do mesmo quadro do Miro.
 * Itens sem `origem` nunca são tocados. `vistosAntes` são os ids do Miro da
 * sincronização anterior: um deles sem item aqui foi apagado na Mesa e não é recriado. `novos` já traz os ids reaproveitados.
 */
export function planejarAtualizacaoDoMiro(
  atuais: ReadonlyMap<string, Item>,
  novos: readonly Item[],
  agora: number,
  vistosAntes?: ReadonlySet<string>,
): { passo: Passo; relatorio: RelatorioDaAtualizacao } {
  const relatorio: RelatorioDaAtualizacao = {
    apagadosAqui: 0,
    novos: 0,
    atualizados: 0,
    removidos: 0,
    conflitos: 0,
    saiuDoMiro: 0,
  }
  const porMiro = new Map<string, Item>()
  let maiorZ = 0
  for (const it of atuais.values()) {
    if (it.origem) porMiro.set(it.origem.miro, it)
    if (it.z > maiorZ) maiorZ = it.z
  }

  const alterar: Alteracao[] = []
  const remover: Item[] = []
  const criar: Item[] = []
  const vistos = new Set<string>()

  for (const novo of novos) {
    if (!novo.origem) continue
    const atual = porMiro.get(novo.origem.miro)
    if (!atual || !atual.origem) {
      // Já estava no Miro na última vez e não existe aqui: o mestre apagou na Mesa.
      if (vistosAntes?.has(novo.origem.miro)) relatorio.apagadosAqui++
      else criar.push(novo)
      continue
    }
    vistos.add(atual.origem.miro)
    const mesaMudou = assinaturaDoMiro(atual) !== atual.origem.assinatura
    const miroMudou = novo.origem.assinatura !== atual.origem.assinatura
    if (!miroMudou) continue
    if (mesaMudou || novo.tipo !== atual.tipo) {
      alterar.push(
        marcarParaRevisao(atual, MOTIVO_CONFLITO_MIRO, novo.origem.assinatura, agora),
      )
      relatorio.conflitos++
    } else {
      alterar.push(alteracaoDeAtualizacao(atual, novo, agora))
      relatorio.atualizados++
    }
  }

  for (const [miro, atual] of porMiro) {
    if (vistos.has(miro) || !atual.origem) continue
    if (assinaturaDoMiro(atual) !== atual.origem.assinatura) {
      alterar.push(marcarParaRevisao(atual, MOTIVO_SAIU_DO_MIRO, null, agora))
      relatorio.saiuDoMiro++
    } else {
      remover.push(atual)
      relatorio.removidos++
    }
  }

  // Os novos ficam acima de tudo, na ordem relativa em que vieram.
  const ordemNovos = criar
    .map((it, i) => ({ it, i }))
    .sort((a, b) => a.it.z - b.it.z || a.i - b.i)
  const zDe = new Map<Item, number>()
  ordemNovos.forEach(({ it }, k) => zDe.set(it, maiorZ + 1 + k))
  const criados = criar.map((it) => ({ ...it, z: zDe.get(it)! }) as Item)
  relatorio.novos = criados.length

  const ops: Operacao[] = []
  if (alterar.length > 0) ops.push({ alterar })
  if (remover.length > 0) ops.push({ remover })
  if (criados.length > 0) ops.push({ criar: criados })
  return { passo: { rotulo: 'Atualizar do Miro', ops }, relatorio }
}

/** Os ids do Miro de uma conversão, para guardar em `quadro.origem.vistos`. */
export function idsDoMiro(itens: readonly Item[]): string[] {
  const ids: string[] = []
  for (const it of itens) if (it.origem) ids.push(it.origem.miro)
  return ids
}

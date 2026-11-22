import type { Item, Ponta } from './quadro.ts'

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

import { sanitizarCor, sanitizarFonte, sanitizarTamanhoPx } from './doc-rico.ts'
import type { DocRico, IdFonte, NoRico } from './quadro.ts'
import { normalizarDoc } from './quadro.ts'

const ENTIDADES_NOMEADAS: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
}

export function decodificarEntidadesHtml(texto: string): string {
  return texto.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (completo, codigo: string) => {
    if (codigo.startsWith('#x') || codigo.startsWith('#X')) {
      const n = parseInt(codigo.slice(2), 16)
      return Number.isFinite(n) && n > 0 ? String.fromCodePoint(n) : completo
    }
    if (codigo.startsWith('#')) {
      const n = parseInt(codigo.slice(1), 10)
      return Number.isFinite(n) && n > 0 ? String.fromCodePoint(n) : completo
    }
    const chave = codigo.toLowerCase()
    return ENTIDADES_NOMEADAS[chave] ?? completo
  })
}

export function mapearFonteMiro(nomeBruto: string | undefined | null): IdFonte {
  if (!nomeBruto) return 'open-sans'
  const limpo = nomeBruto
    .toLowerCase()
    .replace(/['"]/g, '')
    .trim()
    .replace(/[\s-]+/g, '_')

  if (
    limpo.includes('pt_serif') ||
    limpo.includes('georgia') ||
    limpo.includes('times') ||
    limpo.includes('garamond') ||
    limpo.includes('abril') ||
    limpo === 'serif'
  ) {
    return 'pt-serif'
  }
  if (
    limpo.includes('caveat') ||
    limpo.includes('permanent_marker') ||
    limpo.includes('architects_daughter') ||
    limpo.includes('handwriting') ||
    limpo.includes('cursive')
  ) {
    return 'caveat'
  }
  if (
    limpo.includes('roboto_mono') ||
    limpo.includes('plex_mono') ||
    limpo.includes('jetbrains') ||
    limpo.includes('courier') ||
    limpo.includes('mono')
  ) {
    return 'jetbrains-mono'
  }
  if (limpo.includes('cinzel') || limpo.includes('bangers')) {
    return 'cinzel'
  }
  if (limpo.includes('hanken')) {
    return 'hanken'
  }
  return 'open-sans'
}

export function normalizarCorCssParaHex(valor: string | undefined | null): string | null {
  if (!valor) return null
  const limpo = valor.trim().toLowerCase()
  if (limpo === 'transparent' || limpo === 'none') return null
  const hex = sanitizarCor(limpo)
  if (hex) {
    if (/^#[0-9a-f]{3}$/i.test(hex)) {
      return `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`.toLowerCase()
    }
    return hex.toLowerCase()
  }
  const mRgb = limpo.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/)
  if (mRgb) {
    const r = Math.min(255, Math.max(0, Number(mRgb[1])))
    const g = Math.min(255, Math.max(0, Number(mRgb[2])))
    const b = Math.min(255, Math.max(0, Number(mRgb[3])))
    const toHex = (n: number) => n.toString(16).padStart(2, '0')
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`
  }
  return null
}

function extrairAtributos(tagInterior: string): Record<string, string> {
  const attrs: Record<string, string> = {}
  const regex = /([a-zA-Z0-9_-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g
  let m: RegExpExecArray | null
  while ((m = regex.exec(tagInterior)) !== null) {
    const nome = m[1]!.toLowerCase()
    const val = m[2] ?? m[3] ?? m[4] ?? ''
    attrs[nome] = decodificarEntidadesHtml(val)
  }
  return attrs
}

function parsearStyleInline(styleStr: string | undefined): Record<string, string> {
  const mapa: Record<string, string> = {}
  if (!styleStr) return mapa
  for (const parte of styleStr.split(';')) {
    const idx = parte.indexOf(':')
    if (idx <= 0) continue
    const prop = parte.slice(0, idx).trim().toLowerCase()
    const val = parte.slice(idx + 1).trim()
    if (prop && val) mapa[prop] = val
  }
  return mapa
}

interface MarcaAtiva {
  type: string
  attrs?: Record<string, unknown>
}

interface TokenHtml {
  tipo: 'abertura' | 'fechamento' | 'auto' | 'texto'
  nome?: string
  attrs?: Record<string, string>
  texto?: string
}

function tokenizarHtml(html: string): TokenHtml[] {
  const tokens: TokenHtml[] = []
  const regex = /<!--[\s\S]*?-->|<\/?([a-zA-Z0-9]+)([^>]*)>|([^<]+)/g
  let m: RegExpExecArray | null
  while ((m = regex.exec(html)) !== null) {
    if (m[0].startsWith('<!--')) continue
    if (m[1] !== undefined) {
      const nome = m[1].toLowerCase()
      const resto = m[2] ?? ''
      const ehFechamento = m[0].startsWith('</')
      const ehAuto = !ehFechamento && (/\/\s*>$/.test(m[0]) || nome === 'br' || nome === 'hr' || nome === 'img')
      if (ehFechamento) {
        tokens.push({ tipo: 'fechamento', nome })
      } else if (ehAuto) {
        tokens.push({ tipo: 'auto', nome, attrs: extrairAtributos(resto) })
      } else {
        tokens.push({ tipo: 'abertura', nome, attrs: extrairAtributos(resto) })
      }
    } else if (m[3] !== undefined) {
      tokens.push({ tipo: 'texto', texto: decodificarEntidadesHtml(m[3]) })
    }
  }
  return tokens
}

function clonarMarcas(pilha: { tag: string; marcas: MarcaAtiva[] }[]): MarcaAtiva[] {
  const resultado: MarcaAtiva[] = []
  const textStyleAcumulado: Record<string, unknown> = {}
  let temTextStyle = false

  for (const entrada of pilha) {
    for (const m of entrada.marcas) {
      if (m.type === 'textStyle' && m.attrs) {
        Object.assign(textStyleAcumulado, m.attrs)
        temTextStyle = true
      } else {
        const idx = resultado.findIndex((r) => r.type === m.type)
        if (idx >= 0) resultado[idx] = m
        else resultado.push(m)
      }
    }
  }
  if (temTextStyle) {
    resultado.push({ type: 'textStyle', attrs: textStyleAcumulado })
  }
  return resultado
}

function marcasParaTag(nome: string, attrs: Record<string, string> = {}): MarcaAtiva[] {
  const marcas: MarcaAtiva[] = []
  if (nome === 'strong' || nome === 'b') {
    marcas.push({ type: 'bold' })
  } else if (nome === 'em' || nome === 'i') {
    marcas.push({ type: 'italic' })
  } else if (nome === 'u') {
    marcas.push({ type: 'underline' })
  } else if (nome === 's' || nome === 'strike' || nome === 'del') {
    marcas.push({ type: 'strike' })
  } else if (nome === 'a') {
    const href = attrs.href?.trim()
    if (href) {
      marcas.push({ type: 'link', attrs: { href } })
    }
  }

  const estilo = parsearStyleInline(attrs.style)
  const tsAttrs: Record<string, unknown> = {}
  const cor = normalizarCorCssParaHex(estilo.color)
  if (cor) tsAttrs.color = cor
  const bg = normalizarCorCssParaHex(estilo['background-color'])
  if (bg) tsAttrs.backgroundColor = bg
  if (estilo['font-size']) {
    const num = parseFloat(estilo['font-size'])
    const tam = sanitizarTamanhoPx(num)
    if (tam) tsAttrs.fontSize = tam
  }
  if (estilo['font-family']) {
    const f = mapearFonteMiro(estilo['font-family'])
    const fonteValida = sanitizarFonte(f)
    if (fonteValida) tsAttrs.fontFamily = fonteValida
  }
  if (Object.keys(tsAttrs).length > 0) {
    marcas.push({ type: 'textStyle', attrs: tsAttrs })
  }
  return marcas
}

function alinhamentoDeAttrs(attrs: Record<string, string> | undefined): string | undefined {
  if (!attrs) return undefined
  const estilo = parsearStyleInline(attrs.style)
  const align = (estilo['text-align'] || attrs.align || '').toLowerCase()
  if (align === 'center' || align === 'centro') return 'centro'
  if (align === 'right' || align === 'direita') return 'direita'
  if (align === 'justify' || align === 'justificado') return 'justificado'
  if (align === 'left' || align === 'esquerda') return 'esquerda'
  return undefined
}

export function extrairCorDominanteHtml(html: string | undefined | null): string | null {
  if (!html) return null
  const tokens = tokenizarHtml(html)
  const pesos = new Map<string, number>()
  const pilhaCor: (string | null)[] = []

  for (const tk of tokens) {
    if (tk.tipo === 'abertura') {
      const estilo = parsearStyleInline(tk.attrs?.style)
      const bg = normalizarCorCssParaHex(estilo['background-color'])
      pilhaCor.push(bg ?? (pilhaCor.length > 0 ? pilhaCor[pilhaCor.length - 1]! : null))
    } else if (tk.tipo === 'fechamento') {
      if (pilhaCor.length > 0) pilhaCor.pop()
    } else if (tk.tipo === 'texto' && tk.texto) {
      const corAtual = pilhaCor.length > 0 ? pilhaCor[pilhaCor.length - 1] : null
      if (corAtual) {
        const len = tk.texto.trim().length || 1
        pesos.set(corAtual, (pesos.get(corAtual) ?? 0) + len)
      }
    }
  }

  let melhor: string | null = null
  let maior = 0
  for (const [cor, peso] of pesos) {
    if (peso > maior) {
      maior = peso
      melhor = cor
    }
  }
  return melhor
}

export function htmlParaDocRico(htmlBruto: string | undefined | null): DocRico {
  if (!htmlBruto || !htmlBruto.trim()) {
    return { type: 'doc', content: [{ type: 'paragraph' }] }
  }

  const tokens = tokenizarHtml(htmlBruto)
  const blocos: NoRico[] = []
  let paragrafoAtual = null as NoRico | null
  let listaAtual = null as NoRico | null
  let itemListaAtual = null as NoRico | null
  let paragrafoItemLista = null as NoRico | null
  const pilhaMarcas: { tag: string; marcas: MarcaAtiva[] }[] = []

  const obterDestinoInline = (): NoRico => {
    if (itemListaAtual) {
      if (!paragrafoItemLista) {
        paragrafoItemLista = { type: 'paragraph', content: [] }
        itemListaAtual.content = itemListaAtual.content || []
        itemListaAtual.content.push(paragrafoItemLista)
      }
      return paragrafoItemLista
    }
    if (!paragrafoAtual) {
      paragrafoAtual = { type: 'paragraph', content: [] }
      blocos.push(paragrafoAtual)
    }
    return paragrafoAtual
  }

  const fecharParagrafoAtual = () => {
    if (paragrafoAtual) {
      if (paragrafoAtual.content && paragrafoAtual.content.length === 0) {
        delete paragrafoAtual.content
      }
      paragrafoAtual = null
    }
  }

  for (const tk of tokens) {
    if (tk.tipo === 'auto') {
      if (tk.nome === 'br') {
        const alvo = obterDestinoInline()
        alvo.content = alvo.content || []
        alvo.content.push({ type: 'hardBreak' })
      }
      continue
    }

    if (tk.tipo === 'abertura') {
      const nome = tk.nome!
      if (nome === 'p' || nome === 'div') {
        if (!itemListaAtual) {
          fecharParagrafoAtual()
          const align = alinhamentoDeAttrs(tk.attrs)
          paragrafoAtual = {
            type: 'paragraph',
            ...(align ? { attrs: { textAlign: align } } : {}),
            content: [],
          }
          blocos.push(paragrafoAtual)
        }
        const m = marcasParaTag(nome, tk.attrs)
        if (m.length > 0) pilhaMarcas.push({ tag: nome, marcas: m })
      } else if (nome === 'h1' || nome === 'h2' || nome === 'h3') {
        fecharParagrafoAtual()
        const level = Number(nome[1])
        const align = alinhamentoDeAttrs(tk.attrs)
        paragrafoAtual = {
          type: 'heading',
          attrs: { level, ...(align ? { textAlign: align } : {}) },
          content: [],
        }
        blocos.push(paragrafoAtual)
      } else if (nome === 'ul' || nome === 'ol') {
        fecharParagrafoAtual()
        listaAtual = {
          type: nome === 'ol' ? 'orderedList' : 'bulletList',
          content: [],
        }
        blocos.push(listaAtual)
      } else if (nome === 'li') {
        if (!listaAtual) {
          fecharParagrafoAtual()
          listaAtual = { type: 'bulletList', content: [] }
          blocos.push(listaAtual)
        }
        itemListaAtual = { type: 'listItem', content: [] }
        paragrafoItemLista = null
        listaAtual.content = listaAtual.content || []
        listaAtual.content.push(itemListaAtual)
      } else {
        const m = marcasParaTag(nome, tk.attrs)
        pilhaMarcas.push({ tag: nome, marcas: m })
      }
      continue
    }

    if (tk.tipo === 'fechamento') {
      const nome = tk.nome!
      for (let i = pilhaMarcas.length - 1; i >= 0; i--) {
        if (pilhaMarcas[i]!.tag === nome) {
          pilhaMarcas.splice(i, 1)
          break
        }
      }
      if (nome === 'p' || nome === 'div' || nome === 'h1' || nome === 'h2' || nome === 'h3') {
        if (!itemListaAtual) fecharParagrafoAtual()
      } else if (nome === 'li') {
        if (paragrafoItemLista && paragrafoItemLista.content?.length === 0) {
          delete paragrafoItemLista.content
        }
        if (itemListaAtual && (!itemListaAtual.content || itemListaAtual.content.length === 0)) {
          itemListaAtual.content = [{ type: 'paragraph' }]
        }
        paragrafoItemLista = null
        itemListaAtual = null
      } else if (nome === 'ul' || nome === 'ol') {
        if (listaAtual && (!listaAtual.content || listaAtual.content.length === 0)) {
          const idx = blocos.indexOf(listaAtual)
          if (idx >= 0) blocos.splice(idx, 1)
        }
        listaAtual = null
      }
      continue
    }

    if (tk.tipo === 'texto' && tk.texto) {
      const textoNormalizado = tk.texto.replace(/\r\n/g, '\n')
      if (!textoNormalizado) continue
      if (!paragrafoAtual && !itemListaAtual && /^\s+$/.test(textoNormalizado)) {
        continue
      }
      const alvo = obterDestinoInline()
      alvo.content = alvo.content || []
      const marcas = clonarMarcas(pilhaMarcas)
      const noTexto: NoRico = {
        type: 'text',
        text: textoNormalizado,
        ...(marcas.length > 0 ? { marks: marcas } : {}),
      }
      alvo.content.push(noTexto)
    }
  }

  fecharParagrafoAtual()
  if (blocos.length === 0) {
    blocos.push({ type: 'paragraph' })
  }
  return normalizarDoc({ type: 'doc', content: blocos })
}

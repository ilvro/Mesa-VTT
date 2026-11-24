import { writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { strToU8, zipSync } from 'fflate'

/**
 * Extrai o ID do quadro de uma URL do Miro (ex: https://miro.com/app/board/uXjV123456=/?...)
 * ou devolve o próprio ID se já vier puro.
 * @param {string} urlOuId
 * @returns {string}
 */
export function extrairIdDoQuadroMiro(urlOuId) {
  if (typeof urlOuId !== 'string') {
    throw new Error('URL ou ID do quadro Miro inválido')
  }
  const limpo = urlOuId.trim()
  if (!limpo) {
    throw new Error('URL ou ID do quadro Miro vazio')
  }
  const matchUrl = limpo.match(/\/app\/board\/([^/?#]+)\/?/)
  if (matchUrl && matchUrl[1]) {
    return decodeURIComponent(matchUrl[1])
  }
  if (/^[A-Za-z0-9_=-]+$/.test(limpo)) {
    return limpo
  }
  throw new Error(`Não foi possível extrair o ID do quadro Miro de: ${limpo}`)
}

async function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function requisitarMiro(url, token, opcoes = {}) {
  const maxTentativas = 5
  for (let tentativa = 1; tentativa <= maxTentativas; tentativa++) {
    const resp = await fetch(url, {
      ...opcoes,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        ...(opcoes.headers || {}),
      },
    })
    if (resp.status === 429 || resp.status >= 500) {
      if (tentativa === maxTentativas) {
        throw new Error(`Erro HTTP ${resp.status} ao acessar ${url}`)
      }
      const retryAfter = Number(resp.headers.get('retry-after'))
      const atraso = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 500 * 2 ** (tentativa - 1)
      await esperar(atraso)
      continue
    }
    if (!resp.ok) {
      throw new Error(`Erro HTTP ${resp.status} ao acessar ${url}`)
    }
    return resp
  }
  throw new Error(`Falha ao acessar ${url}`)
}

async function paginarMiro(urlBase, token) {
  const acumulado = []
  let cursor = null
  while (true) {
    const sep = urlBase.includes('?') ? '&' : '?'
    const url = cursor ? `${urlBase}${sep}cursor=${encodeURIComponent(cursor)}` : urlBase
    const resp = await requisitarMiro(url, token)
    const json = await resp.json()
    if (Array.isArray(json.data)) {
      acumulado.push(...json.data)
    }
    const proximo = json.cursor || json.links?.nextCursor || null
    if (!proximo || (Array.isArray(json.data) && json.data.length === 0)) {
      break
    }
    cursor = typeof proximo === 'string' ? proximo : null
    if (!cursor) break
  }
  return acumulado
}

/** Paginação por `offset` (usada por tags e por itens filtrados por tag). */
async function paginarMiroPorOffset(urlBase, token) {
  const acumulado = []
  const tamanhoPagina = 50
  let offset = 0
  while (true) {
    const sep = urlBase.includes('?') ? '&' : '?'
    const resp = await requisitarMiro(`${urlBase}${sep}limit=${tamanhoPagina}&offset=${offset}`, token)
    const json = await resp.json()
    const data = Array.isArray(json.data) ? json.data : []
    acumulado.push(...data)
    offset += data.length
    const total = Number(json.total)
    if (data.length === 0 || data.length < tamanhoPagina || (Number.isFinite(total) && offset >= total)) break
  }
  return acumulado
}

/**
 * Baixa tags (GET /tags) e, por tag, os itens marcados (GET /items?tag_id=), anotando `tagIds` em cada item.
 * Tags e grupos são opcionais: se falharem, o pacote sai sem eles (aviso, sem o token).
 */
async function baixarTags(base, items, token) {
  try {
    const tags = await paginarMiroPorOffset(`${base}/tags`, token)
    const porId = new Map(items.map((i) => [String(i.id), i]))
    for (const tag of tags) {
      if (!tag || tag.id === undefined) continue
      try {
        const marcados = await paginarMiroPorOffset(`${base}/items?tag_id=${encodeURIComponent(tag.id)}`, token)
        for (const m of marcados) {
          const alvo = porId.get(String(m?.id))
          if (!alvo) continue
          const ja = (Array.isArray(alvo.tagIds) ? alvo.tagIds : []).map(String)
          if (!ja.includes(String(tag.id))) alvo.tagIds = [...ja, String(tag.id)]
        }
      } catch (err) {
        console.warn(`Aviso: falha ao buscar itens da tag ${tag.id}: ${err.message}`)
      }
    }
    return tags
  } catch (err) {
    console.warn(`Aviso: não foi possível baixar as tags: ${err.message}`)
    return []
  }
}

async function baixarGrupos(base, token) {
  try {
    return await paginarMiro(`${base}/groups?limit=50`, token)
  } catch (err) {
    console.warn(`Aviso: não foi possível baixar os grupos: ${err.message}`)
    return []
  }
}

function extensaoPorMime(contentType, url) {
  const mime = (contentType || '').split(';')[0].trim().toLowerCase()
  if (mime === 'image/png') return 'png'
  if (mime === 'image/jpeg' || mime === 'image/jpg') return 'jpg'
  if (mime === 'image/webp') return 'webp'
  if (mime === 'image/gif') return 'gif'
  if (mime === 'image/svg+xml') return 'svg'
  const m = (url || '').match(/\.(png|jpe?g|webp|gif|svg)(?:[?#]|$)/i)
  if (m) return m[1].toLowerCase() === 'jpeg' ? 'jpg' : m[1].toLowerCase()
  return 'png'
}

/**
 * Troca o parâmetro `format` da URL de uma imagem do Miro (`preview`, `original`...),
 * mantendo os demais parâmetros (como `redirect=false`). URL inválida volta como veio.
 * @param {string} url
 * @param {string} formato
 * @returns {string}
 */
export function urlDaImagemNoFormato(url, formato) {
  try {
    const u = new URL(url)
    u.searchParams.set('format', formato)
    return u.toString()
  } catch {
    return url
  }
}

/** Baixa a imagem no formato pedido; se `original` falhar, tenta `preview` (aviso sem o token). */
async function baixarImagemDoItem(imageUrl, token, soMiniaturas, idItem) {
  if (soMiniaturas) return baixarBinarioImagem(urlDaImagemNoFormato(imageUrl, 'preview'), token)
  try {
    return await baixarBinarioImagem(urlDaImagemNoFormato(imageUrl, 'original'), token)
  } catch (err) {
    console.warn(`\nAviso: imagem do item ${idItem} indisponível em tamanho original (${err.message}); usando a miniatura.`)
    return baixarBinarioImagem(urlDaImagemNoFormato(imageUrl, 'preview'), token)
  }
}

async function baixarBinarioImagem(imageUrl, token) {
  const resp = await requisitarMiro(imageUrl, token, { headers: { Accept: '*/*' } })
  const ct = resp.headers.get('content-type') || ''
  if (ct.includes('application/json')) {
    const meta = await resp.json()
    const urlReal = meta.url || meta.imageUrl || meta.data?.imageUrl
    if (urlReal) {
      const respBin = await fetch(urlReal)
      if (!respBin.ok) throw new Error(`Erro HTTP ${respBin.status} ao baixar imagem`)
      const buf = new Uint8Array(await respBin.arrayBuffer())
      return { bytes: buf, ext: extensaoPorMime(respBin.headers.get('content-type'), urlReal) }
    }
  }
  const buf = new Uint8Array(await resp.arrayBuffer())
  return { bytes: buf, ext: extensaoPorMime(ct, imageUrl) }
}

function analisarArgumentos(argv) {
  let urlOuId = null
  let saida = null
  let soContar = false
  let soMiniaturas = false
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--so-contar') {
      soContar = true
    } else if (arg === '--miniaturas') {
      soMiniaturas = true
    } else if (arg === '--saida' && i + 1 < argv.length) {
      saida = argv[++i]
    } else if (!arg.startsWith('--') && !urlOuId) {
      urlOuId = arg
    }
  }
  return { urlOuId, saida, soContar, soMiniaturas }
}

async function main() {
  const { urlOuId, saida, soContar, soMiniaturas } = analisarArgumentos(process.argv.slice(2))
  if (!urlOuId) {
    console.error('Uso: MIRO_TOKEN=... node scripts/miro-baixar.mjs <url-ou-id> [--saida arquivo.miro.zip] [--so-contar] [--miniaturas]')
    process.exit(1)
  }
  const token = process.env.MIRO_TOKEN
  if (!token) {
    console.error('Variável de ambiente MIRO_TOKEN não definida. Consulte docs/miro.md.')
    process.exit(1)
  }

  const boardId = extrairIdDoQuadroMiro(urlOuId)
  const base = `https://api.miro.com/v2/boards/${encodeURIComponent(boardId)}`

  const boardResp = await requisitarMiro(base, token)
  const board = await boardResp.json()
  const items = await paginarMiro(`${base}/items?limit=50`, token)
  const connectors = await paginarMiro(`${base}/connectors?limit=50`, token)
  const tags = await baixarTags(base, items, token)
  const groups = await baixarGrupos(base, token)

  const contagem = {}
  for (const item of items) {
    const t = item.type || 'desconhecido'
    contagem[t] = (contagem[t] || 0) + 1
  }
  contagem.connector = connectors.length
  contagem.tag = tags.length
  contagem.group = groups.length

  if (soContar) {
    console.log(`Quadro: ${board.name || boardId} (${boardId})`)
    console.log('Contagem por tipo:', contagem)
    return
  }

  const entradasZip = {}
  const comImagem = items.filter((i) => i.type === 'image' && i.data?.imageUrl)
  const terminal = Boolean(process.stdout.isTTY)
  let feitas = 0
  for (const item of comImagem) {
    try {
      const { bytes, ext } = await baixarImagemDoItem(item.data.imageUrl, token, soMiniaturas, item.id)
      const caminhoArquivo = `imagens/${item.id}.${ext}`
      entradasZip[caminhoArquivo] = bytes
      item.arquivoLocal = caminhoArquivo
    } catch (err) {
      console.warn(`\nAviso: falha ao baixar imagem do item ${item.id}: ${err.message}`)
    }
    feitas++
    if (terminal) process.stdout.write(`\rimagens: ${feitas}/${comImagem.length}`)
    else if (feitas % 50 === 0 || feitas === comImagem.length) console.log(`imagens: ${feitas}/${comImagem.length}`)
  }
  if (terminal && comImagem.length > 0) process.stdout.write('\n')

  const bruto = {
    formato: 'miro-bruto',
    versao: 1,
    baixadoEm: Date.now(),
    board,
    items,
    connectors,
    tags,
    groups,
  }
  entradasZip['quadro.json'] = strToU8(JSON.stringify(bruto, null, 2))

  const zipBytes = zipSync(entradasZip)
  const nomeSaida = saida || `${boardId.replace(/[^A-Za-z0-9_-]/g, '_')}.miro.zip`
  writeFileSync(nomeSaida, zipBytes)
  console.log(`Pacote salvo em ${nomeSaida} (${items.length} itens, ${connectors.length} conectores, ${tags.length} tags, ${groups.length} grupos).`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err.message || err)
    process.exit(1)
  })
}

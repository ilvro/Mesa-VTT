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
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--so-contar') {
      soContar = true
    } else if (arg === '--saida' && i + 1 < argv.length) {
      saida = argv[++i]
    } else if (!arg.startsWith('--') && !urlOuId) {
      urlOuId = arg
    }
  }
  return { urlOuId, saida, soContar }
}

async function main() {
  const { urlOuId, saida, soContar } = analisarArgumentos(process.argv.slice(2))
  if (!urlOuId) {
    console.error('Uso: MIRO_TOKEN=... node scripts/miro-baixar.mjs <url-ou-id> [--saida arquivo.miro.zip] [--so-contar]')
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

  const contagem = {}
  for (const item of items) {
    const t = item.type || 'desconhecido'
    contagem[t] = (contagem[t] || 0) + 1
  }
  contagem.connector = connectors.length

  if (soContar) {
    console.log(`Quadro: ${board.name || boardId} (${boardId})`)
    console.log('Contagem por tipo:', contagem)
    return
  }

  const entradasZip = {}
  for (const item of items) {
    if (item.type === 'image' && item.data?.imageUrl) {
      try {
        const { bytes, ext } = await baixarBinarioImagem(item.data.imageUrl, token)
        const caminhoArquivo = `imagens/${item.id}.${ext}`
        entradasZip[caminhoArquivo] = bytes
        item.arquivoLocal = caminhoArquivo
      } catch (err) {
        console.warn(`Aviso: falha ao baixar imagem do item ${item.id}: ${err.message}`)
      }
    }
  }

  const bruto = {
    formato: 'miro-bruto',
    versao: 1,
    baixadoEm: Date.now(),
    board,
    items,
    connectors,
  }
  entradasZip['quadro.json'] = strToU8(JSON.stringify(bruto, null, 2))

  const zipBytes = zipSync(entradasZip)
  const nomeSaida = saida || `${boardId.replace(/[^A-Za-z0-9_-]/g, '_')}.miro.zip`
  writeFileSync(nomeSaida, zipBytes)
  console.log(`Pacote salvo em ${nomeSaida} (${items.length} itens, ${connectors.length} conectores).`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err.message || err)
    process.exit(1)
  })
}

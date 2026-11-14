import { strFromU8, unzipSync } from 'fflate'
import {
  converterMiro,
  type MetadadosImagemImportada,
  type PacoteMiroBruto,
} from '../dominio/miro.ts'
import { novoQuadro, type Quadro } from '../dominio/quadro.ts'
import { gravarItens, guardarImagem, listarQuadros, salvarQuadro } from './banco-quadros.ts'
import { campanhaAtiva } from './campanha.ts'
import { sincronizarLigacoesDoItem } from './ligacoes-quadro.ts'
import { abrirQuadro, paletaDaCampanha, quadros } from './quadros.ts'

export interface RelatorioImportacaoMiro {
  quadro: Quadro
  totalItens: number
  paraRevisar: number
  avisos: string[]
}

function mimePorExtensao(caminho: string): string {
  const m = caminho.toLowerCase().match(/\.(png|jpe?g|webp|gif|svg)$/)
  if (!m) return 'image/png'
  const ext = m[1]
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
  if (ext === 'webp') return 'image/webp'
  if (ext === 'gif') return 'image/gif'
  if (ext === 'svg') return 'image/svg+xml'
  return 'image/png'
}

export async function importarArquivoMiro(
  arquivo: File | Blob | Uint8Array,
): Promise<RelatorioImportacaoMiro> {
  const campanha = campanhaAtiva.value
  if (!campanha) {
    throw new Error('Escolha uma campanha antes de importar um quadro do Miro.')
  }

  const bytes =
    arquivo instanceof Uint8Array
      ? arquivo
      : new Uint8Array(await (arquivo as Blob).arrayBuffer())

  const entradas = unzipSync(bytes)
  const quadroJsonBytes = entradas['quadro.json']
  if (!quadroJsonBytes) {
    throw new Error('Pacote .miro.zip inválido: arquivo quadro.json não encontrado.')
  }

  let bruto: PacoteMiroBruto
  try {
    bruto = JSON.parse(strFromU8(quadroJsonBytes)) as PacoteMiroBruto
  } catch {
    throw new Error('Pacote .miro.zip inválido: quadro.json malformado.')
  }

  const imagensPorItemId = new Map<string, MetadadosImagemImportada>()
  const rawItems = Array.isArray(bruto.items) ? bruto.items : []

  for (const item of rawItems) {
    if (!item || item.type !== 'image' || typeof item.id !== 'string') continue
    const candidatoCaminho =
      typeof item.arquivoLocal === 'string' && entradas[item.arquivoLocal]
        ? item.arquivoLocal
        : Object.keys(entradas).find((k) => k.startsWith(`imagens/${item.id}.`))

    if (candidatoCaminho && entradas[candidatoCaminho]) {
      const imgBytes = entradas[candidatoCaminho]!
      const blob = new Blob([new Uint8Array(imgBytes)], {
        type: mimePorExtensao(candidatoCaminho),
      })
      const salvo = await guardarImagem(blob)
      imagensPorItemId.set(item.id, {
        imagemId: salvo.id,
        larguraOriginal: salvo.largura || Number(item.geometry?.width) || 320,
        alturaOriginal: salvo.altura || Number(item.geometry?.height) || 240,
      })
    }
  }

  const agora = Date.now()
  const quadroId = crypto.randomUUID()
  const convertido = converterMiro(bruto, {
    quadroId,
    agora,
    novoId: () => crypto.randomUUID(),
    paleta: paletaDaCampanha.value,
    imagensPorItemId,
  })

  const nomeFinal = `${convertido.nomeDoQuadro} (importado)`
  const quadro = novoQuadro(campanha.id, nomeFinal, agora, quadroId)

  await salvarQuadro(quadro)
  if (convertido.itens.length > 0) {
    await gravarItens(convertido.itens, [])
  }
  for (const item of convertido.itens) {
    await sincronizarLigacoesDoItem(item)
  }

  quadros.value = await listarQuadros(campanha.id)
  await abrirQuadro(quadro.id)

  const paraRevisar = convertido.itens.filter((i) => Boolean(i.revisao)).length
  return {
    quadro,
    totalItens: convertido.itens.length,
    paraRevisar,
    avisos: convertido.avisos,
  }
}

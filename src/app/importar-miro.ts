import { strFromU8, unzipSync } from 'fflate'
import {
  converterMiro,
  type MetadadosImagemImportada,
  type PacoteMiroBruto,
} from '../dominio/miro.ts'
import { novoQuadro, type Quadro } from '../dominio/quadro.ts'
import { criarQuadroComItens, guardarImagem, listarQuadros } from './banco-quadros.ts'
import { campanhaAtiva } from './campanha.ts'
import { ligarItensNovos } from './ligacoes-quadro.ts'
import { idsDoMiro, planejarAtualizacaoDoMiro, type RelatorioDaAtualizacao } from '../dominio/sincronia-miro.ts'
import {
  abrirQuadro,
  descarregarPendentes,
  executar,
  itens,
  marcarSincronizadoComMiro,
  paletaDaCampanha,
  quadroAberto,
  quadros,
} from './quadros.ts'

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

interface PacoteLido {
  bruto: PacoteMiroBruto
  imagensPorItemId: Map<string, MetadadosImagemImportada>
}

/** Lê o zip, valida o quadro.json e guarda as imagens no banco. */
async function lerPacoteMiro(arquivo: File | Blob | Uint8Array): Promise<PacoteLido> {
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
  return { bruto, imagensPorItemId }
}

export async function importarArquivoMiro(
  arquivo: File | Blob | Uint8Array,
): Promise<RelatorioImportacaoMiro> {
  const campanha = campanhaAtiva.value
  if (!campanha) {
    throw new Error('Escolha uma campanha antes de importar um quadro do Miro.')
  }
  const { bruto, imagensPorItemId } = await lerPacoteMiro(arquivo)

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
  const miroBoardId = typeof bruto.board?.id === 'string' ? bruto.board.id.trim() : ''
  if (miroBoardId) quadro.origem = { miroBoardId, sincronizadoEm: agora, vistos: idsDoMiro(convertido.itens) }

  await criarQuadroComItens(quadro, convertido.itens)
  await ligarItensNovos(convertido.itens)

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

export interface RelatorioAtualizacaoMiro extends RelatorioDaAtualizacao {
  /** Itens que entraram na fila de revisão nesta atualização. */
  paraRevisar: number
  avisos: string[]
}

/** Atualiza o quadro aberto (importado do Miro) com um pacote novo do mesmo quadro. */
export async function atualizarQuadroDoMiro(
  arquivo: File | Blob | Uint8Array,
): Promise<RelatorioAtualizacaoMiro> {
  const quadro = quadroAberto.value
  if (!quadro?.origem) {
    throw new Error('Este quadro não foi importado do Miro; importe-o de novo para poder atualizar.')
  }
  const { bruto, imagensPorItemId } = await lerPacoteMiro(arquivo)
  const miroBoardId = typeof bruto.board?.id === 'string' ? bruto.board.id.trim() : ''
  if (miroBoardId !== quadro.origem.miroBoardId) {
    throw new Error('Este pacote é de outro quadro do Miro.')
  }

  await descarregarPendentes()
  const atuais = itens.value
  const idPorMiro = new Map<string, string>()
  for (const it of atuais.values()) if (it.origem) idPorMiro.set(it.origem.miro, it.id)

  const agora = Date.now()
  const convertido = converterMiro(bruto, {
    quadroId: quadro.id,
    agora,
    novoId: () => crypto.randomUUID(),
    paleta: paletaDaCampanha.value,
    imagensPorItemId,
    idExistente: (miroId) => idPorMiro.get(miroId),
  })

  const vistosAntes = quadro.origem.vistos ? new Set(quadro.origem.vistos) : undefined
  const { passo, relatorio } = planejarAtualizacaoDoMiro(atuais, convertido.itens, agora, vistosAntes)
  const novosComRevisao = passo.ops.reduce(
    (n, op) => ('criar' in op ? n + op.criar.filter((i) => Boolean(i.revisao)).length : n),
    0,
  )
  const paraRevisar = relatorio.conflitos + relatorio.saiuDoMiro + novosComRevisao
  executar(passo)
  await marcarSincronizadoComMiro(agora, idsDoMiro(convertido.itens))
  return { ...relatorio, paraRevisar, avisos: convertido.avisos }
}

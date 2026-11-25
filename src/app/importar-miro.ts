import { strFromU8 } from 'fflate'
import {
  converterMiro,
  type MetadadosImagemImportada,
  type PacoteMiroBruto,
} from '../dominio/miro.ts'
import { filtrarPacote, itensSoltosDoPacote, moldurasDoPacote, type FiltroMolduras, type MolduraDoPacote } from '../dominio/molduras-miro.ts'
import { novoQuadro, type Quadro } from '../dominio/quadro.ts'
import { criarQuadroComItens, guardarImagem, listarQuadros } from './banco-quadros.ts'
import { campanhaAtiva } from './campanha.ts'
import { prepararImagemParaGuardar } from './imagens-quadro.ts'
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
import { lerEntradaDoZip, percorrerZipEmPedacos } from './zip-streaming.ts'

const LADO_MAXIMO_IMAGEM_MIRO = 2048
const QUALIDADE_WEBP_MIRO = 0.85

export interface RelatorioImportacaoMiro {
  quadro: Quadro
  totalItens: number
  paraRevisar: number
  avisos: string[]
}

export interface ProgressoMiro {
  fase: 'lendo' | 'imagens' | 'salvando'
  atual?: number
  total?: number
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

function idDoCaminhoImagem(caminho: string): string | null {
  if (!caminho.startsWith('imagens/')) return null
  const resto = caminho.slice('imagens/'.length)
  const ponto = resto.indexOf('.')
  return ponto > 0 ? resto.slice(0, ponto) : null
}

/** Lê e valida apenas o `quadro.json` do zip em pedaços, sem carregar as imagens na memória. */
async function abrirCabecalhoMiro(arquivo: File | Blob | Uint8Array): Promise<PacoteMiroBruto> {
  const quadroJsonBytes = await lerEntradaDoZip(arquivo, 'quadro.json')
  if (!quadroJsonBytes) {
    throw new Error('Pacote .miro.zip inválido: arquivo quadro.json não encontrado.')
  }

  try {
    return JSON.parse(strFromU8(quadroJsonBytes)) as PacoteMiroBruto
  } catch {
    throw new Error('Pacote .miro.zip inválido: quadro.json malformado.')
  }
}

/** Lê o zip em pedaços, reduz as imagens do pacote (já filtrado) para WebP ≤ 2048 px e grava no banco. */
async function guardarImagensDoPacote(
  arquivo: File | Blob | Uint8Array,
  bruto: PacoteMiroBruto,
  aoProgredir?: (p: ProgressoMiro) => void,
): Promise<Map<string, MetadadosImagemImportada>> {
  const imagensPorItemId = new Map<string, MetadadosImagemImportada>()
  const rawItems = Array.isArray(bruto.items) ? bruto.items : []

  type ItemBruto = NonNullable<PacoteMiroBruto['items']>[number]
  const porCaminhoExact = new Map<string, ItemBruto[]>()
  const porId = new Map<string, ItemBruto[]>()
  for (const item of rawItems) {
    if (!item || item.type !== 'image' || typeof item.id !== 'string') continue
    if (typeof item.arquivoLocal === 'string' && item.arquivoLocal) {
      const lista = porCaminhoExact.get(item.arquivoLocal) ?? []
      lista.push(item)
      porCaminhoExact.set(item.arquivoLocal, lista)
    }
    const listaId = porId.get(item.id) ?? []
    listaId.push(item)
    porId.set(item.id, listaId)
  }

  if (porCaminhoExact.size === 0 && porId.size === 0) return imagensPorItemId

  const total = porId.size
  let processadas = 0
  aoProgredir?.({ fase: 'imagens', atual: 0, total })

  await percorrerZipEmPedacos(arquivo, {
    decidir: (nome) => {
      if (porCaminhoExact.has(nome)) return true
      const id = idDoCaminhoImagem(nome)
      return id !== null && porId.has(id)
    },
    aoLer: async (nome, dados) => {
      const exatos = porCaminhoExact.get(nome) ?? []
      const id = idDoCaminhoImagem(nome)
      const porPrefixo = id ? (porId.get(id) ?? []).filter((it) => !imagensPorItemId.has(it.id)) : []
      if (exatos.length === 0 && porPrefixo.length === 0) return

      const brutoBlob = new Blob([dados as Uint8Array<ArrayBuffer>], { type: mimePorExtensao(nome) })
      const blob = await prepararImagemParaGuardar(brutoBlob, {
        ladoMaximo: LADO_MAXIMO_IMAGEM_MIRO,
        converterParaWebp: true,
        qualidade: QUALIDADE_WEBP_MIRO,
      })
      const salvo = await guardarImagem(blob)
      for (const item of [...exatos, ...porPrefixo]) {
        imagensPorItemId.set(item.id, {
          imagemId: salvo.id,
          larguraOriginal: salvo.largura || Number(item.geometry?.width) || 320,
          alturaOriginal: salvo.altura || Number(item.geometry?.height) || 240,
        })
      }
      processadas++
      aoProgredir?.({ fase: 'imagens', atual: Math.min(processadas, total), total })
    },
  })

  return imagensPorItemId
}

/** Lê o zip em pedaços, aplica o filtro de molduras (se houver) e guarda as imagens que sobraram. */
async function lerPacoteMiro(
  arquivo: File | Blob | Uint8Array,
  filtro?: FiltroMolduras,
  aoProgredir?: (p: ProgressoMiro) => void,
): Promise<PacoteLido> {
  aoProgredir?.({ fase: 'lendo' })
  const brutoOriginal = await abrirCabecalhoMiro(arquivo)
  const bruto = filtro ? filtrarPacote(brutoOriginal, filtro) : brutoOriginal
  return { bruto, imagensPorItemId: await guardarImagensDoPacote(arquivo, bruto, aoProgredir) }
}

export interface ExamePacoteMiro {
  nome: string
  molduras: MolduraDoPacote[]
  /** Itens fora de qualquer moldura. */
  soltos: number
}

/** Lista as molduras de um pacote para o diálogo de escolha (não grava nada). */
export async function examinarPacoteMiro(arquivo: File | Blob | Uint8Array): Promise<ExamePacoteMiro> {
  const bruto = await abrirCabecalhoMiro(arquivo)
  const nome = typeof bruto.board?.name === 'string' && bruto.board.name.trim() ? bruto.board.name.trim() : 'Quadro do Miro'
  return { nome, molduras: moldurasDoPacote(bruto), soltos: itensSoltosDoPacote(bruto) }
}

export async function importarArquivoMiro(
  arquivo: File | Blob | Uint8Array,
  filtro?: FiltroMolduras,
  aoProgredir?: (p: ProgressoMiro) => void,
): Promise<RelatorioImportacaoMiro> {
  const campanha = campanhaAtiva.value
  if (!campanha) {
    throw new Error('Escolha uma campanha antes de importar um quadro do Miro.')
  }
  const { bruto, imagensPorItemId } = await lerPacoteMiro(arquivo, filtro, aoProgredir)

  aoProgredir?.({ fase: 'salvando' })

  const agora = Date.now()
  const quadroId = crypto.randomUUID()
  const convertido = converterMiro(bruto, {
    quadroId,
    agora,
    novoId: () => crypto.randomUUID(),
    paleta: paletaDaCampanha.value,
    imagensPorItemId,
  })

  // Com uma só moldura escolhida (e sem soltos), o título dela nomeia o quadro.
  let nomeBase = convertido.nomeDoQuadro
  if (filtro && filtro.molduras.length === 1 && !filtro.soltos) {
    const m = moldurasDoPacote(bruto).find((x) => x.id === filtro.molduras[0])
    if (m) nomeBase = m.titulo
  }
  const nomeFinal = `${nomeBase} (importado)`
  const quadro = novoQuadro(campanha.id, nomeFinal, agora, quadroId)
  const miroBoardId = typeof bruto.board?.id === 'string' ? bruto.board.id.trim() : ''
  if (miroBoardId) quadro.origem = { miroBoardId, sincronizadoEm: agora, vistos: idsDoMiro(convertido.itens) }
  if (miroBoardId && filtro) {
    quadro.origem = { ...quadro.origem!, molduras: [...filtro.molduras], soltos: filtro.soltos }
  }

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
  // O mesmo filtro da importação: o que ficou de fora não volta.
  const filtro: FiltroMolduras | undefined = quadro.origem.molduras
    ? { molduras: quadro.origem.molduras, soltos: quadro.origem.soltos ?? false }
    : undefined
  const brutoOriginal = await abrirCabecalhoMiro(arquivo)
  const miroBoardId = typeof brutoOriginal.board?.id === 'string' ? brutoOriginal.board.id.trim() : ''
  if (miroBoardId !== quadro.origem.miroBoardId) {
    throw new Error('Este pacote é de outro quadro do Miro.')
  }
  const bruto = filtro ? filtrarPacote(brutoOriginal, filtro) : brutoOriginal
  const imagensPorItemId = await guardarImagensDoPacote(arquivo, bruto)

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

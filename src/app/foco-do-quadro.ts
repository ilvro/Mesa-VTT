import { signal } from '@preact/signals'
import { mesmaRef, type Ligacao, type Ref } from '#mesa'
import { itensAncoradosEm, type ItemAncorado } from '../dominio/ancoras.ts'
import { parsearRefDeItemDeQuadro, refDoItemDeQuadro } from '../dominio/ligacoes-quadro.ts'
import {
  deveDisparar,
  type ItemMoldura,
  type ModoMoldurasAgem,
} from '../dominio/molduras.ts'
import type { Item } from '../dominio/quadro.ts'
import { listarItens, listarQuadros } from './banco-quadros.ts'
import { barramentoDaMesa, pedidoParaAbrir } from './barramento.ts'
import { campanhaAtiva, entidades, ligacoes, repositorio } from './campanha.ts'
import { abrirQuadro, definirFato, estadoDoMundo, itens, quadroAberto, quadros } from './quadros.ts'
import { sessaoAtiva } from './registro.ts'
import { navegarParaQuadro, tela } from './rotas.ts'
import { ativarCena } from './sessao.ts'
import { avisar } from './toasts.ts'

export type { ModoMoldurasAgem }
export type { ItemAncorado } from '../dominio/ancoras.ts'

export const modoMoldurasAgem = signal<ModoMoldurasAgem>('perguntar')
export const ultimaMolduraFocada = signal<string | null>(null)
export const espiarAtivo = signal<{ alvo: Ref; itens: ItemAncorado[] } | null>(null)
export const pedidoFocarItem = signal<{ quadroId: string; itemId: string } | null>(null)

function executarAcoesDaMoldura(moldura: ItemMoldura): void {
  const aoFocar = moldura.aoFocar
  if (!aoFocar) return

  if (aoFocar.cena) {
    if (aoFocar.cena.app === 'mesa' && aoFocar.cena.tipo === 'cena') {
      const ent = entidades.value.find((e) => e.id === aoFocar.cena!.id)
      if (ent) void ativarCena(ent)
    } else {
      const pedido = pedidoParaAbrir(aoFocar.cena)
      const b = barramentoDaMesa()
      if (pedido && b) {
        void b.pedir(pedido, { ref: aoFocar.cena }).catch(() => null)
      }
    }
  }

  const entradas = Object.entries(aoFocar.fatos)
  const anteriores: [string, string | boolean | undefined][] = entradas.map(
    ([chave]) => [chave, estadoDoMundo.value.fatos[chave]],
  )
  for (const [chave, valor] of entradas) {
    void definirFato(chave, valor)
  }

  const nome = moldura.titulo.trim() || 'Moldura'
  avisar(`Ao entrar em "${nome}": ações aplicadas.`, false, {
    rotulo: 'Desfazer',
    aoClicar: () => {
      for (const [chave, valorAnterior] of anteriores) {
        void definirFato(chave, valorAnterior)
      }
    },
  })
}

export function aoFocarMoldura(
  moldura: ItemMoldura,
  todasMolduras: readonly ItemMoldura[],
): void {
  const anteriorId = ultimaMolduraFocada.value
  ultimaMolduraFocada.value = moldura.id

  if (!sessaoAtiva.value) return
  if (!deveDisparar(anteriorId, moldura, todasMolduras, modoMoldurasAgem.value)) {
    return
  }

  if (modoMoldurasAgem.value === 'sim') {
    executarAcoesDaMoldura(moldura)
    return
  }

  const nome = moldura.titulo.trim() || 'Moldura'
  avisar(`Entrou em "${nome}". Aplicar ações?`, false, {
    rotulo: 'Aplicar',
    aoClicar: () => executarAcoesDaMoldura(moldura),
  })
}

export function ancorasDoItem(quadroId: string, itemId: string): Ligacao[] {
  const de = refDoItemDeQuadro(quadroId, itemId)
  return ligacoes.value.filter(
    (l) => l.tipo === 'esta-em' && mesmaRef(l.de, de),
  )
}

export async function ancorarItemEmRef(
  quadroId: string,
  itemId: string,
  alvo: Ref,
): Promise<void> {
  const repo = repositorio.value
  const c = campanhaAtiva.value
  if (!repo || repo === 'indisponivel' || !c) return
  const de = refDoItemDeQuadro(quadroId, itemId)
  if (mesmaRef(de, alvo)) return
  try {
    await repo.ligar({
      campanhaId: c.id,
      de,
      para: alvo,
      tipo: 'esta-em',
    })
    ligacoes.value = await repo.listarLigacoes(c.id)
  } catch (err) {
    avisar(err instanceof Error ? err.message : String(err), true)
  }
}

export async function desancorarItemDeRef(
  quadroId: string,
  itemId: string,
  alvo: Ref,
): Promise<void> {
  const repo = repositorio.value
  const c = campanhaAtiva.value
  if (!repo || repo === 'indisponivel' || !c) return
  const de = refDoItemDeQuadro(quadroId, itemId)
  const existentes = ligacoes.value.filter(
    (l) => l.tipo === 'esta-em' && mesmaRef(l.de, de) && mesmaRef(l.para, alvo),
  )
  for (const lig of existentes) {
    await repo.removerLigacao(lig.id)
  }
  ligacoes.value = await repo.listarLigacoes(c.id)
}

export async function carregarMapaItensCampanha(
  campanhaId: string,
): Promise<Map<string, Map<string, Item>>> {
  const listaQuadros =
    quadros.value.length > 0 ? quadros.value : await listarQuadros(campanhaId)
  const mapaPorQuadro = new Map<string, Map<string, Item>>()

  for (const q of listaQuadros) {
    if (quadroAberto.value?.id === q.id) {
      mapaPorQuadro.set(q.id, new Map(itens.value))
    } else {
      const lista = await listarItens(q.id)
      mapaPorQuadro.set(q.id, new Map(lista.map((i) => [i.id, i])))
    }
  }
  return mapaPorQuadro
}

export async function focarRefNoQuadro(
  ref: Ref,
  opcoes?: { abrirEspiar?: boolean },
): Promise<boolean> {
  const c = campanhaAtiva.value
  if (!c) return false

  if (ref.app === 'mesa' && ref.tipo === 'quadro') {
    await abrirQuadro(ref.id)
    if (tela.value !== 'sessao') {
      navegarParaQuadro(ref.id)
    }
    return true
  }

  if (ref.app === 'mesa' && ref.tipo === 'item') {
    const parsed = parsearRefDeItemDeQuadro(ref)
    if (!parsed) return false
    if (quadroAberto.value?.id !== parsed.quadroId) {
      await abrirQuadro(parsed.quadroId)
      if (tela.value !== 'sessao') {
        navegarParaQuadro(parsed.quadroId)
      }
    }
    pedidoFocarItem.value = { quadroId: parsed.quadroId, itemId: parsed.itemId }
    const item = itens.value.get(parsed.itemId)
    if (item && opcoes?.abrirEspiar !== false) {
      espiarAtivo.value = {
        alvo: ref,
        itens: [
          {
            quadroId: parsed.quadroId,
            nomeDoQuadro: quadroAberto.value?.nome ?? parsed.quadroId,
            item,
            tipoLigacao: 'item',
          },
        ],
      }
    }
    return Boolean(item)
  }

  const repo = repositorio.value
  if (repo && repo !== 'indisponivel') {
    ligacoes.value = await repo.listarLigacoes(c.id)
  }
  const listaQuadros =
    quadros.value.length > 0 ? quadros.value : await listarQuadros(c.id)
  if (quadros.value.length === 0) {
    quadros.value = listaQuadros
  }

  const mapaPorQuadro = await carregarMapaItensCampanha(c.id)
  const ancorados = itensAncoradosEm(
    ref,
    ligacoes.value,
    mapaPorQuadro,
    listaQuadros,
    quadroAberto.value?.id,
  )

  if (opcoes?.abrirEspiar !== false) {
    espiarAtivo.value = { alvo: ref, itens: ancorados }
  }

  const primeiro = ancorados[0]
  if (primeiro) {
    if (quadroAberto.value?.id !== primeiro.quadroId) {
      await abrirQuadro(primeiro.quadroId)
    }
    if (tela.value !== 'sessao') {
      navegarParaQuadro(primeiro.quadroId)
    }
    pedidoFocarItem.value = {
      quadroId: primeiro.quadroId,
      itemId: primeiro.item.id,
    }
    return true
  }

  return false
}

let focoIniciado = false
export function iniciarFocoDoQuadro(): void {
  if (focoIniciado) return
  focoIniciado = true
  const b = barramentoDaMesa()
  if (!b) return
  b.atender('mesa.focar', async (dados) => {
    const ref = (dados as { ref: Ref }).ref
    await focarRefNoQuadro(ref, { abrirEspiar: true })
    return { ok: true }
  })
}

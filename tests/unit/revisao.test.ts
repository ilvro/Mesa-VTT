import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { aplicar, inverter } from '../../src/dominio/quadro-operacoes.ts'
import {
  MOTIVO_CONFLITO_MIRO,
  MOTIVO_SAIU_DO_MIRO,
  passoDeRevisaoEmMassa,
  resumoDaRevisao,
} from '../../src/dominio/revisao.ts'
import {
  docDeTexto,
  novaMoldura,
  novoTexto,
  type Item,
  type TipoSemantico,
} from '../../src/dominio/quadro.ts'

function nota(id: string, sugerido: TipoSemantico | null, motivos: string[] = ['cor']): Item {
  const t = novoTexto({ quadroId: 'q', x: 0, y: 0, largura: 100, altura: 50, doc: docDeTexto(id) }, 1, id)
  t.revisao = { tipoSugerido: sugerido, motivos, origem: 'miro' }
  return t
}

function mapa(...itens: Item[]): Map<string, Item> {
  return new Map(itens.map((i) => [i.id, i]))
}

describe('E2c — revisão em massa', () => {
  const moldura = novaMoldura({ quadroId: 'q', x: 0, y: 0, largura: 300, altura: 300, titulo: 'M' }, 1, 'mo')
  moldura.revisao = { tipoSugerido: null, motivos: ['moldura'], origem: 'miro' }
  const itens = [
    nota('a', 'teste'),
    nota('b', 'teste'),
    nota('c', 'segredo'),
    nota('d', null),
    nota('e', 'teste', [MOTIVO_CONFLITO_MIRO]),
    nota('f', null, [MOTIVO_SAIU_DO_MIRO]),
    novoTexto({ quadroId: 'q', x: 0, y: 0, largura: 1, altura: 1, doc: docDeTexto('ok') }, 1, 'g'),
    moldura,
  ]

  it('resume por tipo, com sem sugestão por último, e separa conflitos', () => {
    const r = resumoDaRevisao(itens)
    assert.deepEqual(
      r.porTipo.map((p) => [p.tipo, p.quantidade]),
      [['teste', 2], ['segredo', 1], [null, 2]],
    )
    assert.deepEqual(r.porTipo[0]!.ids, ['a', 'b'])
    assert.deepEqual(r.conflitos, ['e', 'f'])
  })

  it('aplica o tipo, tira a revisão e desfaz num passo só', () => {
    const base = mapa(...itens)
    const passo = passoDeRevisaoEmMassa(base, ['a', 'b', 'mo'], 'teste')
    assert.equal(passo.ops.length, 1)
    const depois = aplicar(base, passo)
    for (const id of ['a', 'b']) {
      const i = depois.get(id)! as Extract<Item, { tipo: 'texto' }>
      assert.equal(i.semantica, 'teste')
      assert.equal(i.revisao, undefined)
    }
    assert.equal(depois.get('mo')!.revisao, undefined)
    assert.ok(depois.get('c')!.revisao)
    const volta = aplicar(depois, inverter(passo))
    assert.deepEqual(volta.get('a'), base.get('a'))
    assert.deepEqual(volta.get('mo'), base.get('mo'))
  })

  it('sem sugestão vira sem tipo', () => {
    const base = mapa(...itens)
    const depois = aplicar(base, passoDeRevisaoEmMassa(base, ['d'], null))
    assert.equal((depois.get('d') as Extract<Item, { tipo: 'texto' }>).semantica, null)
    assert.equal(depois.get('d')!.revisao, undefined)
  })

  it('conflitos, saídas e itens sem revisão ficam fora do passo', () => {
    const base = mapa(...itens)
    const passo = passoDeRevisaoEmMassa(base, ['e', 'f', 'g', 'inexistente'], 'teste')
    assert.deepEqual(passo.ops, [])
  })
})

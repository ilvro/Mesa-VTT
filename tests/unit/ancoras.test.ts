import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { criarRef, type Ligacao } from '#mesa'
import { itensAncoradosEm, parsearRefAncora } from '../../src/dominio/ancoras.ts'
import { refDoItemDeQuadro } from '../../src/dominio/ligacoes-quadro.ts'
import { novaMoldura, novoQuadro, novoTexto, type Item } from '../../src/dominio/quadro.ts'

describe('Q5c — ancoras (domínio)', () => {
  it('parsearRefAncora reconhece refs válidas do Atlas e rejeita texto solto', () => {
    const ref = parsearRefAncora('mesa:atlas/objeto/m1/escrivaninha')
    assert.deepEqual(ref, { app: 'atlas', tipo: 'objeto', id: 'm1/escrivaninha' })
    assert.equal(parsearRefAncora('texto qualquer'), null)
  })

  it('itensAncoradosEm prioriza quadro aberto e ordena por moldura e ordem de leitura', () => {
    const q1 = novoQuadro('camp-1', 'Quadro 1', 1000, 'q1')
    const q2 = novoQuadro('camp-1', 'Quadro 2', 2000, 'q2')

    const m1 = novaMoldura({ quadroId: 'q1', x: 0, y: 0, largura: 500, altura: 500, titulo: 'Ato 1' }, 1000, 'm1')
    const it1Baixo = novoTexto({ quadroId: 'q1', x: 50, y: 300 }, 1000, 'it1-baixo')
    it1Baixo.molduraId = 'm1'
    const it1Topo = novoTexto({ quadroId: 'q1', x: 50, y: 100 }, 1000, 'it1-topo')
    it1Topo.molduraId = 'm1'

    const it2 = novoTexto({ quadroId: 'q2', x: 20, y: 20 }, 1000, 'it2')

    const itensPorQuadro = new Map<string, Map<string, Item>>([
      ['q1', new Map<string, Item>([['m1', m1], ['it1-baixo', it1Baixo], ['it1-topo', it1Topo]])],
      ['q2', new Map<string, Item>([['it2', it2]])],
    ])

    const alvo = criarRef('atlas', 'objeto', 'mapa-1/bau')
    const ligacoes: Ligacao[] = [
      { id: 'l1', campanhaId: 'camp-1', de: refDoItemDeQuadro('q1', 'it1-baixo'), para: alvo, tipo: 'esta-em', criadaPor: 'mesa', criadaEm: 1000 },
      { id: 'l2', campanhaId: 'camp-1', de: refDoItemDeQuadro('q1', 'it1-topo'), para: alvo, tipo: 'esta-em', criadaPor: 'mesa', criadaEm: 1000 },
      { id: 'l3', campanhaId: 'camp-1', de: refDoItemDeQuadro('q2', 'it2'), para: alvo, tipo: 'menciona', criadaPor: 'mesa', criadaEm: 1000 },
    ]

    const res = itensAncoradosEm(alvo, ligacoes, itensPorQuadro, [q2, q1], 'q1')
    assert.deepEqual(
      res.map((r) => `${r.quadroId}/${r.item.id}`),
      ['q1/it1-topo', 'q1/it1-baixo', 'q2/it2'],
    )
  })
})

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { converterMiro, type PacoteMiroBruto } from '../../src/dominio/miro.ts'
import { filtrarPacote, itensSoltosDoPacote, moldurasDoPacote } from '../../src/dominio/molduras-miro.ts'
import { novoQuadro, validarQuadro } from '../../src/dominio/quadro.ts'

const bruto = JSON.parse(
  readFileSync(new URL('./fixtures/miro/molduras.json', import.meta.url), 'utf8'),
) as PacoteMiroBruto

const ids = (p: PacoteMiroBruto) => (p.items ?? []).map((i) => i.id).sort()
const cons = (p: PacoteMiroBruto) => (p.connectors ?? []).map((c) => c.id).sort()

describe('E2b — molduras do pacote', () => {
  it('lista molduras em ordem de leitura com contagem e soltos', () => {
    assert.deepEqual(moldurasDoPacote(bruto), [
      { id: 'f-a', titulo: 'Ato 1', itens: 2 },
      { id: 'f-b', titulo: 'Ato 2', itens: 1 },
    ])
    assert.equal(itensSoltosDoPacote(bruto), 1)
  })

  it('uma moldura: mantém filhos (parent e geométrico) e conectores internos', () => {
    const f = filtrarPacote(bruto, { molduras: ['f-a'], soltos: false })
    assert.deepEqual(ids(f), ['a1', 'a2', 'f-a'])
    // c-ab sai (ponta em b1); a ponta livre dentro de f-a fica; a livre fora e solta saem
    assert.deepEqual(cons(f), ['c-aa', 'c-libre-a'])
  })

  it('soltos entram só se pedidos, com seus conectores', () => {
    const f = filtrarPacote(bruto, { molduras: ['f-b'], soltos: true })
    assert.deepEqual(ids(f), ['b1', 'f-b', 's1'])
    assert.deepEqual(cons(f), ['c-libre-fora'])
  })

  it('não altera o pacote original e converte sem erro', () => {
    const f = filtrarPacote(bruto, { molduras: ['f-a'], soltos: false })
    assert.equal(bruto.items?.length, 6)
    let n = 0
    const r = converterMiro(f, { quadroId: 'q', agora: 1, novoId: () => `i${++n}` })
    assert.equal(r.itens.filter((i) => i.tipo === 'seta').length, 2)
  })

  it('quadro aceita origem.molduras e soltos e recusa extras', () => {
    const q = novoQuadro('c', 'Q', 1, 'q')
    q.origem = { miroBoardId: 'x', sincronizadoEm: 1, molduras: ['f-a'], soltos: false }
    assert.doesNotThrow(() => validarQuadro(q))
    const ruim = { ...q, origem: { ...q.origem, extra: 1 } }
    assert.throws(() => validarQuadro(ruim))
    assert.throws(() => validarQuadro({ ...q, origem: { ...q.origem, molduras: [1] } }))
    assert.throws(() => validarQuadro({ ...q, origem: { ...q.origem, soltos: 'sim' } }))
  })
})

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { converterMiro, type PacoteMiroBruto } from '../../src/dominio/miro.ts'
import { assinaturaDoMiro } from '../../src/dominio/sincronia-miro.ts'
import {
  docDeTexto,
  novaSeta,
  novoQuadro,
  novoTexto,
  validarItem,
  validarQuadro,
} from '../../src/dominio/quadro.ts'

function texto(doc = 'Olá') {
  return novoTexto({ quadroId: 'q', x: 10, y: 20, largura: 200, altura: 80, doc: docDeTexto(doc) }, 1, 'i1')
}

describe('E1a — origem no modelo', () => {
  it('quadro e item aceitam origem e recusam campo extra dentro dela', () => {
    const q = novoQuadro('c', 'Q', 1, 'q')
    q.origem = { miroBoardId: 'uX=', sincronizadoEm: 5 }
    assert.doesNotThrow(() => validarQuadro(q))
    assert.throws(() => validarQuadro({ ...q, origem: { ...q.origem, extra: 1 } }))
    assert.throws(() => validarQuadro({ ...q, origem: { miroBoardId: '', sincronizadoEm: 5 } }))

    const t = texto()
    t.origem = { miro: 'm1', assinatura: 'abc' }
    assert.doesNotThrow(() => validarItem(t))
    assert.throws(() => validarItem({ ...t, origem: { miro: 'm1', assinatura: 'abc', x: 1 } }))
    assert.throws(() => validarItem({ ...t, origem: { miro: 'm1' } }))
  })
})

describe('E1a — assinaturaDoMiro', () => {
  it('é estável e reage só ao que vem do Miro', () => {
    const a = texto()
    assert.equal(assinaturaDoMiro(a), assinaturaDoMiro(texto()))
    const pintado = texto()
    pintado.caixa = { ...pintado.caixa, fundo: '#ff0000' }
    pintado.texto = { ...pintado.texto, tamanho: 40 }
    assert.equal(assinaturaDoMiro(pintado), assinaturaDoMiro(a))
    const quase = texto()
    quase.x += 0.2
    assert.equal(assinaturaDoMiro(quase), assinaturaDoMiro(a))
    const movido = texto()
    movido.x += 10
    assert.notEqual(assinaturaDoMiro(movido), assinaturaDoMiro(a))
    assert.notEqual(assinaturaDoMiro(texto('Outro')), assinaturaDoMiro(a))
  })

  it('não depende da ordem das chaves do doc', () => {
    const a = texto()
    const c = texto()
    c.doc = { content: a.doc.content, type: 'doc' } as typeof a.doc
    assert.equal(assinaturaDoMiro(c), assinaturaDoMiro(a))
  })

  it('seta não muda de assinatura quando só a caixa muda (item ligado se moveu)', () => {
    const s = novaSeta({ quadroId: 'q', de: { itemId: 'a', lado: 'auto' }, para: { itemId: 'b', lado: 'auto' } }, 1, 's')
    const movida = { ...s, x: s.x + 50, largura: s.largura + 30 }
    assert.equal(assinaturaDoMiro(movida), assinaturaDoMiro(s))
    assert.notEqual(assinaturaDoMiro({ ...s, rotulo: 'outro' }), assinaturaDoMiro(s))
  })
})

describe('E1a — converterMiro com origem', () => {
  const bruto = JSON.parse(
    readFileSync(new URL('./fixtures/miro/aventura-exemplo.json', import.meta.url), 'utf8'),
  ) as PacoteMiroBruto

  it('põe origem em todos os itens e setas', () => {
    let seq = 0
    const res = converterMiro(bruto, { quadroId: 'q', agora: 1, novoId: () => `id-${++seq}` })
    for (const it of res.itens) {
      assert.ok(it.origem, it.tipo)
      assert.doesNotThrow(() => validarItem(it))
      assert.equal(res.mapaId.get(it.origem.miro), it.id)
      assert.equal(it.origem.assinatura, assinaturaDoMiro(it))
    }
  })

  it('idExistente reaproveita ids e religa setas e molduras', () => {
    let seq = 0
    const base = converterMiro(bruto, { quadroId: 'q', agora: 1, novoId: () => `id-${++seq}` })
    const novo = converterMiro(bruto, {
      quadroId: 'q',
      agora: 2,
      novoId: () => `novo-${++seq}`,
      idExistente: (m) => base.mapaId.get(m),
    })
    assert.deepEqual(
      novo.itens.map((i) => i.id).sort(),
      base.itens.map((i) => i.id).sort(),
    )
    const seta = novo.itens.find((i) => i.tipo === 'seta')!
    const antiga = base.itens.find((i) => i.tipo === 'seta')!
    assert.deepEqual(seta.tipo === 'seta' && seta.de, antiga.tipo === 'seta' && antiga.de)
    const moldura = novo.itens.find((i) => i.tipo === 'moldura')!
    assert.ok(novo.itens.some((i) => i.molduraId === moldura.id))
  })
})

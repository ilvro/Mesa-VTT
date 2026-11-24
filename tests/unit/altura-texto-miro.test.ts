import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { alturaEstimadaDoTexto, converterMiro, type PacoteMiroBruto } from '../../src/dominio/miro.ts'
import { docDeTexto, type DocRico } from '../../src/dominio/quadro.ts'

describe('alturaEstimadaDoTexto', () => {
  it('texto curto ocupa uma linha', () => {
    assert.equal(alturaEstimadaDoTexto(docDeTexto('oi'), 400, 20), 20 * 1.4 + 16)
  })
  it('texto longo quebra em várias linhas', () => {
    const curto = alturaEstimadaDoTexto(docDeTexto('a'.repeat(10)), 200, 20)
    const longo = alturaEstimadaDoTexto(docDeTexto('a'.repeat(200)), 200, 20)
    assert.ok(longo > curto * 3)
  })
  it('fonte maior dá caixa maior', () => {
    const t = docDeTexto('a'.repeat(100))
    assert.ok(alturaEstimadaDoTexto(t, 500, 40) > alturaEstimadaDoTexto(t, 500, 20))
  })
  it('vários parágrafos somam', () => {
    const um = alturaEstimadaDoTexto(docDeTexto('abc'), 500, 20)
    const tres = alturaEstimadaDoTexto(docDeTexto('abc\nabc\nabc'), 500, 20)
    assert.equal(tres - 16, (um - 16) * 3)
  })
  it('cabeçalho H1 usa 1,6x', () => {
    const doc: DocRico = { type: 'doc', content: [{ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'x' }] }] }
    assert.ok(Math.abs(alturaEstimadaDoTexto(doc, 500, 20) - (20 * 1.6 * 1.4 + 16)) < 1e-9)
  })
  it('caso real: 1337 de largura, fonte 44, 306 caracteres', () => {
    const h = alturaEstimadaDoTexto(docDeTexto('a'.repeat(306)), 1337, 44)
    assert.ok(h >= 250 && h <= 450, String(h))
  })
})

let seq = 0
const OPC = { quadroId: 'q1', agora: 1, novoId: () => `id-${++seq}` }

describe('converterMiro: altura de texto', () => {
  function pacote(geometry: Record<string, number>): PacoteMiroBruto {
    return {
      board: { id: 'b', name: 'q' },
      items: [
        {
          id: 't1',
          type: 'text',
          position: { x: 0, y: 1000 },
          geometry,
          style: { fontSize: '44' },
          data: { content: `<p>${'a'.repeat(306)}</p>` },
        },
      ],
    } as unknown as PacoteMiroBruto
  }
  it('sem height usa a estimada e centraliza o y', () => {
    const r = converterMiro(pacote({ width: 1337 }), OPC)
    const it = r.itens[0]!
    assert.ok(it.altura > 250 && it.altura < 450)
    assert.equal(it.y, 1000 - it.altura / 2)
  })
  it('height do Miro vence', () => {
    const it = converterMiro(pacote({ width: 1337, height: 90 }), OPC).itens[0]!
    assert.equal(it.altura, 90)
  })
})

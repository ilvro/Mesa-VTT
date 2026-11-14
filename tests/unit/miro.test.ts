import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { extrairIdDoQuadroMiro } from '../../scripts/miro-baixar.mjs'

describe('Q4a — extrairIdDoQuadroMiro', () => {
  it('extrai o ID de uma URL completa do Miro com barra final e query string', () => {
    assert.equal(
      extrairIdDoQuadroMiro('https://miro.com/app/board/uXjV123456=/?moveToWidget=34587645'),
      'uXjV123456=',
    )
  })

  it('extrai o ID de uma URL do Miro sem barra final', () => {
    assert.equal(
      extrairIdDoQuadroMiro('https://miro.com/app/board/uXjV_abc-99='),
      'uXjV_abc-99=',
    )
  })

  it('aceita o ID puro diretamente', () => {
    assert.equal(extrairIdDoQuadroMiro('uXjV123456='), 'uXjV123456=')
  })

  it('rejeita entradas vazias ou inválidas', () => {
    assert.throws(() => extrairIdDoQuadroMiro(''))
    assert.throws(() => extrairIdDoQuadroMiro('https://example.com/outro'))
  })
})

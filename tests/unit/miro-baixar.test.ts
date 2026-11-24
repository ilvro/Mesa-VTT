import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { urlDaImagemNoFormato } from '../../scripts/miro-baixar.mjs'

const BASE = 'https://api.miro.com/v2/boards/uXjV123=/resources/images/3458?format=preview&redirect=false'

describe('urlDaImagemNoFormato', () => {
  it('troca preview por original mantendo redirect=false', () => {
    const u = new URL(urlDaImagemNoFormato(BASE, 'original'))
    assert.equal(u.searchParams.get('format'), 'original')
    assert.equal(u.searchParams.get('redirect'), 'false')
    assert.equal(u.pathname, new URL(BASE).pathname)
  })

  it('acrescenta format quando a URL não tem', () => {
    const u = new URL(urlDaImagemNoFormato('https://api.miro.com/v2/x?redirect=false', 'original'))
    assert.equal(u.searchParams.get('format'), 'original')
    assert.equal(u.searchParams.get('redirect'), 'false')
  })

  it('volta a preview', () => {
    const u = new URL(urlDaImagemNoFormato(urlDaImagemNoFormato(BASE, 'original'), 'preview'))
    assert.equal(u.searchParams.get('format'), 'preview')
  })

  it('devolve a entrada se não for URL', () => {
    assert.equal(urlDaImagemNoFormato('nao-e-url', 'original'), 'nao-e-url')
  })
})

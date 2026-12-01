import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { baixarImagemDoMiro, ErroMiro, urlDaImagemNoFormato } from '../../src/app/imagens-miro.ts'

interface Chamada { url: string; auth: string | null }

function falso(rotas: (url: string) => Response): { fetchFn: typeof fetch; chamadas: Chamada[] } {
  const chamadas: Chamada[] = []
  const fetchFn = (async (url: string, init?: RequestInit) => {
    const h = new Headers(init?.headers)
    chamadas.push({ url: String(url), auth: h.get('authorization') })
    return rotas(String(url))
  }) as unknown as typeof fetch
  return { fetchFn, chamadas }
}

const json = (corpo: unknown) =>
  new Response(JSON.stringify(corpo), { status: 200, headers: { 'content-type': 'application/json' } })

describe('baixarImagemDoMiro', () => {
  it('encadeia API -> JSON com url -> binário; o token só vai até o segundo GET', async () => {
    const { fetchFn, chamadas } = falso((url) => {
      if (url.includes('/v2/boards/')) return json({ data: { imageUrl: 'https://api.miro.com/v2/res/x?format=preview&redirect=false' } })
      if (url.includes('format=original')) return json({ url: 'https://r.miro.com/final.png' })
      return new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': 'image/png' } })
    })
    const blob = await baixarImagemDoMiro('b', 'i1', 'TOK', fetchFn)
    assert.equal(blob.size, 3)
    assert.equal(chamadas.length, 3)
    assert.equal(chamadas[0]!.auth, 'Bearer TOK')
    assert.equal(chamadas[1]!.auth, 'Bearer TOK')
    assert.match(chamadas[1]!.url, /format=original/)
    assert.equal(chamadas[2]!.auth, null)
    assert.equal(chamadas[2]!.url, 'https://r.miro.com/final.png')
  })

  it('cai em preview quando original falha', async () => {
    const { fetchFn, chamadas } = falso((url) => {
      if (url.includes('/v2/boards/')) return json({ data: { imageUrl: 'https://api.miro.com/v2/x?format=preview' } })
      if (url.includes('format=original')) return new Response('', { status: 404 })
      return new Response(new Uint8Array([9]), { status: 200, headers: { 'content-type': 'image/jpeg' } })
    })
    const blob = await baixarImagemDoMiro('b', 'i1', 'TOK', fetchFn)
    assert.equal(blob.size, 1)
    assert.match(chamadas.at(-1)!.url, /format=preview/)
  })

  it('401 vira ErroMiro reconhecível', async () => {
    const { fetchFn } = falso(() => new Response('', { status: 401 }))
    await assert.rejects(baixarImagemDoMiro('b', 'i1', 'ruim', fetchFn), (e) => {
      assert.ok(e instanceof ErroMiro)
      assert.equal(e.status, 401)
      assert.equal(e.tokenInvalido, true)
      return true
    })
  })

  it('boardId com = vai codificado', async () => {
    const { fetchFn, chamadas } = falso(() => new Response('', { status: 404 }))
    await assert.rejects(baixarImagemDoMiro('uXjVabc=', 'i1', 'T', fetchFn))
    assert.match(chamadas[0]!.url, /\/boards\/uXjVabc%3D\/images\/i1$/)
  })

  it('urlDaImagemNoFormato troca só o format', () => {
    assert.equal(urlDaImagemNoFormato('https://a.com/x?format=preview&redirect=false', 'original'), 'https://a.com/x?format=original&redirect=false')
  })
})

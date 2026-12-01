import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { areaMiroParaPacote, fatorDeEscala, lerAreaDoMiro } from '../../src/dominio/area-miro.ts'
import { converterMiro } from '../../src/dominio/miro.ts'
import { textoPuro } from '../../src/dominio/quadro.ts'

const amostra = readFileSync(new URL('./fixtures/area-miro-amostra.json', import.meta.url), 'utf8')

function codificar(json: string, deslocamento = 59): string {
  const bytes = new TextEncoder().encode(json).map((b) => (b + deslocamento) % 256)
  const base64 = Buffer.from(bytes).toString('base64')
  return `<meta charset="utf-8"><span data-meta="<--(miro-data-v1)${base64}(/miro-data-v1)-->"></span><div>x</div>`
}

function converter() {
  const area = lerAreaDoMiro(codificar(amostra))!
  const fator = fatorDeEscala(area)
  let n = 0
  const r = converterMiro(areaMiroParaPacote(area, fator), {
    quadroId: 'q',
    agora: 1,
    novoId: () => `id-${++n}`,
    fonteMaxima: 400,
  })
  return { area, fator, r }
}

describe('C1 — lerAreaDoMiro', () => {
  it('decodifica a amostra e aceita outro deslocamento', () => {
    assert.equal(lerAreaDoMiro(codificar(amostra))?.objects.length, 5)
    assert.equal(lerAreaDoMiro(codificar(amostra, 17))?.objects.length, 5)
  })
  it('devolve null sem o marcador ou com base64 quebrado', () => {
    assert.equal(lerAreaDoMiro('<div>oi</div>'), null)
    assert.equal(lerAreaDoMiro('(miro-data-v1)@@@não é base64(/miro-data-v1)'), null)
    assert.equal(lerAreaDoMiro('(miro-data-v1)aGVsbG8=(/miro-data-v1)'), null)
  })
})

describe('C1 — areaMiroParaPacote + converterMiro', () => {
  it('fator vem da escala dominante dos textos', () => {
    const { fator } = converter()
    assert.ok(Math.abs(fator - 1 / 8.5) < 1e-9)
  })

  it('converte o título com cor, fonte, negrito e tamanho escalado', () => {
    const { fator, r } = converter()
    const titulo = r.itens.find((i) => i.tipo === 'texto' && textoPuro(i.doc).startsWith('CONTOS'))!
    assert.equal(titulo.tipo, 'texto')
    if (titulo.tipo !== 'texto') return
    assert.equal(titulo.texto.cor, '#ffffff')
    assert.equal(titulo.texto.fonte, 'pt-serif')
    assert.ok(JSON.stringify(titulo.doc).includes('bold'))
    assert.ok(Math.abs(titulo.texto.tamanho - 14 * 42.857142857142854 * fator) < 1e-6)
    assert.ok(Math.abs(titulo.largura / titulo.altura - 349.46793614168337 / 18) < 1e-6)
  })

  it('imagem mantém proporção e a posição relativa ao título', () => {
    const { fator, r } = converter()
    const titulo = r.itens.find((i) => i.tipo === 'texto' && textoPuro(i.doc).startsWith('CONTOS'))!
    const imagem = r.itens.find((i) => i.tipo === 'imagem')!
    assert.ok(Math.abs(imagem.largura / imagem.altura - 840 / 569) < 1e-6)
    const cx = (i: typeof titulo) => i.x + i.largura / 2
    const cy = (i: typeof titulo) => i.y + i.altura / 2
    assert.ok(Math.abs(cx(imagem) - cx(titulo) - (-137.69592644344084 - 0) * fator) < 1e-6)
    assert.ok(Math.abs(cy(imagem) - cy(titulo) - (-7805.579255674325 + 10365.68962474144) * fator) < 1e-6)
  })

  it('a seta liga ao título com lado direita e termina em ponto solto', () => {
    const { r } = converter()
    const seta = r.itens.find((i) => i.tipo === 'seta')!
    const intro = r.itens.find((i) => i.tipo === 'texto' && textoPuro(i.doc).startsWith('INTRO'))!
    assert.equal(seta.tipo, 'seta')
    if (seta.tipo !== 'seta') return
    assert.deepEqual(seta.de, { itemId: intro.id, lado: 'direita' })
    assert.ok('ponto' in seta.para)
  })

  it('o texto [AFOGADO] mantém o fundo da marca (#adf0c7 = rgb(173,240,199)) e recebe sugestão de revisão', () => {
    const { r } = converter()
    const afogado = r.itens.find((i) => i.tipo === 'texto' && textoPuro(i.doc).includes('[AFOGADO]'))!
    assert.ok(JSON.stringify(afogado.tipo === 'texto' ? afogado.doc : null).includes('rgb(173,240,199)'))
    assert.ok(afogado.revisao)
  })
})

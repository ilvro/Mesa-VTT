import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { extrairIdDoQuadroMiro } from '../../scripts/miro-baixar.mjs'
import { htmlParaDocRico, decodificarEntidadesHtml } from '../../src/dominio/html-miro.ts'
import {
  CORES_DE_NOTA_DO_MIRO,
  converterMiro,
  type PacoteMiroBruto,
} from '../../src/dominio/miro.ts'
import { textoPuro, validarItem } from '../../src/dominio/quadro.ts'

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

describe('Q4b — htmlParaDocRico e entidades', () => {
  it('decodifica entidades nomeadas, decimais e hexadecimais', () => {
    assert.equal(
      decodificarEntidadesHtml('A &amp; B&nbsp;&lt;3&#33;&#x2014;fim'),
      'A & B <3!—fim',
    )
  })

  it('converte tags de formatação, listas, links e preserva texto de tags desconhecidas', () => {
    const html =
      '<p><strong>Negrito</strong> e <em>itálico</em> com <a href="https://exemplo.com">link</a><br/><custom-tag>texto interno</custom-tag></p><ul><li>Item 1</li><li>Item 2</li></ul>'
    const doc = htmlParaDocRico(html)
    const puro = textoPuro(doc)
    assert.match(puro, /Negrito e itálico com link/)
    assert.match(puro, /texto interno/)
    assert.match(puro, /Item 1/)
    assert.match(puro, /Item 2/)
    assert.equal(doc.content[1]?.type, 'bulletList')
  })
})

describe('Q4b — converterMiro', () => {
  const bruto = JSON.parse(
    readFileSync(new URL('./fixtures/miro/aventura-exemplo.json', import.meta.url), 'utf8'),
  ) as PacoteMiroBruto

  it('converte fixture completo do Miro, calcula coordenadas de parent e valida todos os itens', () => {
    let seq = 0
    const res = converterMiro(bruto, {
      quadroId: 'q-miro',
      agora: 1731580000000,
      novoId: () => `id-${++seq}`,
    })

    assert.equal(res.nomeDoQuadro, 'Castelo de Corvos')
    assert.equal(res.itens.length, 6) // 1 frame + 1 sticky + 1 shape + 1 text + 1 card + 1 connector

    for (const item of res.itens) {
      assert.doesNotThrow(() => validarItem(item))
    }

    // Moldura: centro (500, 400), 800x600 -> canto superior esquerdo (100, 100)
    const moldura = res.itens.find((i) => i.tipo === 'moldura')
    assert.ok(moldura && moldura.tipo === 'moldura')
    assert.equal(moldura.x, 100)
    assert.equal(moldura.y, 100)
    assert.equal(moldura.titulo, 'Ato I & Entrada')

    // Sticky note filha da moldura: centro relativo (150, 120) + topo da moldura (100, 100) = centro (250, 220)
    // Com 200x200 -> canto superior esquerdo (150, 120)
    const stickyId = res.mapaId.get('sticky-1')!
    const sticky = res.itens.find((i) => i.id === stickyId)
    assert.ok(sticky && sticky.tipo === 'forma')
    assert.equal(sticky.x, 150)
    assert.equal(sticky.y, 120)
    assert.equal(sticky.molduraId, moldura.id)
    assert.equal(sticky.caixa.fundo, CORES_DE_NOTA_DO_MIRO.light_yellow)
    assert.equal(sticky.caixa.sombra, true)
    assert.equal(sticky.revisao?.tipoSugerido, 'teste')
    assert.ok(sticky.revisao?.motivos.some((m) => m.includes('PERCEPÇÃO 13')))

    // Shape com cor de leitura (#f7e48c) sem marcador -> sugere 'leitura' pela cor
    const shapeId = res.mapaId.get('shape-1')!
    const shape = res.itens.find((i) => i.id === shapeId)
    assert.ok(shape && shape.tipo === 'forma')
    assert.equal(shape.forma, 'arredondado')
    assert.equal(shape.texto.fonte, 'pt-serif')
    assert.equal(shape.revisao?.tipoSugerido, 'leitura')

    // Texto com span background-color #f2a7b8 -> sugere 'segredo' pela cor dominante do HTML
    const textId = res.mapaId.get('text-1')!
    const text = res.itens.find((i) => i.id === textId)
    assert.ok(text && text.tipo === 'texto')
    assert.equal(text.texto.fonte, 'caveat')
    assert.equal(text.revisao?.tipoSugerido, 'segredo')

    // Card sem cor na paleta e sem marcador -> tipoSugerido null
    const cardId = res.mapaId.get('card-1')!
    const card = res.itens.find((i) => i.id === cardId)
    assert.ok(card && card.tipo === 'texto')
    assert.equal(card.revisao?.tipoSugerido, null)

    // Conector entre sticky-1 e shape-1
    const connId = res.mapaId.get('conn-1')!
    const seta = res.itens.find((i) => i.id === connId)
    assert.ok(seta && seta.tipo === 'seta')
    assert.equal(seta.rota, 'cotovelo')
    assert.equal(seta.tracejado, 'pontilhado')
    assert.equal(seta.rotulo, 'passagem secreta')
    assert.deepEqual(seta.de, { itemId: stickyId, lado: 'direita' })
    assert.deepEqual(seta.para, { itemId: shapeId, lado: 'esquerda' })
  })
})

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { converterMiro, type PacoteMiroBruto } from '../../src/dominio/miro.ts'
import { aplicar, inverter } from '../../src/dominio/quadro-operacoes.ts'
import { assinaturaDoMiro, planejarAtualizacaoDoMiro } from '../../src/dominio/sincronia-miro.ts'
import {
  docDeTexto,
  type Item,
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

describe('E1b — planejarAtualizacaoDoMiro', () => {
  function item(miro: string, doc: string, extra: Record<string, unknown> = {}): Item {
    const t = novoTexto(
      { quadroId: 'q', x: 10, y: 20, largura: 200, altura: 80, doc: docDeTexto(doc), z: 1 },
      1,
      `id-${miro}`,
    )
    Object.assign(t, extra)
    t.origem = { miro, assinatura: assinaturaDoMiro(t) }
    return t
  }
  const mapa = (...its: Item[]) => new Map(its.map((i) => [i.id, i]))
  const relevante = (m: ReadonlyMap<string, Item>) =>
    JSON.stringify([...m.values()].sort((a, b) => a.id.localeCompare(b.id)))

  it('estilos pintados na Mesa sobrevivem a uma mudança de conteúdo no Miro', () => {
    const a = item('a', 'x')
    const pintado = { ...a, caixa: { ...(a as { caixa: object }).caixa, fundo: '#ff0000' } } as Item
    const novo = item('a', 'y', { caixa: { ...(a as { caixa: object }).caixa, fundo: '#00ff00' } })
    const r = planejarAtualizacaoDoMiro(mapa(pintado), [novo], 9)
    assert.equal(r.relatorio.atualizados, 1)
    const res = aplicar(mapa(pintado), r.passo).get(a.id) as { caixa: { fundo: string } }
    assert.equal(res.caixa.fundo, '#ff0000')
  })

  it('item apagado na Mesa que continua no Miro não volta', () => {
    const a = item('a', 'x')
    const b = item('b', 'y')
    const vistos = new Set(['a', 'b'])
    // b foi apagado na Mesa; o Miro ainda tem a e b, e trouxe c, novo.
    const r = planejarAtualizacaoDoMiro(mapa(a), [{ ...a }, b, item('c', 'z')], 9, vistos)
    assert.equal(r.relatorio.apagadosAqui, 1)
    assert.equal(r.relatorio.novos, 1)
    const criados = r.passo.ops.flatMap((op) => ('criar' in op ? op.criar : []))
    assert.deepEqual(criados.map((i) => i.origem!.miro), ['c'])
    // Sem a lista (quadro importado antes dela), b volta como novo.
    assert.equal(planejarAtualizacaoDoMiro(mapa(a), [{ ...a }, b], 9).relatorio.novos, 1)
  })

  it('nada muda: passo vazio', () => {
    const a = item('a', 'x')
    const r = planejarAtualizacaoDoMiro(mapa(a), [{ ...a }], 9)
    assert.equal(r.passo.ops.length, 0)
    assert.deepEqual(r.relatorio, { apagadosAqui: 0, novos: 0, atualizados: 0, removidos: 0, conflitos: 0, saiuDoMiro: 0 })
  })

  it('Miro mudou, Mesa não: atualiza e preserva campos da Mesa', () => {
    const a = item('a', 'x', { semantica: 'segredo', travado: true, soMestre: true, grupoId: 'g', z: 7, feito: { em: 2, sessaoId: null } })
    const novo = item('a', 'y')
    novo.x = 50
    novo.origem = { miro: 'a', assinatura: assinaturaDoMiro(novo) }
    const r = planejarAtualizacaoDoMiro(mapa(a), [novo], 9)
    assert.equal(r.relatorio.atualizados, 1)
    const res = aplicar(mapa(a), r.passo).get(a.id)!
    assert.equal(res.x, 50)
    assert.equal(res.origem!.assinatura, novo.origem.assinatura)
    assert.equal(res.atualizadoEm, 9)
    assert.equal(res.travado, true)
    assert.equal(res.soMestre, true)
    assert.equal(res.grupoId, 'g')
    assert.equal(res.z, 7)
    assert.equal(res.criadoEm, a.criadoEm)
    assert.deepEqual(res.feito, { em: 2, sessaoId: null })
    assert.equal((res as { semantica?: unknown }).semantica, 'segredo')
    assert.equal(res.revisao, undefined)
  })

  it('revisão pendente continua; sem revisão não ganha', () => {
    const rev = { tipoSugerido: null, motivos: ['m'], origem: 'miro' as const }
    const a = item('a', 'x', { revisao: rev })
    const b = item('b', 'x')
    const na = item('a', 'novo')
    const nb = item('b', 'novo')
    const r = planejarAtualizacaoDoMiro(mapa(a, b), [na, nb], 9)
    const res = aplicar(mapa(a, b), r.passo)
    assert.deepEqual(res.get(a.id)!.revisao, rev)
    assert.equal(res.get(b.id)!.revisao, undefined)
  })

  it('conflito: mantém a versão da Mesa e marca revisão', () => {
    const a = item('a', 'x', { semantica: 'segredo' })
    const editado = { ...a, doc: docDeTexto('editado aqui') } as Item
    const novo = item('a', 'mudou no miro')
    const r = planejarAtualizacaoDoMiro(mapa(editado), [novo], 9)
    assert.equal(r.relatorio.conflitos, 1)
    const res = aplicar(mapa(editado), r.passo).get(a.id)!
    assert.deepEqual(res.revisao, {
      tipoSugerido: 'segredo',
      motivos: ['Mudou no Miro e aqui; ficou a versão daqui'],
      origem: 'miro',
    })
    assert.equal(res.origem!.assinatura, novo.origem!.assinatura)
    assert.equal((res as { doc: unknown }).doc && JSON.stringify((res as { doc: unknown }).doc), JSON.stringify(editado.tipo === 'texto' && editado.doc))
    // reimportar de novo sem mudança no Miro não repete o conflito
    const r2 = planejarAtualizacaoDoMiro(aplicar(mapa(editado), r.passo), [novo], 10)
    assert.equal(r2.passo.ops.length, 0)
  })

  it('Mesa mudou e Miro não: nada', () => {
    const a = item('a', 'x')
    const editado = { ...a, doc: docDeTexto('editado') } as Item
    const r = planejarAtualizacaoDoMiro(mapa(editado), [{ ...a }], 9)
    assert.equal(r.passo.ops.length, 0)
  })

  it('tipo diferente é conflito', () => {
    const a = item('a', 'x')
    const novo = novaSeta({ quadroId: 'q', de: { ponto: [0, 0] }, para: { ponto: [5, 5] } }, 1, a.id)
    novo.origem = { miro: 'a', assinatura: assinaturaDoMiro(novo) }
    const r = planejarAtualizacaoDoMiro(mapa(a), [novo], 9)
    assert.equal(r.relatorio.conflitos, 1)
    assert.equal(aplicar(mapa(a), r.passo).get(a.id)!.tipo, 'texto')
  })

  it('sumiu do Miro: remove se intocado, revisão se editado', () => {
    const a = item('a', 'x')
    const b = item('b', 'x')
    const bEditado = { ...b, doc: docDeTexto('editado') } as Item
    const r = planejarAtualizacaoDoMiro(mapa(a, bEditado), [], 9)
    assert.equal(r.relatorio.removidos, 1)
    assert.equal(r.relatorio.saiuDoMiro, 1)
    const res = aplicar(mapa(a, bEditado), r.passo)
    assert.equal(res.has(a.id), false)
    assert.deepEqual(res.get(b.id)!.revisao!.motivos, ['Saiu do Miro'])
    assert.equal(res.get(b.id)!.origem!.assinatura, b.origem!.assinatura)
  })

  it('novos: criados acima do maior z, mantendo a ordem relativa', () => {
    const a = item('a', 'x', { z: 5 })
    const n1 = item('n1', 'x', { z: 9 })
    const n2 = item('n2', 'x', { z: 3 })
    const r = planejarAtualizacaoDoMiro(mapa(a), [n1, n2], 9)
    assert.equal(r.relatorio.novos, 2)
    const res = aplicar(mapa(a), r.passo)
    assert.equal(res.get(n2.id)!.z, 6)
    assert.equal(res.get(n1.id)!.z, 7)
  })

  it('itens sem origem ficam intocados', () => {
    const livre = texto()
    const r = planejarAtualizacaoDoMiro(mapa(livre), [], 9)
    assert.equal(r.passo.ops.length, 0)
  })

  it('aplicar + inverter volta ao estado inicial', () => {
    const rev = { tipoSugerido: null, motivos: ['m'], origem: 'miro' as const }
    const a = item('a', 'x', { semantica: 'segredo', z: 2 })
    const b = item('b', 'x', { revisao: rev })
    const c = item('c', 'x')
    const cEd = { ...c, doc: docDeTexto('ed') } as Item
    const d = item('d', 'x')
    const dEd = { ...d, doc: docDeTexto('ed') } as Item
    const e = item('e', 'x')
    const livre = texto()
    const atuais = mapa(a, b, cEd, dEd, e, livre)
    const r = planejarAtualizacaoDoMiro(atuais, [item('a', 'novo'), item('b', 'novo'), item('c', 'novo'), item('n', 'n')], 9)
    assert.equal(r.passo.ops.length, 3)
    const depois = aplicar(atuais, r.passo)
    assert.notEqual(relevante(depois), relevante(atuais))
    const volta = aplicar(depois, inverter(r.passo))
    assert.equal(relevante(volta), relevante(atuais))
  })
})

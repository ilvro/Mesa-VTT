import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ESTADO_VAZIO, type EstadoDoMundo } from '../../src/dominio/estado-do-mundo.ts';
import {
  docSemMarcadores,
  itensParaJogadores,
  lerMensagemDeProjecao,
  textoSemMarcadores,
} from '../../src/dominio/projecao.ts';
import {
  docDeTexto,
  novaForma,
  novaMoldura,
  novaNotaAdesiva,
  novaRef,
  novaSeta,
  textoPuro,
  type DocRico,
  type Item,
} from '../../src/dominio/quadro.ts';

const nota = (id: string, texto: string, x = 10, y = 10, extra: Partial<Item> = {}): Item => ({
  ...novaNotaAdesiva({ quadroId: 'q', x, y, largura: 50, altura: 50, doc: docDeTexto(texto) }, 1, id),
  molduraId: 'M',
  ...extra,
} as Item);
const moldura = (id = 'M', mae: string | null = null, x = 0, y = 0, l = 1000, a = 1000): Item => ({
  ...novaMoldura({ quadroId: 'q', x, y, largura: l, altura: a, titulo: id }, 1, id),
  molduraId: mae,
});
const mapa = (...itens: Item[]) => new Map(itens.map((i) => [i.id, i]));
const ids = (r: Item[]) => r.map((i) => i.id).sort();
const estado = (fatos: EstadoDoMundo['fatos']): EstadoDoMundo => ({ fatos, historico: [] });

test('só texto normal passa; segredo, só mestre, revisão e condição falsa ficam de fora', () => {
  const itens = mapa(
    moldura(),
    nota('ok', 'Uma carta velha'),
    nota('seg', 'x', 10, 10, { semantica: 'segredo' } as Partial<Item>),
    nota('mestre', 'y', 10, 10, { soMestre: true }),
    nota('rev', 'z', 10, 10, { revisao: { tipoSugerido: null, motivos: [], origem: 'miro' } }),
    nota('cond', 'só se achou [LOOT se:achou]', 10, 10),
    nota('fora', 'fora da moldura', 10, 10, { molduraId: null }),
  );
  assert.deepEqual(ids(itensParaJogadores(itens, 'M', ESTADO_VAZIO)), ['M', 'ok']);
  // condição verdadeira: o item entra (sem o marcador)
  const com = itensParaJogadores(itens, 'M', estado({ achou: true }));
  assert.ok(com.some((i) => i.id === 'cond'));
});

test('moldura inexistente, ou id de item que não é moldura, dá lista vazia', () => {
  const itens = mapa(moldura(), nota('a', 'oi'));
  assert.deepEqual(itensParaJogadores(itens, 'nada', ESTADO_VAZIO), []);
  assert.deepEqual(itensParaJogadores(itens, 'a', ESTADO_VAZIO), []);
});

test('moldura só do mestre, em revisão ou com condição falsa não projeta nada', () => {
  const m = { ...moldura(), soMestre: true } as Item;
  assert.deepEqual(itensParaJogadores(mapa(m, nota('a', 'oi')), 'M', ESTADO_VAZIO), []);
});

test('moldura aninhada de fora leva os filhos junto; a visível traz os dela', () => {
  const itens = mapa(
    moldura('M'),
    { ...moldura('secreta', 'M', 0, 0, 400, 400), soMestre: true } as Item,
    nota('dentro-da-secreta', 'segredinho', 10, 10, { molduraId: 'secreta' }),
    moldura('aberta', 'M', 500, 500, 400, 400),
    nota('dentro-da-aberta', 'tudo bem', 510, 510, { molduraId: 'aberta' }),
  );
  assert.deepEqual(ids(itensParaJogadores(itens, 'M', ESTADO_VAZIO)), ['M', 'aberta', 'dentro-da-aberta']);
});

test('marcadores saem do texto, a semantica e o resto do mestre são zerados', () => {
  const itens = mapa(
    moldura(),
    nota('a', 'Olhe em volta [PERCEPÇÃO 13 - vê o rastro]. [FALA]', 10, 10, {
      semantica: 'teste',
      feito: { em: 1, sessaoId: null },
      origem: { miro: 'm1', assinatura: 's' },
    } as Partial<Item>),
  );
  const a = itensParaJogadores(itens, 'M', ESTADO_VAZIO).find((i) => i.id === 'a')!;
  assert.equal(a.tipo, 'texto');
  if (a.tipo !== 'texto') return;
  assert.equal(textoPuro(a.doc).includes('PERCEPÇÃO'), false);
  assert.equal(textoPuro(a.doc).includes('['), false);
  assert.match(textoPuro(a.doc), /Olhe em volta/);
  assert.equal(a.semantica, null);
  assert.equal(a.feito, undefined);
  assert.equal(a.origem, undefined);
});

test('item que só tinha marcador some; forma sem texto continua', () => {
  const f = { ...novaForma({ quadroId: 'q', x: 1, y: 1, largura: 50, altura: 50 }, 1, 'forma'), molduraId: 'M' } as Item;
  const itens = mapa(moldura(), nota('so', '[PERCEPÇÃO 13]'), f);
  assert.deepEqual(ids(itensParaJogadores(itens, 'M', ESTADO_VAZIO)), ['M', 'forma']);
});

test('docSemMarcadores: [SEGREDO] e [LOOT] levam o resto da linha; Tarefa: sai; ligação vira o nome', () => {
  const r = textoPuro(docSemMarcadores(docDeTexto('Entrada\n[SEGREDO] o rei é impostor\nAntes [LOOT] espada rúnica\nTarefa: falar\nFale com [[Teodor|o velho]] e [[Naira]].')));
  assert.equal(r, 'Entrada\nAntes \n falar\nFale com o velho e Naira.');
});

test('docSemMarcadores: marcador partido entre marcas de texto é removido nos dois pedaços', () => {
  const doc: DocRico = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Sala escura ' },
          { type: 'text', text: '[PERCEP', marks: [{ type: 'bold' }] },
          { type: 'text', text: 'ÇÃO 13]' },
          { type: 'text', text: ' fim', marks: [{ type: 'italic' }] },
        ],
      },
    ],
  };
  const r = docSemMarcadores(doc);
  const json = JSON.stringify(r);
  assert.equal(json.includes('PERCEP'), false);
  assert.equal(json.includes('13'), false);
  assert.equal(textoPuro(r), 'Sala escura  fim');
  // a marca do trecho que sobrou é preservada
  assert.deepEqual(r.content[0]!.content!.at(-1), { type: 'text', text: ' fim', marks: [{ type: 'italic' }] });
});

test('docSemMarcadores: parágrafo que só tinha marcador sai; listas e títulos são percorridos', () => {
  const doc: DocRico = {
    type: 'doc',
    content: [
      { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Título [EVENTO]' }] },
      { type: 'paragraph', content: [{ type: 'text', text: '[TESTE 5]' }] },
      {
        type: 'bulletList',
        content: [
          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'um [PERCEPÇÃO 10]' }] }] },
          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: '[LOOT] ouro' }] }] },
        ],
      },
    ],
  };
  const r = docSemMarcadores(doc);
  assert.equal(textoPuro(r), 'Título \num ');
  assert.equal(r.content.length, 2);
});

test('textoSemMarcadores: título e rótulo', () => {
  assert.equal(textoSemMarcadores('Cripta [EVENTO]'), 'Cripta ');
  assert.equal(textoSemMarcadores('sem nada'), 'sem nada');
});

test('moldura projetada perde aoFocar e o título perde marcadores', () => {
  const m = { ...moldura(), titulo: 'Cripta [PERCEPÇÃO 12]', aoFocar: { cena: null, fatos: { x: true } } } as Item;
  const r = itensParaJogadores(mapa(m), 'M', ESTADO_VAZIO)[0]!;
  assert.equal(r.tipo, 'moldura');
  if (r.tipo !== 'moldura') return;
  assert.equal(r.aoFocar, undefined);
  assert.equal(r.titulo.includes('PERCEP'), false);
});

test('setas: só com as duas pontas projetadas; ponta livre precisa cair dentro da moldura', () => {
  const seta = (id: string, de: Item | { ponto: [number, number] }, para: Item | { ponto: [number, number] }, extra: Partial<Item> = {}): Item => ({
    ...novaSeta({ quadroId: 'q', de: 'id' in de ? { itemId: de.id, lado: 'auto' } : de, para: 'id' in para ? { itemId: para.id, lado: 'auto' } : para, rotulo: 'liga' }, 1, id),
    ...extra,
  } as Item);
  const a = nota('a', 'A');
  const b = nota('b', 'B');
  const s = nota('s', 'S', 10, 10, { soMestre: true });
  const outra = { ...nota('outra', 'Outra'), molduraId: null } as Item;
  const itens = mapa(
    moldura(), a, b, s, outra,
    seta('ab', a, b),
    seta('as', a, s),
    seta('livre-dentro', a, { ponto: [100, 100] }),
    seta('livre-fora', a, { ponto: [5000, 5000] }),
    seta('para-fora', a, outra),
    seta('so-mestre', a, b, { soMestre: true }),
    seta('com-marcador', a, b, { rotulo: 'x [EVENTO]' } as Partial<Item>),
  );
  const r = itensParaJogadores(itens, 'M', ESTADO_VAZIO);
  const setas = ids(r.filter((i) => i.tipo === 'seta'));
  assert.deepEqual(setas, ['ab', 'com-marcador', 'livre-dentro']);
  const cm = r.find((i) => i.id === 'com-marcador')!;
  assert.equal(cm.tipo === 'seta' && cm.rotulo.includes('EVENTO'), false);
});

test('cartão de entidade (ref) continua, com o rótulo limpo', () => {
  const ref = { ...novaRef({ quadroId: 'q', x: 1, y: 1, ref: { app: 'mesa', tipo: 'entidade', id: 'e1' }, rotulo: 'Teodor [EVENTO]' }, 1, 'ref'), molduraId: 'M' } as Item;
  const r = itensParaJogadores(mapa(moldura(), ref), 'M', ESTADO_VAZIO).find((i) => i.id === 'ref')!;
  assert.equal(r.tipo === 'ref' && r.rotulo, 'Teodor ');
});

test('lerMensagemDeProjecao: aceita só as três formas', () => {
  assert.deepEqual(lerMensagemDeProjecao({ tipo: 'mostrar', quadroId: 'q', molduraId: 'm' }), { tipo: 'mostrar', quadroId: 'q', molduraId: 'm' });
  assert.deepEqual(lerMensagemDeProjecao({ tipo: 'parar' }), { tipo: 'parar' });
  assert.deepEqual(lerMensagemDeProjecao({ tipo: 'atualizar', extra: 1 }), { tipo: 'atualizar' });
  assert.equal(lerMensagemDeProjecao({ tipo: 'mostrar', quadroId: 'q' }), null);
  assert.equal(lerMensagemDeProjecao(null), null);
  assert.equal(lerMensagemDeProjecao('mostrar'), null);
});

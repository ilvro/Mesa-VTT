import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarRef } from '#mesa';
import {
  DOC_VAZIO,
  docDeTexto,
  novaForma,
  novaImagem,
  novaMoldura,
  novaNotaAdesiva,
  novaRef,
  novaSeta,
  novoQuadro,
  novoTexto,
  novoTraco,
  textoPuro,
  validarItem,
  validarQuadro,
} from '../../src/dominio/quadro.ts';

test('validarQuadro: aceita quadro criado pela fábrica', () => {
  const q = novoQuadro('camp-1', 'Lysdal', 1000, 'q-1');
  assert.doesNotThrow(() => validarQuadro(q));
  assert.equal(q.fundo.cor, '#101412');
  assert.equal(q.fundo.grade, 'pontos');
  assert.equal(q.fundo.passo, 24);
});

test('validarQuadro: recusa campo desconhecido e passo inválido', () => {
  const comExtra = { ...novoQuadro('camp-1', 'Lysdal', 1000, 'q-1'), extra: 1 };
  assert.throws(() => validarQuadro(comExtra), /quadro\.extra: campo desconhecido/);

  const passoZero = novoQuadro('camp-1', 'Lysdal', 1000, 'q-1');
  passoZero.fundo.passo = 0;
  assert.throws(() => validarQuadro(passoZero, 'quadros[0]'), /quadros\[0\]\.fundo\.passo/);
});

test('validarItem: aceita todos os tipos criados pelas fábricas', () => {
  const itens = [
    novoTexto({ quadroId: 'q-1', x: 10, y: 20 }, 1000, 't-1'),
    novaNotaAdesiva({ quadroId: 'q-1', x: 30, y: 40 }, 1000, 'n-1'),
    novaForma({ quadroId: 'q-1', x: 50, y: 60 }, 1000, 'f-1'),
    novaImagem(
      { quadroId: 'q-1', x: 0, y: 0, imagemId: 'abc123', larguraOriginal: 400, alturaOriginal: 300 },
      1000,
      'i-1',
    ),
    novoTraco(
      { quadroId: 'q-1', x: 0, y: 0, largura: 100, altura: 50, pontos: [[0, 0, 0.5], [100, 50, 0.8]] },
      1000,
      'tr-1',
    ),
    novaSeta(
      { quadroId: 'q-1', de: { itemId: 't-1', lado: 'auto' }, para: { ponto: [200, 200] } },
      1000,
      's-1',
    ),
    novaMoldura({ quadroId: 'q-1', x: 0, y: 0 }, 1000, 'm-1'),
    novaRef({ quadroId: 'q-1', x: 100, y: 100, ref: criarRef('mesa', 'entidade', 'e-1') }, 1000, 'r-1'),
  ];
  for (let i = 0; i < itens.length; i++) {
    assert.doesNotThrow(() => validarItem(itens[i], `itens[${i}]`));
  }
});

test('validarItem: recusa campo desconhecido e opacidade fora de 0..1 com caminho', () => {
  const item = novoTexto({ quadroId: 'q-1', x: 0, y: 0 }, 1000, 't-1');
  const comExtra = { ...item, bobagem: true };
  assert.throws(() => validarItem(comExtra, 'itens[2]'), /itens\[2\]\.bobagem: campo desconhecido/);

  item.caixa.opacidade = 1.5;
  assert.throws(() => validarItem(item, 'itens[3]'), /itens\[3\]\.caixa\.opacidade/);

  item.caixa.opacidade = -0.1;
  assert.throws(() => validarItem(item, 'itens[3]'), /itens\[3\]\.caixa\.opacidade/);
});

test('validarItem: preserva conteúdo de nós desconhecidos e remove marcas desconhecidas', () => {
  const item = novoTexto({ quadroId: 'q-1', x: 0, y: 0 }, 1000, 't-1');
  item.doc = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: 'Olá',
            marks: [{ type: 'bold' }, { type: 'marcaInventada', attrs: { x: 1 } }],
          },
          { type: 'image', attrs: { src: 'x.png' } },
        ],
      },
      { type: 'blockquote', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'fora' }] }] },
    ],
  };

  validarItem(item);
  assert.deepEqual(item.doc, {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'Olá', marks: [{ type: 'bold' }] }],
      },
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'fora' }],
      },
    ],
  });
});

test('textoPuro e docDeTexto fazem ida e volta de linhas', () => {
  assert.equal(textoPuro(DOC_VAZIO), '');
  const doc = docDeTexto('Linha 1\n\nLinha 3');
  assert.equal(textoPuro(doc), 'Linha 1\n\nLinha 3');
});

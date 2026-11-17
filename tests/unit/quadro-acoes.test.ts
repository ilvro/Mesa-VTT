import { test } from 'node:test';
import assert from 'node:assert/strict';
import { docDeTexto, novoTexto, type Item } from '../../src/dominio/quadro.ts';
import {
  alterarTextuaisSelecao,
  alternarTravadoSelecao,
  duplicarSelecao,
  removerSelecao,
} from '../../src/app/quadro-acoes.ts';
import {
  desfazer,
  historico,
  itens,
  quadroAberto,
  selecao,
} from '../../src/app/quadros.ts';

function prepararQuadro(lista: Item[], idsSelecionados: string[]) {
  quadroAberto.value = null;
  historico.limpar();
  itens.value = new Map(lista.map((i) => [i.id, i]));
  selecao.value = new Set(idsSelecionados);
}

test('alterarTextuaisSelecao preserva semantica e caixa no desfazer', () => {
  const base = novoTexto({
    quadroId: 'q1',
    x: 10,
    y: 20,
    z: 1,
    doc: docDeTexto('Nota'),
    semantica: null,
  }, 100, 't1');
  const item: Item = { ...base, caixa: { ...base.caixa, fundo: '#ffffff' } };
  prepararQuadro([item], ['t1']);

  alterarTextuaisSelecao('Tipo semântico', (it) => ({
    semantica: 'evento',
    caixa: { ...it.caixa, fundo: null },
  }));

  const alterado = itens.value.get('t1');
  assert.equal(alterado?.tipo, 'texto');
  if (alterado?.tipo === 'texto') {
    assert.equal(alterado.semantica, 'evento');
    assert.equal(alterado.caixa.fundo, null);
  }

  desfazer();
  const desfeito = itens.value.get('t1');
  if (desfeito?.tipo === 'texto') {
    assert.equal(desfeito.semantica, null);
    assert.equal(desfeito.caixa.fundo, '#ffffff');
  }
});

test('removerSelecao ignora itens travados e remove os destravados', () => {
  const livre = novoTexto({ quadroId: 'q1', x: 0, y: 0, z: 1, doc: docDeTexto('Livre') }, 100, 'livre');
  const travado: Item = {
    ...novoTexto({ quadroId: 'q1', x: 100, y: 0, z: 2, doc: docDeTexto('Travado') }, 100, 'travado'),
    travado: true,
  };
  prepararQuadro([livre, travado], ['livre', 'travado']);

  const removidos = removerSelecao();
  assert.deepEqual(removidos.map((i) => i.id), ['livre']);
  assert.equal(itens.value.has('livre'), false);
  assert.equal(itens.value.has('travado'), true);
});

test('duplicarSelecao cria cópias e alternarTravadoSelecao alterna trava com desfazer', () => {
  const a = novoTexto({ quadroId: 'q1', x: 10, y: 10, z: 1, doc: docDeTexto('A') }, 100, 'a');
  prepararQuadro([a], ['a']);

  let seq = 0;
  const criados = duplicarSelecao(() => `dup-${++seq}`);
  assert.equal(criados.length, 1);
  assert.equal(criados[0]!.id, 'dup-1');
  assert.deepEqual([...selecao.value], ['dup-1']);

  alternarTravadoSelecao();
  assert.equal(itens.value.get('dup-1')?.travado, true);
  desfazer();
  assert.equal(itens.value.get('dup-1')?.travado, false);
});

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Entidade, Ligacao, Ref } from '#mesa';
import {
  classificarRef,
  chavesDeNomes,
  diferencaDeLigacoes,
  itensQueCitam,
  nomesNovos,
  ligacoesDoQuadro,
  ligacoesOrfasDoQuadro,
  parsearRefDeItemDeQuadro,
  refDoItemDeQuadro,
  refsDoItem,
} from '../../src/dominio/ligacoes-quadro.ts';
import { docDeTexto, novaRef, novoTexto } from '../../src/dominio/quadro.ts';

function ent(id: string, nome: string): Entidade {
  return {
    id,
    campanhaId: 'c1',
    tipo: 'personagem',
    nome,
    tags: [],
    notas: '',
    refs: [{ app: 'mesa', tipo: 'entidade', id }],
    criadaPor: 'mesa',
    criadaEm: 1,
    atualizadaEm: 1,
  };
}

describe('ligações do quadro (domínio)', () => {
  it('diferencaDeLigacoes calcula adições e remoções sem duplicar', () => {
    const a: Ref = { app: 'mesa', tipo: 'entidade', id: 'sindre' };
    const b: Ref = { app: 'mesa', tipo: 'entidade', id: 'karl' };
    const c: Ref = { app: 'atlas', tipo: 'mapa', id: 'taverna' };

    const diff = diferencaDeLigacoes([a, b, a], [b, c, c]);
    assert.deepEqual(diff.adicionar, [c]);
    assert.deepEqual(diff.remover, [a]);
  });

  it('refDoItemDeQuadro e parsearRefDeItemDeQuadro fazem ida e volta', () => {
    const ref = refDoItemDeQuadro('q1', 'i2');
    assert.deepEqual(parsearRefDeItemDeQuadro(ref), { quadroId: 'q1', itemId: 'i2' });
    assert.equal(parsearRefDeItemDeQuadro({ app: 'mesa', tipo: 'entidade', id: 'e1' }), null);
  });

  it('refsDoItem extrai [[ligações]], [FALA] que bate com entidade e itens ref', () => {
    const sindre = ent('e-sindre', 'Sindre');
    const ole = ent('e-ole', 'Ole');
    const entidades = [sindre, ole];

    const texto = novoTexto(
      {
        quadroId: 'q1',
        x: 0,
        y: 0,
        doc: docDeTexto('Falar com [[Sindre]] e [OLE]'),
      },
      1,
      'i1',
    );
    assert.deepEqual(refsDoItem(texto, entidades), [
      { app: 'mesa', tipo: 'entidade', id: 'e-sindre' },
      { app: 'mesa', tipo: 'entidade', id: 'e-ole' },
    ]);

    const cartao = novaRef(
      {
        quadroId: 'q1',
        ref: { app: 'mesa', tipo: 'entidade', id: 'e-sindre' },
        x: 10,
        y: 10,
      },
      1,
      'i2',
    );
    assert.deepEqual(refsDoItem(cartao, entidades), [
      { app: 'mesa', tipo: 'entidade', id: 'e-sindre' },
    ]);
  });

  describe('ligações do quadro apagado e órfãs', () => {
    const alvo: Ref = { app: 'mesa', tipo: 'entidade', id: 'sindre' };
    const lig = (
      id: string,
      de: Ref,
      tipo: Ligacao['tipo'],
      criadaPor: Ligacao['criadaPor'] = 'mesa',
    ): Ligacao => ({ id, campanhaId: 'c1', de, para: alvo, tipo, criadaPor, criadaEm: 1 });
    const todas = [
      lig('a', refDoItemDeQuadro('q1', 'i1'), 'esta-em'),
      lig('b', refDoItemDeQuadro('q1', 'i2'), 'menciona'),
      lig('c', refDoItemDeQuadro('q1', 'i3'), 'esta-em', 'atlas'),
      lig('d', refDoItemDeQuadro('q2', 'i1'), 'esta-em'),
      lig('e', { app: 'mesa', tipo: 'entidade', id: 'x' }, 'menciona'),
    ];

    it('ligacoesDoQuadro pega só as da Mesa daquele quadro, de qualquer tipo', () => {
      assert.deepEqual(ligacoesDoQuadro(todas, 'q1').map((l) => l.id), ['a', 'b']);
    });

    it('ligacoesOrfasDoQuadro ignora existentes, outro app e outro quadro', () => {
      const orfas = ligacoesOrfasDoQuadro(todas, 'q1', new Set(['i1']));
      assert.deepEqual(orfas.map((l) => l.id), ['b']);
      assert.deepEqual(
        ligacoesOrfasDoQuadro(todas, 'q1', new Set()).map((l) => l.id),
        ['a', 'b'],
      );
    });
  });
});

describe('classificarRef', () => {
  it('classifica refs da Mesa e de outros apps', () => {
    assert.equal(classificarRef({ app: 'mesa', tipo: 'item', id: 'q1/i1' }), 'item');
    assert.equal(classificarRef({ app: 'mesa', tipo: 'item', id: 'solto' }), 'externo');
    assert.equal(classificarRef({ app: 'mesa', tipo: 'quadro', id: 'q1' }), 'quadro');
    assert.equal(classificarRef({ app: 'mesa', tipo: 'entidade', id: 'e1' }), 'entidade');
    assert.equal(classificarRef({ app: 'atlas', tipo: 'objeto', id: 'm/o' }), 'externo');
  });
});

describe('religar nomes novos', () => {
  const txt = (id: string, t: string) => novoTexto({ quadroId: 'q1', x: 0, y: 0, doc: docDeTexto(t) }, 1, id);

  it('itensQueCitam acha [[Nome]] e falas, ignorando acento e caixa', () => {
    const a = txt('a', 'veja [[TEODOR]] aqui');
    const b = txt('b', '[SINDRE]: oi');
    const c = txt('c', 'nada de [[Outro]]');
    const d = txt('d', 'sem ligação, só Teodor');
    const r = itensQueCitam(['Téodor', 'sindre'], [a, b, c, d]);
    assert.deepEqual(r.map((i) => i.id), ['a', 'b']);
  });

  it('itensQueCitam sem nomes não devolve nada', () => {
    assert.deepEqual(itensQueCitam([], [txt('a', '[[X]]')]), []);
  });

  it('nomesNovos compara pela chave sem acento nem caixa', () => {
    const antes = chavesDeNomes([ent('1', 'Sindre')]);
    assert.deepEqual(nomesNovos(antes, [ent('1', 'SINDRE'), ent('2', 'Téodor')]), ['Téodor']);
    assert.deepEqual(nomesNovos(antes, [ent('1', 'Sindre')]), []);
  });
});

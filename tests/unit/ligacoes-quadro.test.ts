import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Entidade, Ref } from '#mesa';
import {
  diferencaDeLigacoes,
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
});

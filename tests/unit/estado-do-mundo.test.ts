import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  avaliarCondicao,
  chaveDaCondicao,
  condicoesDoItem,
  itemAtendeCondicoes,
  type EstadoDoMundo,
} from '../../src/dominio/estado-do-mundo.ts';
import { docDeTexto, novoTexto } from '../../src/dominio/quadro.ts';

describe('estado do mundo (domínio)', () => {
  it('avaliarCondicao suporta booleano, negação, chave=valor e fato ausente', () => {
    const estado: EstadoDoMundo = {
      fatos: {
        poeira: true,
        'chave do sótão': 'Naira',
      },
      historico: [],
    };

    assert.equal(avaliarCondicao('poeira', estado), true);
    assert.equal(avaliarCondicao('!poeira', estado), false);
    assert.equal(avaliarCondicao('ausente', estado), false);
    assert.equal(avaliarCondicao('!ausente', estado), true);
    assert.equal(avaliarCondicao('chave do sótão=Naira', estado), true);
    assert.equal(avaliarCondicao('chave do sótão=naira', estado), true);
    assert.equal(avaliarCondicao('chave do sótão=Karl', estado), false);
    assert.equal(avaliarCondicao('!chave do sótão=Karl', estado), true);
    assert.equal(chaveDaCondicao('!chave do sótão=Naira'), 'chave do sótão');
  });

  it('condicoesDoItem e itemAtendeCondicoes extraem condições dos marcadores', () => {
    const item = novoTexto(
      {
        quadroId: 'q1',
        x: 0,
        y: 0,
        doc: docDeTexto('[PERCEPÇÃO 13 se:poeira] e [SEGREDO se:chave=Naira]'),
      },
      1,
      'i1',
    );

    assert.deepEqual(condicoesDoItem(item), ['poeira', 'chave=Naira']);

    assert.equal(
      itemAtendeCondicoes(item, {
        fatos: { poeira: true, chave: 'Naira' },
        historico: [],
      }),
      true,
    );
    assert.equal(
      itemAtendeCondicoes(item, {
        fatos: { poeira: true },
        historico: [],
      }),
      false,
    );
  });
});

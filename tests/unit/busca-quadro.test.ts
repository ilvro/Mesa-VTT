import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buscarNoQuadro,
  itemEhSecreto,
  itemPassaNoFiltro,
} from '../../src/dominio/busca-quadro.ts';
import {
  docDeTexto,
  novaForma,
  novaMoldura,
  novaSeta,
  novoTexto,
} from '../../src/dominio/quadro.ts';

describe('busca no quadro (domínio)', () => {
  it('encontra texto sem acento em textos, formas, molduras e setas em ordem de leitura', () => {
    const t1 = novoTexto(
      { quadroId: 'q1', x: 300, y: 200, doc: docDeTexto('Pista da Mansão') },
      1,
      't1',
    );
    const m1 = novaMoldura({ quadroId: 'q1', x: 50, y: 50, titulo: 'Entrada da Mansao' }, 1, 'm1');
    const f1 = novaForma(
      { quadroId: 'q1', forma: 'retangulo', x: 100, y: 200, doc: docDeTexto('Guardão na mansão') },
      1,
      'f1',
    );
    const s1 = novaSeta(
      {
        quadroId: 'q1',
        de: { ponto: [0, 0] },
        para: { ponto: [100, 100] },
        rotulo: 'Caminho da mansão',
      },
      1,
      's1',
    );
    s1.x = 200;
    s1.y = 400;

    const res = buscarNoQuadro([t1, s1, f1, m1], 'MANSAO');
    assert.deepEqual(
      res.map((r) => r.item.id),
      ['m1', 'f1', 't1', 's1'],
    );
  });

  it('respeita esconderSegredos e filtros semânticos', () => {
    const segredo = novoTexto(
      { quadroId: 'q1', x: 0, y: 0, doc: docDeTexto('Chave oculta'), semantica: 'segredo' },
      1,
      'sec',
    );
    const leitura = novoTexto(
      { quadroId: 'q1', x: 0, y: 100, doc: docDeTexto('Chave pública'), semantica: 'leitura' },
      1,
      'lei',
    );
    const mestre = novoTexto(
      { quadroId: 'q1', x: 0, y: 200, doc: docDeTexto('Chave do mestre') },
      1,
      'mes',
    );
    mestre.soMestre = true;

    assert.equal(itemEhSecreto(segredo), true);
    assert.equal(itemEhSecreto(mestre), true);
    assert.equal(itemEhSecreto(leitura), false);

    const visiveis = buscarNoQuadro([segredo, leitura, mestre], 'chave', {
      esconderSegredos: true,
    });
    assert.deepEqual(
      visiveis.map((r) => r.item.id),
      ['lei'],
    );

    const filtro = new Set(['leitura'] as const);
    assert.equal(itemPassaNoFiltro(leitura, filtro), true);
    assert.equal(itemPassaNoFiltro(segredo, filtro), false);
    assert.equal(itemPassaNoFiltro(segredo, new Set()), true);
  });
});

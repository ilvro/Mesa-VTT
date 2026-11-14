import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { deveDisparar, type ItemMoldura } from '../../src/dominio/molduras.ts';
import type { AoFocar } from '../../src/dominio/quadro.ts';

function moldura(
  id: string,
  overrides: Partial<ItemMoldura> = {},
): ItemMoldura {
  return {
    id,
    quadroId: 'q1',
    tipo: 'moldura',
    titulo: id,
    x: 0,
    y: 0,
    largura: 400,
    altura: 300,
    rotacao: 0,
    z: 0,
    grupoId: null,
    molduraId: null,
    travado: false,
    soMestre: false,
    criadoEm: 1,
    atualizadoEm: 1,
    caixa: {
      fundo: null,
      borda: null,
      espessuraBorda: 1,
      tracejado: 'solido',
      raio: 8,
      sombra: false,
      padding: 8,
      opacidade: 1,
    },
    ...overrides,
  };
}

const ACAO: AoFocar = {
  cena: { app: 'jukebox', tipo: 'cena-sonora', id: 'chuva' },
  fatos: { chovendo: true },
};

describe('deveDisparar (molduras que agem)', () => {
  it('respeita modo nao e ausencia de acao', () => {
    const m = moldura('m1', { aoFocar: ACAO });
    assert.equal(deveDisparar(null, m, [m], 'nao'), false);
    assert.equal(deveDisparar(null, moldura('m2'), [m], 'sim'), false);
    assert.equal(
      deveDisparar(null, moldura('m3', { aoFocar: { cena: null, fatos: {} } }), [m], 'sim'),
      false,
    );
  });

  it('nao repete a mesma moldura e dispara em sim ou perguntar', () => {
    const m = moldura('m1', { aoFocar: ACAO });
    assert.equal(deveDisparar(null, m, [m], 'sim'), true);
    assert.equal(deveDisparar(null, m, [m], 'perguntar'), true);
    assert.equal(deveDisparar('m1', m, [m], 'sim'), false);
  });

  it('dispara ao entrar em filha, mas ignora a moldura-mae ao voltar da filha', () => {
    const mae = moldura('mae', { aoFocar: ACAO });
    const filha = moldura('filha', { molduraId: 'mae', aoFocar: ACAO });
    const todas = [mae, filha];

    assert.equal(deveDisparar('mae', filha, todas, 'sim'), true);
    assert.equal(deveDisparar('filha', mae, todas, 'sim'), false);
  });
});

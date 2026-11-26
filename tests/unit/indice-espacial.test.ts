import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { itensVisiveis, type Caixa } from '../../src/dominio/camera.ts';
import {
  consultarCaixa,
  consultarPonto,
  criarIndiceEspacial,
} from '../../src/dominio/indice-espacial.ts';
import { novoTexto, type Item } from '../../src/dominio/quadro.ts';

describe('indice-espacial', () => {
  it('retorna os mesmos itens e na mesma ordem que itensVisiveis, incluindo itens rodados e gigantes', () => {
    const itens: Item[] = [
      novoTexto({ quadroId: 'q1', x: 100, y: 100, largura: 120, altura: 80, z: 1 }, 1, 'peq-dentro'),
      novoTexto({ quadroId: 'q1', x: 5000, y: 5000, largura: 100, altura: 100, z: 2 }, 1, 'peq-fora'),
      {
        ...novoTexto({ quadroId: 'q1', x: 250, y: 150, largura: 20, altura: 220, z: 3 }, 1, 'rodado'),
        rotacao: 90,
      },
      novoTexto({ quadroId: 'q1', x: -1000, y: -1000, largura: 6000, altura: 6000, z: 4 }, 1, 'medio'),
      novoTexto({ quadroId: 'q1', x: -20000, y: -20000, largura: 50000, altura: 50000, z: 5 }, 1, 'gigante'),
    ];

    const indice = criarIndiceEspacial(itens);
    const caixa: Caixa = { x: 0, y: 0, largura: 300, altura: 300 };

    const esperado = itensVisiveis(itens, caixa, 20).map((i) => i.id);
    const obtido = consultarCaixa(indice, caixa, 20).map((i) => i.id);
    assert.deepEqual(obtido, esperado);

    assert.deepEqual(
      consultarPonto(indice, { x: 150, y: 140 }).map((i) => i.id),
      ['peq-dentro', 'medio', 'gigante'],
    );
    assert.deepEqual(
      consultarPonto(indice, { x: 160, y: 260 }).map((i) => i.id),
      ['rodado', 'medio', 'gigante'],
    );
  });

  it('suporta zoom bem distante cobrindo todo o quadro sem perder itens', () => {
    const itens: Item[] = [
      novoTexto({ quadroId: 'q1', x: -120000, y: -10000, largura: 200, altura: 100, z: 1 }, 1, 'a'),
      novoTexto({ quadroId: 'q1', x: 300000, y: 400000, largura: 400, altura: 300, z: 2 }, 1, 'b'),
    ];
    const indice = criarIndiceEspacial(itens);
    const tudo: Caixa = { x: -150000, y: -50000, largura: 500000, altura: 500000 };
    assert.deepEqual(
      consultarCaixa(indice, tudo).map((i) => i.id),
      ['a', 'b'],
    );
  });

  it('consulta viewport e ponto em menos de 2 ms em quadro com 10.000 itens', () => {
    const itens: Item[] = [];
    for (let i = 0; i < 10_000; i++) {
      const col = i % 100;
      const lin = Math.floor(i / 100);
      itens.push(
        novoTexto(
          { quadroId: 'q1', x: col * 300, y: lin * 300, largura: 180, altura: 100, z: i + 1 },
          1,
          `it-${i}`,
        ),
      );
    }

    const tConstr0 = performance.now();
    const indice = criarIndiceEspacial(itens);
    const tConstr = performance.now() - tConstr0;

    const tQ0 = performance.now();
    const vis = consultarCaixa(indice, { x: 3000, y: 3000, largura: 1200, altura: 800 }, 100);
    const sob = consultarPonto(indice, { x: 3050, y: 3050 });
    const tQuery = performance.now() - tQ0;

    assert.ok(vis.length > 0 && vis.length < 100);
    assert.equal(sob.length, 1);
    assert.ok(tConstr < 200, `construção demorou ${tConstr}ms`);
    assert.ok(tQuery < 5, `consulta demorou ${tQuery}ms`);
  });
});

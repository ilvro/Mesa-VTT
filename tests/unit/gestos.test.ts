import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  alteracoesDoArrasto,
  alteracoesDoRedimensionar,
  caixasParaGuias,
  deslocamentoDoArrasto,
  moverItemPatch,
  rotacaoDoGiro,
} from '../../src/dominio/gestos.ts';
import { aplicar } from '../../src/dominio/quadro-operacoes.ts';
import { novaImagem, novaSeta, novoTexto, type Item } from '../../src/dominio/quadro.ts';

const mapa = (...lista: Item[]) => new Map(lista.map((i) => [i.id, i]));
const semGrade = { encaixar: false, passo: 24 };

test('moverItemPatch leva junto as pontas livres da seta, não as ligadas', () => {
  const s = novaSeta({ quadroId: 'q', de: { ponto: [0, 0] }, para: { itemId: 'b', lado: 'auto' } }, 1, 's');
  const alt = moverItemPatch(s, s.x + 10, s.y + 5, 2);
  assert.deepEqual((alt.depois as { de: unknown }).de, { ponto: [10, 5] });
  assert.equal('para' in alt.depois, false);
});

test('caixasParaGuias ignora o que se move, setas e o que está longe da vista', () => {
  const perto = novoTexto({ quadroId: 'q', x: 100, y: 100 }, 1, 'perto');
  const longe = novoTexto({ quadroId: 'q', x: 50_000, y: 50_000 }, 1, 'longe');
  const movendo = novoTexto({ quadroId: 'q', x: 120, y: 120 }, 1, 'mov');
  const seta = novaSeta({ quadroId: 'q', de: { ponto: [0, 0] }, para: { ponto: [50, 50] } }, 1, 's');
  const caixas = caixasParaGuias([perto, longe, movendo, seta], new Set(['mov']), {
    x: 0,
    y: 0,
    largura: 1000,
    altura: 800,
  });
  assert.deepEqual(caixas.map((c) => c.x), [100]);
});

test('deslocamentoDoArrasto: Shift trava o eixo, guias encaixam, Alt desliga, grade arredonda', () => {
  const a = novoTexto({ quadroId: 'q', x: 0, y: 0 }, 1, 'a');
  const itens = mapa(a);
  const g = {
    originais: new Map([['a', { x: 0, y: 0 }]]),
    outros: [{ x: 203, y: 500, largura: 50, altura: 50 }],
  };

  const travado = deslocamentoDoArrasto(g, itens, { dx: 40, dy: 10 }, { shift: true, alt: true }, semGrade, 6);
  assert.deepEqual([travado.dx, travado.dy], [40, 0]);

  const comGuia = deslocamentoDoArrasto(g, itens, { dx: 200, dy: 0 }, { shift: false, alt: false }, semGrade, 6);
  assert.equal(comGuia.dx, 203);
  assert.ok(comGuia.linhas.length > 0);

  const semGuia = deslocamentoDoArrasto(g, itens, { dx: 200, dy: 0 }, { shift: false, alt: true }, semGrade, 6);
  assert.equal(semGuia.dx, 200);
  assert.equal(semGuia.linhas.length, 0);

  const naGrade = deslocamentoDoArrasto(g, itens, { dx: 30, dy: 13 }, { shift: false, alt: false }, { encaixar: true, passo: 24 }, 6);
  assert.deepEqual([naGrade.dx, naGrade.dy], [24, 24]);
});

test('alteracoesDoArrasto parte das posições originais e pula quem não mudou', () => {
  const a = novoTexto({ quadroId: 'q', x: 10, y: 10 }, 1, 'a');
  const originais = new Map([['a', { x: 10, y: 10 }]]);
  assert.equal(alteracoesDoArrasto(originais, mapa(a), 0, 0, 2).length, 0);
  const depois = aplicar(mapa(a), { rotulo: 'm', ops: [{ alterar: alteracoesDoArrasto(originais, mapa(a), 5, -5, 2) }] });
  assert.deepEqual([depois.get('a')!.x, depois.get('a')!.y], [15, 5]);
});

test('alteracoesDoRedimensionar escala a seleção e mantém a proporção da imagem', () => {
  const img = novaImagem({ quadroId: 'q', x: 0, y: 0, imagemId: 'x', larguraOriginal: 200, alturaOriginal: 100, largura: 200, altura: 100 }, 1, 'img');
  const g = {
    alca: 'se' as const,
    caixaInicial: { x: 0, y: 0, largura: 200, altura: 100 },
    originais: new Map([['img', { x: 0, y: 0, largura: 200, altura: 100 }]]),
  };
  const [alt] = alteracoesDoRedimensionar(g, mapa(img), { x: 200, y: 0 }, { shift: false, alt: false }, semGrade, 2);
  const d = alt!.depois as { largura: number; altura: number };
  assert.equal(d.largura / d.altura, 2);

  const [livre] = alteracoesDoRedimensionar(g, mapa(img), { x: 200, y: 0 }, { shift: true, alt: false }, semGrade, 2);
  assert.deepEqual([(livre!.depois as { largura: number }).largura, (livre!.depois as { altura: number }).altura], [400, 100]);
});

test('rotacaoDoGiro soma o ângulo percorrido e encaixa de 15 em 15', () => {
  const a = novoTexto({ quadroId: 'q', x: 0, y: 0 }, 1, 'a');
  const g = { centro: { x: 0, y: 0 }, anguloInicial: 0, rotacaoInicial: 0 };
  assert.equal(Math.round(rotacaoDoGiro(a, g, { x: 0, y: 10 }, false)), 90);
  assert.equal(rotacaoDoGiro(a, g, { x: 10, y: 2 }, true) % 15, 0);
});

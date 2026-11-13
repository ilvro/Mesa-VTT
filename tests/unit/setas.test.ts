import assert from 'node:assert/strict';
import { test } from 'node:test';
import { novaNotaAdesiva, novaSeta, type Item } from '../../src/dominio/quadro.ts';
import {
  caixaDaSeta,
  caminhoDaSeta,
  pontoDaPonta,
  setasLigadasA,
} from '../../src/dominio/setas.ts';

function mapaDe(...lista: Item[]): Map<string, Item> {
  return new Map(lista.map((i) => [i.id, i]));
}

test('pontoDaPonta com lado auto escolhe o lado voltado para a outra ponta', () => {
  const a = novaNotaAdesiva({ quadroId: 'q1', x: 0, y: 0, largura: 100, altura: 100 }, 1, 'a');
  const b = novaNotaAdesiva({ quadroId: 'q1', x: 300, y: 0, largura: 100, altura: 100 }, 1, 'b');
  const c = novaNotaAdesiva({ quadroId: 'q1', x: 0, y: 300, largura: 100, altura: 100 }, 1, 'c');
  const itens = mapaDe(a, b, c);

  const dir = pontoDaPonta({ itemId: 'a', lado: 'auto' }, itens, { itemId: 'b', lado: 'auto' });
  assert.equal(dir.lado, 'direita');
  assert.deepEqual(dir.ponto, { x: 100, y: 50 });

  const baixo = pontoDaPonta({ itemId: 'a', lado: 'auto' }, itens, { itemId: 'c', lado: 'auto' });
  assert.equal(baixo.lado, 'baixo');
  assert.deepEqual(baixo.ponto, { x: 50, y: 100 });
});

test('caminhoDaSeta gera reta, curva e cotovelo (máx 3 segmentos)', () => {
  const a = novaNotaAdesiva({ quadroId: 'q1', x: 0, y: 0, largura: 100, altura: 100 }, 1, 'a');
  const b = novaNotaAdesiva({ quadroId: 'q1', x: 200, y: 100, largura: 100, altura: 100 }, 1, 'b');
  const itens = mapaDe(a, b);

  const reta = caminhoDaSeta(
    novaSeta({ quadroId: 'q1', de: { itemId: 'a', lado: 'direita' }, para: { itemId: 'b', lado: 'esquerda' }, rota: 'reta' }, 1, 's1'),
    itens,
  );
  assert.match(reta.d, /^M 100 50 L 200 150$/);
  assert.deepEqual(reta.meio, [150, 100]);

  const curva = caminhoDaSeta(
    novaSeta({ quadroId: 'q1', de: { itemId: 'a', lado: 'direita' }, para: { itemId: 'b', lado: 'esquerda' }, rota: 'curva' }, 1, 's2'),
    itens,
  );
  assert.match(curva.d, /^M 100 50 C .* 200 150$/);

  const cotovelo = caminhoDaSeta(
    novaSeta({ quadroId: 'q1', de: { itemId: 'a', lado: 'direita' }, para: { itemId: 'b', lado: 'esquerda' }, rota: 'cotovelo' }, 1, 's3'),
    itens,
  );
  const segmentosL = cotovelo.d.match(/\bL\b/g)?.length ?? 0;
  assert.equal(segmentosL, 3);
});

test('caixaDaSeta e setasLigadasA acompanham movimento de item ligado', () => {
  const a = novaNotaAdesiva({ quadroId: 'q1', x: 0, y: 0, largura: 100, altura: 100 }, 1, 'a');
  const b = novaNotaAdesiva({ quadroId: 'q1', x: 200, y: 0, largura: 100, altura: 100 }, 1, 'b');
  const seta = novaSeta(
    { quadroId: 'q1', de: { itemId: 'a', lado: 'auto' }, para: { itemId: 'b', lado: 'auto' }, rota: 'reta' },
    1,
    's1',
  );
  const itens1 = mapaDe(a, b, seta);
  assert.equal(setasLigadasA(['b'], itens1).length, 1);

  const c1 = caixaDaSeta(seta, itens1);
  assert.equal(c1.x, 100);
  assert.equal(c1.largura, 100);

  const bMovido = { ...b, x: 500, y: 200 };
  const itens2 = mapaDe(a, bMovido, seta);
  const c2 = caixaDaSeta(seta, itens2);
  assert.ok(c2.largura > 300);
  assert.ok(c2.altura >= 200);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { caixaDaCaptura, escalaDaCaptura, itensDaRegiao, MARGEM_DA_CAPTURA } from '../../src/dominio/caixa-da-captura.ts';
import { novaNotaAdesiva, novaSeta, type Item } from '../../src/dominio/quadro.ts';

const Q = 'q1';
const nota = (id: string, x: number, y: number): Item => novaNotaAdesiva({ quadroId: Q, x, y, largura: 100, altura: 50 }, 1, id);

test('caixa dos itens com margem; setas não contam; vazio = null', () => {
  const a = nota('a', 0, 0);
  const b = nota('b', 300, 200);
  const seta = novaSeta({ quadroId: Q, de: { ponto: [-5000, -5000] }, para: { itemId: 'a', lado: 'auto' } }, 1, 's');
  const m = MARGEM_DA_CAPTURA;
  assert.deepEqual(caixaDaCaptura([a, b, seta]), { x: -m, y: -m, largura: 400 + 2 * m, altura: 250 + 2 * m });
  assert.equal(caixaDaCaptura([seta]), null);
  assert.equal(caixaDaCaptura([]), null);
});

test('escala: o maior lado cabe em `lado` e nunca amplia além de 2×', () => {
  assert.deepEqual(escalaDaCaptura({ x: 0, y: 0, largura: 2048, altura: 1024 }, 1024), { zoom: 0.5, largura: 1024, altura: 512 });
  const pequena = escalaDaCaptura({ x: 0, y: 0, largura: 100, altura: 50 }, 1024);
  assert.equal(pequena.zoom, 2);
  assert.equal(pequena.largura, 200);
});

test('região: itens que tocam a caixa, setas ligadas a eles e o item da outra ponta', () => {
  const dentro = nota('dentro', 0, 0);
  const fora = nota('fora', 5000, 5000);
  const longe = nota('longe', 9000, 9000);
  const ligada = novaSeta({ quadroId: Q, de: { itemId: 'dentro', lado: 'auto' }, para: { itemId: 'fora', lado: 'auto' } }, 1, 's1');
  const solta = novaSeta({ quadroId: Q, de: { ponto: [8000, 8000] }, para: { itemId: 'longe', lado: 'auto' } }, 1, 's2');
  const todos = new Map<string, Item>([dentro, fora, longe, ligada, solta].map((i) => [i.id, i]));
  const r = itensDaRegiao(todos, { x: -10, y: -10, largura: 200, altura: 200 });
  assert.deepEqual([...r.keys()].sort(), ['dentro', 'fora', 's1']);
});

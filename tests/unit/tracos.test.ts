import assert from 'node:assert/strict';
import { test } from 'node:test';
import { novoTraco } from '../../src/dominio/quadro.ts';
import {
  caminhoDoTraco,
  normalizarTraco,
  simplificar,
  tracoToca,
  type PontoTraco,
} from '../../src/dominio/tracos.ts';

test('simplificar reduz pontos colineares e mantém as pontas', () => {
  const pontos: PontoTraco[] = [
    [0, 0, 0.5],
    [10, 0.2, 0.5],
    [20, -0.1, 0.5],
    [30, 0, 0.5],
    [40, 20, 0.8],
  ];
  const res = simplificar(pontos, 1);
  assert.equal(res.length, 3);
  assert.deepEqual(res[0], [0, 0, 0.5]);
  assert.deepEqual(res[res.length - 1], [40, 20, 0.8]);
});

test('normalizarTraco calcula caixa e coordenadas relativas', () => {
  const norm = normalizarTraco([
    [100, 200, 0.4],
    [150, 230, 0.6],
    [120, 260, 0.5],
  ]);
  assert.equal(norm.x, 100);
  assert.equal(norm.y, 200);
  assert.equal(norm.largura, 50);
  assert.equal(norm.altura, 60);
  assert.deepEqual(norm.pontos[0], [0, 0, 0.4]);
  assert.deepEqual(norm.pontos[1], [50, 30, 0.6]);
  assert.deepEqual(norm.pontos[2], [20, 60, 0.5]);
});

test('caminhoDoTraco gera SVG válido para caneta e marca-texto', () => {
  const pts: PontoTraco[] = [
    [0, 0, 0.5],
    [20, 10, 0.7],
    [40, 0, 0.4],
  ];
  const dCaneta = caminhoDoTraco({ pontos: pts, ferramenta: 'caneta', espessura: 4 });
  const dMarca = caminhoDoTraco({ pontos: pts, ferramenta: 'marca-texto', espessura: 16 });
  assert.match(dCaneta, /^M .* Z$/);
  assert.match(dMarca, /^M .* Z$/);
});

test('tracoToca detecta toque próximo ao traço e ignora pontos distantes', () => {
  const traco = novoTraco(
    {
      quadroId: 'q1',
      x: 100,
      y: 100,
      largura: 100,
      altura: 4,
      pontos: [
        [0, 0, 0.5],
        [100, 0, 0.5],
      ],
      espessura: 4,
    },
    1,
    't1',
  );
  assert.equal(tracoToca(traco, { x: 150, y: 105 }, 8), true);
  assert.equal(tracoToca(traco, { x: 150, y: 140 }, 8), false);
});

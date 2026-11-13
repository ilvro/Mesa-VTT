import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  caixaVisivel,
  enquadrar,
  itensVisiveis,
  mundoParaTela,
  telaParaMundo,
  ZOOM_MAX,
  ZOOM_MIN,
  zoomEm,
} from '../../src/dominio/camera.ts';

test('telaParaMundo e mundoParaTela são inversas', () => {
  const cam = { x: -120, y: 80, zoom: 1.5 };
  const tela = { x: 340, y: 210 };
  const mundo = telaParaMundo(cam, tela);
  const volta = mundoParaTela(cam, mundo);
  assert.ok(Math.abs(volta.x - tela.x) < 1e-9);
  assert.ok(Math.abs(volta.y - tela.y) < 1e-9);
});

test('zoomEm mantém fixo o ponto do mundo sob o cursor e respeita limites', () => {
  const cam = { x: 100, y: 50, zoom: 1 };
  const cursor = { x: 400, y: 300 };
  const mundoAntes = telaParaMundo(cam, cursor);

  const camZoom = zoomEm(cam, cursor, 2);
  assert.equal(camZoom.zoom, 2);
  const mundoDepois = telaParaMundo(camZoom, cursor);
  assert.ok(Math.abs(mundoDepois.x - mundoAntes.x) < 1e-9);
  assert.ok(Math.abs(mundoDepois.y - mundoAntes.y) < 1e-9);

  // Limites mínimo (0.02) e máximo (4)
  assert.equal(zoomEm(cam, cursor, 0.0001).zoom, ZOOM_MIN);
  assert.equal(zoomEm(cam, cursor, 1000).zoom, ZOOM_MAX);
});

test('enquadrar centraliza a caixa com a margem e limita o zoom', () => {
  const cam = enquadrar(
    { x: 100, y: 200, largura: 400, altura: 200 },
    { largura: 1000, altura: 600 },
    100,
  );
  // Espaço disponível: 800x400 -> min(800/400, 400/200) = 2
  assert.equal(cam.zoom, 2);
  // Centro da caixa (300, 300) deve cair no centro da tela (500, 300)
  const centroTela = mundoParaTela(cam, { x: 300, y: 300 });
  assert.ok(Math.abs(centroTela.x - 500) < 1e-9);
  assert.ok(Math.abs(centroTela.y - 300) < 1e-9);
});

test('itensVisiveis filtra por interseção considerando rotação e margem', () => {
  const itens = [
    { id: 'dentro', x: 100, y: 100, largura: 50, altura: 50, rotacao: 0 },
    { id: 'fora', x: 1000, y: 1000, largura: 50, altura: 50, rotacao: 0 },
    // Retângulo largo cujo canto rodado a 90° entra na caixa visível (x=0..300, y=0..300)
    { id: 'rodado', x: 250, y: 150, largura: 20, altura: 200, rotacao: 90 },
  ];

  const vis = caixaVisivel({ x: 0, y: 0, zoom: 1 }, { largura: 300, altura: 300 });
  const achados = itensVisiveis(itens, vis, 0).map((i) => i.id);
  assert.deepEqual(achados, ['dentro', 'rodado']);

  const comMargem = itensVisiveis(itens, vis, 800).map((i) => i.id);
  assert.deepEqual(comMargem, ['dentro', 'fora', 'rodado']);
});

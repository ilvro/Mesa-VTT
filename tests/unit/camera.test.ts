import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  caixaVisivel,
  enquadrar,
  itensVisiveis,
  mundoParaTela,
  pinca,
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

test('pinca mantém o ponto médio fixo, dobra o zoom com o dobro da distância e respeita limites', () => {
  const cam = { x: 100, y: 50, zoom: 1 };
  const p1a = { x: 300, y: 300 };
  const p2a = { x: 500, y: 300 };
  const mundoAntes = telaParaMundo(cam, { x: 400, y: 300 });

  // Só afastar os dedos, com o mesmo ponto médio: zoom dobra, ponto do mundo fica sob o médio.
  const c = pinca(cam, p1a, p2a, { x: 200, y: 300 }, { x: 600, y: 300 });
  assert.equal(c.zoom, 2);
  const depois = telaParaMundo(c, { x: 400, y: 300 });
  assert.ok(Math.abs(depois.x - mundoAntes.x) < 1e-9);
  assert.ok(Math.abs(depois.y - mundoAntes.y) < 1e-9);

  // Mover os dois dedos juntos (mesma distância) só arrasta a câmera.
  const arrasto = pinca(cam, p1a, p2a, { x: 350, y: 340 }, { x: 550, y: 340 });
  assert.equal(arrasto.zoom, 1);
  const sob = telaParaMundo(arrasto, { x: 450, y: 340 });
  assert.ok(Math.abs(sob.x - mundoAntes.x) < 1e-9);
  assert.ok(Math.abs(sob.y - mundoAntes.y) < 1e-9);

  // Limites e distância inicial zero.
  assert.equal(pinca(cam, p1a, p2a, { x: 0, y: 300 }, { x: 100000, y: 300 }).zoom, ZOOM_MAX);
  assert.equal(pinca(cam, p1a, p2a, { x: 400, y: 300 }, { x: 400.001, y: 300 }).zoom, ZOOM_MIN);
  assert.equal(pinca(cam, p1a, p1a, p1a, { x: 900, y: 300 }).zoom, 1);
});

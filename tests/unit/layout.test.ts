import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alternarPainel, LAYOUT_PADRAO, lerLayout, PRESETS, presetDe, redimensionar, visiveis, type Layout } from '../../src/dominio/layout.ts';

const soma = (l: Layout) => visiveis(l).reduce((a, p) => a + p.peso, 0);
const peso = (l: Layout, id: string) => l.find(p => p.id === id)!.peso;

test('presets: cada um tem os quatro painéis, ao menos um visível, e o padrão é o inicial', () => {
  for (const [id, l] of Object.entries(PRESETS)) { assert.deepEqual(l.map(p => p.id), ['atlas', 'fichas', 'jukebox', 'diario'], id); assert.ok(visiveis(l).length >= 1, id); }
  assert.equal(LAYOUT_PADRAO, PRESETS.padrao);
  assert.deepEqual(visiveis(PRESETS['so-mapa']).map(p => p.id), ['atlas']);
  assert.deepEqual(visiveis(PRESETS['mapa-e-fichas']).map(p => p.id), ['atlas', 'fichas']);
  assert.deepEqual(visiveis(PRESETS['com-diario']).map(p => p.id), ['atlas', 'fichas', 'diario']);
  assert.deepEqual(visiveis(PRESETS.padrao).map(p => p.id), ['atlas', 'fichas', 'jukebox'], 'o diário só aparece quando pedido');
});

test('presetDe: reconhece o preset (mesmo em outra escala) e devolve null para um ajuste à mão', () => {
  assert.equal(presetDe(PRESETS['mapa-grande']), 'mapa-grande');
  assert.equal(presetDe(PRESETS.padrao.map(p => ({ ...p, peso: p.peso * 10 }))), 'padrao');
  assert.equal(presetDe(redimensionar(PRESETS.padrao, 0, 150, 1200)), null);
});

test('redimensionar: arrastar o divisor para a direita cresce o da esquerda e encolhe o da direita, sem mudar o total', () => {
  const antes = PRESETS.padrao, depois = redimensionar(antes, 0, 100, 1220);   // 1220 px / 6.1 pesos = 200 px por peso
  assert.ok(Math.abs(peso(depois, 'atlas') - (3 + 0.5)) < 1e-9);
  assert.ok(Math.abs(peso(depois, 'fichas') - (2 - 0.5)) < 1e-9);
  assert.equal(peso(depois, 'jukebox'), 1.1, 'o resto não muda');
  assert.ok(Math.abs(soma(depois) - soma(antes)) < 1e-9);
});

test('redimensionar: respeita a largura mínima dos dois lados', () => {
  const l = PRESETS.padrao;   // 200 px por peso: fichas 400 px, jukebox 220 px
  const muito = redimensionar(l, 1, 5000, 1220);
  assert.ok(Math.abs(peso(muito, 'jukebox') * 200 - 200) < 1e-6, 'o Jukebox para em 200 px');
  const pouco = redimensionar(l, 1, -5000, 1220);
  assert.ok(Math.abs(peso(pouco, 'fichas') * 200 - 200) < 1e-6, 'as fichas param em 200 px');
  assert.ok(Math.abs(soma(muito) - soma(l)) < 1e-9 && Math.abs(soma(pouco) - soma(l)) < 1e-9);
});

test('redimensionar: com painéis escondidos o divisor é entre os visíveis; índice ou largura inválidos não mudam nada', () => {
  const l = PRESETS['mapa-e-fichas'], depois = redimensionar(l, 0, 100, 1000);
  assert.ok(peso(depois, 'atlas') > 3 && peso(depois, 'fichas') < 2); assert.equal(peso(depois, 'jukebox'), 1, 'o escondido não muda');
  assert.equal(redimensionar(l, 1, 100, 1000), l, 'só há um divisor');
  assert.equal(redimensionar(l, 5, 100, 1000), l);
  assert.equal(redimensionar(l, 0, 100, 0), l);
  assert.equal(redimensionar(PRESETS['so-mapa'], 0, 100, 1000), PRESETS['so-mapa']);
});

test('redimensionar: quando os dois não cabem no mínimo, divide por igual em vez de inverter', () => {
  const l = PRESETS.padrao, r = redimensionar(l, 0, 10, 300);   // 300 px para 6.1 pesos: tudo abaixo do mínimo
  assert.ok(peso(r, 'atlas') > 0 && peso(r, 'fichas') > 0);
  assert.ok(Math.abs(soma(r) - soma(l)) < 1e-9);
});

test('alternarPainel: esconde e mostra, mas nunca deixa a tela sem painel', () => {
  let l: Layout = PRESETS.padrao;
  l = alternarPainel(l, 'jukebox'); assert.deepEqual(visiveis(l).map(p => p.id), ['atlas', 'fichas']);
  l = alternarPainel(l, 'fichas'); assert.deepEqual(visiveis(l).map(p => p.id), ['atlas']);
  assert.equal(alternarPainel(l, 'atlas'), l, 'o último visível não some');
  l = alternarPainel(l, 'jukebox'); assert.deepEqual(visiveis(l).map(p => p.id), ['atlas', 'jukebox']);
  assert.equal(peso(l, 'jukebox'), 1.1, 'o peso é lembrado ao voltar');
});

test('lerLayout: aceita um layout válido; lixo, repetição, peso ruim ou tudo escondido voltam ao padrão', () => {
  const ok = [{ id: 'jukebox', peso: 1, visivel: true }, { id: 'atlas', peso: 4, visivel: true }, { id: 'diario', peso: 1.5, visivel: false }, { id: 'fichas', peso: 2, visivel: false }];
  assert.deepEqual(lerLayout(ok), ok, 'a ordem guardada vale');
  for (const ruim of [null, 'x', [], [ok[0]], [...ok.slice(0, 3), { id: 'atlas', peso: 1, visivel: true }], ok.slice(0, 3), ok.map(p => ({ ...p, peso: 0 })), ok.map(p => ({ ...p, peso: NaN })), ok.map(p => ({ ...p, visivel: false })), ok.map(p => ({ ...p, id: 'outro' })), ok.map(p => ({ ...p, visivel: 'sim' }))]) assert.equal(lerLayout(ruim), LAYOUT_PADRAO);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aparenciaDaAtmosfera, atmosferaPedidaPeloDossie, batimentoDoDossie, estadoCriticoDaFicha, recursoCritico } from '../../../src/jogar/atmosfera-critica.ts';

const janela = {}, outra = {};

test('limiares: aviso a 50%, vinheta a 35%, crítico a 25%', () => {
  assert.equal(recursoCritico(6, 10).warning, false);
  assert.equal(recursoCritico(5, 10).warning, true);
  assert.equal(recursoCritico(4, 10).vignette, false);
  assert.equal(recursoCritico(3, 10).vignette, true);
  assert.equal(recursoCritico(3, 10).special, false);
  assert.equal(recursoCritico(2, 10).special, true);
  assert.equal(recursoCritico(0, 10).specialIntensity, 1);
  assert.equal(recursoCritico(0, 0).warning, false, 'sem máximo não há estado');
});

test('Ordem 2 usa PV e PD', () => {
  const e = estadoCriticoDaFicha({ id: 'a', systemMode: 'ordem2', pv: 2, maxPv: 20, pd: 10, maxPd: 10 });
  assert.equal(e.pv.critical, true); assert.equal(e.pd.critical, false); assert.equal(e.active, true);
});

test('Ordem 1 usa Sanidade, ou PE com a regra de PD', () => {
  const base = { id: 'a', systemMode: 'original', pv: 10, maxPv: 10, san: 2, maxSan: 20, pe: 10, maxPe: 10 };
  assert.equal(estadoCriticoDaFicha(base).pd.critical, true);
  assert.equal(estadoCriticoDaFicha({ ...base, usaPD: true }).pd.critical, false);
  assert.equal(estadoCriticoDaFicha({ ...base, usaPD: true, pe: 1 }).pd.critical, true);
});

test('ameaça e ficha ausente não têm atmosfera', () => {
  assert.equal(estadoCriticoDaFicha({ id: 't', systemMode: 'threat', pv: 0, maxPv: 10 }).active, false);
  assert.equal(estadoCriticoDaFicha(null).active, false);
});

test('aparência respeita os efeitos desligados', () => {
  const estado = estadoCriticoDaFicha({ id: 'a', systemMode: 'ordem2', pv: 1, maxPv: 20, pd: 1, maxPd: 10 });
  const a = aparenciaDaAtmosfera({ fichaId: 'a', estado, efeitos: { pv: true, pd: false } });
  assert.equal(a.pvSpecial, true); assert.equal(a.pdSpecial, false); assert.equal(a.combinado, false);
  assert.ok(Number(a.vars['--pv-vignette-rest']) > 0.1);
});

test('só o aviso do iframe do Dossiê, na mesma origem e bem formado, vale', () => {
  const r = recursoCritico(1, 10);
  const msg = { tipo: 'dossie.atmosfera-critica', fichaId: 'a', pv: r, pd: r, efeitos: { pv: true, pd: false } };
  const ok = atmosferaPedidaPeloDossie({ source: janela, origin: 'http://a', data: msg }, janela, 'http://a');
  assert.equal(ok?.fichaId, 'a'); assert.equal(ok?.efeitos.pd, false); assert.equal(ok?.estado.active, true);
  assert.equal(atmosferaPedidaPeloDossie({ source: outra, origin: 'http://a', data: msg }, janela, 'http://a'), null);
  assert.equal(atmosferaPedidaPeloDossie({ source: janela, origin: 'http://b', data: msg }, janela, 'http://a'), null);
  assert.equal(atmosferaPedidaPeloDossie({ source: janela, origin: 'http://a', data: { ...msg, pv: {} } }, janela, 'http://a'), null);
  assert.equal(atmosferaPedidaPeloDossie({ source: janela, origin: 'http://a', data: { ...msg, tipo: 'x' } }, janela, 'http://a'), null);
  assert.equal(atmosferaPedidaPeloDossie({ source: janela, origin: 'http://a', data: msg }, null, 'http://a'), null);
});

test('batimento só do iframe do Dossiê', () => {
  const d = { tipo: 'dossie.batimento-critico' };
  assert.equal(batimentoDoDossie({ source: janela, origin: 'http://a', data: d }, janela, 'http://a'), true);
  assert.equal(batimentoDoDossie({ source: outra, origin: 'http://a', data: d }, janela, 'http://a'), false);
  assert.equal(batimentoDoDossie({ source: janela, origin: 'http://b', data: d }, janela, 'http://a'), false);
  assert.equal(batimentoDoDossie({ source: janela, origin: 'http://a', data: null }, janela, 'http://a'), false);
});

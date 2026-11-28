import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dossiePronto, fichaCobreOMapa, mensagemDeVista, mensagemDoJogador, projetorPronto, vistaDaFicha, vistaPedidaPeloDossie } from '../../../src/jogar/vista-ficha.ts';

const janela = {}, outra = {};
const pedido = { tipo: 'dossie.pedir-vista', vista: 'completa' };

test('só o pedido do iframe do Dossiê, na mesma origem e bem formado, vale', () => {
  assert.equal(vistaPedidaPeloDossie({ source: janela, origin: 'http://a', data: pedido }, janela, 'http://a'), 'completa');
  assert.equal(vistaPedidaPeloDossie({ source: janela, origin: 'http://a', data: { ...pedido, vista: 'card' } }, janela, 'http://a'), 'card');
  assert.equal(vistaPedidaPeloDossie({ source: outra, origin: 'http://a', data: pedido }, janela, 'http://a'), null, 'outra janela');
  assert.equal(vistaPedidaPeloDossie({ source: janela, origin: 'http://b', data: pedido }, janela, 'http://a'), null, 'outra origem');
  assert.equal(vistaPedidaPeloDossie({ source: janela, origin: 'http://a', data: pedido }, null, 'http://a'), null, 'iframe sem janela');
  assert.equal(vistaPedidaPeloDossie({ source: janela, origin: 'http://a', data: { tipo: 'dossie.vista', vista: 'completa' } }, janela, 'http://a'), null, 'tipo errado');
  assert.equal(vistaPedidaPeloDossie({ source: janela, origin: 'http://a', data: { ...pedido, vista: 'x' } }, janela, 'http://a'), null, 'vista inválida');
  assert.equal(vistaPedidaPeloDossie({ source: janela, origin: 'http://a', data: null }, janela, 'http://a'), null);
});

test('fora do celular, a vista segue o pedido; no celular vertical, a aba', () => {
  assert.equal(vistaDaFicha({ celularVertical: false, aba: 'mapa', aberta: false }), 'card');
  assert.equal(vistaDaFicha({ celularVertical: false, aba: 'mapa', aberta: true }), 'completa');
  assert.equal(vistaDaFicha({ celularVertical: true, aba: 'ficha', aberta: false }), 'completa');
  assert.equal(vistaDaFicha({ celularVertical: true, aba: 'mapa', aberta: true }), 'card');
});

test('a tela toda só fora do celular; a mensagem da vista é a do protocolo do Dossiê', () => {
  assert.equal(fichaCobreOMapa({ celularVertical: false, aberta: true }), true);
  assert.equal(fichaCobreOMapa({ celularVertical: false, aberta: false }), false);
  assert.equal(fichaCobreOMapa({ celularVertical: true, aberta: true }), false);
  assert.deepEqual(mensagemDeVista('card'), { tipo: 'dossie.vista', vista: 'card' });
  assert.deepEqual(mensagemDoJogador(['f1', 'f2']), { tipo: 'jogador', fichas: ['f1', 'f2'] });
});

test('projetorPronto só aceita mensagem do iframe do projetor na mesma origem', () => {
  assert.equal(projetorPronto({ source: janela, origin: 'http://a', data: { tipo: 'projetor.pronto' } }, janela, 'http://a'), true);
  assert.equal(projetorPronto({ source: outra, origin: 'http://a', data: { tipo: 'projetor.pronto' } }, janela, 'http://a'), false);
  assert.equal(projetorPronto({ source: janela, origin: 'http://b', data: { tipo: 'projetor.pronto' } }, janela, 'http://a'), false);
  assert.equal(projetorPronto({ source: janela, origin: 'http://a', data: { tipo: 'outro' } }, janela, 'http://a'), false);
  assert.equal(projetorPronto({ source: janela, origin: 'http://a', data: null }, janela, 'http://a'), false);
  assert.equal(projetorPronto({ source: janela, origin: 'http://a', data: { tipo: 'projetor.pronto' } }, null, 'http://a'), false);
});

test('dossiePronto só aceita mensagem do iframe do Dossiê na mesma origem', () => {
  assert.equal(dossiePronto({ source: janela, origin: 'http://a', data: { tipo: 'dossie.pronto' } }, janela, 'http://a'), true);
  assert.equal(dossiePronto({ source: outra, origin: 'http://a', data: { tipo: 'dossie.pronto' } }, janela, 'http://a'), false);
  assert.equal(dossiePronto({ source: janela, origin: 'http://b', data: { tipo: 'dossie.pronto' } }, janela, 'http://a'), false);
  assert.equal(dossiePronto({ source: janela, origin: 'http://a', data: { tipo: 'outro' } }, janela, 'http://a'), false);
  assert.equal(dossiePronto({ source: janela, origin: 'http://a', data: null }, janela, 'http://a'), false);
  assert.equal(dossiePronto({ source: janela, origin: 'http://a', data: { tipo: 'dossie.pronto' } }, null, 'http://a'), false);
});

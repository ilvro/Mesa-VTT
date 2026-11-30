import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enderecoDoSeletor, mensagemDoSeletor, resolverEscolha } from '../../../src/jogar/seletor-dossie.ts';

const janela = {}, outra = {};
const ev = (data: unknown, o: Partial<{ source: unknown; origin: string }> = {}) => ({ source: janela, origin: 'http://a', data, ...o });

test('mensagens do seletor só valem do iframe certo, na mesma origem', () => {
  const m = { tipo: 'dossie.seletor-escolheu', ficha: { id: 'f1', name: 'Ana' } };
  assert.deepEqual(mensagemDoSeletor(ev(m), janela, 'http://a'), { tipo: 'escolheu', ficha: { id: 'f1', name: 'Ana' } });
  assert.equal(mensagemDoSeletor(ev(m, { source: outra }), janela, 'http://a'), null);
  assert.equal(mensagemDoSeletor(ev(m, { origin: 'http://b' }), janela, 'http://a'), null);
  assert.equal(mensagemDoSeletor(ev(m), null, 'http://a'), null);
});

test('mensagens malformadas são ignoradas', () => {
  assert.equal(mensagemDoSeletor(ev({ tipo: 'dossie.seletor-escolheu' }), janela, 'http://a'), null);
  assert.equal(mensagemDoSeletor(ev({ tipo: 'dossie.seletor-escolheu', ficha: { name: 'x' } }), janela, 'http://a'), null);
  assert.equal(mensagemDoSeletor(ev({ tipo: 'dossie.seletor-escolheu', ficha: [] }), janela, 'http://a'), null);
  assert.equal(mensagemDoSeletor(ev({ tipo: 'outra' }), janela, 'http://a'), null);
  assert.equal(mensagemDoSeletor(ev(null), janela, 'http://a'), null);
});

test('pronto, nova e importar JSON', () => {
  assert.deepEqual(mensagemDoSeletor(ev({ tipo: 'dossie.seletor-pronto' }), janela, 'http://a'), { tipo: 'pronto' });
  assert.deepEqual(mensagemDoSeletor(ev({ tipo: 'dossie.seletor-nova' }), janela, 'http://a'), { tipo: 'nova' });
  assert.deepEqual(mensagemDoSeletor(ev({ tipo: 'dossie.seletor-importar-json' }), janela, 'http://a'), { tipo: 'importar-json' });
});

test('escolha: ficha já na sala só seleciona; nova é importada', () => {
  assert.deepEqual(resolverEscolha({ id: 'f1' }, [{ id: 'f1' }]), { acao: 'escolher', id: 'f1' });
  assert.deepEqual(resolverEscolha({ id: 'f2' }, [{ id: 'f1' }]), { acao: 'importar' });
});

test('endereço do seletor', () => {
  assert.equal(enderecoDoSeletor('http://x/Dossie/'), 'http://x/Dossie/?modo=seletor');
  assert.equal(enderecoDoSeletor('http://x/?a=1'), 'http://x/?a=1&modo=seletor');
});

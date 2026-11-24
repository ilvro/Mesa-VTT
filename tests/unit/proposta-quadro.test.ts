import assert from 'node:assert/strict';
import { test } from 'node:test';
import { caixaEnvolventeDeItem } from '../../src/dominio/camera.ts';
import { posicaoLivre, montarProposta, tamanhoDaProposta } from '../../src/dominio/proposta-quadro.ts';
import { PALETA_PADRAO } from '../../src/dominio/paleta.ts';
import { novaNotaAdesiva, validarItem, type Item } from '../../src/dominio/quadro.ts';
import { resumoDaRevisao } from '../../src/dominio/revisao.ts';

const nota = (id: string, x: number, y: number, l = 200, a = 100) => novaNotaAdesiva({ quadroId: 'q', x, y, largura: l, altura: a }, 1, id) as Item;
const sobrepoe = (a: { x: number; y: number; largura: number; altura: number }, b: typeof a) =>
  a.x < b.x + b.largura && a.x + a.largura > b.x && a.y < b.y + b.altura && a.y + a.altura > b.y;

test('posicaoLivre: sem itens e sem perto fica na origem; com itens, à direita de tudo', () => {
  assert.deepEqual(posicaoLivre({ largura: 100, altura: 100 }, [], null), { x: 0, y: 0 });
  const p = posicaoLivre({ largura: 100, altura: 100 }, [nota('a', 0, 0), nota('b', 500, 50)], null);
  assert.equal(p.x, 780);
});

test('posicaoLivre: à direita da seção com 80 px; pula o que estiver no caminho e desce para baixo', () => {
  const perto = { x: 0, y: 0, largura: 400, altura: 300 };
  assert.deepEqual(posicaoLivre({ largura: 200, altura: 100 }, [nota('s', 0, 0, 400, 300)], perto), { x: 480, y: 0 });
  const itens = [nota('s', 0, 0, 400, 300), nota('v', 480, 0, 300, 100)];
  const p = posicaoLivre({ largura: 200, altura: 100 }, itens, perto);
  for (const i of itens) {
    const c = caixaEnvolventeDeItem(i);
    assert.ok(!sobrepoe({ ...p, largura: 200, altura: 100 }, { x: c.x - 40, y: c.y - 40, largura: c.largura + 80, altura: c.altura + 80 }));
  }
  // direita totalmente bloqueada: vai para baixo
  const parede = Array.from({ length: 70 }, (_, i) => nota(`p${i}`, 480, i * 60, 300, 60));
  const q = posicaoLivre({ largura: 200, altura: 100 }, [nota('s', 0, 0, 400, 300), ...parede], perto);
  assert.equal(q.y, 380);
});

test('posicaoLivre: nunca sobrepõe e é rápida com 10 mil itens', () => {
  const itens = Array.from({ length: 10000 }, (_, i) => nota(`n${i}`, (i % 100) * 250, Math.floor(i / 100) * 150));
  const t = Date.now();
  const p = posicaoLivre({ largura: 400, altura: 300 }, itens, { x: 0, y: 0, largura: 600, altura: 400 });
  assert.ok(Date.now() - t < 500);
  for (const i of itens) assert.ok(!sobrepoe({ ...p, largura: 400, altura: 300 }, i));
});

test('montarProposta: moldura, grade de 3 colunas, cores e revisão', () => {
  let n = 0;
  const pr = montarProposta('Ganchos', [{ texto: 'a', tipo: 'teste' }, { texto: 'b' }, { texto: 'c' }, { texto: 'd', tipo: 'segredo' }], { quadroId: 'q', x: 1000, y: 500, agora: 5, novoId: () => `id${n++}` });
  assert.equal(pr.moldura.titulo, '✦ Ganchos');
  assert.equal(pr.notas.length, 4);
  assert.deepEqual({ largura: pr.moldura.largura, altura: pr.moldura.altura }, tamanhoDaProposta(4));
  assert.deepEqual(pr.notas.map(i => [i.x, i.y]), [[1024, 548], [1288, 548], [1552, 548], [1024, 732]]);
  assert.ok(pr.notas.every(i => i.molduraId === pr.moldura.id && i.largura === 240 && i.altura === 160));
  assert.equal(pr.notas[0]!.caixa.fundo, PALETA_PADRAO.teste);
  assert.equal(pr.notas[0]!.semantica, 'teste');
  assert.equal(pr.notas[1]!.semantica, null);
  assert.notEqual(pr.notas[1]!.caixa.fundo, PALETA_PADRAO.teste);
  for (const i of pr.itens) {
    assert.equal(i.revisao?.origem, 'assistente');
    assert.deepEqual(i.revisao?.motivos, ['Proposta do assistente']);
    validarItem(i, 'i');
  }
  assert.equal(pr.notas[3]!.revisao?.tipoSugerido, 'segredo');
  assert.ok(pr.notas.every(i => i.x + i.largura <= pr.moldura.x + pr.moldura.largura && i.y + i.altura <= pr.moldura.y + pr.moldura.altura));
  const r = resumoDaRevisao(pr.itens);
  assert.equal(r.assistente.length, 5);
});

test('montarProposta: erros legíveis', () => {
  const o = { quadroId: 'q', x: 0, y: 0, agora: 1, novoId: () => 'x' };
  assert.throws(() => montarProposta(' ', [{ texto: 'a' }], o), /título/);
  assert.throws(() => montarProposta('T', [], o), /ao menos uma/);
  assert.throws(() => montarProposta('T', Array.from({ length: 31 }, () => ({ texto: 'a' })), o), /máximo por chamada/);
  assert.throws(() => montarProposta('T', [{ texto: 'a'.repeat(2001) }], o), /2000/);
  assert.throws(() => montarProposta('T', [{ texto: '' }], o), /sem texto/);
  assert.throws(() => montarProposta('T', [{ texto: 'a', tipo: 'foo' }], o), /Tipos:/);
  assert.equal(montarProposta('T', Array.from({ length: 30 }, () => ({ texto: 'a' })), o).notas.length, 30);
});

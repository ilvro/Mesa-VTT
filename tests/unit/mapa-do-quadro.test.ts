import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mapaDoQuadro, tokensEmPortugues } from '../../src/dominio/mapa-do-quadro.ts';
import type { DocRico, Item } from '../../src/dominio/quadro.ts';
import { novaImagem, novaMoldura, novaNotaAdesiva, novaSeta } from '../../src/dominio/quadro.ts';

const Q = 'q1';
const doc = (...linhas: string[]): DocRico => ({
  type: 'doc',
  content: linhas.map((t) => ({ type: 'paragraph', content: [{ type: 'text', text: t }] })),
});
const nota = (id: string, x: number, y: number, texto: string, extra: Partial<Item> = {}) =>
  ({
    ...novaNotaAdesiva({ quadroId: Q, x, y, largura: 200, altura: 100, doc: doc(texto) }, 1, id),
    ...extra,
  }) as Item;
const mold = (id: string, x: number, y: number, l: number, a: number, titulo: string, mae: string | null = null) =>
  ({ ...novaMoldura({ quadroId: Q, x, y, largura: l, altura: a, titulo }, 1, id), molduraId: mae }) as Item;
const img = (id: string, x: number, y: number, extra: Partial<Item> = {}) =>
  ({
    ...novaImagem({ quadroId: Q, x, y, imagemId: 'i', larguraOriginal: 800, alturaOriginal: 600, largura: 200, altura: 100 }, 1, id),
    ...extra,
  }) as Item;
const quadro = { nome: 'Campanha do Corvo' };

function cena(): Item[] {
  return [
    mold('m1', 0, 0, 1000, 800, 'Capítulo 1'),
    nota('a1', 50, 50, 'A estalagem do Corvo. Chove.', { molduraId: 'm1', semantica: 'leitura' }),
    nota('a2', 50, 200, 'Pegadas na lama', { molduraId: 'm1', semantica: 'teste' }),
    nota('a3', 300, 200, 'Cofre', { molduraId: 'm1', semantica: 'leitura' }),
    nota('a4', 300, 50, 'Anotação sem tipo', { molduraId: 'm1' }),
    img('i1', 600, 50, { molduraId: 'm1' }),
    img('i2', 600, 300, { molduraId: 'm1', legenda: 'Mapa da vila' }),
    mold('f1', 100, 450, 500, 300, 'Porão', 'm1'),
    nota('f2', 150, 500, 'Barris velhos', { molduraId: 'f1' }),
    mold('m2', 1600, 0, 1000, 800, 'Capítulo 2'),
    nota('b1', 1650, 50, 'O vilarejo', { molduraId: 'm2' }),
    mold('m3', 0, 1500, 1000, 600, 'Epílogo'),
    nota('c1', 50, 1550, 'Fim', { molduraId: 'm3' }),
    novaSeta({ quadroId: Q, de: { itemId: 'a1', lado: 'direita' }, para: { itemId: 'b1', lado: 'esquerda' }, rotulo: 'depois' }, 1, 's1'),
  ];
}

test('formato, contagens, vizinha, ligações e recuo', () => {
  const r = mapaDoQuadro(quadro, cena());
  console.log(r.texto);
  const linhas = r.texto.split('\n');
  assert.match(linhas[0]!, /^Quadro "Campanha do Corvo": 4 seções, 9 itens, ~\d+ tokens\.$/);
  assert.equal(linhas[1], "1 imagem sem legenda nem descrição.");
  const l1 = linhas.find((l) => l.startsWith('§ m1 '))!;
  assert.ok(l1.includes('— 6 itens (2 leitura, 1 teste, 1 outro, 2 imagens) · ~'), l1);
  assert.ok(l1.includes('à esquerda de "Capítulo 2"'), l1);
  assert.ok(l1.includes('→ "Capítulo 2" (depois)'), l1);
  const l2 = linhas.find((l) => l.includes('§ m2 '))!;
  assert.ok(l2.includes('← "Capítulo 1" (depois)'), l2);
  const filha = linhas.find((l) => l.includes('§ f1 '))!;
  assert.ok(filha.startsWith('  § f1 "Porão" — 1 item'), filha);
  assert.ok(!filha.includes('acima de') && !filha.includes('abaixo de'));
  const epilogo = linhas.find((l) => l.startsWith('§ m3 '))!;
  assert.ok(epilogo.includes('abaixo de "Capítulo 1"'), epilogo);
  assert.equal(linhas.indexOf(filha), linhas.indexOf(l1) + 1);
  assert.equal(r.secoes.length, 4);
});

test('resumos: desatualizado, mestre e descrição de imagem', () => {
  const resumos = new Map([
    ['m1', { texto: 'Chegada à estalagem.', desatualizado: true }],
    ['m2', { texto: 'A vila.', desatualizado: false, autor: 'mestre' as const }],
    ['item:i1', { texto: 'Retrato do barão', desatualizado: false }],
  ]);
  const r = mapaDoQuadro(quadro, cena(), { resumos });
  assert.ok(r.texto.includes('  resumo: Chegada à estalagem. (resumo desatualizado)'));
  assert.ok(r.texto.includes('(escrito pelo mestre: não troque sem pedir)'));
  assert.ok(!r.texto.includes('sem legenda nem descrição'));
});

test('números em português', () => {
  assert.equal(tokensEmPortugues(850), '~850 tokens');
  assert.equal(tokensEmPortugues(1930), '~1,9 mil tokens');
  assert.equal(tokensEmPortugues(2000), '~2 mil tokens');
});

test('corte por limite: soltos e ilhas pequenas viram linhas por região; depois primeira frase', () => {
  const itens: Item[] = [mold('m1', 0, 0, 1000, 800, 'Capítulo 1'), nota('a1', 50, 50, 'x'.repeat(40), { molduraId: 'm1' })];
  // 30 ilhas de 1 nota grande, espalhadas
  for (let i = 0; i < 30; i++) {
    itens.push(nota(`ilha${i}`, 2000 + (i % 6) * 800, 100 + Math.floor(i / 6) * 800, `Nota solta número ${i}`, { largura: 300, altura: 300 } as Partial<Item>));
  }
  const cheio = mapaDoQuadro(quadro, itens, { limiteTokens: 100000 });
  assert.ok(!cheio.texto.includes('grupos pequenos'));
  const r = mapaDoQuadro(quadro, itens, { limiteTokens: 300 });
  console.log(r.texto);
  assert.ok(r.tokens < cheio.tokens);
  assert.match(r.texto, /· \d+ grupos pequenos perto de "Capítulo 1"/);
  assert.match(r.texto, /\(\d+ seções resumidas assim/);
  assert.ok(r.texto.includes('§ m1 '));

  const resumos = new Map([['m1', { texto: 'Primeira frase. Segunda frase longa.', desatualizado: false }]]);
  const folgado = mapaDoQuadro(quadro, itens, { resumos, limiteTokens: 100000 });
  assert.ok(folgado.texto.includes('Segunda frase longa.'));
  const apertado = mapaDoQuadro(quadro, itens, { resumos, limiteTokens: 50 });
  assert.ok(apertado.texto.includes('resumo: Primeira frase.\n') || apertado.texto.includes('resumo: Primeira frase.'));
  assert.ok(!apertado.texto.includes('Segunda frase longa.'));
});

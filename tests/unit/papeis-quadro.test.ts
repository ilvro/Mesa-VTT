import assert from 'node:assert/strict';
import { test } from 'node:test';
import { achatarPedidos, larguraDeUmaLinha, montarInsercao, type EntradaPedida, type ItemPedido } from '../../src/dominio/insercao-quadro.ts';
import type { DocRico, Item, NoRico } from '../../src/dominio/quadro.ts';
import { estiloDeCaixaPadrao, estiloDeTextoPadrao, novaNotaAdesiva, normalizarDoc, validarItem } from '../../src/dominio/quadro.ts';

const Q = 'q1';
type Marca = NonNullable<NoRico['marks']>[number];
const trecho = (text: string, ...marks: Marca[]): NoRico => ({ type: 'text', text, ...(marks.length ? { marks } : {}) });
const fundo = (bg: string, letra?: string): Marca => ({ type: 'textStyle', attrs: { backgroundColor: bg, ...(letra ? { color: letra } : {}) } });
const NEGRITO: Marca = { type: 'bold' };
const doc = (...c: NoRico[]): DocRico => ({ type: 'doc', content: [{ type: 'paragraph', content: c }] });
const AZUL = 'rgb(101,157,242)';
const VERDE = 'rgb(77,255,165)';

function texto(id: string, x: number, y: number, d: DocRico, tamanho = 14): Item {
  const base = novaNotaAdesiva({ quadroId: Q, x, y, largura: 400, altura: 40, doc: d }, 1, id);
  return {
    ...base,
    texto: estiloDeTextoPadrao({ fonte: 'pt-serif', tamanho, cor: '#222222' }),
    caixa: estiloDeCaixaPadrao({ fundo: null, padding: 0, sombra: false }),
  } as Item;
}

/** Quadro com GUIA DE LEGENDA (teste azul negrito, ponto verde com letra escura, loot) e um corpo do mestre. */
function comLegenda(): Item[] {
  return [
    texto('it-legt', 0, 0, doc(trecho('GUIA DE LEGENDA')), 40),
    texto('it-leg1', 0, 60, doc(trecho('[PONTO DE INTERAÇÃO]', NEGRITO, fundo(VERDE, '#1a1a1a')))),
    texto('it-leg2', 0, 110, doc(trecho('[TESTE E DT]', NEGRITO, fundo(AZUL)), trecho('  ou condicional'))),
    texto('it-leg3', 0, 160, doc(trecho('[LOOT]', NEGRITO, fundo('rgb(232,196,48)')), trecho('  item'))),
    texto('it-t', 3000, 0, doc(trecho('INTRODUÇÃO')), 28),
    texto('it-c1', 3000, 50, doc(trecho('Faz três dias que vocês caminham.'))),
    texto('it-c2', 3000, 100, doc(trecho('Mais uma linha do corpo.'))),
  ];
}
const semLegenda = (): Item[] => [texto('it-t', 0, 0, doc(trecho('INTRODUÇÃO')), 28), texto('it-c1', 0, 50, doc(trecho('Corpo simples.'))), texto('it-c2', 0, 100, doc(trecho('Outro corpo.')))];

function opcoes(itens: Item[], extra: Record<string, unknown> = {}) {
  let n = 0;
  return { quadroId: Q, itens, agora: 5, novoId: () => `novo-${++n}`, medir: () => 50, ...extra };
}
const montar = (pedidos: ItemPedido[], itens: Item[], extra: Record<string, unknown> = {}) => montarInsercao(pedidos, opcoes(itens, extra));
const ehTexto = (i: Item) => {
  assert.equal(i.tipo, 'texto');
  return i as Extract<Item, { tipo: 'texto' }>;
};
const marcasDe = (n: NoRico) => n.marks ?? [];
const paragrafos = (i: Item) => ehTexto(i).doc.content;

test('trechos mistos numa linha: azul negrito mais texto simples', () => {
  const { itens: [t] } = montar(
    [{ formato: 'texto', paragrafos: [{ trechos: [{ papel: 'teste', texto: '[APTIDÃO (GUERRA) / OFÍCIO] [8]' }, { texto: ' A balista é antiga, mas parece funcional.' }] }] }],
    comLegenda(),
  );
  const ps = paragrafos(t!);
  assert.equal(ps.length, 1);
  const [a, b] = ps[0]!.content!;
  assert.equal(a!.text, '[APTIDÃO (GUERRA) / OFÍCIO] [8]');
  assert.deepEqual(marcasDe(a!), [{ type: 'bold' }, { type: 'textStyle', attrs: { backgroundColor: AZUL } }]);
  assert.equal(b!.text, ' A balista é antiga, mas parece funcional.');
  assert.deepEqual(marcasDe(b!), []);
});

test('trecho com como mantém o comportamento atual; papel e como juntos dão erro', () => {
  const { itens: [t] } = montar([{ formato: 'texto', paragrafos: [{ trechos: [{ como: '#it-leg3', texto: 'x' }, { texto: ' y' }] }] }], comLegenda());
  assert.equal(marcasDe(paragrafos(t!)[0]!.content![0]!).some((m) => m.type === 'bold'), true);
  assert.throws(() => montar([{ formato: 'texto', paragrafos: [{ trechos: [{ papel: 'loot', como: '#it-leg3', texto: 'x' }] }] }], comLegenda()), /"papel" ou "como"/);
  assert.throws(() => montar([{ formato: 'texto', paragrafos: [{ texto: 'a', trechos: [{ texto: 'b' }] }] }], comLegenda()), /"texto" ou "trechos"/);
});

test('papel no parágrafo: marcas do papel no parágrafo todo', () => {
  const { itens: [t] } = montar([{ formato: 'texto', paragrafos: [{ papel: 'loot', texto: '[LOOT] MUNIÇÃO DE PISTOLA' }, { texto: 'simples' }] }], comLegenda());
  const [p1, p2] = paragrafos(t!);
  assert.deepEqual(marcasDe(p1!.content![0]!), [{ type: 'bold' }, { type: 'textStyle', attrs: { backgroundColor: 'rgb(232,196,48)' } }]);
  assert.deepEqual(marcasDe(p2!.content![0]!), []);
});

test('papel no item: vale para parágrafos sem como nem papel próprio', () => {
  const { itens: [t] } = montar(
    [{ formato: 'texto', papel: 'teste', paragrafos: [{ texto: 'um' }, { texto: 'dois', papel: 'loot' }, { texto: 'três', como: '#it-c1' }] }],
    comLegenda(),
  );
  const [p1, p2, p3] = paragrafos(t!);
  assert.equal((marcasDe(p1!.content![0]!)[1]!.attrs as { backgroundColor: string }).backgroundColor, AZUL);
  assert.equal((marcasDe(p2!.content![0]!)[1]!.attrs as { backgroundColor: string }).backgroundColor, 'rgb(232,196,48)');
  assert.deepEqual(marcasDe(p3!.content![0]!), []);
  // Texto simples com papel: o parágrafo inteiro.
  const { itens: [u] } = montar([{ formato: 'texto', papel: 'ponto', texto: '[ARBUSTO]' }], comLegenda());
  assert.deepEqual(marcasDe(paragrafos(u!)[0]!.content![0]!), [{ type: 'bold' }, { type: 'textStyle', attrs: { backgroundColor: VERDE, color: '#1a1a1a' } }]);
});

test('papel aceita o rótulo da legenda sem colchetes nem acento', () => {
  const { itens: [t] } = montar([{ formato: 'texto', papel: 'Ponto de Interacao', texto: 'x' }], comLegenda());
  assert.equal((marcasDe(paragrafos(t!)[0]!.content![0]!)[1]!.attrs as { backgroundColor: string }).backgroundColor, VERDE);
  const { itens: [u] } = montar([{ formato: 'texto', papel: '[TESTE E DT]', texto: 'x' }], comLegenda());
  assert.equal((marcasDe(paragrafos(u!)[0]!.content![0]!)[1]!.attrs as { backgroundColor: string }).backgroundColor, AZUL);
});

test('rótulo: estilo do corpo, marcas do papel e largura medida', () => {
  const medirLargura = () => 480;
  const { itens: [r], alturas } = montar([{ formato: 'rotulo', papel: 'ponto', texto: '[ARBUSTO]' }], comLegenda(), { medirLargura });
  const t = ehTexto(r!);
  assert.equal(t.texto.fonte, 'pt-serif');
  assert.equal(t.texto.tamanho, 14);
  assert.equal(t.largura, 480); // corpo 400; 480 < 1,5 × 400
  assert.equal(t.altura, 50);
  assert.equal(alturas[t.id], 50);
  assert.deepEqual(marcasDe(t.doc.content[0]!.content![0]!)[1], { type: 'textStyle', attrs: { backgroundColor: VERDE, color: '#1a1a1a' } });
  // Teto de 1,5 × a largura copiada, e sem medidor a copiada.
  assert.equal(montar([{ formato: 'rotulo', papel: 'ponto', texto: '[ARBUSTO]' }], comLegenda(), { medirLargura: () => 900 }).itens[0]!.largura, larguraDeUmaLinha(400, 900));
  assert.equal(montar([{ formato: 'rotulo', papel: 'ponto', texto: '[ARBUSTO]' }], comLegenda()).itens[0]!.largura, 400);
  // largura explícita vence a medida; estilo_como troca a base.
  assert.equal(montar([{ formato: 'rotulo', papel: 'ponto', texto: '[X]', largura: 120 }], comLegenda(), { medirLargura }).itens[0]!.largura, 120);
  assert.equal(ehTexto(montar([{ formato: 'rotulo', papel: 'ponto', texto: '[X]', estilo_como: '#it-t' }], comLegenda()).itens[0]!).texto.tamanho, 28);
  assert.throws(() => montar([{ formato: 'rotulo', texto: '[X]' } as unknown as ItemPedido], comLegenda()), /precisa de "papel"/);
});

test('o doc gerado passa pela validação do quadro', () => {
  const { itens } = montar(
    [
      { formato: 'texto', paragrafos: [{ trechos: [{ papel: 'teste', texto: '[TECNOLOGIA] [10]' }, { texto: ' sucesso.\nSegunda linha.' }] }, { papel: 'loot', texto: '[LOOT] X' }] },
      { formato: 'rotulo', papel: 'ponto', texto: '[ARBUSTO]' },
    ],
    comLegenda(),
  );
  for (const i of itens) {
    const e = ehTexto(i);
    assert.deepEqual(normalizarDoc(JSON.parse(JSON.stringify(e.doc))), e.doc);
    validarItem(JSON.parse(JSON.stringify(i)));
  }
  assert.equal(JSON.stringify(ehTexto(itens[0]!).doc).includes('hardBreak'), true);
});

test('papel desconhecido lista os papéis; quadro sem legenda orienta', () => {
  assert.throws(() => montar([{ formato: 'texto', papel: 'x', texto: 'a' }], comLegenda()), /papel 'x' não está na legenda do quadro; papéis: ponto, teste, loot/);
  assert.throws(() => montar([{ formato: 'texto', paragrafos: [{ trechos: [{ papel: 'nada', texto: 'a' }] }] }], comLegenda()), /papel 'nada' não está na legenda/);
  assert.throws(() => montar([{ formato: 'rotulo', papel: 'ponto', texto: '[A]' }], semLegenda()), /o quadro não tem legenda; use como\/estilo_como ou pergunte ao mestre/i);
  // Sem papel, o quadro sem legenda continua funcionando.
  assert.equal(montar([{ formato: 'texto', texto: 'ok' }], semLegenda()).itens.length, 1);
});

test('papel dentro de células de grupo (Q9l)', () => {
  const entradas: EntradaPedida[] = [
    { linha: [[{ formato: 'rotulo', papel: 'ponto', texto: '[ARBUSTO]' }, { formato: 'texto', paragrafos: [{ trechos: [{ papel: 'teste', texto: '[PERCEPÇÃO] [12]' }, { texto: ' folhas.' }] }] }], [{ formato: 'rotulo', papel: 'loot', texto: '[LOOT]' }]], largura_da_celula: 200 },
  ];
  const { itens: pedidos } = achatarPedidos(entradas);
  const { itens } = montarInsercao(pedidos, opcoes(comLegenda(), { medirLargura: () => 100 }));
  assert.equal(itens.length, 3);
  assert.deepEqual(itens.map((i) => i.largura), [200, 200, 200]);
  assert.equal((marcasDe(ehTexto(itens[2]!).doc.content[0]!.content![0]!)[1]!.attrs as { backgroundColor: string }).backgroundColor, 'rgb(232,196,48)');
  assert.equal(marcasDe(ehTexto(itens[1]!).doc.content[0]!.content![1]!).length, 0);
});

test('formato inválido cita rotulo; nota não aceita papel', () => {
  assert.throws(() => montar([{ formato: 'x' } as unknown as ItemPedido], comLegenda()), /texto, titulo, rotulo, nota ou imagem/);
  assert.throws(() => montar([{ formato: 'nota', texto: 'a', papel: 'loot' } as unknown as ItemPedido], comLegenda()), /papel não vale em nota/);
});

test('contraste: trecho com fundo copiado para item de letra branca ganha letra escura; o que já contrasta fica', async () => {
  const { garantirContraste } = await import('../../src/dominio/insercao-quadro.ts');
  const doc = { type: 'doc', content: [{ type: 'paragraph', content: [
    { type: 'text', text: 'narração', marks: [{ type: 'textStyle', attrs: { backgroundColor: 'rgb(255,246,182)' } }] },
    { type: 'text', text: 'regra', marks: [{ type: 'textStyle', attrs: { backgroundColor: 'rgb(26,26,26)' } }] },
    { type: 'text', text: 'com cor', marks: [{ type: 'textStyle', attrs: { backgroundColor: 'rgb(255,246,182)', color: '#ff0000' } }] },
    { type: 'text', text: 'simples' },
  ] }] };
  const r = garantirContraste(doc as never, '#ffffff');
  const nos = r.content[0]!.content!;
  assert.equal((nos[0]!.marks![0]!.attrs as { color?: string }).color, '#1a1a1a');
  assert.equal((nos[1]!.marks![0]!.attrs as { color?: string }).color, undefined);
  assert.equal((nos[2]!.marks![0]!.attrs as { color?: string }).color, '#ff0000');
  assert.equal(nos[3]!.marks, undefined);
  // Em item de letra escura, a regra (fundo escuro) ganha letra branca.
  const escuro = garantirContraste(doc as never, '#1a1a1a').content[0]!.content!;
  assert.equal((escuro[1]!.marks![0]!.attrs as { color?: string }).color, '#ffffff');
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { estiloDoQuadro, textoDoEstilo } from '../../src/dominio/estilo-do-quadro.ts';
import { legendaDoQuadro } from '../../src/dominio/legenda-do-quadro.ts';
import type { DocRico, Item, NoRico } from '../../src/dominio/quadro.ts';
import { estiloDeCaixaPadrao, estiloDeTextoPadrao, novaNotaAdesiva } from '../../src/dominio/quadro.ts';
import { estimarTokens } from '../../src/dominio/texto-da-secao.ts';

const Q = 'q1';
type Marca = NonNullable<NoRico['marks']>[number];
const trecho = (text: string, ...marks: Marca[]): NoRico => ({ type: 'text', text, ...(marks.length ? { marks } : {}) });
const estilo = (attrs: Record<string, unknown>): Marca => ({ type: 'textStyle', attrs });
const fundo = (bg: string, letra?: string): Marca => estilo({ backgroundColor: bg, ...(letra ? { color: letra } : {}) });
const NEGRITO: Marca = { type: 'bold' };
const doc = (...c: NoRico[]): DocRico => ({ type: 'doc', content: [{ type: 'paragraph', content: c }] });

function texto(id: string, x: number, y: number, d: DocRico, tamanho = 14, fonte: 'open-sans' | 'pt-serif' = 'open-sans'): Item {
  const base = novaNotaAdesiva({ quadroId: Q, x, y, largura: 400, altura: 40, doc: d }, 1, id);
  return {
    ...base,
    texto: estiloDeTextoPadrao({ fonte, tamanho, cor: '#ffffff' }),
    caixa: estiloDeCaixaPadrao({ fundo: null, padding: 0, sombra: false }),
  } as Item;
}

const AZUL = 'rgb(101,157,242)';
const LINHAS: [string, string, string, string?, string?][] = [
  ['it-leg1', 'PONTO DE INTERAÇÃO', '', 'rgb(77,255,165)', '#1a1a1a'],
  ['it-leg2', 'NARRAÇÃO', '  ler em voz alta (cores diversas)', 'rgb(255,246,182)'],
  ['it-leg3', 'SEGREDO', '  apenas para o mestre', 'rgb(26,26,26)'],
  ['it-leg4', 'SEGREDO', '  apenas para o mestre (destaque)', 'rgb(255,198,198)'],
  ['it-leg5', 'TESTE E DT', '  ou "condicional"', AZUL],
  ['it-leg6', 'LOOT', '  item ou documento', 'rgb(232,196,48)'],
  ['it-leg7', 'TRANSIÇÃO', '  música/cena Jukebox ou luz', 'rgb(143,127,238)'],
  ['it-leg8', 'EVENTO', '  algo que acontece depois de um tempo', 'rgb(254,159,77)'],
  ['it-leg9', 'GANCHO', '  a definir com os jogadores OU "condicional" também', 'rgb(255,25,100)'],
];

function guiaDeLegenda(): Item[] {
  const itens: Item[] = [texto('it-legt', 0, 0, doc(trecho('GUIA DE LEGENDA')), 70.6, 'pt-serif')];
  LINHAS.forEach(([id, rotulo, resto, bg, letra], i) => {
    itens.push(texto(id, 0, 50 + i * 50, doc(trecho(`[${rotulo}]`, NEGRITO, fundo(bg!, letra)), trecho(resto))));
  });
  return itens;
}

/** Coluna parecida com a do Pântano: a missão do mestre, longe da legenda. */
function colunaDoPantano(): Item[] {
  return [
    texto('it-p-tit', 3000, 0, doc(trecho('INTRODUÇÃO')), 45, 'pt-serif'),
    texto('it-p-1', 3000, 100, doc(trecho('[SE UM OU MAIS PERSONAGENS PASSAREM]', NEGRITO, fundo(AZUL))), 14, 'pt-serif'),
    texto('it-p-2', 3000, 200, doc(trecho('[AFOGADO] “Oisín… meu pequeno, Oisín… fuja…”', fundo('rgb(173,240,199)'))), 14, 'pt-serif'),
    texto('it-p-3', 3000, 300, doc(trecho('[TECNOLOGIA] [10]', fundo(AZUL)), trecho(' A balista parece funcional.')), 14, 'pt-serif'),
    texto('it-p-4', 3000, 400, doc(trecho('[LOOT] MUNIÇÃO DE PISTOLA', fundo('rgb(232,196,48)'))), 14, 'pt-serif'),
    texto('it-p-5', 3000, 500, doc(trecho('[LOOT] OUTRA MUNIÇÃO', fundo(AZUL))), 14, 'pt-serif'),
    texto('it-p-6', 3000, 600, doc(trecho('[LOOT] MAIS UMA', fundo('rgb(232,196,48)'))), 14, 'pt-serif'),
  ];
}

const porPapel = (itens: Item[]) => Object.fromEntries(legendaDoQuadro(itens)!.entradas.map((e) => [e.papel, e]));

test('legenda real: 9 papéis, rótulo com marcas e descrição em texto simples', () => {
  const l = legendaDoQuadro(guiaDeLegenda())!;
  assert.equal(l.secaoTitulo, 'GUIA DE LEGENDA');
  assert.deepEqual(l.entradas.map((e) => e.papel), ['ponto', 'narracao', 'segredo', 'segredo-destaque', 'teste', 'loot', 'transicao', 'evento', 'gancho']);
  const p = porPapel(guiaDeLegenda());
  assert.deepEqual(p.ponto!.marcas, { fundo: 'rgb(77,255,165)', letra: '#1a1a1a', negrito: true });
  assert.equal(p.ponto!.descricao, undefined);
  assert.equal(p.ponto!.rotulo, 'PONTO DE INTERAÇÃO');
  assert.equal(p.narracao!.descricao, 'ler em voz alta (cores diversas)');
  assert.deepEqual(p.narracao!.marcas, { fundo: 'rgb(255,246,182)', negrito: true });
  assert.equal(p.teste!.exemplo, 'it-leg5');
  assert.ok(l.entradas.every((e) => e.origem === 'legenda'));
});

test('duas variantes de segredo', () => {
  const p = porPapel(guiaDeLegenda());
  assert.equal(p.segredo!.marcas.fundo, 'rgb(26,26,26)');
  assert.equal(p['segredo-destaque']!.marcas.fundo, 'rgb(255,198,198)');
});

test('sem GUIA DE LEGENDA: os trechos destacados formam a legenda', () => {
  const l = legendaDoQuadro(colunaDoPantano())!;
  assert.equal(l.secaoTitulo, null);
  assert.ok(l.entradas.every((e) => e.origem === 'marcadores'));
  const p = porPapel(colunaDoPantano());
  assert.equal(p.condicao!.exemplo, 'it-p-1');
  assert.match(p.condicao!.descricao!, /agrupa com teste/);
  assert.deepEqual(p.condicao!.marcas, { fundo: AZUL, negrito: true });
  assert.equal(p.fala!.rotulo, 'AFOGADO');
  assert.equal(p.fala!.marcas.fundo, 'rgb(173,240,199)');
  assert.equal(p.teste!.exemplo, 'it-p-3');
  assert.equal(p.teste!.rotulo, 'TECNOLOGIA');
  // A combinação mais comum de LOOT (dourado, 2 de 3).
  assert.equal(p.loot!.marcas.fundo, 'rgb(232,196,48)');
  assert.equal(p.loot!.exemplo, 'it-p-4');
});

test('a explícita vence o marcador discordante; o marcador completa o que falta', () => {
  const itens = [...guiaDeLegenda(), ...colunaDoPantano()];
  const p = porPapel(itens);
  assert.equal(p.loot!.origem, 'legenda');
  assert.equal(p.loot!.marcas.fundo, 'rgb(232,196,48)');
  assert.equal(p.teste!.origem, 'legenda');
  assert.equal(p.condicao!.origem, 'marcadores');
  assert.equal(p.fala!.origem, 'marcadores');
});

test('rótulo desconhecido vira papel com o próprio nome; sem destaque não entra', () => {
  const itens = [
    texto('it-t', 0, 0, doc(trecho('LEGENDA')), 70, 'pt-serif'),
    texto('it-x', 0, 70, doc(trecho('[PISTA FALSA]', fundo('rgb(1,2,3)')), trecho(' o que sobra'))),
    texto('it-y', 0, 120, doc(trecho('[SEM COR]'), trecho(' texto'))),
  ];
  const l = legendaDoQuadro(itens)!;
  assert.deepEqual(l.entradas.map((e) => e.papel), ['pista falsa']);
  assert.equal(l.entradas[0]!.descricao, 'o que sobra');
});

test('itens do assistente nunca entram; sem nada destacado não há legenda', () => {
  const itens = guiaDeLegenda().map((i) => ({ ...i, revisao: { origem: 'assistente' } }) as unknown as Item);
  assert.equal(legendaDoQuadro(itens), null);
  assert.equal(legendaDoQuadro([texto('it-a', 0, 0, doc(trecho('[LOOT] sem cor')))]), null);
});

test('quadro_estilo mostra a legenda real e a coluna do Pântano, abaixo de 600 tokens', () => {
  const itens = [...guiaDeLegenda(), ...colunaDoPantano()];
  const e = estiloDoQuadro(itens)!;
  assert.equal(e.legenda!.entradas.length, 11);
  const t = textoDoEstilo(e);
  assert.ok(estimarTokens(t) < 600, `tokens: ${estimarTokens(t)}\n${t}`);
  assert.match(t, /Legenda do mestre \("GUIA DE LEGENDA"/);
  assert.match(t, /- narracao \[NARRAÇÃO\]: fundo rgb\(255,246,182\), negrito — ler em voz alta \(cores diversas\) \(#it-leg2\)/);
  assert.match(t, /- condicao .*\[inferida\]/);
  assert.ok(!t.includes('Sem legenda no quadro'));
  // A seção da legenda descreve o estilo; a escolhida é a do material, mesmo com menos itens de texto.
  assert.ok(!/legenda/i.test(e.secaoTitulo), e.secaoTitulo);
});

test('sem legenda: palpites e aviso', () => {
  const e = estiloDoQuadro([texto('it-a', 0, 0, doc(trecho('Texto corrido.', fundo('rgb(200,200,200)'))))])!;
  assert.equal(e.legenda, null);
  const t = textoDoEstilo(e);
  assert.match(t, /Destaques \(fundo do trecho\)/);
  assert.match(t, /Sem legenda no quadro; pergunte ao mestre/);
});

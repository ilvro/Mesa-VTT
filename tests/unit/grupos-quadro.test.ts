import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  achatarPedidos,
  layoutDeBlocos,
  montarInsercao,
  montarSetas,
  posicionarEmColuna,
  type EntradaPedida,
  type ItemPedido,
} from '../../src/dominio/insercao-quadro.ts';
import type { Item } from '../../src/dominio/quadro.ts';
import { docDeTexto, novaImagem, novaNotaAdesiva } from '../../src/dominio/quadro.ts';

const Q = 'q1';
const EIXO = 1150;
const ancora = (): Item => ({ ...novaNotaAdesiva({ quadroId: Q, x: 1000, y: 2000, largura: 300, altura: 40, doc: docDeTexto('ÂNCORA') }, 1, 'ancora') }) as Item;
const imagem = (): Item => novaImagem({ quadroId: Q, x: 0, y: 5000, imagemId: 'img1', larguraOriginal: 400, alturaOriginal: 200, largura: 400, altura: 200 }, 1, 'img1xx');
const quadro = (...extra: Item[]): Item[] => [ancora(), imagem(), ...extra];
const T = (texto: string, largura = 200): ItemPedido => ({ formato: 'texto', texto, largura });

/** Altura 120 para textos que começam com ALTO; 40 para os outros. */
const medir = (i: Extract<Item, { tipo: 'texto' }>) => (JSON.stringify(i.doc).includes('ALTO') ? 120 : 40);

function inserir(entradas: EntradaPedida[], itens: Item[], alinhar: 'esquerda' | 'centro' = 'centro', abrirEspaco = false) {
  let n = 0;
  const { itens: pedidos, estrutura } = achatarPedidos(entradas);
  const ins = montarInsercao(pedidos, { quadroId: Q, itens, agora: 5, novoId: () => `novo-${++n}`, medir });
  const layout = layoutDeBlocos(estrutura, ins.itens, 24, alinhar);
  const alvo = { abaixoDe: itens[0]! };
  const pos = posicionarEmColuna(layout.alturas, layout.larguras, itens, alvo, 24, { alinhar, abrirEspaco, eixo: EIXO });
  const finais = layout.espalhar(pos.posicoes);
  ins.itens.forEach((it, k) => { it.x = finais[k]!.x; it.y = finais[k]!.y; });
  return { ...ins, pos, layout };
}
const textoDe = (i: Item) => (i.tipo === 'texto' ? JSON.stringify(i.doc.content).match(/"text":"([^"]*)"/)![1] : '');

test('três regras lado a lado: centradas no eixo e alinhadas pelo topo', () => {
  const r = inserir([{ linha: [[T('Regras da perseguição')], [T('ALTO Fôlego')], [T('Ações da perseguição')]] }], quadro());
  // Espaço entre células: 3 × 24 = 72; conjunto de 3 × 200 + 2 × 72 = 744 centrado no eixo.
  assert.deepEqual(r.itens.map((i) => i.x), [EIXO - 372, EIXO - 372 + 272, EIXO - 372 + 544]);
  assert.deepEqual(r.itens.map((i) => i.y), [2064, 2064, 2064]);
  assert.equal(r.pos.caixa.largura, 744);
  assert.equal(r.pos.caixa.altura, 120);
});

test('linha à esquerda começa no x da coluna e respeita o espaço pedido', () => {
  const r = inserir([{ linha: [[T('a')], [T('b')]], espaco: 10 }], quadro(), 'esquerda');
  assert.deepEqual(r.itens.map((i) => i.x), [1000, 1210]);
});

test('grade 3×2 de cartões: imagem, rótulo e texto em cada célula', () => {
  const cartao = (nome: string, alto = false) => [
    { formato: 'imagem', de: '#img1xx' } as ItemPedido,
    { formato: 'titulo', texto: nome } as ItemPedido,
    { formato: 'texto', texto: `${alto ? 'ALTO ' : ''}linha de ${nome}` } as ItemPedido,
  ];
  const r = inserir(
    [{ grade: [cartao('A'), cartao('B', true), cartao('C'), cartao('D'), cartao('E'), cartao('F')], colunas: 3, largura_da_celula: 200 }],
    quadro(),
  );
  assert.equal(r.itens.length, 18);
  // Imagem 400×200 com largura 200 fica 200×100; célula: 100 + 24 + 40 + 24 + 40 = 228 (a da fileira 1 é 308 por causa do ALTO).
  const imagens = r.itens.filter((i) => i.tipo === 'imagem');
  assert.ok(imagens.every((i) => i.largura === 200 && i.altura === 100));
  const xs = [...new Set(imagens.map((i) => i.x))].sort((a, b) => a - b);
  assert.deepEqual(xs, [EIXO - 372, EIXO - 372 + 272, EIXO - 372 + 544]);
  const ys = [...new Set(imagens.map((i) => i.y))];
  assert.deepEqual(ys, [2064, 2064 + 308 + 72]);
  // Rótulo e texto empilham sob a imagem, na ordem.
  assert.equal(r.itens[1]!.y, 2064 + 100 + 24);
  assert.equal(r.itens[2]!.y, 2064 + 100 + 24 + 40 + 24);
  // Altura do grupo: fileira 1 (308) + espaço (72) + fileira 2 (228).
  assert.equal(r.pos.caixa.altura, 308 + 72 + 228);
  assert.equal(r.pos.caixa.largura, 744);
});

test('a altura do grupo é a da célula mais alta; a coluna continua abaixo', () => {
  const r = inserir([T('antes'), { linha: [[T('a')], [T('ALTO b'), T('ALTO c')], [T('d')]] }, T('depois')], quadro());
  // Célula do meio: 120 + 24 + 120 = 264.
  const [antes, a, b, c, d, depois] = r.itens;
  assert.equal(antes!.y, 2064);
  assert.equal(a!.y, 2064 + 40 + 24);
  assert.equal(a!.y, d!.y);
  assert.equal(c!.y, b!.y + 120 + 24);
  assert.equal(depois!.y, a!.y + 264 + 24);
  assert.equal(depois!.x, EIXO - 100);
  assert.equal(antes!.x, EIXO - 100);
});

test('item mais estreito que a célula fica centrado nela', () => {
  const r = inserir([{ linha: [[T('largo', 300), T('estreito', 100)]] }], quadro(), 'esquerda');
  assert.deepEqual(r.itens.map((i) => i.x), [1000, 1100]);
});

test('obstáculo ao lado do grupo é recusado; abrir_espaco desce o que cruza o recorte do grupo', () => {
  // Um item solto de 200 px não bateria nele, mas o grupo (778 a 1522) sim.
  const obstaculo = { ...novaNotaAdesiva({ quadroId: Q, x: 1400, y: 2070, largura: 100, altura: 50, doc: docDeTexto('obstáculo') }, 1, 'obst') } as Item;
  const itens = quadro(obstaculo);
  const grupo: EntradaPedida[] = [{ linha: [[T('a')], [T('b')], [T('c')]] }];
  assert.throws(() => inserir(grupo, itens), /Não há espaço livre.*#obst/);
  assert.doesNotThrow(() => inserir([T('só um')], itens));
  const r = inserir(grupo, itens, 'centro', true);
  assert.deepEqual(r.pos.empurrar, [{ id: 'obst', dy: 40 + 24 }]);
});

test('índices das setas atravessam os grupos, fileira por fileira, célula por célula', () => {
  const entradas: EntradaPedida[] = [
    T('zero'),
    { grade: [[T('um'), T('dois')], [T('três')], [T('quatro')]], colunas: 2 },
    T('cinco'),
  ];
  const r = inserir(entradas, quadro());
  assert.deepEqual(r.itens.map(textoDe), ['zero', 'um', 'dois', 'três', 'quatro', 'cinco']);
  const [s] = montarSetas([{ de: 0, para: 4 }], { quadroId: Q, itens: quadro(), novos: r.itens, agora: 5, novoId: () => 'seta1' });
  assert.deepEqual(s!.de, { itemId: r.itens[0]!.id, lado: 'auto' });
  assert.deepEqual(s!.para, { itemId: r.itens[4]!.id, lado: 'auto' });
});

test('limite de 40 itens por chamada conta os de dentro dos grupos', () => {
  const celulas = (n: number) => Array.from({ length: n }, (_, k) => [T(`c${k}`)]);
  assert.doesNotThrow(() => inserir([T('solto'), { linha: celulas(39) }], quadro()));
  assert.throws(() => inserir([T('solto'), { linha: celulas(40) }], quadro()), /41 itens; o máximo por chamada é 40/);
  assert.throws(() => inserir([{ grade: celulas(41), colunas: 5 }], quadro()), /máximo por chamada é 40/);
});

test('grupos inválidos dão erro legível', () => {
  const quando = (e: unknown) => () => achatarPedidos([e as EntradaPedida]);
  assert.throws(quando({ linha: [[{ formato: 'imagem', de: '#img1xx', lado: 'direita' }]] }), /Grupo 1, célula 1: imagem com "lado"/);
  assert.throws(quando({ grade: [[T('a')]] }), /"colunas"/);
  assert.throws(quando({ linha: [] }), /lista de células/);
  assert.throws(quando({ linha: [[]] }), /ao menos um item/);
  assert.throws(quando({ linha: [[T('a')]], grade: [[T('a')]], colunas: 1 }), /não os dois/);
  assert.throws(quando({ linha: [[{ linha: [[T('a')]] }]] }), /grupo dentro de célula/);
  assert.throws(quando({ linha: [[T('a')]], largura_da_celula: 10 }), /largura_da_celula/);
});

test('largura_da_celula força a largura de texto e imagem; nota fica como está', () => {
  const { itens } = achatarPedidos([{ linha: [[T('a', 500), { formato: 'imagem', de: '#x' }, { formato: 'nota', texto: 'n' }]], largura_da_celula: 150 }]);
  assert.deepEqual(itens.map((i) => (i as { largura?: number }).largura), [150, 150, undefined]);
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { montarInsercao, marcasPredominantes, posicionarEmColuna, type ItemPedido } from '../../src/dominio/insercao-quadro.ts';
import { PALETA_PADRAO } from '../../src/dominio/paleta.ts';
import type { DocRico, Item, NoRico } from '../../src/dominio/quadro.ts';
import {
  estiloDeCaixaPadrao,
  estiloDeTextoPadrao,
  novaImagem,
  novaMoldura,
  novaNotaAdesiva,
  normalizarDoc,
  validarItem,
} from '../../src/dominio/quadro.ts';
import { secoesDoQuadro } from '../../src/dominio/secoes-do-quadro.ts';

const Q = 'q1';
type Marca = NonNullable<NoRico['marks']>[number];
const trecho = (text: string, ...marks: Marca[]): NoRico => ({ type: 'text', text, ...(marks.length ? { marks } : {}) });
const estilo = (attrs: Record<string, unknown>): Marca => ({ type: 'textStyle', attrs });
const paragrafo = (...c: NoRico[]): DocRico => ({ type: 'doc', content: [{ type: 'paragraph', content: c }] });
const AMARELO = estilo({ backgroundColor: 'rgb(255,246,182)' });
const PRETO = estilo({ backgroundColor: 'rgb(26,26,26)', color: '#ffffff' });

function texto(id: string, x: number, y: number, doc: DocRico, tamanho = 14, extra: Partial<Item> = {}): Item {
  const base = novaNotaAdesiva({ quadroId: Q, x, y, largura: 400, altura: 76, doc }, 1, id);
  return {
    ...base,
    texto: estiloDeTextoPadrao({ fonte: 'pt-serif', tamanho, cor: '#1a1a1a' }),
    caixa: estiloDeCaixaPadrao({ fundo: '#ffffff', padding: 0, sombra: false }),
    alturaAuto: true,
    ...extra,
  } as Item;
}

function coluna(): Item[] {
  return [
    texto('it-tit1', 1000, 2000, paragrafo(trecho('INTRODUÇÃO')), 28),
    texto('it-dd3', 1000, 2100, paragrafo(trecho('Faz três dias que vocês caminham pelo pântano. ', AMARELO), trecho('Role.', PRETO))),
    texto('it-regr', 1000, 2200, paragrafo(trecho('Teste de Furtividade CD 13.', PRETO))),
    texto('it-reg1', 1000, 2300, paragrafo(trecho('[SE PASSAREM]', estilo({ backgroundColor: 'rgb(101,157,242)' })))),
    texto('it-fala1', 1000, 2400, paragrafo(trecho('[AFOGADO] "Oisín?"', estilo({ backgroundColor: 'rgb(173,240,199)' })))),
    novaImagem({ quadroId: Q, x: 1500, y: 2100, imagemId: 'i1', larguraOriginal: 800, alturaOriginal: 600, largura: 200, altura: 150 }, 1, 'it-img1'),
  ];
}

function opcoes(itens: Item[], extra: Record<string, unknown> = {}) {
  let n = 0;
  return { quadroId: Q, itens, agora: 5, novoId: () => `novo-${++n}`, medir: () => 123, ...extra };
}

const ehTexto = (i: Item) => {
  assert.equal(i.tipo, 'texto');
  return i as Extract<Item, { tipo: 'texto' }>;
};

test('caso real: parágrafos com como copiam fonte, tamanho, largura e destaques', () => {
  const itens = coluna();
  const { itens: saida, alturas } = montarInsercao(
    [{ formato: 'texto', paragrafos: [{ texto: 'A névoa se abre…', como: '#it-dd3' }, { texto: 'Todos fazem [DISCIPLINA 10].', como: '#it-regr' }] }],
    opcoes(itens),
  );
  assert.equal(saida.length, 1);
  const t = ehTexto(saida[0]!);
  assert.equal(t.texto.fonte, 'pt-serif');
  assert.equal(t.texto.tamanho, 14);
  assert.equal(t.largura, 400);
  assert.equal(t.caixa.fundo, '#ffffff');
  assert.equal(t.caixa.sombra, false);
  assert.equal(t.semantica, null);
  assert.equal((t.x, t.y), 0);
  assert.equal(t.altura, 123);
  assert.deepEqual(alturas, { [t.id]: 123 });
  const [p1, p2] = t.doc.content;
  assert.deepEqual(p1!.content![0]!.marks, [{ type: 'textStyle', attrs: { backgroundColor: 'rgb(255,246,182)' } }]);
  assert.deepEqual(p2!.content![0]!.marks, [{ type: 'textStyle', attrs: { backgroundColor: 'rgb(26,26,26)', color: '#ffffff' } }]);
  assert.equal(p2!.content![0]!.text, 'Todos fazem [DISCIPLINA 10].');
  // O doc gerado passa na validação do quadro.
  validarItem(t);
  assert.deepEqual(normalizarDoc(t.doc), t.doc);
});

test('estilo_como copia estilo e largura; largura do pedido vence; altura copiada se não for auto', () => {
  const itens = coluna();
  const fixo = texto('it-fixo', 0, 0, paragrafo(trecho('x')), 20, { alturaAuto: false, altura: 90 } as Partial<Item>);
  itens.push(fixo);
  const r = montarInsercao(
    [
      { formato: 'texto', texto: 'a', estilo_como: '#it-tit1', largura: 300 },
      { formato: 'texto', texto: 'b', estilo_como: 'it-fixo' },
    ],
    opcoes(itens),
  );
  const [a, b] = r.itens.map(ehTexto);
  assert.equal(a!.texto.tamanho, 28);
  assert.equal(a!.largura, 300);
  assert.equal(a!.altura, 123);
  assert.equal(b!.alturaAuto, false);
  // Altura fixa copiada (90) vence a medida menor; a medida maior (123) vence a fixa.
  assert.equal(b!.altura, 123);
  assert.equal(r.alturas[b!.id], 123);
  const curto = montarInsercao([{ formato: 'texto', texto: 'b', estilo_como: 'it-fixo' }], { ...opcoes(itens), medir: () => 40 });
  assert.equal(curto.itens[0]!.altura, 90);
});

test('sem estilo_como usa o estilo de título e de corpo detectados', () => {
  const r = montarInsercao([{ formato: 'titulo', texto: 'COMBATE' }, { formato: 'texto', texto: 'Linha 1\nLinha 2 [[Nome]]' }], opcoes(coluna()));
  const [t, c] = r.itens.map(ehTexto);
  assert.equal(t!.texto.tamanho, 28);
  assert.equal(c!.texto.tamanho, 14);
  assert.equal(c!.texto.fonte, 'pt-serif');
  assert.equal(c!.doc.content.length, 2);
  assert.equal(c!.doc.content[1]!.content![0]!.text, 'Linha 2 [[Nome]]');
});

test('sem nenhum estilo cai no padrão de novoTexto (título maior)', () => {
  const r = montarInsercao([{ formato: 'titulo', texto: 'T' }, { formato: 'texto', texto: 'c' }], opcoes([]));
  const [t, c] = r.itens.map(ehTexto);
  assert.equal(c!.texto.fonte, 'open-sans');
  assert.equal(c!.texto.tamanho, 16);
  assert.equal(t!.texto.tamanho, 28);
  assert.equal(c!.alturaAuto, true);
});

test('tipo grava semântica mas não pinta quando há estilo; nota sem estilo usa a paleta', () => {
  const r = montarInsercao(
    [
      { formato: 'texto', texto: 'segredo', tipo: 'segredo' },
      { formato: 'nota', texto: 'ideia', tipo: 'segredo' },
      { formato: 'nota', texto: 'pista', tipo: 'segredo', estilo_como: '#it-dd3' },
    ],
    opcoes(coluna()),
  );
  const [a, b, c] = r.itens.map(ehTexto);
  assert.equal(a!.semantica, 'segredo');
  assert.equal(a!.caixa.fundo, '#ffffff');
  assert.equal(b!.caixa.fundo, PALETA_PADRAO.segredo);
  assert.equal(b!.alturaAuto, false);
  assert.equal(c!.caixa.fundo, '#ffffff');
  assert.equal(a!.revisao?.tipoSugerido, 'segredo');
});

test('revisão do assistente e moldura só quando a seção é moldura do mestre', () => {
  const m = novaMoldura({ quadroId: Q, x: 900, y: 1900, largura: 800, altura: 800, titulo: 'Pântano' }, 1, 'mold-1');
  const dentro = coluna().map((i) => ({ ...i, molduraId: 'mold-1' }) as Item);
  const itens = [m, ...dentro];
  const secao = secoesDoQuadro(itens).find((s) => s.id === 'mold-1');
  assert.ok(secao);
  const r = montarInsercao([{ formato: 'texto', texto: 'x' }], opcoes(itens, { secao }));
  const t = ehTexto(r.itens[0]!);
  assert.equal(t.molduraId, 'mold-1');
  assert.equal(t.revisao?.origem, 'assistente');
  assert.deepEqual(t.revisao?.motivos, ['Proposta do assistente']);
  const solto = montarInsercao([{ formato: 'texto', texto: 'x' }], opcoes(coluna()));
  assert.equal(ehTexto(solto.itens[0]!).molduraId, null);
  const doAssistente = { ...m, revisao: { origem: 'assistente', tipoSugerido: null, motivos: [] } } as Item;
  const s2 = montarInsercao([{ formato: 'texto', texto: 'x' }], opcoes([doAssistente, ...dentro], { secao }));
  assert.equal(ehTexto(s2.itens[0]!).molduraId, null);
});

test('trecho predominante: o que cobre mais caracteres, com negrito e itálico', () => {
  const doc = paragrafo(
    trecho('curto', AMARELO),
    trecho('um trecho bem mais longo', { type: 'bold' }, { type: 'italic' }, estilo({ color: '#fff', backgroundColor: '#000', fontSize: '20px', fontFamily: 'x' })),
  );
  assert.deepEqual(marcasPredominantes(doc), [
    { type: 'bold' },
    { type: 'italic' },
    { type: 'textStyle', attrs: { backgroundColor: '#000', color: '#fff', fontFamily: 'x', fontSize: '20px' } },
  ]);
  assert.deepEqual(marcasPredominantes(paragrafo(trecho('sem marca'))), []);
});

test('ids: curto, prefixo, ambíguo e inexistente', () => {
  const itens = [...coluna(), texto('it-dd3x', 0, 0, paragrafo(trecho('y')))];
  const um = (como: string) => montarInsercao([{ formato: 'texto', paragrafos: [{ texto: 'a', como }] }], opcoes(itens));
  assert.ok(um('#it-dd3')); // exato vence o prefixo
  assert.ok(um('it-fal')); // prefixo único
  assert.throws(() => um('#it-r'), /ambíguo/);
  assert.throws(() => um('#zzz'), /não encontrado/);
  assert.throws(() => montarInsercao([{ formato: 'texto', texto: 'a', estilo_como: '#it-img1' }], opcoes(itens)), /#it-img1 é uma imagem; use um item de texto em estilo_como/);
});

test('erros: limites, vazio, tipo inválido, imagem', () => {
  const o = () => opcoes(coluna());
  assert.throws(() => montarInsercao([], o()), /ao menos um/);
  assert.throws(() => montarInsercao(Array.from({ length: 41 }, () => ({ formato: 'texto', texto: 'a' }) as ItemPedido), o()), /máximo por chamada é 40/);
  assert.throws(() => montarInsercao([{ formato: 'texto', texto: 'a'.repeat(4001) }], o()), /4000/);
  assert.throws(() => montarInsercao([{ formato: 'texto', paragrafos: [{ texto: 'a'.repeat(2500) }, { texto: 'b'.repeat(2500) }] }], o()), /4000/);
  assert.throws(() => montarInsercao([{ formato: 'texto', texto: '  ' }], o()), /sem texto/);
  assert.throws(() => montarInsercao([{ formato: 'texto', paragrafos: [{ texto: ' ' }] }], o()), /parágrafo 1 do item 1 está vazio/);
  assert.throws(() => montarInsercao([{ formato: 'texto', texto: 'a', tipo: 'xyz' as never }], o()), /Tipo "xyz" inválido/);
  assert.throws(() => montarInsercao([{ formato: 'imagem', de: '#it-img1' }], o()), /ainda não suportado/);
});

// Q9e: posição em coluna.
const por = (itens: Item[], id: string) => itens.find((i) => i.id === id)!;
const doisBlocos = (): Item[] => [
  ...coluna(),
  texto('it-tit2', 1000, 2560, paragrafo(trecho('COMBATE')), 28),
  texto('it-cmb1', 1000, 2660, paragrafo(trecho('Três afogados atacam.'))),
];

test('coluna: continua abaixo do último item com o espaço pedido, empilhando os novos', () => {
  const itens = coluna();
  const r = posicionarEmColuna([50, 80], [400, 300], itens, { abaixoDe: por(itens, 'it-fala1') }, 24);
  assert.deepEqual(r.posicoes, [{ x: 1000, y: 2500 }, { x: 1000, y: 2574 }]);
  assert.deepEqual(r.empurrar, []);
  assert.deepEqual(r.caixa, { x: 1000, y: 2500, largura: 400, altura: 50 + 24 + 80 });
});

test('coluna: abaixo de um título é o fim do bloco dele; abaixo de um item comum é o próprio item', () => {
  const itens = doisBlocos();
  // Bloco INTRODUÇÃO termina em 2476 (it-fala1); COMBATE começa em 2560: cabem 40 px de altura com espaço 24.
  const r = posicionarEmColuna([30], [400], itens, { abaixoDe: por(itens, 'it-tit1') }, 24);
  assert.equal(r.posicoes[0]!.y, 2500);
  // Abaixo de um item no meio do bloco, o item seguinte está no caminho.
  assert.throws(() => posicionarEmColuna([30], [400], itens, { abaixoDe: por(itens, 'it-dd3') }, 24), /bloco "INTRODUÇÃO" começa 24 px abaixo/);
});

test('coluna: recusa com obstáculo dizendo o bloco; abrir_espaco desce a coluna e a imagem do bloco seguinte', () => {
  const ficha = { ...novaImagem({ quadroId: Q, x: 1500, y: 2560, imagemId: 'img-ficha', larguraOriginal: 200, alturaOriginal: 200 }, 1, 'it-ficha'), molduraId: null } as Item;
  const itens = [...doisBlocos(), ficha, texto('it-lado', 1900, 2600, paragrafo(trecho('fora da coluna')))];
  const tit = por(itens, 'it-tit1');
  assert.throws(() => posicionarEmColuna([100], [400], itens, { abaixoDe: tit }, 24), /o bloco "COMBATE" começa 84 px abaixo.*abrir_espaco: true/);
  const r = posicionarEmColuna([100], [400], itens, { abaixoDe: tit }, 24, { abrirEspaco: true });
  assert.equal(r.posicoes[0]!.y, 2500);
  // A ficha ao lado de COMBATE (mesma seção) desce com o bloco; a imagem acima do ponto e a outra ilha ficam.
  assert.deepEqual(r.empurrar.map((e) => e.id).sort(), ['it-cmb1', 'it-ficha', 'it-tit2']);
  assert.ok(r.empurrar.every((e) => e.dy === 124));
  assert.ok(!r.empurrar.some((e) => e.id === 'it-img1' || e.id === 'it-lado'));
});

test('coluna: abaixo da seção usa o fim da coluna principal', () => {
  const itens = coluna();
  const secao = secoesDoQuadro(itens)[0]!;
  const r = posicionarEmColuna([40], [400], itens, { abaixoDeSecao: secao }, 24);
  assert.deepEqual(r.posicoes[0], { x: 1000, y: 2476 + 24 });
});

test('coluna: ao lado da seção abre coluna nova sem sobrepor nada', () => {
  const itens = coluna();
  const secao = secoesDoQuadro(itens)[0]!;
  const r = posicionarEmColuna([60, 60], [400, 400], itens, { aoLadoDe: secao }, 24);
  const caixa = r.caixa;
  for (const i of itens) {
    const sobrepoe = caixa.x < i.x + i.largura && caixa.x + caixa.largura > i.x && caixa.y < i.y + i.altura && caixa.y + caixa.altura > i.y;
    assert.equal(sobrepoe, false, i.id);
  }
  assert.ok(r.posicoes[0]!.x > 1500 + 200);
  assert.equal(r.posicoes[1]!.y, r.posicoes[0]!.y + 60 + 24);
  assert.deepEqual(r.empurrar, []);
});

test('coluna: alvos inválidos dão erro legível', () => {
  const itens = [...coluna(), novaMoldura({ quadroId: Q, x: 0, y: 0, largura: 10, altura: 10, titulo: 'M' }, 1, 'mold')];
  assert.throws(() => posicionarEmColuna([10], [10], itens, { abaixoDe: por(itens, 'mold') }, 24), /moldura/);
  assert.throws(() => posicionarEmColuna([], [], itens, { abaixoDe: por(itens, 'it-dd3') }, 24), /Nada a posicionar/);
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { DocRico, Item } from '../../src/dominio/quadro.ts';
import {
  novaImagem,
  novaMoldura,
  novaNotaAdesiva,
  novaSeta,
  novoTexto,
  novoTraco,
} from '../../src/dominio/quadro.ts';
import {
  ligacoesEntreSecoes,
  OPCOES_PADRAO_SECOES,
  secoesDoQuadro,
  tituloDaSecao,
} from '../../src/dominio/secoes-do-quadro.ts';

const Q = 'q1';
const doc = (texto: string, extra: { fontSize?: string; nivel?: number } = {}): DocRico => ({
  type: 'doc',
  content: [
    extra.nivel
      ? { type: 'heading', attrs: { level: extra.nivel }, content: [{ type: 'text', text: texto }] }
      : {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: texto,
              ...(extra.fontSize
                ? { marks: [{ type: 'textStyle', attrs: { fontSize: extra.fontSize } }] }
                : {}),
            },
          ],
        },
  ],
});
const nota = (id: string, x: number, y: number, texto = 'nota', l = 200, a = 200) =>
  novaNotaAdesiva({ quadroId: Q, x, y, largura: l, altura: a, doc: doc(texto) }, 1, id);
const mold = (id: string, x: number, y: number, l: number, a: number, titulo = id) =>
  novaMoldura({ quadroId: Q, x, y, largura: l, altura: a, titulo }, 1, id);

test('moldura vira seção com o próprio título e seus itens', () => {
  const m = mold('m1', 0, 0, 1000, 800, 'Capítulo 1');
  const n = { ...nota('n1', 100, 100), molduraId: 'm1' };
  const s = secoesDoQuadro([m, n]);
  assert.equal(s.length, 1);
  assert.deepEqual(s[0], {
    id: 'm1',
    tipo: 'moldura',
    titulo: 'Capítulo 1',
    caixa: { x: 0, y: 0, largura: 1000, altura: 800 },
    itemIds: ['n1'],
    maeId: null,
  });
});

test('item com molduraId nulo mas centro dentro da moldura vai para a moldura', () => {
  const m = mold('m1', 0, 0, 1000, 800);
  const n = nota('n1', 100, 100);
  const s = secoesDoQuadro([m, n]);
  assert.equal(s.length, 1);
  assert.deepEqual(s[0]!.itemIds, ['n1']);
});

test('duas ilhas separadas por um vão', () => {
  const itens = [
    nota('a', 0, 0, 'Alfa'),
    nota('b', 250, 0, 'Beta'),
    nota('c', 5000, 0, 'Gama'),
    nota('d', 5250, 0, 'Delta'),
  ];
  const s = secoesDoQuadro(itens);
  assert.equal(s.length, 2);
  assert.deepEqual(s.map((x) => x.itemIds), [['a', 'b'], ['c', 'd']]);
  assert.ok(s.every((x) => x.tipo === 'ilha'));
});

test('distância entre caixas é o vão entre bordas (0 se sobrepõem)', () => {
  const sobrepostas = [nota('a', 0, 0), nota('b', 100, 100)];
  assert.equal(secoesDoQuadro(sobrepostas, { vao: 1 }).length, 1);
  const vao50 = [nota('a', 0, 0), nota('b', 250, 0)];
  assert.equal(secoesDoQuadro(vao50, { vao: 51 }).length, 1);
  assert.equal(secoesDoQuadro(vao50, { vao: 50 }).length, 2);
});

test('ilha que cresce mantém o id', () => {
  const t = novoTexto({ quadroId: Q, x: 0, y: 0, largura: 300, altura: 40, doc: doc('Cidade', { nivel: 1 }) }, 1, 'titulo');
  const a = nota('a', 0, 100);
  const antes = secoesDoQuadro([t, a]);
  const depois = secoesDoQuadro([t, a, nota('z', 250, 150)]);
  assert.equal(antes[0]!.id, 'ilha:titulo');
  assert.equal(depois[0]!.id, 'ilha:titulo');
  assert.equal(depois[0]!.itemIds.length, 3);
});

test('sem título, o id vem do item mais acima e à esquerda', () => {
  const s = secoesDoQuadro([nota('b', 300, 0, 'x'), nota('a', 0, 0, 'y')]);
  assert.equal(s[0]!.id, 'ilha:a');
});

test('título por semantica, por H1 e por fonte maior', () => {
  const normal = nota('n', 0, 200, 'texto comum');
  const sem = novoTexto({ quadroId: Q, x: 0, y: 100, doc: doc('Por semântica'), semantica: 'titulo' }, 1, 's');
  assert.deepEqual(tituloDaSecao([normal, sem]), { titulo: 'Por semântica', itemId: 's' });

  const h1 = novoTexto({ quadroId: Q, x: 0, y: 100, doc: doc('Por H1', { nivel: 1 }) }, 1, 'h');
  assert.equal(tituloDaSecao([normal, h1]).titulo, 'Por H1');

  const normal2 = nota('n2', 0, 400, 'outro');
  const normal3 = nota('n3', 0, 600, 'mais um');
  const grande = novoTexto({ quadroId: Q, x: 0, y: 100, doc: doc('Grande', { fontSize: '40px' }) }, 1, 'g');
  assert.deepEqual(tituloDaSecao([normal, normal2, normal3, grande]), { titulo: 'Grande', itemId: 'g' });
  const quase = novoTexto({ quadroId: Q, x: 0, y: 100, doc: doc('Quase', { fontSize: '20px' }) }, 1, 'q');
  assert.equal(tituloDaSecao([normal, normal2, normal3, quase]).itemId, null);
});

test('sem destaque, o título é a primeira linha do item mais acima, cortada em 60', () => {
  const longo = 'a'.repeat(100);
  const r = tituloDaSecao([nota('b', 0, 300, 'embaixo'), nota('a', 0, 0, longo)]);
  assert.equal(r.titulo, `${'a'.repeat(60)}…`);
  assert.equal(r.itemId, null);
});

test('texto longo com H1 não vira título (mais de 80 caracteres)', () => {
  const h = novoTexto({ quadroId: Q, x: 0, y: 0, doc: doc('x'.repeat(90), { nivel: 1 }) }, 1, 'h');
  assert.equal(tituloDaSecao([h]).itemId, null);
});

test('molduras aninhadas: maeId e filhas logo depois da mãe', () => {
  const externa = mold('ext', 0, 0, 2000, 2000, 'Externa');
  const interna = { ...mold('int', 100, 100, 500, 500, 'Interna'), molduraId: 'ext' };
  const outra = mold('out', 3000, 0, 500, 500, 'Outra');
  const naInterna = { ...nota('n', 150, 150), molduraId: 'int' };
  const s = secoesDoQuadro([outra, naInterna, interna, externa]);
  assert.deepEqual(s.map((x) => x.id), ['ext', 'int', 'out']);
  assert.equal(s[1]!.maeId, 'ext');
  assert.deepEqual(s[1]!.itemIds, ['n']);
  assert.deepEqual(s[0]!.itemIds, []);
});

test('moldura aninhada sem molduraId é achada pela geometria', () => {
  const externa = mold('ext', 0, 0, 2000, 2000);
  const interna = mold('int', 100, 100, 500, 500);
  const s = secoesDoQuadro([externa, interna]);
  assert.equal(s.find((x) => x.id === 'int')!.maeId, 'ext');
});

test('ordem de leitura das seções', () => {
  const s = secoesDoQuadro([mold('c', 0, 2000, 500, 500), mold('b', 1000, 0, 500, 500), mold('a', 0, 0, 500, 500)]);
  assert.deepEqual(s.map((x) => x.id), ['a', 'b', 'c']);
});

test('setas entre seções dão ligações; setas dentro da mesma seção e pontas livres, não', () => {
  const m1 = mold('m1', 0, 0, 500, 500, 'Um');
  const m2 = mold('m2', 1000, 0, 500, 500, 'Dois');
  const a = { ...nota('a', 50, 50), molduraId: 'm1' };
  const b = { ...nota('b', 1050, 50), molduraId: 'm2' };
  const c = { ...nota('c', 300, 300), molduraId: 'm1' };
  const itens: Item[] = [
    m1, m2, a, b, c,
    novaSeta({ quadroId: Q, de: { itemId: 'a', lado: 'auto' }, para: { itemId: 'b', lado: 'auto' }, rotulo: 'leva a' }, 1, 's1'),
    novaSeta({ quadroId: Q, de: { itemId: 'a', lado: 'auto' }, para: { itemId: 'c', lado: 'auto' } }, 1, 's2'),
    novaSeta({ quadroId: Q, de: { itemId: 'a', lado: 'auto' }, para: { ponto: [5, 5] } }, 1, 's3'),
  ];
  const secoes = secoesDoQuadro(itens);
  assert.deepEqual(ligacoesEntreSecoes(secoes, itens), [{ de: 'm1', para: 'm2', rotulo: 'leva a' }]);
});

test('setas não entram em ilhas', () => {
  const itens: Item[] = [
    nota('a', 0, 0),
    novaSeta({ quadroId: Q, de: { ponto: [0, 0] }, para: { ponto: [10, 10] }, x: 0, y: 0, largura: 10, altura: 10 }, 1, 's'),
  ];
  const s = secoesDoQuadro(itens);
  assert.deepEqual(s.flatMap((x) => x.itemIds), ['a']);
});

test('ilhas de um item pequeno vão para "Soltos" por região, com id estável', () => {
  const traco = (id: string, x: number, y: number) =>
    novoTraco({ quadroId: Q, pontos: [[x, y, 1], [x + 10, y + 10, 1]], cor: '#fff', espessura: 2 } as never, 1, id);
  const itens: Item[] = [
    { ...traco('t1', 100, 100), x: 100, y: 100, largura: 10, altura: 10 },
    { ...traco('t2', 1500, 100), x: 1500, y: 100, largura: 10, altura: 10 },
    { ...traco('t3', 5000, 100), x: 5000, y: 100, largura: 10, altura: 10 },
    nota('grande', 2000, 2000, 'importante'),
  ];
  const s = secoesDoQuadro(itens);
  const soltos = s.filter((x) => x.tipo === 'soltos');
  assert.deepEqual(soltos.map((x) => x.id).sort(), ['soltos:0,0', 'soltos:1,0']);
  assert.deepEqual(soltos.find((x) => x.id === 'soltos:0,0')!.itemIds.sort(), ['t1', 't2']);
  assert.equal(soltos[0]!.titulo, 'Soltos');
  assert.ok(s.some((x) => x.id === 'ilha:grande'));
});

test('imagem gigante junta o que está perto sem explodir', () => {
  const img = novaImagem({ quadroId: Q, x: 0, y: 0, imagemId: 'i', larguraOriginal: 1e6, alturaOriginal: 1e6 }, 1, 'img');
  const s = secoesDoQuadro([img, nota('a', 1e6 + 10, 10), nota('b', 5e6, 5e6)]);
  assert.equal(s.length, 2);
});

test('caixa com rotação usa a caixa envolvente', () => {
  const a = { ...nota('a', 0, 0, 'a', 400, 20), rotacao: 90 };
  const b = nota('b', 100, 300, 'b', 20, 20);
  // girada 90°, a ocupa ~ x 190..210, y -190..210; b está a ~90 px de distância
  assert.equal(secoesDoQuadro([a, b], { vao: 200 }).length, 1);
  assert.equal(secoesDoQuadro([a, b], { vao: 50 }).length, 2);
});

test('OPCOES_PADRAO_SECOES é exportado', () => {
  assert.equal(OPCOES_PADRAO_SECOES.razaoTitulo, 1.6);
});

test('10 mil itens em menos de 300 ms', () => {
  let semente = 12345;
  const rnd = () => {
    semente = (semente * 1664525 + 1013904223) >>> 0;
    return semente / 0x100000000;
  };
  const itens: Item[] = [];
  for (let i = 0; i < 40; i++) itens.push(mold(`m${i}`, (i % 8) * 3000, Math.floor(i / 8) * 3000, 2500, 2500));
  for (let i = 0; i < 10000; i++) {
    itens.push(nota(`n${i}`, rnd() * 24000, rnd() * 15000, `texto ${i}`, 150 + rnd() * 100, 100 + rnd() * 100));
  }
  secoesDoQuadro(itens.slice(0, 200)); // aquece
  const t0 = performance.now();
  const s = secoesDoQuadro(itens);
  const ms = performance.now() - t0;
  console.log(`secoesDoQuadro: ${s.length} seções em ${ms.toFixed(1)} ms`);
  assert.ok(ms < 300, `levou ${ms} ms`);
  assert.equal(new Set(s.map((x) => x.id)).size, s.length);
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { blocosDaSecao, estruturaDaSecao } from '../../src/dominio/estrutura-da-secao.ts';
import type { DocRico, Item, NoRico } from '../../src/dominio/quadro.ts';
import {
  estiloDeCaixaPadrao,
  estiloDeTextoPadrao,
  novaImagem,
  novaMoldura,
  novaNotaAdesiva,
  novaSeta,
} from '../../src/dominio/quadro.ts';
import { secoesDoQuadro, type Secao } from '../../src/dominio/secoes-do-quadro.ts';

const Q = 'q1';
type Marca = NonNullable<NoRico['marks']>[number];
const trecho = (text: string, ...marks: Marca[]): NoRico => ({ type: 'text', text, ...(marks.length ? { marks } : {}) });
const estilo = (attrs: Record<string, unknown>): Marca => ({ type: 'textStyle', attrs });
const paragrafo = (...c: NoRico[]): DocRico => ({ type: 'doc', content: [{ type: 'paragraph', content: c }] });
const simples = (t: string): DocRico => paragrafo(trecho(t));

/** Texto corrido do mestre: `pt-serif`, sem semântica, caixa sem fundo. */
function texto(id: string, x: number, y: number, doc: DocRico, extra: Partial<Item> = {}, tamanho = 14): Item {
  const base = novaNotaAdesiva({ quadroId: Q, x, y, largura: 400, altura: 100, doc }, 1, id);
  return {
    ...base,
    texto: estiloDeTextoPadrao({ fonte: 'pt-serif', tamanho, cor: '#1a1a1a' }),
    caixa: estiloDeCaixaPadrao({ fundo: null, padding: 0 }),
    ...extra,
  } as Item;
}

function colunaDoMestre(): { itens: Item[]; secao: Secao } {
  const itens: Item[] = [
    texto('it-tit1', 1000, 2000, simples('INTRODUÇÃO'), {}, 28),
    texto(
      'it-dd3',
      1000,
      2100,
      paragrafo(
        trecho('Faz três dias que vocês caminham pelo pântano, sob uma chuva fina que não passa nunca. ', estilo({ backgroundColor: 'rgb(255,246,182)' })),
        trecho('Role Sobrevivência.', estilo({ backgroundColor: 'rgb(26,26,26)', color: '#ffffff' }), { type: 'bold' }),
      ),
    ),
    texto('it-regra', 1000, 2400, paragrafo(trecho('Teste de Furtividade CD 13.', estilo({ backgroundColor: 'rgb(26,26,26)', color: '#ffffff' })))),
    texto('it-reg1', 1000, 2300, paragrafo(trecho('[SE UM OU MAIS PERSONAGENS PASSAREM]', estilo({ backgroundColor: 'rgb(101,157,242)' })))),
    texto('it-tit2', 1000, 2500, simples('COMBATE'), {}, 28),
    texto('it-fala1', 1000, 2600, paragrafo(trecho('[AFOGADO] "Oisín…"', estilo({ backgroundColor: 'rgb(173,240,199)' })))),
    novaImagem({ quadroId: Q, x: 1500, y: 2100, imagemId: 'i1', larguraOriginal: 800, alturaOriginal: 600, largura: 200, altura: 150 }, 1, 'it-img1'),
  ];
  const secoes = secoesDoQuadro(itens);
  return { itens, secao: secoes[0]! };
}

test('coluna do mestre: coordenadas relativas, estilo efetivo, destaques e blocos', () => {
  const { itens, secao } = colunaDoMestre();
  assert.equal(secao.tipo, 'ilha');
  const { texto: t, paginas } = estruturaDaSecao(secao, itens);
  assert.equal(paginas, 1);
  const linhas = t.split('\n');
  // Canto da seção em (1000, 2000): coordenadas relativas, múltiplas de 4.
  const dd3 = linhas.find((l) => l.includes('#it-dd3'))!;
  assert.match(dd3, /^- #it-dd3 texto 0,100 400×100 pt-serif 14 #1a1a1a /);
  assert.match(dd3, /destaques: rgb\(255,246,182\) 8\d%, rgb\(26,26,26\) 1\d%/);
  assert.match(dd3, / · "Faz três dias que vocês caminham pelo pântano, sob uma chuva…"$/);
  assert.ok(linhas.indexOf('▸ bloco "INTRODUÇÃO" (#it-tit1)') < linhas.findIndex((l) => l.startsWith('- #it-tit1')));
  assert.ok(linhas.some((l) => l.startsWith('- #it-tit1 texto 0,0 400×100 pt-serif 28')));
  assert.ok(linhas.indexOf('▸ bloco "COMBATE" (#it-tit2)') > linhas.findIndex((l) => l.startsWith('- #it-reg1')));
  assert.ok(linhas.some((l) => l.startsWith('- #it-img imagem ')));
  assert.match(linhas.find((l) => l.startsWith('- #it-regr '))!, /pt-serif 14 #ffffff destaques: rgb\(26,26,26\) 100% · /);
  for (const l of linhas) for (const m of l.matchAll(/ (-?\d+),(-?\d+) /g)) assert.equal(Number(m[1]) % 4 + Number(m[2]) % 4, 0);
});

test('tamanho efetivo vem da marca fontSize e as frações dos destaques somam ~100%', () => {
  const doc = paragrafo(
    trecho('abcd', estilo({ backgroundColor: 'rgb(1,1,1)', fontSize: '20px' })),
    trecho('efgh', estilo({ backgroundColor: 'rgb(2,2,2)' })),
    trecho('ijkl', estilo({ backgroundColor: 'rgb(3,3,3)' })),
    trecho('mnop', estilo({ backgroundColor: 'rgb(4,4,4)' })),
  );
  const itens = [texto('aaaaaa', 100, 100, doc)];
  const secao = secoesDoQuadro(itens)[0]!;
  const l = estruturaDaSecao(secao, itens).texto.split('\n')[1]!;
  assert.match(l, /pt-serif 20 /);
  const fracoes = [...l.matchAll(/rgb\(\d,\d,\d\) (\d+)%/g)].map((m) => Number(m[1]));
  assert.equal(fracoes.length, 3); // no máximo 3
  assert.ok(fracoes.reduce((a, b) => a + b, 0) <= 100 && fracoes.reduce((a, b) => a + b, 0) >= 70);
});

test('negrito, itálico e cor de letra só quando cobrem mais da metade', () => {
  const maioria = paragrafo(trecho('negritão', { type: 'bold' }, { type: 'italic' }, estilo({ color: '#ff0000' })), trecho('x'));
  const minoria = paragrafo(trecho('x'.repeat(20)), trecho('n', { type: 'bold' }, estilo({ color: '#ff0000' })));
  const itens = [texto('aaaaaa', 0, 0, maioria), texto('bbbbbb', 0, 110, minoria)];
  const l = estruturaDaSecao(secoesDoQuadro(itens)[0]!, itens).texto.split('\n');
  assert.match(l[1]!, / #ff0000 negrito itálico /);
  assert.doesNotMatch(l[2]!, /negrito|itálico|#ff0000/);
});

test('formato nota (fundo e sombra) x texto, semântica e do assistente', () => {
  const nota = novaNotaAdesiva({ quadroId: Q, x: 0, y: 0, doc: simples('post-it'), fundo: '#f7e48c', semantica: 'leitura' }, 1, 'nnnnnn') as Item;
  const solto = texto('tttttt', 400, 0, simples('texto corrido'), {
    revisao: { tipoSugerido: null, motivos: [], origem: 'assistente' },
  });
  const solto0 = solto as Extract<Item, { tipo: 'texto' }>;
  const doMiro = { ...solto0, id: 'mmmmmm', y: solto0.y + solto0.altura + 20, caixa: { ...solto0.caixa, fundo: '#ffffff', borda: null, sombra: false } } as Item;
  const itens = [nota, solto, doMiro];
  const l = secoesDoQuadro(itens).flatMap((s) => estruturaDaSecao(s, itens).texto.split('\n'));
  assert.match(l.find((x) => x.startsWith('- #mmmmmm'))!, /^- #mmmmmm texto .* caixa:#ffffff/);
  assert.match(l.find((x) => x.startsWith('- #nnnnnn'))!, /^- #nnnnnn nota .* caixa:#f7e48c .*\[leitura\] · "post-it"$/);
  assert.match(l.find((x) => x.startsWith('- #tttttt'))!, /^- #tttttt texto .*\[do assistente\] · "texto corrido"$/);
});

test('blocos por fonte e por semântica; ilha sem título interno = nenhum bloco', () => {
  const { itens, secao } = colunaDoMestre();
  const blocos = blocosDaSecao(secao, itens);
  assert.deepEqual(blocos.map((b) => [b.tituloId, b.titulo]), [['it-tit1', 'INTRODUÇÃO'], ['it-tit2', 'COMBATE']]);
  assert.deepEqual(blocos[0]!.itemIds, ['it-dd3', 'it-img1', 'it-reg1', 'it-regra']);
  assert.ok(blocos[1]!.itemIds.includes('it-fala1'));

  // Por semântica: mesma fonte, mas `titulo`.
  const sem = [
    texto('aaaaaa', 0, 0, simples('Capítulo um'), { semantica: 'titulo' } as Partial<Item>),
    texto('bbbbbb', 0, 120, simples('corpo')),
  ];
  const b = blocosDaSecao(secoesDoQuadro(sem)[0]!, sem);
  assert.deepEqual(b, [{ tituloId: 'aaaaaa', titulo: 'Capítulo um', itemIds: ['bbbbbb'] }]);

  // Sem título interno: tudo na mesma fonte, nenhum bloco e nenhuma linha ▸.
  const planos = [texto('cccccc', 0, 0, simples('um')), texto('dddddd', 0, 120, simples('dois'))];
  const sp = secoesDoQuadro(planos)[0]!;
  assert.deepEqual(blocosDaSecao(sp, planos), []);
  assert.doesNotMatch(estruturaDaSecao(sp, planos).texto, /▸/);
});

test('moldura filha, setas no fim e relativas à moldura', () => {
  const itens: Item[] = [
    { ...novaMoldura({ quadroId: Q, x: 500, y: 500, largura: 2000, altura: 1500, titulo: 'Cap' }, 1, 'm1') } as Item,
    { ...texto('aaaaaa', 600, 600, simples('um')), molduraId: 'm1' } as Item,
    { ...texto('bbbbbb', 600, 800, simples('dois')), molduraId: 'm1' } as Item,
    { ...novaMoldura({ quadroId: Q, x: 1500, y: 1000, largura: 800, altura: 600, titulo: 'Filha' }, 1, 'f1'), molduraId: 'm1' } as Item,
    novaSeta({ quadroId: Q, de: { itemId: 'aaaaaa', lado: 'baixo' }, para: { itemId: 'bbbbbb', lado: 'cima' }, rotulo: 'depois' }, 1, 's1'),
  ];
  const secoes = secoesDoQuadro(itens);
  const secao = secoes.find((s) => s.id === 'm1')!;
  const linhas = estruturaDaSecao(secao, itens, { secoes }).texto.split('\n');
  assert.ok(linhas.some((l) => l.startsWith('- #aaaaaa texto 100,100 ')));
  assert.ok(linhas.some((l) => l.startsWith('- #f1 moldura 1000,500 800×600')));
  assert.equal(linhas[linhas.length - 1], '- seta #aaaaaa → #bbbbbb: depois');
});

test('paginação: respeita o limite e a página pedida', () => {
  const itens: Item[] = Array.from({ length: 40 }, (_, i) =>
    texto(`it${String(i).padStart(4, '0')}`, 0, i * 150, simples(`linha numero ${i} com algum texto para ocupar espaço`)),
  );
  const secao = secoesDoQuadro(itens)[0]!;
  const p1 = estruturaDaSecao(secao, itens, { limiteTokens: 200 });
  assert.ok(p1.paginas > 1);
  assert.match(p1.texto, new RegExp(`… página 1 de ${p1.paginas}$`));
  const p2 = estruturaDaSecao(secao, itens, { limiteTokens: 200, pagina: 2 });
  assert.match(p2.texto, new RegExp(`… página 2 de ${p1.paginas}$`));
  assert.notEqual(p1.texto, p2.texto);
  assert.match(estruturaDaSecao(secao, itens, { limiteTokens: 200, pagina: 99 }).texto, new RegExp(`página ${p1.paginas} de`));
});

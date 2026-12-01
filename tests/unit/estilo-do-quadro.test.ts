import assert from 'node:assert/strict';
import { test } from 'node:test';
import { estiloDoQuadro, textoDoEstilo } from '../../src/dominio/estilo-do-quadro.ts';
import type { DocRico, Item, NoRico } from '../../src/dominio/quadro.ts';
import { estiloDeCaixaPadrao, estiloDeTextoPadrao, novaImagem, novaNotaAdesiva } from '../../src/dominio/quadro.ts';
import { estimarTokens } from '../../src/dominio/texto-da-secao.ts';

const Q = 'q1';
type Marca = NonNullable<NoRico['marks']>[number];
const trecho = (text: string, ...marks: Marca[]): NoRico => ({ type: 'text', text, ...(marks.length ? { marks } : {}) });
const estilo = (attrs: Record<string, unknown>): Marca => ({ type: 'textStyle', attrs });
const paragrafo = (...c: NoRico[]): DocRico => ({ type: 'doc', content: [{ type: 'paragraph', content: c }] });
const simples = (t: string): DocRico => paragrafo(trecho(t));

/** Texto corrido do mestre (como no Miro): `pt-serif`, caixa branca sem sombra, sem semântica. */
function texto(id: string, x: number, y: number, doc: DocRico, tamanho = 14, extra: Partial<Item> = {}): Item {
  const base = novaNotaAdesiva({ quadroId: Q, x, y, largura: 400, altura: 76, doc }, 1, id);
  return {
    ...base,
    texto: estiloDeTextoPadrao({ fonte: 'pt-serif', tamanho, cor: '#1a1a1a' }),
    caixa: estiloDeCaixaPadrao({ fundo: '#ffffff', padding: 0, sombra: false }),
    ...extra,
  } as Item;
}

function colunaDoMestre(): Item[] {
  const preto = estilo({ backgroundColor: 'rgb(26,26,26)', color: '#ffffff' });
  return [
    texto('it-tit1', 1000, 2000, simples('INTRODUÇÃO'), 28),
    texto('it-dd3', 1000, 2100, paragrafo(trecho('Faz três dias que vocês caminham pelo pântano, sob uma chuva fina que não passa nunca. ', estilo({ backgroundColor: 'rgb(255,246,182)' })), trecho('Role Sobrevivência.', preto))),
    texto('it-regra', 1000, 2200, paragrafo(trecho('Teste de Furtividade CD 13.', preto))),
    texto('it-reg1', 1000, 2300, paragrafo(trecho('[SE UM OU MAIS PERSONAGENS PASSAREM]', estilo({ backgroundColor: 'rgb(101,157,242)' })))),
    texto('it-tit2', 1000, 2400, simples('COMBATE'), 28),
    texto('it-fala1', 1000, 2500, paragrafo(trecho('[AFOGADO] "Oisín, é você?"', estilo({ backgroundColor: 'rgb(173,240,199)' })))),
    texto('it-fala2', 1000, 2600, paragrafo(trecho('[AFOGADO] "Não vá embora."', estilo({ backgroundColor: 'rgb(173,240,199)' })))),
    novaImagem({ quadroId: Q, x: 1500, y: 2100, imagemId: 'i1', larguraOriginal: 800, alturaOriginal: 600, largura: 200, altura: 150 }, 1, 'it-img1'),
  ];
}

test('coluna do mestre: fluxo, estilos, destaques, imagens e semântica', () => {
  const e = estiloDoQuadro(colunaDoMestre())!;
  assert.equal(e.fluxo, 'coluna');
  assert.deepEqual(e.coluna, { x: 0, largura: 400, espacoVertical: 24 });
  assert.equal(e.espacoVertical, 24);
  assert.equal(e.larguraDaColuna, 400);
  assert.deepEqual(e.imagens, { lado: 'direita', largura: 200 });
  assert.equal(e.exemploTitulo, 'it-tit1');
  assert.equal(e.exemploCorpo, 'it-dd3');
  const [t, c] = e.grupos;
  assert.deepEqual([t!.papel, t!.contagem, t!.tamanho, t!.fonte], ['titulo', 2, 28, 'pt-serif']);
  assert.deepEqual([c!.papel, c!.contagem, c!.formato, c!.fundo], ['corpo', 5, 'texto', '#ffffff']);
  assert.equal(e.destaques.length, 4);
  const por = Object.fromEntries(e.destaques.map((d) => [d.cor, d]));
  assert.equal(por['rgb(255,246,182)']!.uso, 'narração');
  assert.equal(por['rgb(101,157,242)']!.uso, 'condição/rótulo');
  assert.equal(por['rgb(173,240,199)']!.uso, 'fala');
  assert.equal(por['rgb(26,26,26)']!.uso, null);
  assert.equal(por['rgb(26,26,26)']!.corDaLetra, '#ffffff');
  assert.equal(por['rgb(26,26,26)']!.exemplo, 'it-regra');
  assert.equal(e.semantica.fracao, 0);

  const t2 = textoDoEstilo(e);
  assert.ok(estimarTokens(t2) < 600);
  assert.match(t2, /Fluxo: coluna em x=0, largura ~400, 24 px entre itens; imagens à direita \(~200 px\)/);
  assert.match(t2, /Título \(2\): texto pt-serif 28 #1a1a1a, caixa #ffffff, largura ~400 \(exemplo #it-tit1\)/);
  assert.match(t2, /rgb\(26,26,26\) letra #ffffff 46 car\. \(#it-regr\)/);
  assert.match(t2, /rgb\(173,240,199\) fala\?/);
  assert.match(t2, /o mestre não usa post-its tipados; não use cores por tipo/);
  assert.ok(t2.includes('\n'));
});

test('itens do assistente são ignorados', () => {
  const itens = colunaDoMestre();
  const sem = estiloDoQuadro(itens)!;
  // Cinco notas do assistente, com post-it tipado e outra fonte, fora da coluna.
  for (let i = 0; i < 5; i++) {
    const n = novaNotaAdesiva({ quadroId: Q, x: 1000 + i * 500, y: 2000, largura: 200, altura: 100, doc: simples('ideia ' + i) }, 1, `it-ass${i}`);
    itens.push({ ...n, semantica: 'segredo', texto: estiloDeTextoPadrao({ fonte: 'open-sans', tamanho: 12 }), revisao: { origem: 'assistente' } } as unknown as Item);
  }
  const com = estiloDoQuadro(itens)!;
  assert.deepEqual(com.grupos, sem.grupos);
  assert.equal(com.fluxo, 'coluna');
  assert.equal(com.semantica.fracao, 0);
  assert.equal(com.itensDeTexto, sem.itensDeTexto);
});

test('fluxo em grade', () => {
  const itens: Item[] = [];
  for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) itens.push(texto(`it-g${r}${c}`, c * 410, r * 100, simples('nota ' + r + c)));
  const e = estiloDoQuadro(itens)!;
  assert.equal(e.fluxo, 'grade');
  assert.equal(e.coluna, null);
  assert.equal(e.espacoVertical, null);
  assert.match(textoDoEstilo(e), /Fluxo: grade/);
});

test('quadro só de post-its tipados', () => {
  const itens: Item[] = [];
  for (let i = 0; i < 4; i++) {
    const n = novaNotaAdesiva({ quadroId: Q, x: i * 300, y: 0, largura: 200, altura: 100, doc: simples('pista ' + i) }, 1, `it-n${i}`);
    itens.push({ ...n, semantica: 'segredo' } as Item);
  }
  const e = estiloDoQuadro(itens)!;
  assert.equal(e.semantica.fracao, 1);
  assert.equal(e.grupos[0]!.formato, 'nota');
  assert.equal(e.destaques.length, 0);
  const t = textoDoEstilo(e);
  assert.match(t, /Semântica: 100% dos itens\./);
  assert.ok(!t.includes('não use cores por tipo'));
});

test('sem texto do mestre', () => {
  assert.equal(estiloDoQuadro([]), null);
  assert.match(textoDoEstilo(null), /Não há seção/);
});

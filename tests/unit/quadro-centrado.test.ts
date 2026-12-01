import assert from 'node:assert/strict';
import { test } from 'node:test';
import { estiloDoQuadro, textoDoEstilo } from '../../src/dominio/estilo-do-quadro.ts';
import { estruturaDaSecao, numeroCurto } from '../../src/dominio/estrutura-da-secao.ts';
import { posicionarEmColuna } from '../../src/dominio/insercao-quadro.ts';
import type { DocRico, Item, NoRico } from '../../src/dominio/quadro.ts';
import { estiloDeCaixaPadrao, estiloDeTextoPadrao, novaImagem, novaMoldura, novaNotaAdesiva } from '../../src/dominio/quadro.ts';
import { secoesDoQuadro } from '../../src/dominio/secoes-do-quadro.ts';

// O quadro real do mestre: coluna centrada num eixo (x≈910 na seção), com pares lado a lado.
const Q = 'q1';
const X0 = 1000;
const Y0 = 2000;
type Marca = NonNullable<NoRico['marks']>[number];
const trecho = (text: string, ...marks: Marca[]): NoRico => ({ type: 'text', text, ...(marks.length ? { marks } : {}) });
const estilo = (attrs: Record<string, unknown>): Marca => ({ type: 'textStyle', attrs });
const doc = (...c: NoRico[]): DocRico => ({ type: 'doc', content: [{ type: 'paragraph', content: c }] });
const AMARELO = estilo({ backgroundColor: 'rgb(255,246,182)' });
const ESCURO = estilo({ backgroundColor: 'rgb(26,26,26)', color: '#ffffff' });
const AZUL = estilo({ backgroundColor: 'rgb(101,157,242)' });
const VERDE = estilo({ backgroundColor: 'rgb(173,240,199)' });
const NARRACAO = 'Vocês estão no pântano há três dias e vocês veem a névoa subir; seus passos afundam na lama e suas botas pesam. ';
const REGRA = 'Peça um teste de Percepção CD 13 a quem vigia. Em caso de falha, o grupo perde a iniciativa no primeiro turno. ';

function t(id: string, x: number, y: number, largura: number, altura: number, d: DocRico, tamanho = 14.001579488255537): Item {
  const base = novaNotaAdesiva({ quadroId: Q, x: X0 + x, y: Y0 + y, largura, altura, doc: d }, 1, id);
  return { ...base, texto: estiloDeTextoPadrao({ fonte: 'pt-serif', tamanho, cor: '#1a1a1a' }), caixa: estiloDeCaixaPadrao({ fundo: '#ffffff', padding: 0, sombra: false }) } as Item;
}
const narr = (id: string, x: number, y: number, w: number, h: number) => t(id, x, y, w, h, doc(trecho(NARRACAO.repeat(2), AMARELO)));
const regra = (id: string, x: number, y: number, w: number, h: number) => t(id, x, y, w, h, doc(trecho(REGRA.repeat(2), ESCURO)));

function casoReal(): Item[] {
  return [
    novaMoldura({ quadroId: Q, x: X0, y: Y0, largura: 2000, altura: 2700, titulo: 'Capítulo 1' }, 1, 'mold'),
    t('it-e8c', 744, 1064, 332, 76, doc(trecho('INTRODUÇÃO', { type: 'bold' })), 45.251879487713026),
    narr('it-dd3', 388, 1152, 488, 204),
    narr('it-8af', 956, 1152, 616, 260),
    narr('it-224d', 724, 1440, 372, 112),
    regra('it-6b2', 680, 1548, 460, 92),
    t('it-b1c', 712, 1644, 392, 40, doc(trecho('[SE FALHAREM NO TESTE]', AZUL))),
    narr('it-77a', 732, 1688, 372, 128),
    regra('it-b1f', 696, 1824, 432, 184),
    t('it-420', 760, 2048, 332, 76, doc(trecho('COMBATE', { type: 'bold' })), 45.251879487713026),
    novaImagem({ quadroId: Q, x: X0 + 1380, y: Y0 + 2104, imagemId: 'i1', larguraOriginal: 360, alturaOriginal: 420, largura: 360, altura: 420 }, 1, 'it-954'),
    narr('it-cb6', 672, 2132, 472, 168),
    regra('it-9f4', 404, 2312, 468, 240),
    regra('it-dd1', 932, 2316, 332, 92),
    narr('it-323', 932, 2404, 412, 56),
    t('it-d13', 940, 2440, 332, 56, doc(trecho('[AFOGADO] "Oisín, é você?"', VERDE))),
    regra('it-4be', 932, 2492, 364, 56),
  ];
}

test('arredondamento de tamanhos de fonte: 1 casa decimal, sem .0', () => {
  assert.equal(numeroCurto(45.251879487713026), '45.3');
  assert.equal(numeroCurto(14.001579488255537), '14');
  assert.equal(numeroCurto(70.58823529411765), '70.6');
  assert.equal(numeroCurto(16.9), '16.9');
});

test('caso real: o fluxo é centrado num eixo, com palpites de uso e fontes arredondadas', () => {
  const itens = casoReal();
  const secao = secoesDoQuadro(itens).find((s) => s.itemIds.includes('it-e8c'))!;
  const e = estiloDoQuadro(itens, secao)!;
  assert.equal(e.fluxo, 'centrado');
  assert.equal(e.coluna, null);
  assert.equal(e.eixo!.x, 910);
  assert.equal(e.eixo!.xAbsoluto, X0 + 910);
  assert.deepEqual(e.imagens, { lado: 'direita', largura: 360 });
  const usos = Object.fromEntries(e.destaques.map((d) => [d.cor, d.uso]));
  assert.equal(usos['rgb(255,246,182)'], 'narração');
  assert.equal(usos['rgb(26,26,26)'], 'regras/instruções');
  assert.equal(usos['rgb(101,157,242)'], 'condição/rótulo');
  assert.equal(usos['rgb(173,240,199)'], 'fala');
  const texto = textoDoEstilo(e);
  assert.match(texto, /Fluxo: centrado num eixo em x≈910 \(itens centrados\), \d+ px entre itens; imagens à direita \(~360 px\)\./);
  assert.match(texto, /pt-serif 45\.3 /);
  assert.match(texto, /pt-serif 14 /);
  assert.ok(!/\d\.\d{2,}/.test(texto.split('\n').filter((l) => /^(Título|Corpo)/.test(l)).join('\n')));
  assert.match(texto, /rgb\(26,26,26\) letra #ffffff regras\/instruções\?/);
  assert.match(texto, /rgb\(255,246,182\) narração\?/);
  const est = estruturaDaSecao(secao, itens).texto;
  assert.ok(!/\d\.\d{2,}/.test(est));
  assert.match(est, /pt-serif 45\.3 /);
});

test('palpite de narração exige segunda pessoa relevante; sem ela fica sem palpite', () => {
  const itens = [
    t('it-a', 0, 0, 400, 80, doc(trecho('O pântano é frio e a névoa é espessa, sem nenhum som além da água. '.repeat(3), AMARELO))),
    t('it-b', 0, 100, 400, 80, doc(trecho('Descreva a cena com calma e aguarde as perguntas do grupo. '.repeat(3), estilo({ backgroundColor: 'rgb(200,200,200)' })))),
  ];
  const e = estiloDoQuadro(itens)!;
  assert.ok(e.destaques.every((d) => d.uso === null));
});

test('quadro_inserir centrado: abaixo de um título, itens no centro dele', () => {
  const itens = casoReal();
  const tit = itens.find((i) => i.id === 'it-420')!;
  const r = posicionarEmColuna([76, 120], [332, 472], itens, { abaixoDe: tit }, 24, { alinhar: 'centro' });
  assert.deepEqual(r.posicoes, [{ x: X0 + 760, y: Y0 + 2552 + 24 }, { x: X0 + 690, y: Y0 + 2552 + 24 + 76 + 24 }]);
  assert.equal(r.caixa.x, X0 + 690);
  assert.equal(r.caixa.largura, 472);
  // Sem alinhar, ficam pela borda esquerda do título.
  const e = posicionarEmColuna([76, 120], [332, 472], itens, { abaixoDe: tit }, 24);
  assert.deepEqual(e.posicoes.map((p) => p.x), [X0 + 760, X0 + 760]);
});

test('quadro_inserir centrado: seção usa o eixo; abrir_espaco usa a união das larguras centradas', () => {
  const itens = casoReal();
  const secao = secoesDoQuadro(itens).find((s) => s.itemIds.includes('it-e8c'))!;
  const eixo = X0 + 910;
  const r = posicionarEmColuna([50], [300], itens, { abaixoDeSecao: secao }, 24, { alinhar: 'centro', eixo });
  assert.equal(r.posicoes[0]!.x, eixo - 150);
  // Abrir espaço abaixo da introdução: a região recortada é a das larguras centradas (332 e 500).
  const intro = itens.find((i) => i.id === 'it-e8c')!;
  assert.throws(() => posicionarEmColuna([50], [500], itens, { abaixoDe: intro }, 24, { alinhar: 'centro' }), /Não há espaço livre/);
  const a = posicionarEmColuna([50], [500], itens, { abaixoDe: intro }, 24, { alinhar: 'centro', abrirEspaco: true });
  assert.equal(a.posicoes[0]!.x, X0 + 744 + 166 - 250);
  assert.ok(a.empurrar.length > 0);
});

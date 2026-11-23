import assert from 'node:assert/strict';
import { test } from 'node:test';
import { legendaDaImagemMiro } from '../../src/dominio/miro.ts';
import type { DocRico, Item } from '../../src/dominio/quadro.ts';
import {
  novaImagem,
  novaMoldura,
  novaNotaAdesiva,
  novaRef,
  novaSeta,
  validarItem,
} from '../../src/dominio/quadro.ts';
import { secoesDoQuadro } from '../../src/dominio/secoes-do-quadro.ts';
import { estimarTokens, idsCurtos, textoDaSecao } from '../../src/dominio/texto-da-secao.ts';

const Q = 'q1';
const doc = (...linhas: string[]): DocRico => ({
  type: 'doc',
  content: linhas.map((t) => ({ type: 'paragraph', content: [{ type: 'text', text: t }] })),
});
const nota = (id: string, x: number, y: number, texto: string, extra: Partial<Item> = {}) =>
  ({
    ...novaNotaAdesiva({ quadroId: Q, x, y, largura: 200, altura: 100, doc: doc(...texto.split('\n')) }, 1, id),
    ...extra,
  }) as Item;
const mold = (id: string, x: number, y: number, l: number, a: number, titulo: string, mae: string | null = null) =>
  ({ ...novaMoldura({ quadroId: Q, x, y, largura: l, altura: a, titulo }, 1, id), molduraId: mae }) as Item;
const em = (itens: Item[], x: Item[]) => x.map((i) => ({ ...i, molduraId: i.molduraId ?? 'm1' }));

function cena(): { itens: Item[]; secao: ReturnType<typeof secoesDoQuadro>[number] } {
  const itens: Item[] = [
    mold('m1', 0, 0, 2000, 1500, 'Capítulo 1'),
    ...(em([], [
      nota('aaaaaa111', 100, 100, 'A estalagem do Corvo\nChove sem parar'),
      novaImagem({ quadroId: Q, x: 400, y: 100, imagemId: 'i1', larguraOriginal: 800, alturaOriginal: 600, largura: 200, altura: 100 }, 1, 'img999999'),
      nota('bbbbbb222', 100, 400, '[PERCEPÇÃO 13] pegadas na lama', { semantica: 'teste', soMestre: true }),
      nota('cccccc333', 400, 400, 'Cofre aberto [SEGREDO] [LOOT se:poeira]', { feito: { em: 1, sessaoId: null } }),
    ])),
    mold('f1', 1000, 600, 800, 600, 'Porão', 'm1'),
    novaSeta({ quadroId: Q, de: { itemId: 'aaaaaa111', lado: 'baixo' }, para: { itemId: 'bbbbbb222', lado: 'cima' }, rotulo: 'depois' }, 1, 'seta1'),
    novaSeta({ quadroId: Q, de: { itemId: 'cccccc333', lado: 'baixo' }, para: { ponto: [500, 500] }, rotulo: '' }, 1, 'seta2'),
    nota('f2', 1100, 700, 'dentro do porão', { molduraId: 'f1' }),
  ];
  const secoes = secoesDoQuadro(itens);
  return { itens, secao: secoes.find((s) => s.id === 'm1')! };
}

test('ordem de leitura, marcadores, estado, setas e filha', () => {
  const { itens, secao } = cena();
  const r = textoDaSecao(secao, itens);
  console.log(r.texto);
  const linhas = r.texto.split('\n');
  assert.equal(linhas[0], '§ Capítulo 1 (moldura, 4 itens)');
  assert.ok(linhas.indexOf('- #aaaaaa A estalagem do Corvo / Chove sem parar') < linhas.indexOf('- #bbbbbb [teste] [PERCEPÇÃO 13] pegadas na lama (só mestre)'));
  assert.ok(r.texto.includes('[PERCEPÇÃO 13]'));
  assert.ok(r.texto.includes('- #cccccc ✓ Cofre aberto [SEGREDO] [LOOT se:poeira] (segredo)'));
  assert.ok(r.texto.includes('§ Porão (seção f1, 1 item)'));
  assert.ok(!r.texto.includes('dentro do porão'));
  assert.ok(r.texto.includes('"A estalagem do Corvo" #aaaaaa → "[PERCEPÇÃO 13] pegadas na lama" #bbbbbb: depois'));
  assert.ok(r.texto.includes('"Cofre aberto [SEGREDO] [LOOT se:poeira]" #cccccc → (ponto livre)'));
  assert.equal(r.paginas, 1);
  assert.equal(r.tokens, estimarTokens(r.texto));
});

test('imagem com e sem legenda', () => {
  const img = novaImagem({ quadroId: Q, x: 0, y: 0, imagemId: 'i', larguraOriginal: 640, alturaOriginal: 480 }, 1, 'abcdef0123');
  const com = { ...img, id: 'zzzzzz9999', y: 500, legenda: 'Mapa da vila' } as Item;
  const itens = [img, com];
  const s = secoesDoQuadro(itens, { vao: 10 });
  const texto = s.map((x) => textoDaSecao(x, itens).texto).join('\n');
  assert.ok(texto.includes('[imagem #abcdef: sem legenda, 640x480]'));
  assert.ok(texto.includes('[imagem #zzzzzz: Mapa da vila, 640x480]'));
});

test('cartão de entidade e outros refs', () => {
  const e = novaRef({ quadroId: Q, x: 0, y: 0, ref: { app: 'mesa', tipo: 'entidade', id: 'e1' } }, 1, 'refent0001');
  const o = { ...novaRef({ quadroId: Q, x: 0, y: 300, ref: { app: 'atlas', tipo: 'mapa', id: 'm9' } }, 1, 'refmap0002') } as Item;
  const itens = [e, o];
  const [sec] = secoesDoQuadro(itens, { vao: 1000 });
  const t = textoDaSecao(sec!, itens, { entidades: new Map([['e1', { nome: 'Lia', tipo: 'personagem' }]]) }).texto;
  assert.ok(t.includes('[entidade: Lia (personagem)]'));
  assert.ok(t.includes('[ref: mesa:atlas/mapa/m9]'), t);
});

test('titulos é bem menor que completo', () => {
  const longo = 'palavra '.repeat(60).trim();
  const itens: Item[] = [mold('m1', 0, 0, 3000, 3000, 'T')];
  for (let i = 0; i < 10; i++) itens.push(nota(`n${i}xxxxxxx`, 100, 100 + i * 200, `Linha um ${i}\n${longo}`, { molduraId: 'm1' }));
  const [sec] = secoesDoQuadro(itens);
  const c = textoDaSecao(sec!, itens, { nivel: 'completo' });
  const t = textoDaSecao(sec!, itens, { nivel: 'titulos' });
  assert.ok(t.tokens * 4 < c.tokens);
  assert.ok(t.texto.includes('Linha um 3'));
  assert.ok(!t.texto.includes('palavra'));
});

test('paginação respeita o limite e não corta item', () => {
  const itens: Item[] = [mold('m1', 0, 0, 3000, 5000, 'T')];
  for (let i = 0; i < 30; i++) itens.push(nota(`n${String(i).padStart(2, '0')}xxxxxxx`, 100, 100 + i * 120, `Item ${i} ${'x'.repeat(100)}`, { molduraId: 'm1' }));
  const [sec] = secoesDoQuadro(itens);
  const limite = 200;
  const p1 = textoDaSecao(sec!, itens, { limiteTokens: limite, pagina: 1 });
  assert.ok(p1.paginas > 1);
  let total = 0;
  const vistos = new Set<string>();
  for (let p = 1; p <= p1.paginas; p++) {
    const r = textoDaSecao(sec!, itens, { limiteTokens: limite, pagina: p });
    assert.ok(r.tokens <= limite, `página ${p}: ${r.tokens}`);
    assert.ok(r.texto.endsWith(`… página ${p} de ${p1.paginas}`));
    for (const l of r.texto.split('\n')) if (l.startsWith('- #')) vistos.add(l);
    total += r.tokens;
  }
  assert.equal(vistos.size, 30);
  assert.ok(vistos.size === 30 && [...vistos].every((l) => l.endsWith('x'.repeat(100))));
  assert.equal(p1.tokensTotais, total);
  assert.equal(textoDaSecao(sec!, itens, { limiteTokens: limite, pagina: 99 }).texto.endsWith(`página ${p1.paginas} de ${p1.paginas}`), true);
});

test('item sozinho maior que o limite sai inteiro com marca', () => {
  const itens: Item[] = [
    mold('m1', 0, 0, 3000, 3000, 'T'),
    nota('curto0001', 100, 100, 'curto', { molduraId: 'm1' }),
    nota('longo0001', 100, 400, 'y'.repeat(2000), { molduraId: 'm1' }),
  ];
  const [sec] = secoesDoQuadro(itens);
  const total = textoDaSecao(sec!, itens, { limiteTokens: 100 });
  assert.equal(total.paginas, 2);
  const p2 = textoDaSecao(sec!, itens, { limiteTokens: 100, pagina: 2 });
  assert.ok(p2.texto.includes('y'.repeat(2000)));
  assert.ok(p2.texto.includes('(item longo)'));
});

test('ids curtos sem colisão', () => {
  const m = idsCurtos(['abcdef1', 'abcdef2', 'xyz', 'abcdef1']);
  assert.equal(m.get('abcdef1'), 'abcdef1');
  assert.equal(m.get('abcdef2'), 'abcdef2');
  assert.equal(m.get('xyz'), 'xyz');
  assert.equal(new Set(m.values()).size, 3);
  const n = idsCurtos(['abcdef', 'ghijkl']);
  assert.equal(n.get('abcdef'), 'abcdef');
  const itens = [nota('abcdef11', 0, 0, 'um'), nota('abcdef22', 0, 300, 'dois')];
  const [s] = secoesDoQuadro(itens, { vao: 1000 });
  const t = textoDaSecao(s!, itens).texto;
  assert.ok(t.includes('#abcdef1 ') && t.includes('#abcdef2 '));
});

test('legenda: validação e conversão do título do Miro', () => {
  const img = novaImagem({ quadroId: Q, x: 0, y: 0, imagemId: 'i', larguraOriginal: 10, alturaOriginal: 10 }, 1, 'i1');
  validarItem({ ...img, legenda: 'ok' });
  assert.throws(() => validarItem({ ...img, legenda: '' }));
  assert.throws(() => validarItem({ ...img, legenda: 'a'.repeat(301) }));
  validarItem({ ...img, legenda: 'a'.repeat(300) });
  assert.equal(legendaDaImagemMiro('  Mapa   da  vila.PNG '), 'Mapa da vila');
  assert.equal(legendaDaImagemMiro('foto.jpg'), 'foto');
  assert.equal(legendaDaImagemMiro('   '), undefined);
  assert.equal(legendaDaImagemMiro(undefined), undefined);
});

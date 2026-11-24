import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ferramentasDaMesa } from '../../src/app/ponte-ferramentas.ts';
import { ferramentasDeQuadros, type ContextoDeQuadros } from '../../src/app/ponte-quadros.ts';
import type { DocRico, Item, Quadro } from '../../src/dominio/quadro.ts';
import { novaImagem, novaMoldura, novaNotaAdesiva, novoQuadro } from '../../src/dominio/quadro.ts';

const doc = (...linhas: string[]): DocRico => ({ type: 'doc', content: linhas.map(t => ({ type: 'paragraph', content: [{ type: 'text', text: t }] })) });
const nota = (qid: string, id: string, x: number, y: number, texto: string, mae: string | null = null) =>
  ({ ...novaNotaAdesiva({ quadroId: qid, x, y, largura: 200, altura: 100, doc: doc(texto) }, 1, id), molduraId: mae }) as Item;

function montar(opcoes: { campanha?: boolean; aberto?: boolean; semArquivo?: boolean } = {}) {
  const q1: Quadro = novoQuadro('c1', 'Reino Vermelho', 1, 'q1aaaa');
  const q2: Quadro = novoQuadro('c1', 'Masmorra', 1, 'q2bbbb');
  const itens1: Item[] = [
    { ...novaMoldura({ quadroId: 'q1aaaa', x: 0, y: 0, largura: 900, altura: 600, titulo: 'Capítulo 1' }, 1, 'm1'), molduraId: null } as Item,
    nota('q1aaaa', 'n1xxxxxx', 20, 40, 'O rei Aldric esconde uma coroa falsa no porão', 'm1'),
    nota('q1aaaa', 'n2xxxxxx', 260, 40, 'A ESTALAGEM fica ao norte', 'm1'),
    { ...novaImagem({ quadroId: 'q1aaaa', x: 20, y: 200, imagemId: 'img1', larguraOriginal: 800, alturaOriginal: 600 }, 1, 'i1yyyyyy'), legenda: 'Mapa do reino', molduraId: 'm1' } as Item,
  ];
  const itens2: Item[] = [nota('q2bbbb', 'n3zzzzzz', 0, 0, 'Corredor com armadilhas e a coroa verdadeira')];
  const chamadas: { id: string; lado: number }[] = [];
  const ctx: ContextoDeQuadros = {
    campanha: async () => (opcoes.campanha === false ? null : { id: 'c1', nome: 'C' }),
    quadros: async () => [q1, q2],
    itens: async id => (id === 'q1aaaa' ? itens1 : itens2),
    aberto: () => (opcoes.aberto ? { quadro: q1, itens: [...itens1, nota('q1aaaa', 'n9nnnnnn', 600, 400, 'Nota só na memória', 'm1')] } : null),
    async imagem(id, lado) { chamadas.push({ id, lado }); return opcoes.semArquivo ? null : 'data:image/jpeg;base64,QUJD'; },
  };
  const f = Object.fromEntries(ferramentasDeQuadros(ctx).map(t => [t.nome, t]));
  return { f, chamadas };
}
const lerJson = async (p: Promise<{ tipo: string; texto?: string }[]>) => JSON.parse((await p)[0]!.texto!);
const lerTexto = async (p: Promise<{ tipo: string; texto?: string }[]>) => (await p)[0]!.texto!;

test('quadros_listar: seções, itens e tokens de cada quadro', async () => {
  const { f } = montar();
  const r = await lerJson(f.quadros_listar!.executar({}));
  assert.equal(r.length, 2);
  assert.equal(r[0].nome, 'Reino Vermelho');
  assert.equal(r[0].itens, 4);
  assert.ok(r[0].secoes >= 1 && r[0].tokens > 0);
});

test('quadro_mapa: aceita nome (sem acento/caixa) ou id e mostra a seção', async () => {
  const { f } = montar();
  const porNome = await lerTexto(f.quadro_mapa!.executar({ quadro: 'reino' }));
  assert.match(porNome, /Capítulo 1/);
  assert.equal(await lerTexto(f.quadro_mapa!.executar({ quadro: 'q1aaaa' })), porNome);
});

test('quadro_secao: titulos por padrão, completo e id curto; seção por id ou título', async () => {
  const { f } = montar();
  const t = await lerTexto(f.quadro_secao!.executar({ quadro: 'Reino Vermelho', secao: 'm1' }));
  assert.match(t, /#n1xxxx/);
  assert.match(t, /\[imagem #i1yyyy: Mapa do reino/);
  const porTitulo = await lerTexto(f.quadro_secao!.executar({ quadro: 'Reino Vermelho', secao: 'capitulo 1', nivel: 'completo' }));
  assert.match(porTitulo, /coroa falsa/);
  await assert.rejects(f.quadro_secao!.executar({ quadro: 'Reino Vermelho', secao: 'm1', nivel: 'x' }), /nivel/);
  await assert.rejects(f.quadro_secao!.executar({ quadro: 'Reino Vermelho', secao: 'm1', pagina: 0 }), /pagina/);
});

test('quadro_buscar: sem acento, com trecho limitado, em um quadro ou em todos', async () => {
  const { f } = montar();
  const r = await lerJson(f.quadro_buscar!.executar({ termo: 'CORÔA' }));
  assert.equal(r.total, 2);
  assert.deepEqual(r.ocorrencias.map((o: { quadro: string }) => o.quadro).sort(), ['Masmorra', 'Reino Vermelho']);
  const um = await lerJson(f.quadro_buscar!.executar({ termo: 'estalagem', quadro: 'Reino Vermelho' }));
  assert.equal(um.ocorrencias[0].secao, 'm1');
  assert.equal(um.ocorrencias[0].item, 'n2xxxx');
  assert.ok(um.ocorrencias[0].trecho.length <= 122);
});

test('quadro_buscar: no máximo 20 ocorrências e trecho de até 120 caracteres', async () => {
  const q: Quadro = novoQuadro('c1', 'Grande', 1, 'qg');
  const itens = Array.from({ length: 30 }, (_, i) => nota('qg', `n${String(i).padStart(7, '0')}`, i * 10, 0, `${'a'.repeat(200)} dragão ${'b'.repeat(200)}`));
  const f = Object.fromEntries(ferramentasDeQuadros({
    campanha: async () => ({ id: 'c1', nome: 'C' }), quadros: async () => [q], itens: async () => itens, aberto: () => null, imagem: async () => null,
  }).map(t => [t.nome, t]));
  const r = await lerJson(f.quadro_buscar!.executar({ termo: 'dragao' }));
  assert.equal(r.total, 30);
  assert.equal(r.ocorrencias.length, 20);
  assert.ok(r.ocorrencias.every((o: { trecho: string }) => o.trecho.length <= 122 && o.trecho.includes('dragão')));
});

test('quadro aberto: a memória vale mais que o banco', async () => {
  const { f } = montar({ aberto: true });
  const r = await lerJson(f.quadro_buscar!.executar({ termo: 'só na memória', quadro: 'q1aaaa' }));
  assert.equal(r.total, 1);
});

test('quadro_imagem: imagem reduzida com a legenda; lado limitado a 1568', async () => {
  const { f, chamadas } = montar();
  const r = await f.quadro_imagem!.executar({ quadro: 'Reino Vermelho', item: '#i1yyyy' });
  assert.equal(r[0]!.tipo, 'imagem');
  assert.equal((r[0] as { mime: string }).mime, 'image/jpeg');
  assert.match((r[1] as { texto: string }).texto, /Mapa do reino, 800x600/);
  assert.deepEqual(chamadas[0], { id: 'img1', lado: 768 });
  await f.quadro_imagem!.executar({ quadro: 'Reino Vermelho', item: 'i1yyyy', lado: 5000 });
  assert.equal(chamadas[1]!.lado, 1568);
});

test('erros legíveis: quadro, seção e imagem inexistentes, sem campanha, sem arquivo', async () => {
  const { f } = montar();
  await assert.rejects(f.quadro_mapa!.executar({ quadro: 'Nada' }), /Quadro "Nada" não encontrado.*Reino Vermelho/);
  await assert.rejects(f.quadro_mapa!.executar({}), /Informe o quadro/);
  await assert.rejects(f.quadro_secao!.executar({ quadro: 'Reino', secao: 'zzz' }), /Seção "zzz" não encontrada/);
  await assert.rejects(f.quadro_imagem!.executar({ quadro: 'Reino', item: 'n1xxxx' }), /não é uma imagem/);
  await assert.rejects(f.quadro_imagem!.executar({ quadro: 'Reino', item: 'nope' }), /não encontrada/);
  await assert.rejects(montar({ campanha: false }).f.quadros_listar!.executar({}), /Nenhuma campanha/);
  await assert.rejects(montar({ semArquivo: true }).f.quadro_imagem!.executar({ quadro: 'Reino', item: 'i1yyyy' }), /não tem arquivo/);
});

test('catálogo: cada ferramenta com menos de 4,5 KB e todas só de leitura', () => {
  const ferramentas = ferramentasDaMesa(Object.fromEntries(['repositorio', 'sessoes', 'entidades', 'campanhas', 'cenas', 'elenco', 'quadros'].map(k => [k, {}])) as never);
  const nomes = ['quadros_listar', 'quadro_mapa', 'quadro_secao', 'quadro_buscar', 'quadro_imagem'];
  for (const n of nomes) {
    const t = ferramentas.find(x => x.nome === n);
    assert.ok(t, n);
    assert.ok(t.anotacoes?.leitura);
    assert.ok(JSON.stringify({ nome: t.nome, descricao: t.descricao, esquema: t.esquema }).length < 4500, n);
  }
});

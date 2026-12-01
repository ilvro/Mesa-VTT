import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ferramentasDaMesa } from '../../src/app/ponte-ferramentas.ts';
import { ferramentasDeQuadros, type ContextoDeQuadros } from '../../src/app/ponte-quadros.ts';
import type { DocRico, Item, Quadro } from '../../src/dominio/quadro.ts';
import type { RegistroResumo } from '../../src/dominio/resumos-do-quadro.ts';
import { novaImagem, novaMoldura, novaNotaAdesiva, novoQuadro } from '../../src/dominio/quadro.ts';

const doc = (...linhas: string[]): DocRico => ({ type: 'doc', content: linhas.map(t => ({ type: 'paragraph', content: [{ type: 'text', text: t }] })) });
const nota = (qid: string, id: string, x: number, y: number, texto: string, mae: string | null = null) =>
  ({ ...novaNotaAdesiva({ quadroId: qid, x, y, largura: 200, altura: 100, doc: doc(texto) }, 1, id), molduraId: mae }) as Item;

function montar(opcoes: { campanha?: boolean; aberto?: boolean; semArquivo?: boolean; semCaptura?: boolean; retratos?: boolean; dados?: string[]; resumos?: RegistroResumo[] } = {}) {
  const guardados: RegistroResumo[] = opcoes.resumos ?? [];
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
  const criados: { quadroId: string; itens: Item[]; rotulo: string; mover?: { id: string; dy: number }[] }[] = [];
  const capturas: { caixa: { x: number; y: number; largura: number; altura: number }; lado: number; itens: number }[] = [];
  const ctx: ContextoDeQuadros = {
    campanha: async () => (opcoes.campanha === false ? null : { id: 'c1', nome: 'C' }),
    quadros: async () => [q1, q2],
    itens: async id => (id === 'q1aaaa' ? itens1 : itens2),
    aberto: () => (opcoes.aberto ? { quadro: q1, itens: [...itens1, nota('q1aaaa', 'n9nnnnnn', 600, 400, 'Nota só na memória', 'm1')] } : null),
    entidades: async () => new Map([['e-aldric', { nome: 'Aldric', tipo: 'personagem' }], ['e-vazia', { nome: 'Sem Retrato', tipo: 'personagem' }]]),
    ...(opcoes.retratos ? { async retratoDaEntidade(id: string) { return id === 'e-aldric' ? { imagemId: 'ret-aldric', larguraOriginal: 200, alturaOriginal: 300 } : null; } } : {}),
    ...(opcoes.dados ? { async guardarImagemDeDados(url: string) { const i = new Set(opcoes.dados).has(url) ? 0 : 1; opcoes.dados!.push(url); return { imagemId: `hash-${url.slice(-4)}`, larguraOriginal: 1000, alturaOriginal: 500 + i * 0 }; } } : {}),
    async imagem(id, lado) { chamadas.push({ id, lado }); return opcoes.semArquivo ? null : 'data:image/jpeg;base64,QUJD'; },
    resumos: async id => guardados.filter(r => r.quadroId === id),
    async criarItens(quadroId, novos, rotulo, mover) { criados.push({ quadroId, itens: novos, rotulo, ...(mover ? { mover } : {}) }); },
    ...(opcoes.semCaptura ? {} : { async capturar(_q: Quadro, itens: ReadonlyMap<string, Item>, caixa: { x: number; y: number; largura: number; altura: number }, lado: number) { capturas.push({ caixa, lado, itens: itens.size }); return 'data:image/jpeg;base64,QUJD'; } }),
    async salvarResumo(r) { const i = guardados.findIndex(x => x.quadroId === r.quadroId && x.alvo === r.alvo); if (i >= 0) guardados[i] = r; else guardados.push(r); },
  };
  const f = Object.fromEntries(ferramentasDeQuadros(ctx).map(t => [t.nome, t]));
  return { f, chamadas, guardados, criados, capturas };
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
  const est = await lerTexto(f.quadro_secao!.executar({ quadro: 'Reino Vermelho', secao: 'm1', nivel: 'estrutura' }));
  assert.match(est, /^§ Capítulo 1 \(moldura, 3 itens\)/);
  assert.match(est, /- #n1xxxx nota 20,40 /);
  assert.match(est, /- #i1yyyy imagem /);
  await assert.rejects(f.quadro_secao!.executar({ quadro: 'Reino Vermelho', secao: 'm1', pagina: 0 }), /pagina/);
});

test('quadro_estilo: resumo da seção (escolhida ou pedida) e erro de seção', async () => {
  const { f } = montar();
  const t = await lerTexto(f.quadro_estilo!.executar({ quadro: 'Reino Vermelho' }));
  assert.match(t, /^Seção: "Capítulo 1" \(m1\), escolhida por ter mais itens de texto do mestre; 2 itens de texto\./);
  assert.match(t, /Semântica: 0% dos itens; o mestre não usa post-its tipados/);
  const pedida = await lerTexto(f.quadro_estilo!.executar({ quadro: 'Reino Vermelho', secao: 'capitulo 1' }));
  assert.ok(!pedida.includes('escolhida'));
  await assert.rejects(f.quadro_estilo!.executar({ quadro: 'Reino Vermelho', secao: 'zzz' }), /Seção "zzz" não encontrada/);
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
    campanha: async () => ({ id: 'c1', nome: 'C' }), quadros: async () => [q], itens: async () => itens, aberto: () => null, imagem: async () => null, resumos: async () => [], salvarResumo: async () => {}, criarItens: async () => {},
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

test('quadro_ver_regiao: seção com margem, caixa dos #ids, lado limitado e erros legíveis', async () => {
  const { f, capturas } = montar();
  const r = await f.quadro_ver_regiao!.executar({ quadro: 'Reino Vermelho', secao: 'Capítulo 1' });
  assert.equal(r[0]!.tipo, 'imagem');
  assert.match((r[1] as { texto: string }).texto, /seção "Capítulo 1"/);
  assert.deepEqual(capturas[0]!.caixa, { x: -40, y: -40, largura: 980, altura: 680 });
  assert.equal(capturas[0]!.lado, 1024);
  await f.quadro_ver_regiao!.executar({ quadro: 'Reino Vermelho', itens: ['#n1xxxx', 'n2xxxx'], lado: 9000 });
  assert.deepEqual(capturas[1]!.caixa, { x: -20, y: 0, largura: 520, altura: 180 });
  assert.equal(capturas[1]!.lado, 1568);
  await assert.rejects(f.quadro_ver_regiao!.executar({ quadro: 'Reino Vermelho' }), /seção ou os itens/);
  await assert.rejects(f.quadro_ver_regiao!.executar({ quadro: 'Reino Vermelho', secao: 'Capítulo 1', itens: ['n1xxxx'] }), /não os dois/);
  await assert.rejects(f.quadro_ver_regiao!.executar({ quadro: 'Reino Vermelho', itens: ['nope'] }), /#nope não encontrado/);
  await assert.rejects(f.quadro_ver_regiao!.executar({ quadro: 'Reino Vermelho', itens: ['n'] }), /ambíguo/);
  await assert.rejects(montar({ semCaptura: true }).f.quadro_ver_regiao!.executar({ quadro: 'Reino Vermelho', secao: 'Capítulo 1' }), /não está disponível/);
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
  const nomes = ['quadros_listar', 'quadro_mapa', 'quadro_secao', 'quadro_estilo', 'quadro_buscar', 'quadro_imagem', 'quadro_ver_regiao', 'quadro_resumir', 'quadro_descrever_imagem', 'quadro_propor', 'quadro_inserir'];
  for (const n of nomes) {
    const t = ferramentas.find(x => x.nome === n);
    assert.ok(t, n);
    if (n === 'quadro_resumir' || n === 'quadro_descrever_imagem' || n === 'quadro_propor' || n === 'quadro_inserir') assert.equal(t.anotacoes?.destrutiva, false);
    else assert.ok(t.anotacoes?.leitura);
    assert.ok(JSON.stringify({ nome: t.nome, descricao: t.descricao, esquema: t.esquema }).length < 4500, n);
    // Os mesmos limites que o teste do catálogo do Atlas confere (tests/unit/ponte-mcp.test.ts).
    assert.ok(t.descricao.length <= 400, `${n}: descrição com ${t.descricao.length} caracteres`);
    const props = (t.esquema as { properties?: Record<string, { description?: string }> }).properties ?? {};
    for (const [campo, def] of Object.entries(props)) {
      assert.ok((def.description ?? '').length <= 80, `${n}.${campo}: ${(def.description ?? '').length} caracteres`);
    }
  }
});

test('quadro_resumir: grava com a assinatura, aparece no mapa e na seção, e fica desatualizado quando o texto muda', async () => {
  const { f, guardados } = montar();
  await f.quadro_resumir!.executar({ quadro: 'Reino', secao: 'm1', texto: 'O rei esconde uma coroa falsa.' });
  assert.equal(guardados.length, 1);
  assert.equal(guardados[0]!.autor, 'assistente');
  assert.equal(guardados[0]!.alvo, 'm1');
  const mapa = await lerTexto(f.quadro_mapa!.executar({ quadro: 'Reino' }));
  assert.match(mapa, /O rei esconde uma coroa falsa\./);
  assert.doesNotMatch(mapa, /desatualizado/);
  assert.match(await lerTexto(f.quadro_secao!.executar({ quadro: 'Reino', secao: 'm1' })), /^Resumo: O rei esconde/);
  guardados[0]!.assinatura = 'velha';
  assert.match(await lerTexto(f.quadro_mapa!.executar({ quadro: 'Reino' })), /\(resumo desatualizado\)/);
  assert.match(await lerTexto(f.quadro_secao!.executar({ quadro: 'Reino', secao: 'm1' })), /^Resumo \(desatualizado\)/);
});

test('quadro_resumir: limite de 400, mestre não é sobrescrito, seção inexistente', async () => {
  const { f, guardados } = montar();
  await assert.rejects(f.quadro_resumir!.executar({ quadro: 'Reino', secao: 'm1', texto: 'x'.repeat(401) }), /401 caracteres.*400/);
  await assert.rejects(f.quadro_resumir!.executar({ quadro: 'Reino', secao: 'zzz', texto: 'a' }), /não encontrada/);
  await assert.rejects(f.quadro_resumir!.executar({ quadro: 'Reino', secao: 'm1', texto: '  ' }), /Informe o texto/);
  guardados.push({ quadroId: 'q1aaaa', alvo: 'm1', texto: 'Do mestre', assinatura: 'x', autor: 'mestre', em: 1 });
  await assert.rejects(f.quadro_resumir!.executar({ quadro: 'Reino', secao: 'm1', texto: 'Novo' }), /escrito pelo mestre.*pedido/);
  assert.equal(guardados[0]!.texto, 'Do mestre');
});

test('quadro_descrever_imagem: só imagem, limite de 600, aparece no lugar da legenda', async () => {
  const { f, guardados } = montar();
  await assert.rejects(f.quadro_descrever_imagem!.executar({ quadro: 'Reino', item: 'n1xxxx', texto: 'a' }), /não é uma imagem/);
  await assert.rejects(f.quadro_descrever_imagem!.executar({ quadro: 'Reino', item: 'i1yyyy', texto: 'x'.repeat(601) }), /601 caracteres.*600/);
  await f.quadro_descrever_imagem!.executar({ quadro: 'Reino', item: 'i1yyyy', texto: 'Mapa com a estrada do norte' });
  assert.equal(guardados[0]!.alvo, 'item:i1yyyyyy');
  assert.equal(guardados[0]!.assinatura, 'img1');
  const t = await lerTexto(f.quadro_secao!.executar({ quadro: 'Reino', secao: 'm1' }));
  assert.match(t, /\[imagem #i1yyyy: Mapa com a estrada do norte, 800x600\]/);
  assert.doesNotMatch(t, /Mapa do reino/);
});

test('quadro_propor: moldura ao lado da seção, notas dentro, revisão do assistente; quadro aberto e fechado', async () => {
  const { f, criados } = montar({ aberto: true });
  const r = await lerJson(f.quadro_propor!.executar({ quadro: 'Reino', titulo: 'Ganchos', notas: [{ texto: 'Um', tipo: 'leitura' }, { texto: 'Dois' }], perto: 'm1' }));
  assert.equal(r.notas, 2);
  assert.equal(criados.length, 1);
  assert.equal(criados[0]!.quadroId, 'q1aaaa');
  const moldura = criados[0]!.itens[0]!;
  assert.equal(r.moldura, moldura.id);
  assert.equal(moldura.tipo === 'moldura' && moldura.titulo, '✦ Ganchos');
  assert.ok(moldura.x >= 900 + 80);
  assert.match(r.desfazer, /Ctrl\+Z/);
  assert.ok(criados[0]!.itens.every(i => i.revisao?.origem === 'assistente'));
  const fechado = await lerJson(montar().f.quadro_propor!.executar({ quadro: 'Masmorra', titulo: 'X', notas: [{ texto: 'a' }] }));
  assert.match(fechado.desfazer, /sem histórico/);
});

test('quadro_propor: erros legíveis', async () => {
  const { f, criados } = montar();
  await assert.rejects(f.quadro_propor!.executar({ quadro: 'Reino', titulo: 'T', notas: [] }), /ao menos uma nota/);
  await assert.rejects(f.quadro_propor!.executar({ quadro: 'Reino', titulo: 'T', notas: Array.from({ length: 31 }, () => ({ texto: 'a' })) }), /máximo por chamada é 30/);
  await assert.rejects(f.quadro_propor!.executar({ quadro: 'Reino', titulo: 'T', notas: [{ texto: 'a', tipo: 'xyz' }] }), /inválido/);
  await assert.rejects(f.quadro_propor!.executar({ quadro: 'Reino', titulo: 'T', notas: [{ texto: 'a' }], perto: 'nao existe' }), /não encontrada/);
  assert.equal(criados.length, 0);
});

test('quadro_inserir: continua abaixo de um item, numa única chamada de criação (um passo de desfazer)', async () => {
  const { f, criados } = montar({ aberto: true });
  const r = await lerJson(f.quadro_inserir!.executar({
    quadro: 'Reino',
    abaixo_de: '#i1yyyy',
    itens: [{ formato: 'titulo', texto: 'COMBATE' }, { formato: 'texto', texto: 'Três afogados saem da água.' }],
  }));
  assert.equal(criados.length, 1);
  assert.equal(criados[0]!.itens.length, 2);
  assert.deepEqual(r.criados, criados[0]!.itens.map(i => `#${i.id.slice(0, 6)}`));
  assert.equal(r.empurrados, 0);
  assert.match(r.desfazer, /Ctrl\+Z/);
  assert.match(r.conferir, /quadro_ver_regiao/);
  const [a, b] = criados[0]!.itens;
  assert.equal(a!.x, 20);
  assert.ok(a!.y >= 200 + 24 && b!.y > a!.y + a!.altura);
  assert.ok(criados[0]!.itens.every(i => i.revisao?.origem === 'assistente' && i.molduraId === null || i.molduraId === 'm1'));
});

test('quadro_inserir: seta entre item novo e existente, imagem do quadro à direita alinhada pelo topo', async () => {
  const { f, criados } = montar({ aberto: true });
  const r = await lerJson(f.quadro_inserir!.executar({
    quadro: 'Reino',
    abaixo_de: '#i1yyyy',
    itens: [
      { formato: 'titulo', texto: 'ALDRIC' },
      { formato: 'texto', texto: 'O rei desconfia de todos.' },
      { formato: 'imagem', de: '#i1yyyy', lado: 'direita' },
    ],
    setas: [{ de: 1, para: '#i1yyyy', rotulo: 'vê' }],
  }));
  assert.equal(criados.length, 1);
  const [tit, corpo, img, seta] = criados[0]!.itens;
  assert.equal(r.criados.length, 3);
  assert.equal(r.setas.length, 1);
  assert.equal(img!.tipo, 'imagem');
  if (img!.tipo !== 'imagem' || seta!.tipo !== 'seta') throw new Error('tipos');
  assert.equal(img!.imagemId, 'img1');
  // Sem largura: a mediana das imagens da seção (a do mestre tem 800 x 600).
  assert.equal(img!.largura, 800);
  assert.equal(img!.altura, 600);
  assert.equal(img!.y, corpo!.y);
  assert.equal(img!.x, corpo!.x + corpo!.largura + 24);
  assert.equal(corpo!.y, tit!.y + tit!.altura + 24);
  assert.equal(img!.revisao?.origem, 'assistente');
  assert.equal(seta!.revisao?.origem, 'assistente');
  assert.deepEqual(seta!.de, { itemId: corpo!.id, lado: 'auto' });
  assert.deepEqual(seta!.para, { itemId: 'i1yyyyyy', lado: 'auto' });
  assert.equal(seta!.rotulo, 'vê');
  // A imagem ao lado não ocupa altura: a caixa da resposta a inclui na largura, mas a coluna termina no corpo.
  assert.equal(r.caixa.largura, corpo!.largura + 24 + 800);
});

test('quadro_inserir: ponta de seta inválida e imagem inexistente dão erro legível', async () => {
  const { f, criados } = montar();
  const base = { quadro: 'Reino', abaixo_de: '#i1yyyy', itens: [{ formato: 'texto', texto: 'a' }] };
  await assert.rejects(f.quadro_inserir!.executar({ ...base, setas: [{ de: 5, para: 0 }] }), /índice 5 não existe/);
  await assert.rejects(f.quadro_inserir!.executar({ ...base, setas: [{ de: 0, para: '#zzzz' }] }), /não encontrado/);
  await assert.rejects(f.quadro_inserir!.executar({ ...base, setas: [{ de: 0, para: 0 }] }), /mesmo item/);
  await assert.rejects(f.quadro_inserir!.executar({ ...base, setas: [{ de: 0, para: 'abc' }] }), /índice.*#id/);
  await assert.rejects(f.quadro_inserir!.executar({ ...base, itens: [{ formato: 'imagem', de: '#n1xxxx' }] }), /não uma imagem/);
  await assert.rejects(f.quadro_inserir!.executar({ ...base, itens: [{ formato: 'imagem', de: '#i1yyyy', lado: 'direita' }] }), /precisa de um item de texto antes/);
  assert.equal(criados.length, 0);
});

test('quadro_inserir: retrato de entidade vira imagem; sem retrato ou sem suporte dá erro legível', async () => {
  const { f, criados } = montar({ retratos: true });
  await f.quadro_inserir!.executar({ quadro: 'Reino', abaixo_de: '#i1yyyy', itens: [{ formato: 'texto', texto: 'Aldric' }, { formato: 'imagem', de: 'entidade:aldric', lado: 'esquerda', largura: 100 }] });
  const img = criados[0]!.itens[1]!;
  assert.equal(img.tipo === 'imagem' && img.imagemId, 'ret-aldric');
  assert.equal(img.altura, 150);
  assert.equal(img.x, criados[0]!.itens[0]!.x - 24 - 100);
  const pedido = (de: string) => ({ quadro: 'Reino', abaixo_de: '#i1yyyy', itens: [{ formato: 'texto', texto: 'a' }, { formato: 'imagem', de }] });
  await assert.rejects(f.quadro_inserir!.executar(pedido('entidade:Sem Retrato')), /não tem retrato/);
  await assert.rejects(f.quadro_inserir!.executar(pedido('entidade:Fulano')), /não encontrado/);
  await assert.rejects(montar().f.quadro_inserir!.executar(pedido('entidade:Aldric')), /ainda não suportado/);
});

test('quadro_inserir: obstáculo recusa; abrir_espaco empurra no mesmo passo de criação', async () => {
  const { f, criados } = montar();
  // n1 (20,40) e a imagem (20,200) estão na mesma coluna; abaixo de n1 a imagem é obstáculo.
  const pedido = { quadro: 'Reino', abaixo_de: '#n1xxxx', itens: [{ formato: 'texto', texto: 'Um parágrafo novo.' }] };
  await assert.rejects(f.quadro_inserir!.executar(pedido), /Não há espaço livre.*abrir_espaco: true/);
  assert.equal(criados.length, 0);
  const r = await lerJson(f.quadro_inserir!.executar({ ...pedido, abrir_espaco: true }));
  assert.equal(r.empurrados, 1);
  assert.equal(criados.length, 1);
  assert.equal(criados[0]!.mover!.length, 1);
  assert.equal(criados[0]!.mover![0]!.id, 'i1yyyyyy');
  assert.match(r.desfazer, /sem histórico/);
});

test('quadro_inserir: ao_lado_de abre coluna nova; sem alvo ou com dois alvos dá erro legível', async () => {
  const { f, criados } = montar();
  const r = await lerJson(f.quadro_inserir!.executar({ quadro: 'Reino', ao_lado_de: 'm1', itens: [{ formato: 'texto', texto: 'Nova coluna' }] }));
  assert.equal(r.empurrados, 0);
  assert.ok(criados[0]!.itens[0]!.x >= 900);
  await assert.rejects(f.quadro_inserir!.executar({ quadro: 'Reino', itens: [{ formato: 'texto', texto: 'a' }] }), /abaixo_de.*ao_lado_de/);
  await assert.rejects(f.quadro_inserir!.executar({ quadro: 'Reino', abaixo_de: 'm1', ao_lado_de: 'm1', itens: [{ formato: 'texto', texto: 'a' }] }), /só um destino/);
  await assert.rejects(f.quadro_inserir!.executar({ quadro: 'Reino', abaixo_de: '#zzzz', itens: [{ formato: 'texto', texto: 'a' }] }), /não encontrado/);
});

test('quadro_inserir: linha e grade lado a lado, setas pelos índices achatados, limite com os itens dos grupos', async () => {
  const { f, criados } = montar({ aberto: true });
  const r = await lerJson(f.quadro_inserir!.executar({
    quadro: 'Reino',
    abaixo_de: '#i1yyyy',
    alinhar: 'esquerda',
    itens: [
      { formato: 'titulo', texto: 'PERSEGUIÇÃO' },
      { linha: [[{ formato: 'texto', texto: 'Regras' }], [{ formato: 'texto', texto: 'Fôlego' }], [{ formato: 'texto', texto: 'Ações' }]], largura_da_celula: 200 },
      { grade: [[{ formato: 'imagem', de: '#i1yyyy' }, { formato: 'texto', texto: 'Arbusto' }], [{ formato: 'texto', texto: 'Poço' }]], colunas: 2, largura_da_celula: 200, espaco: 40 },
    ],
    setas: [{ de: 0, para: 6 }],
  }));
  assert.equal(criados.length, 1);
  const [tit, a, b, c, img, arb, poco, seta] = criados[0]!.itens;
  assert.equal(r.criados.length, 7);
  assert.equal(a!.y, b!.y);
  assert.equal(b!.y, c!.y);
  assert.equal(b!.x, a!.x + 200 + 72);
  assert.equal(c!.x, b!.x + 200 + 72);
  assert.equal(a!.y, tit!.y + tit!.altura + 24);
  assert.equal(img!.largura, 200);
  assert.equal(img!.x, a!.x);
  assert.equal(arb!.x, img!.x);
  assert.equal(poco!.x, img!.x + 200 + 40);
  assert.equal(poco!.y, img!.y);
  assert.ok(img!.y > a!.y + a!.altura);
  if (seta!.tipo !== 'seta') throw new Error('seta');
  assert.deepEqual(seta!.para, { itemId: poco!.id, lado: 'auto' });
  assert.equal(r.caixa.largura, 3 * 200 + 2 * 72);
  const muitos = Array.from({ length: 40 }, () => [{ formato: 'texto', texto: 'x' }]);
  await assert.rejects(f.quadro_inserir!.executar({ quadro: 'Reino', abaixo_de: '#i1yyyy', itens: [{ formato: 'texto', texto: 'y' }, { linha: muitos }] }), /máximo por chamada é 40/);
  await assert.rejects(f.quadro_inserir!.executar({ quadro: 'Reino', abaixo_de: '#i1yyyy', itens: [{ linha: [[{ formato: 'imagem', de: '#i1yyyy', lado: 'direita' }]] }] }), /imagem com "lado"/);
});

test('quadro_inserir: dados: guarda a imagem (solta e em célula de grade), sem repetir a gravação; valida mime, tamanho e contexto', async () => {
  const dados: string[] = [];
  const { f, criados } = montar({ dados });
  const url = 'data:image/png;base64,QUJDRA==';
  const outra = 'data:image/jpeg;base64,QUJDRQ==';
  await f.quadro_inserir!.executar({
    quadro: 'Reino', abaixo_de: '#i1yyyy',
    itens: [{ formato: 'imagem', de: `dados:${url}`, largura: 200 }, { grade: [[{ formato: 'imagem', de: `dados:${url}` }], [{ formato: 'imagem', de: `dados:${outra}` }]], colunas: 2, largura_da_celula: 200 }],
  });
  const imgs = criados[0]!.itens.filter(i => i.tipo === 'imagem');
  assert.deepEqual(imgs.map(i => i.tipo === 'imagem' && i.imagemId), ['hash-RA==', 'hash-RA==', 'hash-RQ==']);
  assert.equal(imgs[0]!.tipo === 'imagem' && imgs[0]!.altura, 100);
  assert.deepEqual(dados, [url, outra]);
  const pedido = (de: string) => ({ quadro: 'Reino', abaixo_de: '#i1yyyy', itens: [{ formato: 'imagem', de }] });
  await assert.rejects(f.quadro_inserir!.executar(pedido('dados:data:image/gif;base64,QUJD')), /não aceito/);
  await assert.rejects(f.quadro_inserir!.executar(pedido('dados:data:image/png;base64,' + 'A'.repeat(21 * 1024 * 1024))), /15 MB/);
  await assert.rejects(f.quadro_inserir!.executar(pedido('dados:texto')), /data URL/);
  await assert.rejects(montar().f.quadro_inserir!.executar(pedido(`dados:${url}`)), /só pela ponte do assistente/);
});

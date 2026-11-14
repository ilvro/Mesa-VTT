import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Entidade } from '#mesa';
import {
  agruparPorCategoria,
  alterarListaDeElenco,
  alternarModoExibicao,
  alternarSecaoColapsada,
  contarPorTag,
  contarPorTipo,
  ehEncontro,
  filtrarEntidades,
  lerTags,
  ordenarEntidades,
  personagensParaElenco,
  podarElenco,
  podeEditar,
  podeEditarConteudo,
  ROTULO_DO_TIPO,
  semAcento,
} from '../../src/dominio/entidades.ts';

const base = { campanhaId: 'c', refs: [], tags: [], notas: '', criadaPor: 'mesa', criadaEm: 1, atualizadaEm: 1 } as const;
const e = (id: string, tipo: Entidade['tipo'], nome: string, extra: Partial<Entidade> = {}): Entidade => ({ ...base, id, tipo, nome, ...extra } as Entidade);

const lista = [
  e('1', 'lugar', 'Casa dos Salgueiros', { tags: ['mansão', 'Vila'] }),
  e('2', 'personagem', 'Muirenn', { criadaPor: 'ficha', notas: 'Investigadora de Ateliê' }),
  e('3', 'pista', 'Carta queimada', { notas: 'Achada na biblioteca' }),
  e('4', 'lugar', 'Álamo Velho'),
  e('5', 'nota', 'zeta'),
];

test('semAcento: minúsculas e sem acento', () => {
  assert.equal(semAcento('Ateliê Ação'), 'atelie acao');
  assert.equal(semAcento('ÁLAMO'), 'alamo');
});

test('filtrarEntidades: por tipo, ordenado sem acento (Álamo antes de Casa)', () => {
  assert.deepEqual(filtrarEntidades(lista, { tipo: 'lugar' }).map(x => x.id), ['4', '1']);
  assert.deepEqual(filtrarEntidades(lista).map(x => x.id), ['4', '3', '1', '2', '5']);
});

test('filtrarEntidades: a busca ignora acento e caixa e olha nome, etiquetas e notas', () => {
  assert.deepEqual(filtrarEntidades(lista, { busca: 'MANSAO' }).map(x => x.id), ['1']);
  assert.deepEqual(filtrarEntidades(lista, { busca: 'atelie' }).map(x => x.id), ['2']);
  assert.deepEqual(filtrarEntidades(lista, { busca: 'biblioteca carta' }).map(x => x.id), ['3']);
  assert.deepEqual(filtrarEntidades(lista, { busca: 'carta mansao' }).map(x => x.id), []);
  assert.deepEqual(filtrarEntidades(lista, { busca: '   ' }).length, 5);
});

test('filtrarEntidades: tipo e busca juntos', () => {
  assert.deepEqual(filtrarEntidades(lista, { tipo: 'lugar', busca: 'salgueiros' }).map(x => x.id), ['1']);
  assert.deepEqual(filtrarEntidades(lista, { tipo: 'pista', busca: 'salgueiros' }), []);
});

test('contarPorTipo conta cada tipo', () => {
  const c = contarPorTipo(lista);
  assert.equal(c.lugar, 2); assert.equal(c.personagem, 1); assert.equal(c.cena, 0);
});

test('podeEditarConteudo: etiquetas e notas de qualquer app', () => {
  assert.equal(podeEditarConteudo(e('b', 'personagem', 'y', { criadaPor: 'ficha' })), true);
  assert.equal(podeEditarConteudo(e('a', 'lugar', 'x')), true);
});

test('podeEditar: só quem criou', () => {
  assert.equal(podeEditar(e('a', 'lugar', 'x')), true);
  assert.equal(podeEditar(e('b', 'personagem', 'y', { criadaPor: 'ficha' })), false);
  assert.equal(podeEditar(e('b', 'personagem', 'y', { criadaPor: 'ficha' }), 'ficha'), true);
});

test('lerTags: tira vazias e repetidas (sem acento), corta no limite do contrato', () => {
  assert.deepEqual(lerTags('a, b ,, A; c\nd'), ['a', 'b', 'c', 'd']);
  assert.deepEqual(lerTags('Mansão, mansao'), ['Mansão']);
  assert.equal(lerTags('x'.repeat(100))[0]!.length, 40);
  assert.equal(lerTags(Array.from({ length: 80 }, (_, i) => `t${i}`).join(',')).length, 50);
  assert.deepEqual(lerTags(''), []);
});

test('ameaca: tem rótulo próprio, conta separada de personagem e entra na busca por tipo', () => {
  const lista = [e('1', 'personagem', 'Muirenn'), e('2', 'ameaca', 'Zumbi de Sangue'), e('3', 'ameaca', 'Ariranha')];
  const c = contarPorTipo(lista);
  assert.equal(c.ameaca, 2); assert.equal(c.personagem, 1);
  assert.deepEqual(filtrarEntidades(lista, { tipo: 'ameaca' }).map(x => x.nome), ['Ariranha', 'Zumbi de Sangue']);
  assert.deepEqual(filtrarEntidades(lista, { busca: 'zumbi' }).map(x => x.id), ['2']);
  assert.deepEqual(ROTULO_DO_TIPO.ameaca, { singular: 'Ameaça', plural: 'Ameaças' });
});

test('contarPorTag: agrupa sem acento/caixa, preserva grafia mais usada e ordena por contagem e alfabético', () => {
  const entidades = [
    e('1', 'lugar', 'Mansão', { tags: ['Mansão', 'Vila', 'Mistério'] }),
    e('2', 'lugar', 'Casa', { tags: ['mansão', 'VILA', 'floresta'] }),
    e('3', 'personagem', 'Investigador', { tags: ['MANSÃO', 'vila', '#Sobrenatural'] }),
    e('4', 'nota', 'Relatório', { tags: ['floresta', 'Castelo'] }),
    e('5', 'pista', 'Pista sem tag', { tags: [] }),
  ];

  const contagens = contarPorTag(entidades);
  // 'mansao': 3 (grafias: 'Mansão' 1, 'mansão' 1, 'MANSÃO' 1 - empate alfabético escolhe 'MANSÃO' ou melhorTag)
  // 'vila': 3 (grafias: 'Vila' 1, 'VILA' 1, 'vila' 1)
  // 'floresta': 2
  // 'castelo': 1
  // 'misterio': 1
  // 'sobrenatural': 1
  assert.equal(contagens.length, 6);
  // As duas primeiras têm contagem 3, ordenadas por chave ('mansao' vs 'vila')
  assert.equal(contagens[0]!.chave, 'mansao');
  assert.equal(contagens[0]!.contagem, 3);
  assert.equal(contagens[1]!.chave, 'vila');
  assert.equal(contagens[1]!.contagem, 3);

  // Terceira é 'floresta' com 2
  assert.equal(contagens[2]!.chave, 'floresta');
  assert.equal(contagens[2]!.contagem, 2);

  // Restantes com contagem 1: 'castelo', 'misterio', 'sobrenatural'
  assert.equal(contagens[3]!.chave, 'castelo');
  assert.equal(contagens[3]!.contagem, 1);
  assert.equal(contagens[4]!.chave, 'misterio');
  assert.equal(contagens[4]!.contagem, 1);
  assert.equal(contagens[5]!.chave, 'sobrenatural');
  assert.equal(contagens[5]!.contagem, 1);

  // Preservação da grafia mais usada:
  const tagsGrafia = [
    e('1', 'lugar', 'A', { tags: ['Ordem'] }),
    e('2', 'lugar', 'B', { tags: ['ordem'] }),
    e('3', 'lugar', 'C', { tags: ['Ordem'] }),
  ];
  const resultadoGrafia = contarPorTag(tagsGrafia);
  assert.equal(resultadoGrafia[0]!.tag, 'Ordem');
  assert.equal(resultadoGrafia[0]!.chave, 'ordem');
  assert.equal(resultadoGrafia[0]!.contagem, 3);
});

test('ordenarEntidades: nome-asc, nome-desc e recentes', () => {
  const itens = [
    e('1', 'lugar', 'Casa', { criadaEm: 10, atualizadaEm: 100 }),
    e('2', 'lugar', 'Álamo', { criadaEm: 20, atualizadaEm: 50 }),
    e('3', 'lugar', 'Zumbi', { criadaEm: 30, atualizadaEm: 200 }),
  ];

  const asc = ordenarEntidades(itens, 'nome-asc').map(x => x.nome);
  assert.deepEqual(asc, ['Álamo', 'Casa', 'Zumbi']);

  const desc = ordenarEntidades(itens, 'nome-desc').map(x => x.nome);
  assert.deepEqual(desc, ['Zumbi', 'Casa', 'Álamo']);

  const recentes = ordenarEntidades(itens, 'recentes').map(x => x.nome);
  assert.deepEqual(recentes, ['Zumbi', 'Casa', 'Álamo']);
});

test('filtrarEntidades com tag: filtra por etiqueta com ou sem hash, isolada ou combinada', () => {
  const entidades = [
    e('1', 'lugar', 'Mansão Velha', { tags: ['Mansão', 'Vila'], notas: 'Sombria' }),
    e('2', 'personagem', 'Muirenn', { tags: ['Investigadora', 'Vila'], notas: 'No cais' }),
    e('3', 'pista', 'Carta', { tags: ['mansao'], notas: 'Achada na vila' }),
  ];

  // Filtro por tag sem acento
  const porMansao = filtrarEntidades(entidades, { tag: 'mansao' });
  assert.deepEqual(porMansao.map(x => x.id), ['3', '1']);

  // Filtro por tag com prefixo '#'
  const porHashMansao = filtrarEntidades(entidades, { tag: '#mansão' });
  assert.deepEqual(porHashMansao.map(x => x.id), ['3', '1']);

  // Filtro combinado: tipo + tag + busca
  const combinado = filtrarEntidades(entidades, { tipo: 'personagem', tag: 'vila', busca: 'cais' });
  assert.deepEqual(combinado.map(x => x.id), ['2']);

  // Quarto parâmetro legado para tag
  const legado = filtrarEntidades(entidades, {}, 'nome-asc', 'investigadora');
  assert.deepEqual(legado.map(x => x.id), ['2']);
});

test('ehEncontro e filtro por categoria encontro', () => {
  const cena1 = e('c1', 'cena', 'Emboscada no Cais', { tags: ['encontro', 'cais'] });
  const cena2 = e('c2', 'cena', 'Exploração Silenciosa', { tags: ['investigação'] });
  const cena3 = e('c3', 'cena', 'Batalha do Salão', { refs: [{ app: 'ficha', tipo: 'ameaca', id: 'zumbi-1' }] });
  const naoCena = e('p1', 'personagem', 'Guerreiro', { tags: ['encontro'] });

  assert.equal(ehEncontro(cena1), true);
  assert.equal(ehEncontro(cena2), false);
  assert.equal(ehEncontro(cena3), true);
  assert.equal(ehEncontro(naoCena), false);

  const lista = [cena1, cena2, cena3, naoCena];
  const encontros = filtrarEntidades(lista, { tipo: 'encontro' });
  assert.deepEqual(encontros.map(x => x.id), ['c3', 'c1']);
});

test('agruparPorCategoria: separa por seções, isolando encontros de cenas e omitindo vazias', () => {
  const lista = [
    e('1', 'lugar', 'Mansão Velha'),
    e('2', 'lugar', 'Cais Sombrio'),
    e('3', 'personagem', 'Muirenn'),
    e('4', 'cena', 'Investigação Noturna'),
    e('5', 'cena', 'Batalha do Cais', { tags: ['encontro'] }),
    e('6', 'nota', 'Anotações'),
  ];

  const secoes = agruparPorCategoria(lista);
  assert.equal(secoes.length, 5);
  assert.deepEqual(secoes.map(s => s.id), ['cena', 'lugar', 'encontro', 'personagem', 'nota']);

  const cenas = secoes.find(s => s.id === 'cena')!;
  assert.deepEqual(cenas.entidades.map(x => x.id), ['4']);

  const lugares = secoes.find(s => s.id === 'lugar')!;
  assert.deepEqual(lugares.entidades.map(x => x.id), ['1', '2']);

  const encontros = secoes.find(s => s.id === 'encontro')!;
  assert.deepEqual(encontros.entidades.map(x => x.id), ['5']);

  const personagens = secoes.find(s => s.id === 'personagem')!;
  assert.deepEqual(personagens.entidades.map(x => x.id), ['3']);

  const notas = secoes.find(s => s.id === 'nota')!;
  assert.deepEqual(notas.entidades.map(x => x.id), ['6']);
});

test('alternarModoExibicao e alternarSecaoColapsada', () => {
  assert.equal(alternarModoExibicao('grade'), 'lista');
  assert.equal(alternarModoExibicao('lista'), 'grade');

  const s1 = new Set<string>();
  const s2 = alternarSecaoColapsada(s1, 'lugar');
  assert.equal(s2.has('lugar'), true);
  const s3 = alternarSecaoColapsada(s2, 'lugar');
  assert.equal(s3.has('lugar'), false);
});

test('elenco: entrar/sair, podar IDs órfãos, ordenar elenco primeiro e filtrar só o elenco', () => {
  const comFicha = (id: string, nome: string) =>
    e(id, 'personagem', nome, { criadaPor: 'ficha', refs: [{ app: 'ficha', tipo: 'ficha', id: `f-${id}` }] });
  const p1 = comFicha('p1', 'Zara');
  const p2 = comFicha('p2', 'Álvaro');
  const p3 = comFicha('p3', 'Breno');
  const semFicha = e('p4', 'personagem', 'Vendedor Sem Ficha');
  const lugar = e('l1', 'lugar', 'Praça');
  const todas = [p1, p2, p3, semFicha, lugar];

  assert.deepEqual(podarElenco(['p3', 'orfao', 'l1', 'p1', 'p3'], todas), ['p3', 'p1']);

  // Sem elenco definido: todos os personagens com ficha entram em ordem alfabética
  const semElenco = personagensParaElenco(todas, undefined);
  assert.deepEqual(semElenco.noElenco.map(x => x.id), []);
  assert.deepEqual(semElenco.foraDoElenco.map(x => x.id), ['p2', 'p3', 'p1']);
  assert.deepEqual(semElenco.todos.map(x => x.id), ['p2', 'p3', 'p1']);

  // Com elenco definido: os do elenco vêm primeiro na ordem do elenco; os demais vêm depois em ordem alfabética
  const comElenco = personagensParaElenco(todas, ['p1', 'orfao', 'p3']);
  assert.deepEqual(comElenco.noElenco.map(x => x.id), ['p1', 'p3']);
  assert.deepEqual(comElenco.foraDoElenco.map(x => x.id), ['p2']);
  assert.deepEqual(comElenco.todos.map(x => x.id), ['p1', 'p3', 'p2']);

  // Entrar e sair do elenco
  let elenco = alterarListaDeElenco(['p1', 'orfao'], todas, { acrescentar: ['p2'] });
  assert.deepEqual(elenco, ['p1', 'p2']);
  elenco = alterarListaDeElenco(elenco, todas, { remover: ['p1'] });
  assert.deepEqual(elenco, ['p2']);

  // Filtro "Só o elenco" na coleção
  assert.deepEqual(
    filtrarEntidades(todas, { soElenco: true, elenco: ['p1', 'p3'] }).map(x => x.id),
    ['p3', 'p1'],
  );
  assert.deepEqual(
    filtrarEntidades(todas, { soElenco: true, elenco: [] }),
    [],
  );
});

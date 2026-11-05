import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Entidade } from '#mesa';
import { analisarNota, autocompletarEm, entidadePorNome, refDaEntidade, refsMencionados, resolver, sugerirEntidades, nomeLigavel, type Trecho } from '../../src/dominio/notas.ts';

const t = (texto: string): Trecho => ({ tipo: 'texto', texto });
const nome = (bruto: string, nomeAlvo: string, rotulo?: string): Trecho => ({ tipo: 'ligacao', bruto, alvo: { tipo: 'nome', nome: nomeAlvo }, ...(rotulo ? { rotulo } : {}) });
const ref = (bruto: string, app: string, tipo: string, id: string, rotulo?: string, rev?: number): Trecho => ({ tipo: 'ligacao', bruto, alvo: { tipo: 'ref', ref: { app, tipo, id, ...(rev === undefined ? {} : { rev }) } as never }, ...(rotulo ? { rotulo } : {}) });

const tabela: [string, string, Trecho[]][] = [
  ['sem ligações', 'Só texto.', [t('Só texto.')]],
  ['vazio', '', []],
  ['ligação por nome', 'Vá à [[Casa dos Salgueiros]] logo.', [t('Vá à '), nome('[[Casa dos Salgueiros]]', 'Casa dos Salgueiros'), t(' logo.')]],
  ['ligação por nome com rótulo', '[[Muirenn|a investigadora]]', [nome('[[Muirenn|a investigadora]]', 'Muirenn', 'a investigadora')]],
  ['espaços ao redor e repetidos viram um só', '[[  Casa   dos Salgueiros ]]', [nome('[[  Casa   dos Salgueiros ]]', 'Casa dos Salgueiros')]],
  ['acento fica como foi escrito', '[[Álamo Velho]]', [nome('[[Álamo Velho]]', 'Álamo Velho')]],
  ['Ref', 'Mapa: [[mesa:atlas/mapa/abc-1]].', [t('Mapa: '), ref('[[mesa:atlas/mapa/abc-1]]', 'atlas', 'mapa', 'abc-1'), t('.')]],
  ['Ref com rótulo', '[[mesa:atlas/comodo/m1/c2|Biblioteca]]', [ref('[[mesa:atlas/comodo/m1/c2|Biblioteca]]', 'atlas', 'comodo', 'm1/c2', 'Biblioteca')]],
  ['Ref com revisão', '[[mesa:atelie/documento/d1@3|Carta]]', [ref('[[mesa:atelie/documento/d1@3|Carta]]', 'atelie', 'documento', 'd1', 'Carta', 3)]],
  ['mesa: inválido vira nome', '[[mesa:foo/x]]', [nome('[[mesa:foo/x]]', 'mesa:foo/x')]],
  ['rótulo vazio é ignorado', '[[Muirenn|]]', [nome('[[Muirenn|]]', 'Muirenn')]],
  ['duas seguidas', '[[A]][[B]]', [nome('[[A]]', 'A'), nome('[[B]]', 'B')]],
  ['aninhamento: vale a de dentro', '[[a [[b]] c]]', [t('[[a '), nome('[[b]]', 'b'), t(' c]]')]],
  ['colchete simples não é ligação', 'lista [1] e [2]', [t('lista [1] e [2]')]],
  ['abertura sem fechamento', 'olha [[ isto', [t('olha [[ isto')]],
  ['fechamento solto', 'isto ]] e [[A]]', [t('isto ]] e '), nome('[[A]]', 'A')]],
  ['vazia', 'x [[]] y', [t('x [[]] y')]],
  ['só espaços', 'x [[   ]] y', [t('x [[   ]] y')]],
  ['quebra de linha dentro não é ligação', '[[a\nb]]', [t('[[a\nb]]')]],
  ['três colchetes', '[[[A]]]', [t('['), nome('[[A]]', 'A'), t(']')]],
  ['depois de uma inválida, a válida ainda vale', '[[a\nb]] e [[C]]', [t('[[a\nb]] e '), nome('[[C]]', 'C')]],
];
for (const [titulo, entrada, esperado] of tabela) test(`analisarNota: ${titulo}`, () => assert.deepEqual(analisarNota(entrada), esperado));

test('analisarNota: reconstruir o texto pelos trechos devolve a nota original', () => {
  for (const [, entrada] of tabela) {
    const volta = analisarNota(entrada).map(x => x.tipo === 'texto' ? x.texto : x.bruto).join('');
    assert.equal(volta, entrada);
  }
});

const base = { campanhaId: 'c', refs: [], tags: [], notas: '', criadaPor: 'mesa', atualizadaEm: 1 } as const;
const e = (id: string, nomeE: string, criadaEm = 1, extra: Partial<Entidade> = {}): Entidade => ({ ...base, id, tipo: 'lugar', nome: nomeE, criadaEm, ...extra } as Entidade);
const lista = [e('1', 'Casa dos Salgueiros'), e('2', 'Álamo Velho'), e('3', 'Muirenn', 5), e('4', 'muirenn', 2)];

test('entidadePorNome: sem acento, sem caixa, espaços repetidos; a mais antiga ganha', () => {
  assert.equal(entidadePorNome(lista, 'casa  dos salgueiros')?.id, '1');
  assert.equal(entidadePorNome(lista, 'alamo velho')?.id, '2');
  assert.equal(entidadePorNome(lista, 'MUIRENN')?.id, '4');
  assert.equal(entidadePorNome(lista, 'Ninguém'), undefined);
});

test('resolver: nome com destino, nome sem destino, Ref, e Ref de entidade da Mesa que abre a entidade', () => {
  assert.equal(resolver({ tipo: 'nome', nome: 'Álamo Velho' }, lista).tipo, 'entidade');
  assert.deepEqual(resolver({ tipo: 'nome', nome: 'Fantasma' }, lista), { tipo: 'sem-destino', nome: 'Fantasma' });
  const r = { app: 'atlas', tipo: 'mapa', id: 'm1' } as const;
  assert.deepEqual(resolver({ tipo: 'ref', ref: r }, lista), { tipo: 'ref', ref: r });
  const d = resolver({ tipo: 'ref', ref: refDaEntidade('2') }, lista);
  assert.equal(d.tipo, 'entidade');
  assert.equal(resolver({ tipo: 'ref', ref: refDaEntidade('zzz') }, lista).tipo, 'ref');
});

test('refsMencionados: sem repetir, sem nomes sem destino, sem a própria nota', () => {
  const de = refDaEntidade('nota-1');
  const texto = '[[Casa dos Salgueiros]] e [[casa dos salgueiros|de novo]], [[Fantasma]], [[mesa:atlas/mapa/m1]] e [[mesa:mesa/entidade/nota-1]]';
  assert.deepEqual(refsMencionados(texto, lista, de), [refDaEntidade('1'), { app: 'atlas', tipo: 'mapa', id: 'm1' }]);
  assert.deepEqual(refsMencionados('nada', lista, de), []);
});

test('autocompletarEm: só dentro de um [[ aberto, na mesma linha', () => {
  assert.deepEqual(autocompletarEm('vá à [[Cas', 10), { inicio: 7, termo: 'Cas' });
  assert.deepEqual(autocompletarEm('[[', 2), { inicio: 2, termo: '' });
  assert.equal(autocompletarEm('vá à [[Casa]] e', 15), null, 'depois de fechar não completa');
  assert.equal(autocompletarEm('sem nada', 4), null);
  assert.equal(autocompletarEm('[[Casa\nmais', 11), null, 'quebra de linha cancela');
  assert.equal(autocompletarEm('[[Casa|rót', 10), null, 'depois do | é rótulo, não nome');
});

test('sugerirEntidades: começa-com primeiro, depois contém, sem acento, com limite', () => {
  const outras = [e('a', 'Salão'), e('b', 'Casa dos Salgueiros'), e('c', 'Sala de Música'), e('d', 'Ruínas'), e('f', 'Lasa')];
  assert.deepEqual(sugerirEntidades(outras, 'sal').map(x => x.nome), ['Sala de Música', 'Salão', 'Casa dos Salgueiros']);
  assert.deepEqual(sugerirEntidades(outras, '').length, 5);
  assert.deepEqual(sugerirEntidades(outras, 'zzz'), []);
  assert.equal(sugerirEntidades(outras, '', 2).length, 2);
});

test('nomeLigavel: nomes com | ou colchetes não cabem numa ligação por nome', () => {
  assert.equal(nomeLigavel('Casa dos Salgueiros'), true);
  assert.equal(nomeLigavel('a|b'), false);
  assert.equal(nomeLigavel('a]]'), false);
});

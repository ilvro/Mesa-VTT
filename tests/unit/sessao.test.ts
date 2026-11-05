import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Entidade } from '#mesa';
import { ESCOLHAS_VAZIAS, enderecoDaFicha, enderecoDoAtlas, fichaAtiva, fichasDaSessao, lerEscolhas, mapaEscolhido, mapasDaCampanha, personagensComFicha } from '../../src/dominio/sessao.ts';

const base = { campanhaId: 'c', tags: [], notas: '', criadaPor: 'atlas', criadaEm: 1, atualizadaEm: 1 } as const;
const e = (id: string, tipo: Entidade['tipo'], nome: string, refs: Entidade['refs']): Entidade => ({ ...base, id, tipo, nome, refs } as unknown as Entidade);
const mapa = (id: string) => ({ app: 'atlas', tipo: 'mapa', id }) as const, ficha = (id: string) => ({ app: 'ficha', tipo: 'ficha', id }) as const;

const lista = [
  e('1', 'lugar', 'Casa dos Salgueiros', [mapa('m-casa')]), e('2', 'lugar', 'Álamo', [mapa('m-alamo'), { app: 'atlas', tipo: 'comodo', id: 'm-alamo/c1' }]),
  e('3', 'lugar', 'Sem mapa', []), e('4', 'pista', 'Carta', [mapa('m-x')]),
  e('5', 'personagem', 'Muirenn', [ficha('s1')]), e('6', 'personagem', 'Aldo', [ficha('s2'), { app: 'mesa', tipo: 'entidade', id: '6' }]), e('7', 'personagem', 'Sem ficha', []),
];

test('mapasDaCampanha: só lugares com mapa do Atlas, em ordem alfabética sem contar cômodos', () => {
  assert.deepEqual(mapasDaCampanha(lista).map(m => `${m.nome}:${m.mapaId}`), ['Álamo:m-alamo', 'Casa dos Salgueiros:m-casa']);
});

test('personagensComFicha: só personagens com Ref da Ficha, em ordem alfabética', () => {
  assert.deepEqual(personagensComFicha(lista).map(p => `${p.nome}:${p.fichaId}`), ['Aldo:s2', 'Muirenn:s1']);
});

test('fichasDaSessao e fichaAtiva: null é “todas”; escolhidas que sumiram não contam; a ativa cai na primeira', () => {
  const ps = personagensComFicha(lista);
  assert.deepEqual(fichasDaSessao(ps, null).map(p => p.fichaId), ['s2', 's1']);
  assert.deepEqual(fichasDaSessao(ps, ['s1', 'sumiu']).map(p => p.fichaId), ['s1']);
  assert.deepEqual(fichasDaSessao(ps, []), []);
  assert.equal(fichaAtiva(ps, 's1')?.fichaId, 's1');
  assert.equal(fichaAtiva(ps, 'sumiu')?.fichaId, 's2');
  assert.equal(fichaAtiva([], 's1'), null);
});

test('mapaEscolhido: o escolhido, se existe; senão o primeiro; senão nenhum', () => {
  const ms = mapasDaCampanha(lista);
  assert.equal(mapaEscolhido(ms, 'm-casa')?.mapaId, 'm-casa');
  assert.equal(mapaEscolhido(ms, 'sumiu')?.mapaId, 'm-alamo');
  assert.equal(mapaEscolhido(ms, null)?.mapaId, 'm-alamo');
  assert.equal(mapaEscolhido([], 'm-casa'), null);
});

test('endereços: o Atlas embutido com o mapa no hash; a Ficha pelo parâmetro; ids com caracteres especiais são codificados', () => {
  assert.equal(enderecoDoAtlas('http://x/Atlas/', 'm-casa'), 'http://x/Atlas/?embutido=1#/mapa/m-casa');
  assert.equal(enderecoDoAtlas('http://x/Atlas/', null), 'http://x/Atlas/?embutido=1');
  assert.equal(enderecoDaFicha('http://x/Dossie/', 'sheet-1730'), 'http://x/Dossie/?ficha=sheet-1730');
  assert.equal(enderecoDaFicha('http://x/Dossie/', 'a b&c'), 'http://x/Dossie/?ficha=a%20b%26c');
});

test('lerEscolhas: aceita o formato certo e limpa o resto', () => {
  assert.deepEqual(lerEscolhas({ mapaId: 'm1', fichas: ['s1', 3, ''], ativa: 's1' }), { mapaId: 'm1', fichas: ['s1'], ativa: 's1' });
  assert.deepEqual(lerEscolhas({ mapaId: '', fichas: 'x', ativa: 7 }), ESCOLHAS_VAZIAS);
  assert.deepEqual(lerEscolhas(null), ESCOLHAS_VAZIAS); assert.deepEqual(lerEscolhas('lixo'), ESCOLHAS_VAZIAS);
});

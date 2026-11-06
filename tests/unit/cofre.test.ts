import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Campanha, Entidade, Ligacao, Sessao } from '#mesa';
import {
  caminhoDaEntidade,
  criarSlug,
  entidadeParaMarkdown,
  lerManifestoDoCofre,
  manifestoDoCofre,
  markdownParaEntidade,
} from '../../src/dominio/cofre.ts';

const baseEntidade = (dados: Partial<Entidade> & { id: string; tipo: Entidade['tipo']; nome: string }): Entidade => ({
  campanhaId: 'camp-1',
  refs: [],
  tags: [],
  notas: '',
  criadaPor: 'mesa',
  criadaEm: 1730000000000,
  atualizadaEm: 1730000050000,
  ...dados,
});

describe('cofre em disco (domínio)', () => {
  it('criarSlug remove acentos, símbolos e gera slugs limpos', () => {
    assert.equal(criarSlug('Mansão Degolificada'), 'mansao-degolificada');
    assert.equal(criarSlug('Capítulo 1: O Início! (A Ameaça)'), 'capitulo-1-o-inicio-a-ameaca');
    assert.equal(criarSlug('   ---espaços---   '), 'espacos');
    assert.equal(criarSlug('???'), 'item');
  });

  it('caminhoDaEntidade gera caminhos relativos consistentes', () => {
    const e = baseEntidade({
      id: 'ent-123456789',
      tipo: 'lugar',
      nome: 'Sanatório de Arkham',
    });
    assert.equal(caminhoDaEntidade(e), 'entidades/lugar/sanatorio-de-arkham-ent-1234.md');
  });

  it('entidadeParaMarkdown e markdownParaEntidade realizam ida e volta perfeita (round-trip)', () => {
    const original: Entidade = baseEntidade({
      id: 'ent-investigador-1',
      campanhaId: 'camp-alpha',
      tipo: 'personagem',
      nome: 'Arthur "O Ocultista" Cervero',
      tags: ['protagonista', 'ocultismo', 'ordem'],
      refs: [
        { app: 'ficha', tipo: 'ficha', id: 'sheet-arthur' },
        { app: 'mesa', tipo: 'entidade', id: 'ent-investigador-1' },
      ],
      notas: `# Diário de Bordo

Primeiro contato com o ritual em [[Mansão Degolificada]].
O símbolo encontrado no livro antigo é uma ameaça: [[Aberração de Carne]].

- Item encontrado: Faca ritualística
- Pista anotada: "O sangue chama o sangue"`,
      criadaPor: 'ficha',
      criadaEm: 1730001000000,
      atualizadaEm: 1730002000000,
    });

    const { caminho, conteudo } = entidadeParaMarkdown(original);

    assert.ok(caminho.startsWith('entidades/personagem/'));
    assert.ok(caminho.endsWith('.md'));
    assert.ok(conteudo.startsWith('---\n'));
    assert.ok(conteudo.includes('Arthur \\"O Ocultista\\" Cervero'));

    const recuperada = markdownParaEntidade(conteudo, 'camp-alpha');
    assert.ok(recuperada);
    assert.deepEqual(recuperada, original);
  });

  it('preserva notas vazias, tags vazias e refs vazias', () => {
    const original: Entidade = baseEntidade({
      id: 'ent-vazia',
      campanhaId: 'camp-1',
      tipo: 'nota',
      nome: 'Anotação Solta',
      tags: [],
      refs: [],
      notas: '',
      criadaPor: 'mesa',
    });

    const { conteudo } = entidadeParaMarkdown(original);
    assert.ok(conteudo.includes('tags: []'));
    assert.ok(conteudo.includes('refs: []'));

    const recuperada = markdownParaEntidade(conteudo, 'camp-1');
    assert.ok(recuperada);
    assert.deepEqual(recuperada, original);
    assert.equal(recuperada.notas, '');
  });

  it('preserva quebras de linha múltiplas dentro das notas', () => {
    const notasComplexas = `Linha 1\n\n\nLinha 2 com múltiplos enters\n\nLinha 3`;
    const original: Entidade = baseEntidade({
      id: 'ent-quebras',
      tipo: 'cena',
      nome: 'Emboscada',
      notas: notasComplexas,
    });

    const { conteudo } = entidadeParaMarkdown(original);
    const recuperada = markdownParaEntidade(conteudo, 'camp-1');
    assert.ok(recuperada);
    assert.equal(recuperada.notas, notasComplexas);
  });

  it('markdownParaEntidade aceita variações comuns de YAML manual (inline arrays, sem aspas)', () => {
    const markdownManual = `---
id: lugar-manual
tipo: lugar
nome: Cabana na Floresta: Parte 1
tags: [cabana, isolado, "floresta sombria"]
refs: [mesa:atlas/mapa/map-cabana]
criadaPor: atlas
criadaEm: 1730000000000
atualizadaEm: 1730000500000
---

Notas manuais escritas no Obsidian.
`;

    const recuperada = markdownParaEntidade(markdownManual, 'camp-manual');
    assert.ok(recuperada);
    assert.equal(recuperada.id, 'lugar-manual');
    assert.equal(recuperada.tipo, 'lugar');
    assert.equal(recuperada.nome, 'Cabana na Floresta: Parte 1');
    assert.deepEqual(recuperada.tags, ['cabana', 'isolado', 'floresta sombria']);
    assert.deepEqual(recuperada.refs, [{ app: 'atlas', tipo: 'mapa', id: 'map-cabana' }]);
    assert.equal(recuperada.criadaPor, 'atlas');
    assert.equal(recuperada.notas, 'Notas manuais escritas no Obsidian.');
  });

  it('markdownParaEntidade rejeita entradas malformadas ou com campos inválidos', () => {
    // Sem frontmatter
    assert.equal(markdownParaEntidade('# Apenas markdown', 'camp-1'), null);

    // Frontmatter sem fechar
    assert.equal(markdownParaEntidade('---\nid: 1\nnome: Teste', 'camp-1'), null);

    // Tipo inválido
    const tipoInvalido = `---
id: ent-1
tipo: desconhecido
nome: Teste
---
Notas`;
    assert.equal(markdownParaEntidade(tipoInvalido, 'camp-1'), null);

    // Sem nome
    const semNome = `---
id: ent-1
tipo: nota
nome: ""
---
Notas`;
    assert.equal(markdownParaEntidade(semNome, 'camp-1'), null);

    // Sem id
    const semId = `---
tipo: nota
nome: Teste
---
Notas`;
    assert.equal(markdownParaEntidade(semId, 'camp-1'), null);
  });

  it('manifestoDoCofre e lerManifestoDoCofre serializam e desserializam campanha.json perfeitamente', () => {
    const campanha: Campanha = {
      id: 'camp-omega',
      nome: 'O Segredo na Ilha',
      sistema: 'ordem-paranormal',
      tema: 'ordem',
      capa: null,
      criadaEm: 1730000000000,
      atualizadaEm: 1730005000000,
    };

    const ligacoes: Ligacao[] = [
      {
        id: 'lig-1',
        campanhaId: 'camp-omega',
        tipo: 'esta-em',
        de: { app: 'mesa', tipo: 'cena', id: 'cena-1' },
        para: { app: 'atlas', tipo: 'mapa', id: 'mapa-ilha' },
        criadaPor: 'mesa',
        criadaEm: 1730001000000,
      },
    ];

    const sessoes: Sessao[] = [
      {
        id: 'sessao-1',
        campanhaId: 'camp-omega',
        nome: 'Sessão 01 — A Chegada de Barco',
        data: 1730002000000,
        roteiro: [{ app: 'atlas', tipo: 'mapa', id: 'mapa-ilha' }],
        roteiroNotas: { 'atlas/mapa/mapa-ilha': 'Desembarque sob tempestade' },
        registro: '19:00 Chegada na praia.',
        criadaEm: 1730002000000,
        atualizadaEm: 1730003000000,
      },
    ];

    const json = manifestoDoCofre(campanha, ligacoes, sessoes);
    assert.ok(json.includes('"versao": 1'));
    assert.ok(json.includes('"O Segredo na Ilha"'));

    const lido = lerManifestoDoCofre(json);
    assert.ok(lido);
    assert.deepEqual(lido.campanha, campanha);
    assert.deepEqual(lido.ligacoes, ligacoes);
    assert.deepEqual(lido.sessoes, sessoes);
  });

  it('lerManifestoDoCofre rejeita json inválido ou campanha corrompida', () => {
    assert.equal(lerManifestoDoCofre('não é json'), null);
    assert.equal(lerManifestoDoCofre('{}'), null);
    assert.equal(lerManifestoDoCofre(JSON.stringify({ campanha: { nome: '' } })), null);
  });
});

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Campanha, Entidade, Ligacao, RepositorioCampanha, Sessao } from '#mesa';
import {
  caminhoDaEntidade,
  criarSlug,
  entidadeParaMarkdown,
  lerManifestoDoCofre,
  manifestoDoCofre,
  markdownParaEntidade,
} from '../../src/dominio/cofre.ts';
import {
  criarDriverEmMemoria,
  gerarPacoteCofre,
  importarCofreDeTexto,
  sincronizarCampanhaComPasta,
} from '../../src/app/cofre.ts';

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

  it('sincronizarCampanhaComPasta grava campanha.json, arquivos .md e retratos em memória', async () => {
    const driver = criarDriverEmMemoria();
    const campanha: Campanha = {
      id: 'camp-sync-1',
      nome: 'O Covil da Serpente',
      sistema: 'ordem-paranormal',
      tema: null,
      capa: null,
      criadaEm: 1730000000000,
      atualizadaEm: 1730000000000,
    };

    const ent1 = baseEntidade({
      id: 'ent-12345678',
      campanhaId: 'camp-sync-1',
      tipo: 'personagem',
      nome: 'César Oliveira',
      retrato: new Blob(['fake-image-bytes'], { type: 'image/webp' }),
    });

    const ent2 = baseEntidade({
      id: 'ent-87654321',
      campanhaId: 'camp-sync-1',
      tipo: 'lugar',
      nome: 'Floresta Nebulosa',
    });

    const res = await sincronizarCampanhaComPasta(driver, campanha, [ent1, ent2]);

    assert.equal(res.campanhaId, 'camp-sync-1');
    assert.ok(driver.arquivos.has('campanha.json'));
    assert.ok(driver.arquivos.has('retratos/ent-12345678.webp'));
    assert.ok(driver.arquivos.has('entidades/personagem/cesar-oliveira-ent-1234.md'));
    assert.ok(driver.arquivos.has('entidades/lugar/floresta-nebulosa-ent-8765.md'));

    const jsonCampanha = await driver.lerTexto('campanha.json');
    assert.ok(jsonCampanha?.includes('O Covil da Serpente'));
  });

  it('sincronizarCampanhaComPasta remove arquivos órfãos que não pertencem mais à campanha', async () => {
    const driver = criarDriverEmMemoria({
      'entidades/lugar/antigo-orfa-12345678.md': '---\nid: orfa\n---',
      'outra-pasta/qualquer.txt': 'preservar',
    });

    const campanha: Campanha = {
      id: 'camp-sync-2',
      nome: 'Campanha Limpa',
      sistema: 'ordem-paranormal',
      tema: null,
      capa: null,
      criadaEm: 1730000000000,
      atualizadaEm: 1730000000000,
    };

    const novaEntidade = baseEntidade({
      id: 'ent-nova',
      campanhaId: 'camp-sync-2',
      tipo: 'lugar',
      nome: 'Mansão Nova',
    });

    const res = await sincronizarCampanhaComPasta(driver, campanha, [novaEntidade]);

    assert.deepEqual(res.arquivosRemovidos, ['entidades/lugar/antigo-orfa-12345678.md']);
    assert.equal(driver.arquivos.has('entidades/lugar/antigo-orfa-12345678.md'), false);
    // Preserva arquivos de fora da pasta entidades
    assert.equal(driver.arquivos.has('outra-pasta/qualquer.txt'), true);
  });

  it('gerarPacoteCofre e importarCofreDeTexto exportam e importam campanha e entidades completas', async () => {
    const campanha: Campanha = {
      id: 'camp-import-1',
      nome: 'Operação Crisálida',
      sistema: 'ordem-paranormal',
      tema: 'ordem',
      capa: null,
      criadaEm: 1730000000000,
      atualizadaEm: 1730000000000,
    };

    const e1 = baseEntidade({
      id: 'ent-p1',
      campanhaId: 'camp-import-1',
      tipo: 'personagem',
      nome: 'Rubens Naluti',
      notas: 'Membro da equipe.',
    });

    const pacoteJson = gerarPacoteCofre(campanha, [e1]);

    const campanhasSalvas: Campanha[] = [];
    const entidadesSalvas: Entidade[] = [];

    const mockRepo: RepositorioCampanha = {
      criarCampanha: async (c) => {
        const nova = { ...campanha, ...c };
        campanhasSalvas.push(nova);
        return nova;
      },
      salvarCampanha: async (c) => {
        campanhasSalvas.push(c);
      },
      listarCampanhas: async () => campanhasSalvas,
      obterCampanha: async (id) => campanhasSalvas.find(c => c.id === id),
      removerCampanha: async () => {},
      listarEntidades: async () => entidadesSalvas,
      obterEntidade: async (id) => entidadesSalvas.find(e => e.id === id),
      criarEntidade: async (d) => {
        const e: Entidade = baseEntidade({ ...d, id: 'id-mock' });
        entidadesSalvas.push(e);
        return e;
      },
      salvarEntidade: async (e) => {
        entidadesSalvas.push(e);
      },
      removerEntidade: async () => {},
      entidadeDaRef: async () => undefined,
      ligar: async (l) => ({ ...l, id: 'lig-1', criadaPor: 'mesa', criadaEm: Date.now() }),
      listarLigacoes: async () => [],
      removerLigacao: async () => {},
      listarSessoes: async () => [],
      salvarSessao: async () => {},
      removerSessao: async () => {},
      fechar: () => {},
    };

    const importada = await importarCofreDeTexto(pacoteJson, mockRepo);

    assert.ok(importada);
    assert.equal(importada.nome, 'Operação Crisálida');
    assert.equal(campanhasSalvas.length, 1);
    assert.equal(entidadesSalvas.length, 1);
    assert.equal(entidadesSalvas[0]?.nome, 'Rubens Naluti');
  });
});

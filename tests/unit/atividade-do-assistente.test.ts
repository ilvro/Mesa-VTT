import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { Campanha, Entidade, RepositorioCampanha, Sessao } from '#mesa';
import {
  desfazerChamada,
  limparAtividade,
  registrarChamadaConcluida,
} from '../../src/app/atividade-do-assistente.ts';

function baseCampanha(parcial: Partial<Campanha> = {}): Campanha {
  return {
    id: 'camp-1',
    nome: 'Campanha Teste',
    sistema: 'padrao',
    tema: null,
    capa: null,
    criadaEm: 1000,
    atualizadaEm: 1000,
    ...parcial,
  };
}

function baseEntidade(parcial: Partial<Entidade> = {}): Entidade {
  return {
    id: 'ent-1',
    campanhaId: 'camp-1',
    tipo: 'personagem',
    nome: 'Personagem Teste',
    tags: [],
    notas: '',
    refs: [],
    criadaPor: 'mesa',
    criadaEm: 1000,
    atualizadaEm: 1000,
    ...parcial,
  };
}

function baseSessao(parcial: Partial<Sessao> = {}): Sessao {
  return {
    id: 'sess-1',
    campanhaId: 'camp-1',
    nome: 'Sessão 1',
    data: 1000,
    roteiro: [],
    registro: '',
    criadaEm: 1000,
    atualizadaEm: 1000,
    ...parcial,
  };
}

function criarRepositorioMock() {
  const campanhas = new Map<string, Campanha>();
  const entidades = new Map<string, Entidade>();
  const sessoes = new Map<string, Sessao>();
  const ligacoes = new Map<string, any>();

  const repo: RepositorioCampanha = {
    criarCampanha: async (c) => {
      const camp = baseCampanha(c);
      campanhas.set(camp.id, camp);
      return camp;
    },
    salvarCampanha: async (c) => {
      campanhas.set(c.id, c);
    },
    listarCampanhas: async () => [...campanhas.values()],
    obterCampanha: async (id) => campanhas.get(id),
    removerCampanha: async (id) => { campanhas.delete(id); },

    listarEntidades: async () => [...entidades.values()],
    obterEntidade: async (id) => entidades.get(id),
    criarEntidade: async (d) => {
      const e = baseEntidade(d);
      entidades.set(e.id, e);
      return e;
    },
    salvarEntidade: async (e) => {
      entidades.set(e.id, e);
    },
    removerEntidade: async (id) => {
      entidades.delete(id);
    },
    entidadeDaRef: async () => undefined,

    ligar: async (l) => {
      const nova = { ...l, id: 'lig-1', criadaPor: 'mesa' as const, criadaEm: Date.now() };
      ligacoes.set(nova.id, nova);
      return nova as any;
    },
    listarLigacoes: async () => [...ligacoes.values()],
    removerLigacao: async (id) => {
      ligacoes.delete(id);
    },

    listarSessoes: async () => [...sessoes.values()],
    salvarSessao: async (s) => {
      sessoes.set(s.id, s);
    },
    removerSessao: async (id) => {
      sessoes.delete(id);
    },
    fechar: () => {},
  };

  return { repo, campanhas, entidades, sessoes, ligacoes };
}

describe('atividade-do-assistente e desfazer', () => {
  beforeEach(() => {
    limparAtividade();
  });

  it('criar uma entidade e desfazer a remove', async () => {
    const { repo, entidades } = criarRepositorioMock();
    const ent = baseEntidade({ id: 'npc-1', nome: 'Ferreiro' });
    entidades.set(ent.id, ent);

    const chamada = registrarChamadaConcluida({
      quando: 2000,
      ferramenta: 'mesa_entidade_criar',
      resumo: 'Criou npc "Ferreiro"',
      efeitos: [{ tipo: 'criou-entidade', id: 'npc-1' }],
      desfeita: false,
    });

    assert.equal(entidades.has('npc-1'), true);

    const relatorio = await desfazerChamada(chamada.id, repo, 'camp-1');
    assert.equal(relatorio.ok, true);
    assert.equal(relatorio.conflitos.length, 0);
    assert.equal(relatorio.desfeitos.length, 1);
    assert.equal(entidades.has('npc-1'), false);
    assert.equal(chamada.desfeita, true);
  });

  it('alterar uma sessão e desfazer restaura o "antes"', async () => {
    const { repo, sessoes } = criarRepositorioMock();
    const antes = baseSessao({ id: 's-1', nome: 'Sessão Original', roteiro: [] });
    const alterada = baseSessao({ id: 's-1', nome: 'Sessão Editada', roteiro: [{ app: 'mesa', tipo: 'entidade', id: 'e-1' }], atualizadaEm: 2000 });
    sessoes.set(alterada.id, alterada);

    const chamada = registrarChamadaConcluida({
      quando: 2000,
      ferramenta: 'mesa_sessao_editar',
      resumo: 'Editou sessão',
      efeitos: [{ tipo: 'alterou-sessao', antes }],
      desfeita: false,
    });

    const relatorio = await desfazerChamada(chamada.id, repo, 'camp-1');
    assert.equal(relatorio.ok, true);
    assert.equal(relatorio.conflitos.length, 0);
    const restaurada = sessoes.get('s-1');
    assert.equal(restaurada?.nome, 'Sessão Original');
    assert.equal(restaurada?.roteiro.length, 0);
  });

  it('item que mudou depois (atualizadaEm > chamada.quando) não é desfeito e aparece em conflitos', async () => {
    const { repo, entidades } = criarRepositorioMock();
    const entAntes = baseEntidade({ id: 'npc-2', nome: 'Guarda Antes' });
    // Item foi modificado às 3000, enquanto a chamada ocorreu às 2000
    const entAtual = baseEntidade({ id: 'npc-2', nome: 'Guarda Atualizado Pelo Mestre', atualizadaEm: 3000 });
    entidades.set(entAtual.id, entAtual);

    const chamada = registrarChamadaConcluida({
      quando: 2000,
      ferramenta: 'mesa_entidade_editar',
      resumo: 'Editou guarda',
      efeitos: [{ tipo: 'alterou-entidade', antes: entAntes }],
      desfeita: false,
    });

    const relatorio = await desfazerChamada(chamada.id, repo, 'camp-1');
    assert.equal(relatorio.ok, false);
    assert.equal(relatorio.conflitos.length, 1);
    assert.match(relatorio.conflitos[0]!, /não desfeito: Guarda Atualizado Pelo Mestre mudou depois/);
    assert.equal(entidades.get('npc-2')?.nome, 'Guarda Atualizado Pelo Mestre');
    assert.equal(chamada.desfeita, false);
  });

  it('não desfaz chamada já desfeita', async () => {
    const { repo, entidades } = criarRepositorioMock();
    const ent = baseEntidade({ id: 'npc-3', nome: 'Taverneiro' });
    entidades.set(ent.id, ent);

    const chamada = registrarChamadaConcluida({
      quando: 2000,
      ferramenta: 'mesa_entidade_criar',
      resumo: 'Criou npc "Taverneiro"',
      efeitos: [{ tipo: 'criou-entidade', id: 'npc-3' }],
      desfeita: false,
    });

    const r1 = await desfazerChamada(chamada.id, repo, 'camp-1');
    assert.equal(r1.ok, true);

    const r2 = await desfazerChamada(chamada.id, repo, 'camp-1');
    assert.equal(r2.ok, false);
    assert.match(r2.conflitos[0]!, /já foi desfeita/);
  });
});

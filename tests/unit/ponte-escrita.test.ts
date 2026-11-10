import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TIPOS_LIGACAO, type Entidade, type Ligacao, type Ref, type Sessao } from '#mesa';
import { ferramentasDeEntidade, ferramentasDeSessao, type ContextoDeEntidades, type ContextoDeSessoes } from '../../src/app/ponte-escrita.ts';
import { refDaEntidade, refsMencionados } from '../../src/dominio/notas.ts';
import { MAXIMO_DO_ROTEIRO } from '../../src/dominio/roteiro.ts';

function montar(comCampanha = true) {
  let lista: Sessao[] = [];
  const ctx: ContextoDeSessoes = {
    campanha: () => (comCampanha ? { id: 'c1', nome: 'C' } : null),
    sessoes: () => lista,
    async planejar(nome, data) { const s: Sessao = { id: `s${lista.length + 1}`, campanhaId: 'c1', nome, data: data ?? 0, roteiro: [], registro: '', criadaEm: 0, atualizadaEm: 0 }; lista = [s, ...lista]; return s; },
    async alterar(id, m) { const a = lista.find(s => s.id === id); if (!a) return null; const n = { ...a, ...m }; lista = lista.map(s => (s.id === id ? n : s)); return n; },
  };
  const f = Object.fromEntries(ferramentasDeSessao(ctx).map(t => [t.nome, t]));
  return { f, ctx, lista: () => lista };
}
const texto = async (p: Promise<{ tipo: string; texto?: string }[]>) => JSON.parse((await p)[0]!.texto!);
const mapa = (id: string): Ref => ({ app: 'atlas', tipo: 'mapa', id });

test('criar: planeja sem gravar, aceita data, e listar mostra', async () => {
  const { f, lista } = montar();
  const r = await texto(f.mesa_sessao_criar!.executar({ nome: 'Sessão 12', data: '2026-11-14' }));
  assert.equal(r.nome, 'Sessão 12'); assert.equal(r.data, '2026-11-14'); assert.equal(r.temRegistro, false);
  assert.equal(lista().length, 1);
  assert.equal((await texto(f.mesa_sessoes_listar!.executar({}))).length, 1);
  await assert.rejects(f.mesa_sessao_criar!.executar({ nome: 'x', data: 'ontem' }), /Data inválida/);
});

test('sem campanha ativa: erro legível', async () => {
  const { f } = montar(false);
  for (const n of ['mesa_sessao_criar', 'mesa_sessoes_listar']) await assert.rejects(f[n]!.executar({ nome: 'a' }), /Nenhuma campanha/);
});

test('roteiro: refs em texto e objeto, sem repetição, ordem e remoção', async () => {
  const { f } = montar();
  const { id } = await texto(f.mesa_sessao_criar!.executar({ nome: 'S' }));
  let r = await texto(f.mesa_sessao_editar!.executar({ id, roteiro: { acrescentar: ['mesa:atlas/mapa/a', mapa('b'), 'mesa:atlas/mapa/a', { app: 'jukebox', tipo: 'cena-sonora', id: 'c' }] } }));
  assert.deepEqual(r.roteiro.map((x: { ref: string }) => x.ref), ['mesa:atlas/mapa/a', 'mesa:atlas/mapa/b', 'mesa:jukebox/cena-sonora/c']);
  assert.equal(r.ignorados.length, 1);
  r = await texto(f.mesa_sessao_editar!.executar({ id, roteiro: { ordem: ['mesa:jukebox/cena-sonora/c', 'mesa:atlas/mapa/b'] , remover: ['mesa:atlas/mapa/zzz'] } }));
  assert.deepEqual(r.roteiro.map((x: { ref: string }) => x.ref), ['mesa:jukebox/cena-sonora/c', 'mesa:atlas/mapa/b', 'mesa:atlas/mapa/a']);
  assert.equal(r.ignorados.length, 1);
  r = await texto(f.mesa_sessao_editar!.executar({ id, nome: 'Nova', roteiro: { remover: ['mesa:atlas/mapa/a'] } }));
  assert.equal(r.nome, 'Nova'); assert.equal(r.roteiro.length, 2);
});

test('roteiro respeita o limite de itens', async () => {
  const { f } = montar();
  const { id } = await texto(f.mesa_sessao_criar!.executar({ nome: 'S' }));
  const muitos = Array.from({ length: MAXIMO_DO_ROTEIRO + 3 }, (_, i) => mapa(`m${i}`));
  const r = await texto(f.mesa_sessao_editar!.executar({ id, roteiro: { acrescentar: muitos } }));
  assert.equal(r.roteiro.length, MAXIMO_DO_ROTEIRO); assert.equal(r.ignorados.length, 3);
});

test('notas: valem para itens do roteiro e são podadas quando o item sai', async () => {
  const { f, lista } = montar();
  const { id } = await texto(f.mesa_sessao_criar!.executar({ nome: 'S' }));
  let r = await texto(f.mesa_sessao_editar!.executar({ id, roteiro: { acrescentar: ['mesa:atlas/mapa/a', 'mesa:atlas/mapa/b'] }, notas: [{ ref: 'mesa:atlas/mapa/a', texto: 'Começa aqui' }, { ref: 'mesa:atlas/mapa/x', texto: 'perdida' }] }));
  assert.equal(r.roteiro[0].nota, 'Começa aqui'); assert.equal(r.ignorados.length, 1);
  assert.deepEqual(lista()[0]!.roteiroNotas, { 'atlas/mapa/a': 'Começa aqui' });
  await texto(f.mesa_sessao_editar!.executar({ id, roteiro: { remover: ['mesa:atlas/mapa/a'] } }));
  assert.deepEqual(lista()[0]!.roteiroNotas, {});
});

test('erros: sessão inexistente e ref inválida não alteram nada', async () => {
  const { f, lista } = montar();
  await assert.rejects(f.mesa_sessao_editar!.executar({ id: 'nao' }), /Não há sessão/);
  const { id } = await texto(f.mesa_sessao_criar!.executar({ nome: 'S' }));
  await assert.rejects(f.mesa_sessao_editar!.executar({ id, roteiro: { acrescentar: ['lixo'] } }), /Referência inválida/);
  assert.equal(lista()[0]!.roteiro.length, 0);
});

function montarEntidades(comCampanha = true) {
  let lista: Entidade[] = [];
  const ligacoes: Ligacao[] = [];
  let n = 0;
  const outra: Entidade = { id: 'x1', campanhaId: 'c1', tipo: 'personagem', nome: 'Ficha do Dossiê', refs: [], tags: [], notas: '', criadaPor: 'ficha', criadaEm: 0, atualizadaEm: 0 };
  lista.push(outra);
  const ctx: ContextoDeEntidades = {
    campanha: () => (comCampanha ? { id: 'c1', nome: 'C' } : null),
    entidades: () => lista,
    async criar(tipo, nome) { const e: Entidade = { id: `e${++n}`, campanhaId: 'c1', tipo, nome, refs: [], tags: [], notas: '', criadaPor: 'mesa', criadaEm: 0, atualizadaEm: 0 }; lista = [...lista, e]; return e; },
    async alterar(e, m) {
      const nova = { ...e, ...m }; lista = lista.map(x => (x.id === e.id ? nova : x));
      if (m.notas !== undefined) {
        ligacoes.splice(0, ligacoes.length, ...ligacoes.filter(l => l.de.id !== e.id));
        for (const para of refsMencionados(nova.notas, lista, refDaEntidade(e.id))) ligacoes.push({ id: `l${ligacoes.length}`, campanhaId: 'c1', de: refDaEntidade(e.id), para, tipo: 'menciona', criadaPor: 'mesa', criadaEm: 0 } as Ligacao);
      }
      return true;
    },
    async ligar(de, para, tipo) { const l = { id: `l${ligacoes.length}`, campanhaId: 'c1', de, para, tipo, criadaPor: 'mesa', criadaEm: 0 } as Ligacao; ligacoes.push(l); return l; },
  };
  const f = Object.fromEntries(ferramentasDeEntidade(ctx).map(t => [t.nome, t]));
  return { f, lista: () => lista, ligacoes };
}

test('entidade: criar personagem com [[Lugar]] nas notas gera a ligação', async () => {
  const { f, ligacoes } = montarEntidades();
  const forja = await texto(f.mesa_entidade_criar!.executar({ tipo: 'lugar', nome: 'Forja' }));
  const r = await texto(f.mesa_entidade_criar!.executar({ tipo: 'personagem', nome: 'Var Hoyde', tags: ['#ferreiro', 'ferreiro'], notas: 'Trabalha na [[Forja]].' }));
  assert.deepEqual(r.tags, ['ferreiro']); assert.equal(r.criadaPor, 'mesa');
  assert.equal(ligacoes.length, 1);
  assert.equal(ligacoes[0]!.para.id, forja.id);
  await assert.rejects(f.mesa_entidade_criar!.executar({ tipo: 'efeito', nome: 'x' }), /Tipos aceitos: .*cena.*ameaca/);
  assert.equal((await texto(f.mesa_entidade_criar!.executar({ tipo: 'ameaca', nome: 'Lobo' }))).tipo, 'ameaca');
});

test('entidade: editar, acrescentar notas e recusar entidade de outro app', async () => {
  const { f } = montarEntidades();
  const { id } = await texto(f.mesa_entidade_criar!.executar({ tipo: 'nota', nome: 'N', notas: 'um' }));
  let r = await texto(f.mesa_entidade_editar!.executar({ id, acrescentarNotas: 'dois', nome: 'N2' }));
  assert.equal(r.notas, 'um\n\ndois'); assert.equal(r.nome, 'N2');
  r = await texto(f.mesa_entidade_editar!.executar({ id: `mesa:mesa/entidade/${id}`, notas: 'novo', acrescentarNotas: 'fim' }));
  assert.equal(r.notas, 'novo\n\nfim');
  await assert.rejects(f.mesa_entidade_editar!.executar({ id: 'x1', nome: 'Y' }), /é do Dossiê/);
  await assert.rejects(f.mesa_entidade_editar!.executar({ id: 'nada', nome: 'Y' }), /Não há entidade/);
  await assert.rejects(f.mesa_entidade_editar!.executar({ id }), /Nada a mudar/);
});

test('ligar: refs em texto e objeto; tipo inválido lista os tipos', async () => {
  const { f, ligacoes } = montarEntidades();
  const r = await texto(f.mesa_ligar!.executar({ de: 'mesa:mesa/entidade/e1', para: { app: 'atlas', tipo: 'mapa', id: 'm' }, tipo: 'esta-em' }));
  assert.equal(r.para, 'mesa:atlas/mapa/m'); assert.equal(ligacoes.length, 1);
  await assert.rejects(f.mesa_ligar!.executar({ de: 'mesa:mesa/entidade/e1', para: 'mesa:mesa/entidade/e2', tipo: 'odeia' }), new RegExp(TIPOS_LIGACAO.join(', ')));
  await assert.rejects(f.mesa_ligar!.executar({ de: 'lixo', para: 'mesa:mesa/entidade/e2', tipo: 'revela' }), /Referência inválida/);
});

test('entidade: sem campanha ativa, erro legível', async () => {
  const { f } = montarEntidades(false);
  await assert.rejects(f.mesa_entidade_criar!.executar({ tipo: 'lugar', nome: 'a' }), /Nenhuma campanha/);
});

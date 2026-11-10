import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Ref, Sessao } from '#mesa';
import { ferramentasDeSessao, type ContextoDeSessoes } from '../../src/app/ponte-escrita.ts';
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

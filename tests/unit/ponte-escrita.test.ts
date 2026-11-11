import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TIPOS_LIGACAO, type Entidade, type Ligacao, type Ref, type Sessao } from '#mesa';
import { ferramentasDeEntidade, ferramentasDeSessao, type ContextoDeEntidades, type ContextoDeSessoes } from '../../src/app/ponte-escrita.ts';
import { refDaEntidade, refsMencionados } from '../../src/dominio/notas.ts';
import { MAXIMO_DO_ROTEIRO } from '../../src/dominio/roteiro.ts';

function montar(comCampanha = true) {
  let lista: Sessao[] = [];
  const ctx: ContextoDeSessoes = {
    campanha: async () => (comCampanha ? { id: 'c1', nome: 'C' } : null),
    sessoes: async () => lista,
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

test('listar lê do banco, não do signal: signal vazio e sessão no banco', async () => {
  const noBanco: Sessao = { id: 'sb', campanhaId: 'c1', nome: 'No banco', data: 0, roteiro: [], registro: '', criadaEm: 0, atualizadaEm: 0 };
  let signal: Sessao[] = [], recargas = 0;
  const ctx: ContextoDeSessoes = {
    campanha: async () => ({ id: 'c1', nome: 'C' }),
    sessoes: async () => [noBanco],
    async planejar() { return null; },
    async alterar(id, m) { signal = [{ ...noBanco, ...m }]; return signal[0]!; },   // escrever pela interface atualiza o signal
    async recarregar() { recargas++; },
  };
  const f = Object.fromEntries(ferramentasDeSessao(ctx).map(t => [t.nome, t]));
  assert.equal(signal.length, 0);
  assert.deepEqual((await texto(f.mesa_sessoes_listar!.executar({}))).map((s: { id: string }) => s.id), ['sb']);
  const r = await texto(f.mesa_sessao_editar!.executar({ id: 'sb', nome: 'Novo nome' }));
  assert.equal(r.nome, 'Novo nome'); assert.equal(signal[0]!.nome, 'Novo nome'); assert.equal(recargas, 1);
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
    campanha: async () => (comCampanha ? { id: 'c1', nome: 'C' } : null),
    entidades: async () => lista,
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

import { ferramentasDeCena, ferramentasDeElenco, type ContextoDeCenas, type ContextoDeElenco } from '../../src/app/ponte-escrita.ts';

function montarCenas() {
  const mk = (id: string, tipo: Entidade['tipo'], nome: string, criadaPor: Entidade['criadaPor'], refs: Ref[] = [], tags: string[] = []): Entidade =>
    ({ id, campanhaId: 'c1', tipo, nome, tags, notas: '', refs, criadaPor, criadaEm: 0, atualizadaEm: 0 } as Entidade);
  let ents: Entidade[] = [
    mk('cena1', 'cena', 'Emboscada na ponte', 'mesa'), mk('npc', 'personagem', 'Mira', 'mesa'),
    mk('ravina', 'lugar', 'Ravina', 'atlas', [mapa('rav')]), mk('tensao', 'cena', 'Tensão', 'jukebox', [{ app: 'jukebox', tipo: 'cena-sonora', id: 't1' }]),
    mk('b1', 'ameaca', 'Bandido 1', 'ficha', [{ app: 'ficha', tipo: 'ameaca', id: 'f1' }]), mk('b2', 'ameaca', 'Bandido 2', 'ficha', [{ app: 'ficha', tipo: 'ameaca', id: 'f2' }]),
    mk('carta', 'pista', 'Carta', 'atelie', [{ app: 'atelie', tipo: 'documento', id: 'd1' }]),
  ];
  const ligs: Ligacao[] = [];
  const lig = async (cena: Entidade, outro: Entidade, tipo: Ligacao['tipo'], inverso = false) => {
    const a = outro.refs[0] ?? refDaEntidade(outro.id), b = refDaEntidade(cena.id);
    ligs.push({ id: `l${ligs.length}`, campanhaId: 'c1', de: inverso ? a : b, para: inverso ? b : a, tipo, criadaPor: 'mesa', criadaEm: 0 } as Ligacao);
    return true;
  };
  const abertos: string[] = [];
  const ctx: ContextoDeCenas = {
    campanha: async () => ({ id: 'c1', nome: 'C' }), entidades: async () => ents, ligacoes: async () => ligs,
    vincularMapa: (c, m) => lig(c, m, 'esta-em'), vincularTrilha: (c, t) => lig(c, t, 'toca-em'),
    vincularParticipante: (c, p) => lig(c, p, 'aparece-em', true), vincularPista: (c, p) => lig(c, p, 'revela'),
    alternarEncontro: async c => { ents = ents.map(e => (e.id === c.id ? { ...e, tags: e.tags.includes('encontro') ? [] : ['encontro'] } : e)); return true; },
    definirMomento: async (c, m) => { ents = ents.map(e => (e.id === c.id ? { ...e, tags: [...e.tags.filter(t => !t.startsWith("momento:")), ...(m ? [`momento:${m}`] : [])] } : e)); return true; },
    abrirApp: async app => { abertos.push(app); return app === 'jukebox' ? 'bloqueado' : app === 'atelie' ? 'indisponivel' : 'aberto'; },
  };
  return { f: Object.fromEntries(ferramentasDeCena(ctx).map(t => [t.nome, t])), ligs, abertos };
}

test('cena: montar com mapa, trilha, dois participantes, pista, encontro e momento; ler devolve nomes', async () => {
  const { f, ligs } = montarCenas();
  const r = await texto(f.mesa_cena_montar!.executar({ cenaId: 'cena1', mapa: 'ravina', trilha: 'tensao', participantes: ['b1', 'b2'], pistas: ['carta'], encontro: true, momento: 'Chegada' }));
  assert.deepEqual(ligs.map(l => l.tipo), ['esta-em', 'toca-em', 'aparece-em', 'aparece-em', 'revela']);
  assert.equal(r.mapa.nome, 'Ravina'); assert.equal(r.trilha.nome, 'Tensão'); assert.deepEqual(r.participantes.map((p: { nome: string }) => p.nome), ['Bandido 1', 'Bandido 2']);
  assert.equal(r.pistas[0].nome, 'Carta'); assert.equal(r.encontro, true); assert.equal(r.momento, 'Chegada');
  const l = await texto(f.mesa_cena_ler!.executar({ cenaId: 'cena1' }));
  assert.deepEqual(l, r);
});

test('cena: erros legíveis (não é cena, entidade inexistente, tipo errado) sem gravar nada', async () => {
  const { f, ligs } = montarCenas();
  await assert.rejects(f.mesa_cena_montar!.executar({ cenaId: 'ravina', mapa: 'ravina' }), /não uma cena/);
  await assert.rejects(f.mesa_cena_montar!.executar({ cenaId: 'cena1', mapa: 'nada' }), /não há entidade com id "nada"/);
  await assert.rejects(f.mesa_cena_montar!.executar({ cenaId: 'cena1', mapa: 'ravina', participantes: ['ravina'] }), /participantes.*lugar.*personagem ou ameaça/);
  await assert.rejects(f.mesa_cena_montar!.executar({ cenaId: 'cena1', trilha: 'npc' }), /Jukebox/);
  await assert.rejects(f.mesa_cena_montar!.executar({ cenaId: 'cena1' }), /Nada a montar/);
  assert.equal(ligs.length, 0);
});

test('abrir apps: abre, avisa do bloqueio e do app ausente; recusa app inválido', async () => {
  const { f, abertos } = montarCenas();
  const r = await texto(f.mesa_abrir_apps!.executar({ apps: ['atlas', 'jukebox', 'atelie', 'atlas'] }));
  assert.deepEqual(abertos, ['atlas', 'jukebox', 'atelie']);
  assert.deepEqual(r.apps, { atlas: 'aberto', jukebox: 'bloqueado', atelie: 'indisponivel' });
  assert.match(r.aviso, /bloqueou.*jukebox.*Abrir/); assert.match(r.aviso, /atelie/);
  await assert.rejects(f.mesa_abrir_apps!.executar({ apps: ['tabletop'] }), /inválidos/);
});

test('elenco: mesa_elenco por nome, id e ref; poda órfãos; mesa_elenco_ler lista elenco e fora', async () => {
  const mk = (id: string, tipo: Entidade['tipo'], nome: string, fichaId?: string): Entidade => ({
    id,
    campanhaId: 'c1',
    tipo,
    nome,
    tags: [],
    notas: '',
    refs: fichaId ? [{ app: 'ficha', tipo: 'ficha', id: fichaId }] : [],
    criadaPor: fichaId ? 'ficha' : 'mesa',
    criadaEm: 0,
    atualizadaEm: 0,
  });
  let ents: Entidade[] = [
    mk('p1', 'personagem', 'Áurea', 'f-aurea'),
    mk('p2', 'personagem', 'Dante', 'f-dante'),
    mk('p3', 'personagem', 'Taverneiro', 'f-tav'),
    mk('l1', 'lugar', 'Cais'),
  ];
  let elencoAtual: string[] | undefined = undefined;
  const ctx: ContextoDeElenco = {
    campanha: async () => ({
      id: 'c1',
      nome: 'Campanha',
      ...(elencoAtual !== undefined ? { elenco: elencoAtual } : {}),
    }),
    entidades: async () => ents,
    salvarElenco: async novo => {
      const idsPersonagens = new Set(ents.filter(e => e.tipo === 'personagem').map(e => e.id));
      elencoAtual = novo.filter(id => idsPersonagens.has(id));
      return true;
    },
  };
  const f = Object.fromEntries(ferramentasDeElenco(ctx).map(t => [t.nome, t]));

  // Antes de definir elenco
  const antes = await texto(f.mesa_elenco_ler!.executar({}));
  assert.equal(antes.definido, false);
  assert.equal(antes.elenco.length, 0);
  assert.deepEqual(antes.foraDoElenco.map((x: { id: string }) => x.id), ['p1', 'p2', 'p3']);

  // Acrescentar por nome (sem acento/caixa) e por ref de ficha
  const depois1 = await texto(
    f.mesa_elenco!.executar({ acrescentar: ['mesa:ficha/ficha/f-dante', 'aurea'] }),
  );
  assert.equal(depois1.definido, true);
  assert.deepEqual(depois1.elenco.map((x: { nome: string }) => x.nome), ['Dante', 'Áurea']);
  assert.deepEqual(depois1.foraDoElenco.map((x: { nome: string }) => x.nome), ['Taverneiro']);

  // Remover por nome e acrescentar por id; ID órfão no banco é podado
  elencoAtual = ['orfao', 'p2', 'p1'];
  const depois2 = await texto(
    f.mesa_elenco!.executar({ remover: ['Dante'], acrescentar: ['p3'] }),
  );
  assert.deepEqual(depois2.elenco.map((x: { id: string }) => x.id), ['p1', 'p3']);
  assert.deepEqual(depois2.foraDoElenco.map((x: { id: string }) => x.id), ['p2']);

  // Recusar lugar ou inexistente
  await assert.rejects(f.mesa_elenco!.executar({ acrescentar: ['Cais'] }), /não personagem/);
  await assert.rejects(f.mesa_elenco!.executar({ acrescentar: ['Inexistente'] }), /não encontrado/);
});

test('orçamento: descrições até 400 caracteres e campos até 80', () => {
  const nada = new Proxy(function () {}, { get: () => nada, apply: () => nada }) as never;
  const varrer = (o: unknown): string[] => !o || typeof o !== 'object' ? [] : [...(typeof (o as { description?: unknown }).description === 'string' && (o as { description: string }).description.length > 80 ? [(o as { description: string }).description] : []), ...Object.values(o).flatMap(varrer)];
  for (const t of [...ferramentasDeSessao(nada), ...ferramentasDeEntidade(nada), ...ferramentasDeCena(nada), ...ferramentasDeElenco(nada)]) { assert.ok(t.descricao.length <= 400, t.nome); assert.deepEqual(varrer(t.esquema), [], t.nome); }
});

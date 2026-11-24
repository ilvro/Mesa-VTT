import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarFeed, iniciais, lerHistorico, lerRolagem, tomDaRolagem, VIDA_NO_FEED_MS, type RolagemDoFeed } from '../../../src/online/feed.ts';

function relogio() {
  let t = 1000;
  const pendentes: Array<{ em: number; f: () => void }> = [];
  return {
    agora: () => t,
    agendar: (f: () => void, ms: number) => { const p = { em: t + ms, f }; pendentes.push(p); return () => { const i = pendentes.indexOf(p); if (i >= 0) pendentes.splice(i, 1); }; },
    avancar(ms: number) {
      t += ms;
      for (const p of pendentes.filter(x => x.em <= t).sort((a, b) => a.em - b.em)) { pendentes.splice(pendentes.indexOf(p), 1); p.f(); }
    },
  };
}
const r = (id: string, em: number, extra: Partial<RolagemDoFeed> = {}): RolagemDoFeed => ({ id, em, autor: 'Ana', fichaId: 'f1', titulo: 'Ataque', total: 10, tom: 'normal', ...extra });

test('lerRolagem lê o envelope ficha.rolagem e o tom segue o do Atlas', () => {
  const env = { tipo: 'ficha.rolagem', id: 'e1', em: 5, autor: { nome: 'Ana' }, dados: { ficha: { app: 'ficha', tipo: 'ficha', id: 'f1' }, titulo: 'Luta', total: 22, modificador: 2 } };
  assert.deepEqual(lerRolagem(env), { id: 'e1', em: 5, autor: 'Ana', fichaId: 'f1', titulo: 'Luta', total: 22, modificador: 2, tom: 'alto' });
  assert.equal(lerRolagem({ ...env, tipo: 'ficha.recursos' }), null);
  assert.equal(lerRolagem({ ...env, dados: { titulo: 'x' } }), null);
  assert.equal(lerRolagem(null), null);
  assert.equal(tomDaRolagem(19), 'alto');
  assert.equal(tomDaRolagem(2), 'baixo');
  assert.equal(tomDaRolagem(12, 10), 'baixo'); // o dado sem o modificador
  assert.equal(tomDaRolagem(10), 'normal');
});

test('lerHistorico ordena da mais nova para a mais antiga e ignora o que não é rolagem', () => {
  const mk = (id: string, em: number) => ({ tipo: 'ficha.rolagem', id, em, dados: { titulo: 't', total: 5 } });
  const h = lerHistorico([mk('a', 1), { tipo: 'outro', id: 'z' }, mk('c', 3), mk('b', 2)] as never);
  assert.deepEqual(h.map(x => x.id), ['c', 'b', 'a']);
});

test('iniciais', () => {
  assert.equal(iniciais('Ana Maria Souza'), 'AS');
  assert.equal(iniciais('rex'), 'RE');
  assert.equal(iniciais('  '), '?');
});

test('o feed recebe, ordena por em e mantém só as 5 mais novas', () => {
  const c = relogio();
  const feed = criarFeed(c);
  for (const [id, em] of [['a', 3], ['b', 1], ['c', 6], ['d', 2], ['e', 5], ['f', 4], ['g', 7]] as const) feed.receber(r(id, em));
  assert.deepEqual(feed.itens().map(x => x.id), ['a', 'f', 'e', 'c', 'g']);
  assert.equal(feed.receber(r('g', 7)), false); // repetida
  feed.fechar();
});

test('uma rolagem some 8 s depois de chegar, e o feed avisa a mudança', () => {
  const c = relogio();
  const vistos: string[][] = [];
  const feed = criarFeed({ ...c, aoMudar: l => vistos.push(l.map(x => x.id)) });
  feed.receber(r('a', 1));
  c.avancar(3000);
  feed.receber(r('b', 2));
  c.avancar(VIDA_NO_FEED_MS - 3000 - 1);
  assert.deepEqual(feed.itens().map(x => x.id), ['a', 'b']);
  c.avancar(1);
  assert.deepEqual(feed.itens().map(x => x.id), ['b']);
  c.avancar(3000);
  assert.deepEqual(feed.itens(), []);
  assert.deepEqual(vistos.at(-1), []);
  assert.deepEqual(vistos, [['a'], ['a', 'b'], ['b'], []]);
});

test('fechar para o relógio e esvazia', () => {
  const c = relogio();
  const feed = criarFeed(c);
  feed.receber(r('a', 1));
  feed.fechar();
  assert.deepEqual(feed.itens(), []);
  assert.equal(feed.receber(r('b', 2)), false);
});

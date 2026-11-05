import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classificar } from '../../src/dominio/aplicativos.ts';

const manifesto = (app: string) => ({ app, nome: app, contrato: 1, icone: './i.svg', rotas: {}, oferece: ['x'], emite: [], atende: [] });

test('classificar: manifesto válido do aplicativo esperado é “achado”', () => {
  const v = classificar('atlas', { manifesto: { status: 200, corpo: manifesto('atlas') } });
  assert.equal(v.estado, 'achado'); assert.equal(v.manifesto?.app, 'atlas');
});

test('classificar: manifesto de outro aplicativo ou inválido é “sem manifesto”, com o motivo', () => {
  const outro = classificar('atlas', { manifesto: { status: 200, corpo: manifesto('ficha') } });
  assert.equal(outro.estado, 'sem-manifesto'); assert.match(outro.detalhe!, /“ficha”.*“atlas”/);
  const ruim = classificar('atlas', { manifesto: { status: 200, corpo: { app: 'atlas' } } });
  assert.equal(ruim.estado, 'sem-manifesto'); assert.ok(ruim.detalhe);
  const html = classificar('atlas', { manifesto: { status: 200 } });   // o servidor de desenvolvimento devolveu a página
  assert.equal(html.estado, 'sem-manifesto'); assert.match(html.detalhe!, /JSON/);
});

test('classificar: 404 com a página no ar é “sem manifesto”; sem a página, “fora do ar”', () => {
  assert.equal(classificar('tabletop', { manifesto: { status: 404 }, pagina: { status: 200 } }).estado, 'sem-manifesto');
  assert.equal(classificar('tabletop', { manifesto: { status: 404 }, pagina: { status: 404 } }).estado, 'fora-do-ar');
  assert.equal(classificar('tabletop', { manifesto: { status: 404 }, pagina: { status: null } }).estado, 'fora-do-ar');
  assert.equal(classificar('tabletop', { manifesto: { status: 404 } }).estado, 'fora-do-ar');
});

test('classificar: sem resposta ou erro do servidor/proxy é “fora do ar”', () => {
  assert.equal(classificar('ficha', { manifesto: { status: null } }).estado, 'fora-do-ar');
  assert.equal(classificar('ficha', { manifesto: { status: 502 }, pagina: { status: 502 } }).estado, 'fora-do-ar');
  assert.match(classificar('ficha', { manifesto: { status: 502 } }).detalhe!, /502/);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CHAVE_SESSAO, CHAVE_STATE, CHAVE_VOLTA,
  concluirLogin, erroDoLogin, expDaSessao, hashDeVolta, iniciarLogin, lerSessaoGuardada,
  queryLimpa, sessaoOnline, urlDeAutorizacao,
} from '../../../src/app/online-login.ts';
import {
  DISCORD_CLIENT_ID, ehDesktopMesa, REDIRECT_DEV, REDIRECT_PAGES, redirectUri, urlDaSala, urlDeConviteDaSala,
  urlDoWebSocket, URL_SALA_LOCAL, URL_SALA_PRODUCAO,
} from '../../../src/online/config.ts';

class Armazem {
  m = new Map<string, string>();
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
}
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
const token = (exp: number) => `${b64({ discordId: '1', exp })}.assinatura`;
const eu = { discordId: '1', nome: 'Ana', avatar: null, podeMestrar: true };

test('a URL de autorização tem client_id, code, scope, redirect_uri e state', () => {
  const u = new URL(urlDeAutorizacao('abc', REDIRECT_PAGES));
  assert.equal(u.origin + u.pathname, 'https://discord.com/oauth2/authorize');
  assert.equal(u.searchParams.get('client_id'), DISCORD_CLIENT_ID);
  assert.equal(u.searchParams.get('response_type'), 'code');
  assert.equal(u.searchParams.get('scope'), 'identify guilds');
  assert.equal(u.searchParams.get('redirect_uri'), 'https://ilvro.github.io/Mesa-VTT/');
  assert.equal(u.searchParams.get('state'), 'abc');
});

test('iniciarLogin guarda o state na aba e o põe na URL', () => {
  const aba = new Armazem();
  const u = new URL(iniciarLogin({ sessionStorage: aba, redirect: REDIRECT_DEV }));
  const state = u.searchParams.get('state')!;
  assert.match(state, /^[0-9a-f]{32}$/);
  assert.equal(aba.getItem(CHAVE_STATE), state);
});

test('volta com o state certo: troca o code e guarda a sessão', async () => {
  const aba = new Armazem(), local = new Armazem();
  aba.setItem(CHAVE_STATE, 'xyz');
  let chamada: { url: string; corpo: unknown } | null = null;
  const sessao = token(Date.now() + 1000);
  const r = await concluirLogin({
    search: '?code=C0D&state=xyz', sessionStorage: aba, localStorage: local, urlSala: 'http://sala', redirect: REDIRECT_PAGES,
    fetch: (async (url: string, init: { body: string }) => { chamada = { url, corpo: JSON.parse(init.body) }; return new Response(JSON.stringify({ sessao, eu, access_token: 'x' })); }) as unknown as typeof fetch,
  });
  assert.equal(r, 'ok');
  assert.deepEqual(chamada, { url: 'http://sala/sala/token', corpo: { code: 'C0D', redirectUri: REDIRECT_PAGES } });
  assert.deepEqual(JSON.parse(local.getItem(CHAVE_SESSAO)!), { sessao, eu });
  assert.equal(aba.getItem(CHAVE_STATE), null);
  assert.equal(sessaoOnline.value?.eu.nome, 'Ana');
});

test('recusa state diferente (ou ausente) sem chamar a sala', async () => {
  for (const guardado of ['outro', null]) {
    const aba = new Armazem(), local = new Armazem();
    if (guardado) aba.setItem(CHAVE_STATE, guardado);
    let chamou = false;
    const r = await concluirLogin({ search: '?code=C&state=xyz', sessionStorage: aba, localStorage: local, fetch: (async () => { chamou = true; return new Response('{}'); }) as unknown as typeof fetch });
    assert.equal(r, 'state-invalido');
    assert.equal(chamou, false);
    assert.equal(local.getItem(CHAVE_SESSAO), null);
  }
});

test('sem code não faz nada; a sala recusando vira erro', async () => {
  assert.equal(await concluirLogin({ search: '?x=1' }), 'sem-codigo');
  const aba = new Armazem(); aba.setItem(CHAVE_STATE, 's');
  const r = await concluirLogin({ search: '?code=C&state=s', sessionStorage: aba, localStorage: new Armazem(), fetch: (async () => new Response('{"erro":"x"}', { status: 401 })) as unknown as typeof fetch });
  assert.equal(r, 'erro');
});

test('sessão vencida volta ao estado "não conectado" e é apagada', () => {
  const local = new Armazem();
  local.setItem(CHAVE_SESSAO, JSON.stringify({ sessao: token(1000), eu }));
  assert.equal(lerSessaoGuardada(local, 5000), null);
  assert.equal(local.getItem(CHAVE_SESSAO), null);
  local.setItem(CHAVE_SESSAO, JSON.stringify({ sessao: token(9000), eu }));
  assert.equal(lerSessaoGuardada(local, 5000)?.eu.nome, 'Ana');
  local.setItem(CHAVE_SESSAO, 'lixo');
  assert.equal(lerSessaoGuardada(local, 5000), null);
  assert.equal(expDaSessao('sem-ponto'), null);
});

test('a query perde só code e state', () => {
  assert.equal(queryLimpa('?code=1&state=2'), '');
  assert.equal(queryLimpa('?a=1&code=1&state=2'), '?a=1');
});

test('config: urlDaSala, redirectUri e a URL do WebSocket', () => {
  const vazio = new Armazem();
  assert.equal(urlDaSala({ hostname: '127.0.0.1' }, vazio), 'http://127.0.0.1:8787');
  assert.equal(urlDaSala({ hostname: 'localhost' }, vazio), 'http://127.0.0.1:8787');
  assert.equal(urlDaSala({ hostname: 'ilvro.github.io' }, vazio), URL_SALA_PRODUCAO);
  vazio.setItem('mesa:sala-url', 'http://127.0.0.1:9999/');
  assert.equal(urlDaSala({ hostname: 'ilvro.github.io' }, vazio), 'http://127.0.0.1:9999');
  assert.equal(urlDaSala({ hostname: 'x' }, { getItem() { throw new Error('bloqueado'); } }), URL_SALA_PRODUCAO);
  assert.equal(redirectUri({ hostname: 'ilvro.github.io' }), REDIRECT_PAGES);
  assert.equal(redirectUri({ hostname: '127.0.0.1' }), REDIRECT_DEV);
  assert.equal(urlDoWebSocket('abc', 'http://127.0.0.1:8787'), 'ws://127.0.0.1:8787/sala/abc/ws');
  assert.equal(urlDoWebSocket('abc', 'https://s.workers.dev'), 'wss://s.workers.dev/sala/abc/ws');
});

test('login do jogador: scope identify e o hash de volta guardado, lido uma vez', () => {
  const aba = new Armazem();
  const u = new URL(iniciarLogin({ sessionStorage: aba, redirect: REDIRECT_DEV, state: 's1', scope: 'identify', voltarPara: '#/jogar/abc123' }));
  assert.equal(u.searchParams.get('scope'), 'identify');
  assert.equal(aba.getItem(CHAVE_VOLTA), '#/jogar/abc123');
  assert.equal(hashDeVolta(aba), '#/jogar/abc123');
  assert.equal(aba.getItem(CHAVE_VOLTA), null);
  assert.equal(hashDeVolta(aba), '#/online');
});

test('o hash de volta só aceita #/jogar/<sala>; o login do mestre volta a #/online', () => {
  const aba = new Armazem();
  iniciarLogin({ sessionStorage: aba, voltarPara: '#/outra/coisa' });
  assert.equal(hashDeVolta(aba), '#/online');
  iniciarLogin({ sessionStorage: aba, voltarPara: '#/jogar/abc' });
  iniciarLogin({ sessionStorage: aba });
  assert.equal(hashDeVolta(aba), '#/online');
});

test('config Desktop: ehDesktopMesa, urlDaSala com desktop=true e urlDeConviteDaSala', () => {
  assert.equal(ehDesktopMesa(), false);
  const desc = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  try {
    Object.defineProperty(globalThis, 'navigator', {
      value: { userAgent: 'Mozilla/5.0 MesaVTT/1' },
      configurable: true,
    });
    assert.equal(ehDesktopMesa(), true);
  } finally {
    if (desc) Object.defineProperty(globalThis, 'navigator', desc);
  }

  const storage = new Armazem();
  assert.equal(urlDaSala({ hostname: '127.0.0.1' }, storage, true), URL_SALA_PRODUCAO);
  assert.equal(urlDaSala({ hostname: 'localhost' }, storage, true), URL_SALA_PRODUCAO);
  assert.equal(urlDaSala({ hostname: '127.0.0.1' }, storage, false), URL_SALA_LOCAL);

  storage.setItem('mesa:sala-url', 'http://127.0.0.1:8787/');
  assert.equal(urlDaSala({ hostname: '127.0.0.1' }, storage, true), URL_SALA_LOCAL);

  assert.equal(urlDeConviteDaSala('sala-123'), 'https://ilvro.github.io/Mesa-VTT/#/jogar/sala-123');
  assert.equal(urlDeConviteDaSala('a b/c'), 'https://ilvro.github.io/Mesa-VTT/#/jogar/a%20b%2Fc');
});

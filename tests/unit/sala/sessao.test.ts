import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assinarSessao, papelDe, venceEm, verificarSessao, SESSAO_DURACAO_MS, type Sessao } from '../../../sala/sessao.ts';
import { lerOla } from '../../../sala/ola.ts';
import { retransmitirIdentificados } from '../../../sala/retransmitir.ts';

const SEGREDO = 'segredo-de-teste';
const AGORA = 1_000_000;
const dados: Sessao = { discordId: '42', nome: 'Ana', avatar: null, papel: 'jogador', exp: venceEm(AGORA) };

test('assina e verifica', async () => {
  const t = await assinarSessao(dados, SEGREDO);
  assert.match(t, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  assert.deepEqual(await verificarSessao(t, SEGREDO, AGORA), dados);
  assert.equal(SESSAO_DURACAO_MS, 12 * 3600 * 1000);
});

test('sessão vencida é rejeitada', async () => {
  const t = await assinarSessao(dados, SEGREDO);
  assert.equal(await verificarSessao(t, SEGREDO, dados.exp), null);
  assert.equal(await verificarSessao(t, SEGREDO, dados.exp + 1), null);
});

test('outro segredo, corpo ou assinatura adulterados são rejeitados', async () => {
  const t = await assinarSessao(dados, SEGREDO);
  const [corpo, assin] = t.split('.') as [string, string];
  assert.equal(await verificarSessao(t, 'outro', AGORA), null);
  const falso = Buffer.from(JSON.stringify({ ...dados, papel: 'mestre' })).toString('base64url');
  assert.equal(await verificarSessao(`${falso}.${assin}`, SEGREDO, AGORA), null);
  const trocada = assin.slice(0, -2) + (assin.endsWith('AA') ? 'BB' : 'AA');
  assert.equal(await verificarSessao(`${corpo}.${trocada}`, SEGREDO, AGORA), null);
  for (const lixo of ['', 'x', 'a.b.c', '.', `${corpo}.`, null, 42]) {
    assert.equal(await verificarSessao(lixo, SEGREDO, AGORA), null);
  }
});

test('assinatura válida de corpo malformado é rejeitada', async () => {
  const t = await assinarSessao({ ...dados, papel: 'deus' } as unknown as Sessao, SEGREDO);
  assert.equal(await verificarSessao(t, SEGREDO, AGORA), null);
});

test('papelDe só dá mestre para o id configurado', () => {
  assert.equal(papelDe('1', '1'), 'mestre');
  assert.equal(papelDe('2', '1'), 'jogador');
  assert.equal(papelDe('1', undefined), 'jogador');
  assert.equal(papelDe('', ''), 'jogador');
});

test('lerOla aceita só ola com sessão em texto', () => {
  assert.equal(lerOla('{"tipo":"ola","sessao":"abc"}'), 'abc');
  assert.equal(lerOla('{"tipo":"canal"}'), null);
  assert.equal(lerOla('{"tipo":"ola","sessao":1}'), null);
  assert.equal(lerOla('nada'), null);
});

test('só retransmite entre conexões identificadas', () => {
  const mk = (id: boolean) => ({ id, recebidas: [] as string[], send(d: string) { this.recebidas.push(d); } });
  const a = mk(true);
  const b = mk(true);
  const anonima = mk(false);
  assert.equal(retransmitirIdentificados([a, b, anonima], a, 'oi', (c) => c.id), 1);
  assert.deepEqual(b.recebidas, ['oi']);
  assert.deepEqual(anonima.recebidas, []);
  assert.equal(retransmitirIdentificados([a, b, anonima], anonima, 'x', (c) => c.id), 0);
  assert.deepEqual(a.recebidas, []);
  assert.deepEqual(b.recebidas, ['oi']);
});

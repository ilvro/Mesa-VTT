import { test } from 'node:test';
import assert from 'node:assert/strict';
import { origemPermitida, retransmitir, type ConexaoLike } from '../../../sala/retransmitir.ts';

function falsa(): ConexaoLike & { recebidas: string[] } {
  const recebidas: string[] = [];
  return { recebidas, send: (d) => void recebidas.push(d) };
}

test('repete aos outros e não a quem mandou', () => {
  const a = falsa();
  const b = falsa();
  const c = falsa();
  assert.equal(retransmitir([a, b, c], a, 'oi'), 2);
  assert.deepEqual(a.recebidas, []);
  assert.deepEqual(b.recebidas, ['oi']);
  assert.deepEqual(c.recebidas, ['oi']);
});

test('salas diferentes não trocam mensagens', () => {
  const a1 = falsa();
  const a2 = falsa();
  const b1 = falsa();
  retransmitir([a1, a2], a1, 'só da sala A');
  assert.deepEqual(a2.recebidas, ['só da sala A']);
  assert.deepEqual(b1.recebidas, []);
});

test('conexão que falha não derruba as outras', () => {
  const ruim: ConexaoLike = { send: () => { throw new Error('fechada'); } };
  const b = falsa();
  assert.equal(retransmitir([ruim, b], falsa(), 'x'), 1);
  assert.deepEqual(b.recebidas, ['x']);
});

test('CORS: só as origens permitidas', () => {
  assert.ok(origemPermitida('https://ilvro.github.io'));
  assert.ok(origemPermitida('http://127.0.0.1:5100'));
  assert.ok(origemPermitida('https://123456.discordsays.com'));
  assert.ok(!origemPermitida('https://discordsays.com.evil.com'));
  assert.ok(!origemPermitida('http://123456.discordsays.com'));
  assert.ok(!origemPermitida('https://evil.com'));
  assert.ok(!origemPermitida(null));
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarEstado } from '../../../sala/estado.ts';
import { bemVindo, tratar } from '../../../sala/mensagens.ts';
import { lerMensagemDaSala, lerMensagemParaSala, ROLAGENS_NO_BEM_VINDO, type Eu } from '../../../src/online/protocolo.ts';
import { sqlEmMemoria } from './sql-teste.ts';

const mestre: Eu = { discordId: 'M', nome: 'Mestre', papel: 'mestre' };
const ana: Eu = { discordId: 'A', nome: 'Ana', papel: 'jogador' };
const bia: Eu = { discordId: 'B', nome: 'Bia', papel: 'jogador' };
const todos = [mestre, ana, bia];
const j = (o: unknown) => JSON.stringify(o);

function salaComRolagens(n: number) {
  const e = criarEstado(sqlEmMemoria());
  e.iniciar('M', 'Campanha');
  e.salvarFicha({ id: 'f1' }, 'A', 0, 1);
  for (let i = 0; i < n; i++) {
    const envelope = { contrato: 1, app: 'ficha', tipo: 'ficha.rolagem', id: `r${i}`, em: i + 1, campanhaId: null, dados: { ficha: { app: 'ficha', tipo: 'ficha', id: 'f1' }, titulo: `T${i}`, total: i } };
    const s = tratar(e, ana, j({ tipo: 'evento', envelope }), i, todos);
    assert.equal(s[0]?.destino, 'outros'); // espalhada a todos
  }
  return e;
}

test('o bem-vindo traz só as últimas 50 rolagens, da mais antiga à mais nova', () => {
  const e = salaComRolagens(80);
  for (const eu of [ana, bia, mestre]) {
    const r = bemVindo(e, eu, todos).rolagens!;
    assert.equal(r.length, ROLAGENS_NO_BEM_VINDO);
    assert.equal(r[0]?.id, 'r30');
    assert.equal(r.at(-1)?.id, 'r79');
  }
  assert.equal(bemVindo(salaComRolagens(3), bia, todos).rolagens!.length, 3);
});

test('rolagens.historico responde com as 200 da sala, só ao remetente', () => {
  const e = salaComRolagens(230);
  const s = tratar(e, bia, j({ tipo: 'rolagens.historico' }), 1, todos);
  assert.equal(s.length, 1);
  assert.equal(s[0]!.destino, 'remetente');
  const msg = s[0]!.msg as { tipo: string; rolagens: Array<{ id: string }> };
  assert.equal(msg.tipo, 'rolagens.historico');
  assert.equal(msg.rolagens.length, 200);
  assert.equal(msg.rolagens[0]?.id, 'r30');
  // o autor carimbado pela sala vem junto
  assert.equal((msg.rolagens[0] as unknown as { autor: { nome: string } }).autor.nome, 'Ana');
});

test('o protocolo lê o pedido, a resposta e o bem-vindo com rolagens', () => {
  assert.deepEqual(lerMensagemParaSala(j({ tipo: 'rolagens.historico' })), { tipo: 'rolagens.historico' });
  const env = { tipo: 'ficha.rolagem', id: 'x' };
  assert.deepEqual(lerMensagemDaSala(j({ tipo: 'rolagens.historico', rolagens: [env] })), { tipo: 'rolagens.historico', rolagens: [env] });
  assert.equal(lerMensagemDaSala(j({ tipo: 'rolagens.historico', rolagens: [1] })), null);
  assert.equal(lerMensagemDaSala(j({ tipo: 'rolagens.historico' })), null);
  const base = { tipo: 'bem-vindo', eu: ana, membros: [], fichas: [], ultimoEstado: {} };
  assert.deepEqual((lerMensagemDaSala(j({ ...base, rolagens: [env] })) as { rolagens: unknown[] }).rolagens, [env]);
  assert.equal('rolagens' in lerMensagemDaSala(j(base))!, false);
  assert.equal(lerMensagemDaSala(j({ ...base, rolagens: 'x' })), null);
});

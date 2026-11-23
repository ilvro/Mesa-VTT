import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarEstado, MAX_EFEITOS_LEMBRADOS } from '../../../sala/estado.ts';
import { bemVindo, eventosParaQuemChega, tratar, tratarBinario } from '../../../sala/mensagens.ts';
import { permitido } from '../../../sala/permissoes.ts';
import { codificarPedaco, decodificarPedaco, lerMensagemParaSala, type Eu } from '../../../src/online/protocolo.ts';
import { validarEvento } from '../../../vendor/mesa-core/eventos.js';
import { sqlEmMemoria } from './sql-teste.ts';

const mestre: Eu = { discordId: 'M', nome: 'Mestre', papel: 'mestre' };
const ana: Eu = { discordId: 'A', nome: 'Ana', papel: 'jogador' };
const todos = [mestre, ana];
const j = (o: unknown) => JSON.stringify(o);

const estadoDaFaixa = { volume: 1, efeitos: [], ajustes: {}, regioes: [] };
const faixa = (faixaId: string, extra: object = {}) => ({ faixaId, loop: true, posicao: 3, taxa: 1, desde: 1000, pausada: false, estado: estadoDaFaixa, ...extra });
const mix = (faixas: object[], id = `m${Math.random()}`) =>
  ({ tipo: 'evento', envelope: { contrato: 1, app: 'jukebox', tipo: 'jukebox.mix', id, em: 1, campanhaId: null, dados: { mestre: 1, faixas } } });
const efeito = (faixaId: string) =>
  ({ tipo: 'evento', envelope: { contrato: 1, app: 'jukebox', tipo: 'jukebox.efeito-tocado', id: `e${Math.random()}`, em: 1, campanhaId: null, dados: { faixaId, estado: estadoDaFaixa } } });

function sala() {
  const e = criarEstado(sqlEmMemoria());
  e.iniciar('M', 'Campanha');
  return e;
}
function subir(e: ReturnType<typeof sala>, id: string, dados: Uint8Array[], tipoMime = 'audio/mpeg') {
  tratar(e, mestre, j({ tipo: 'blob', id, tipoMime }), 1, todos);
  dados.forEach((d, i) => tratarBinario(e, mestre, codificarPedaco({ id, i, n: dados.length, tipo: tipoMime }, d)));
}

test('um jukebox.mix sem titulo e sem cena, com o autor carimbado, passa no validarEvento e é repassado', () => {
  const e = sala();
  const msg = mix([faixa('aa', { url: 'sample/a.mp3' }), faixa('bb')]);
  assert.equal(validarEvento(msg.envelope).ok, true);
  const saidas = tratar(e, mestre, j(msg), 1, todos);
  assert.equal(saidas.length, 1);
  assert.equal(saidas[0]!.destino, 'outros');
  const env = (saidas[0]!.msg as { envelope: Record<string, unknown> }).envelope;
  assert.deepEqual(env.autor, { discordId: 'M', nome: 'Mestre', papel: 'mestre', fichas: [] });
  // o envelope carimbado também é válido para quem recebe (o autor não atrapalha)
  assert.equal(validarEvento(env).ok, true);
  // jogador não manda mix nem efeito
  assert.equal(tratar(e, ana, j(msg), 1, todos)[0]!.msg.tipo, 'erro');
  assert.equal(tratar(e, ana, j(efeito('bb')), 1, todos)[0]!.msg.tipo, 'erro');
});

test('a sala guarda o último mix e o entrega a quem chega depois (como evento, logo após o bem-vindo)', () => {
  const e = sala();
  assert.deepEqual(eventosParaQuemChega(e), []);
  tratar(e, mestre, j(mix([faixa('aa')], 'm1')), 1, todos);
  tratar(e, mestre, j(mix([faixa('bb')], 'm2')), 2, todos);
  const chegada = eventosParaQuemChega(e);
  assert.equal(chegada.length, 1);
  const env = (chegada[0] as unknown as { envelope: { id: string; autor: unknown; dados: { faixas: Array<{ faixaId: string }> } } }).envelope;
  assert.equal(env.id, 'm2');
  assert.equal((env.autor as { papel: string }).papel, 'mestre');
  assert.deepEqual(env.dados.faixas.map(f => f.faixaId), ['bb']);
  // o bem-vindo não carrega o mix (ultimoEstado é só dos canais do projetor)
  assert.deepEqual(Object.keys(bemVindo(e, ana, todos).ultimoEstado), []);
});

test('blob.pedir: protocolo e permissão (qualquer membro)', () => {
  assert.deepEqual(lerMensagemParaSala(j({ tipo: 'blob.pedir', id: 'h' })), { tipo: 'blob.pedir', id: 'h' });
  assert.equal(lerMensagemParaSala(j({ tipo: 'blob.pedir' })), null);
  assert.equal(lerMensagemParaSala(j({ tipo: 'blob.pedir', id: '' })), null);
  const e = sala();
  assert.equal(permitido({ tipo: 'blob.pedir', id: 'h' }, ana, e), true);
  assert.equal(permitido({ tipo: 'blob.pedir', id: 'h' }, mestre, e), true);
});

test('blob.pedir entrega só ids do último mix, dos efeitos tocados ou dos citados', () => {
  const e = sala();
  subir(e, 'aa', [new Uint8Array([1, 2]), new Uint8Array([3])]);
  subir(e, 'bb', [new Uint8Array([9])]);
  subir(e, 'cc', [new Uint8Array([7])]);
  subir(e, 'ef', [new Uint8Array([5])]);
  subir(e, 'segredo', [new Uint8Array([0])]);
  subir(e, 'retrato1', [new Uint8Array([4])], 'image/png');
  const pedir = (id: string) => tratar(e, ana, j({ tipo: 'blob.pedir', id }), 1, todos);

  // nada citado ainda
  assert.deepEqual(pedir('aa'), [{ destino: 'remetente', msg: { tipo: 'erro', motivo: 'permissao', recusado: 'blob.pedir' } }]);

  tratar(e, mestre, j(mix([faixa('aa'), faixa('bb', { url: 'sample/b.mp3' })])), 1, todos);
  const ok = pedir('aa');
  assert.equal(ok.length, 1);
  assert.equal(ok[0]!.destino, 'remetente');
  assert.deepEqual(ok[0]!.msg, { tipo: 'blob', id: 'aa', tipoMime: 'audio/mpeg' });
  const quadros = ok[0]!.quadros!.map(q => decodificarPedaco(q)!);
  assert.deepEqual(quadros.map(q => [q.cab.i, q.cab.n, [...q.dados]]), [[0, 2, [1, 2]], [1, 2, [3]]]);
  // fora do mix: recusado, mesmo existindo na sala
  for (const id of ['cc', 'ef', 'segredo']) assert.equal((pedir(id)[0]!.msg as { motivo?: string }).motivo, 'permissao');

  // o mix seguinte troca os ids pedíveis
  tratar(e, mestre, j(mix([faixa('cc')])), 2, todos);
  assert.equal((pedir('aa')[0]!.msg as { motivo?: string }).motivo, 'permissao');
  assert.equal(pedir('cc')[0]!.msg.tipo, 'blob');

  // efeito tocado
  tratar(e, mestre, j(efeito('ef')), 3, todos);
  assert.equal(pedir('ef')[0]!.msg.tipo, 'blob');

  // citado pelo canal (R6: retrato)
  tratar(e, mestre, j({ tipo: 'canal', nome: 'atlas:projetor:remoto', msg: { tipo: 'retrato', id: 'r', blob: { blobId: 'retrato1' } } }), 4, todos);
  assert.equal(pedir('retrato1')[0]!.msg.tipo, 'blob');

  // id pedível que ainda não subiu: inexistente
  tratar(e, mestre, j(mix([faixa('nao-subiu')])), 5, todos);
  assert.deepEqual(pedir('nao-subiu'), [{ destino: 'remetente', msg: { tipo: 'erro', motivo: 'inexistente', recusado: 'blob.pedir' } }]);
});

test('a sala lembra só os últimos efeitos tocados', () => {
  const e = sala();
  for (let i = 0; i < MAX_EFEITOS_LEMBRADOS + 5; i++) e.lembrarEfeito(`ef${i}`);
  const ids = e.blobsPedidos();
  assert.equal(ids.length, MAX_EFEITOS_LEMBRADOS);
  assert.equal(ids.includes('ef0'), false);
  assert.equal(ids.includes(`ef${MAX_EFEITOS_LEMBRADOS + 4}`), true);
});

test('blob.tem responde o tamanho em bytes', () => {
  const e = sala();
  subir(e, 'aa', [new Uint8Array(100), new Uint8Array(23)]);
  assert.deepEqual(tratar(e, mestre, j({ tipo: 'blob.tem', id: 'aa' }), 1, todos)[0]!.msg, { tipo: 'blob.tem', id: 'aa', tem: true, tamanho: 123 });
  assert.equal(e.tamanhoDoBlob('x'), null);
});

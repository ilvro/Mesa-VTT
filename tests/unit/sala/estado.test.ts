import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarEstado, ErroEstado, LIMITE_FICHA_BYTES, MAX_ROLAGENS } from '../../../sala/estado.ts';
import { codificarPedaco, TAMANHO_PEDACO, type Envelope } from '../../../src/online/protocolo.ts';
import { bemVindo, papelNaSala, tratar, tratarBinario } from '../../../sala/mensagens.ts';
import { carimbar, criarLimitador, permitido } from '../../../sala/permissoes.ts';
import { sqlEmMemoria } from './sql-teste.ts';
import type { Eu } from '../../../src/online/protocolo.ts';

const mestre: Eu = { discordId: 'M', nome: 'Mestre', papel: 'mestre' };
const ana: Eu = { discordId: 'A', nome: 'Ana', papel: 'jogador' };
const bia: Eu = { discordId: 'B', nome: 'Bia', papel: 'jogador' };
const todos = [mestre, ana, bia];
const j = (o: unknown) => JSON.stringify(o);

const evento = (tipo: string, app: string, dados: unknown, extra: object = {}) =>
  ({ tipo: 'evento', envelope: { contrato: 1, app, tipo, id: `e${Math.random()}`, em: 1, campanhaId: null, dados, ...extra } });
const refFicha = (id: string) => ({ app: 'ficha', tipo: 'ficha', id });
const rolagem = (fichaId: string, extra: object = {}) => evento('ficha.rolagem', 'ficha', { ficha: refFicha(fichaId), titulo: 'Ataque', total: 12 }, extra);

function sala() {
  const estado = criarEstado(sqlEmMemoria());
  estado.iniciar('M', 'Campanha');
  return estado;
}
const erros = (saidas: ReturnType<typeof tratar>) => saidas.map(s => s.msg).filter(m => m.tipo === 'erro');

test('um jogador não manda canal nem salva a ficha de outro; o mestre salva qualquer uma', () => {
  const e = sala();
  e.salvarFicha({ id: 'f-bia', nome: 'Bia' }, 'B', 0, 1);
  const canal = j({ tipo: 'canal', nome: 'atlas:projetor:ativo', msg: { tipo: 'estado' } });
  assert.deepEqual(erros(tratar(e, ana, canal, 1, todos)), [{ tipo: 'erro', motivo: 'permissao', recusado: 'canal' }]);
  assert.deepEqual(e.ultimoEstado(), {});
  const roubo = j({ tipo: 'ficha.salvar', ficha: { id: 'f-bia', nome: 'Ana' }, rev: 1 });
  assert.deepEqual(erros(tratar(e, ana, roubo, 1, todos)), [{ tipo: 'erro', motivo: 'permissao', recusado: 'ficha.salvar' }]);
  assert.equal(e.ficha('f-bia')?.ficha.nome, 'Bia');
  const saidas = tratar(e, mestre, roubo, 2, todos);
  assert.deepEqual(erros(saidas), []);
  assert.equal(e.ficha('f-bia')?.ficha.nome, 'Ana');
  assert.equal(e.ficha('f-bia')?.dono, 'B');
});

test('um jogador cria uma ficha nova e vira dono dela; rev velha grava e marca conflito', () => {
  const e = sala();
  const s1 = tratar(e, ana, j({ tipo: 'ficha.salvar', ficha: { id: 'f1', nome: 'A' }, rev: 0 }), 1, todos);
  assert.deepEqual(s1[0]?.destino, { ficha: 'A' });
  assert.equal(e.donoDaFicha('f1'), 'A');
  assert.deepEqual(s1[0]?.msg, { tipo: 'ficha.atualizada', ficha: { id: 'f1', nome: 'A' }, rev: 1, dono: 'A' });
  tratar(e, ana, j({ tipo: 'ficha.salvar', ficha: { id: 'f1', nome: 'A2' }, rev: 1 }), 2, todos);
  const s3 = tratar(e, ana, j({ tipo: 'ficha.salvar', ficha: { id: 'f1', nome: 'A3' }, rev: 1 }), 3, todos);
  assert.deepEqual(s3[0]?.msg, { tipo: 'ficha.atualizada', ficha: { id: 'f1', nome: 'A3' }, rev: 3, dono: 'A', conflito: true });
  assert.equal(e.ficha('f1')?.ficha.nome, 'A3');
  // Bia não toma a ficha de Ana
  assert.equal(erros(tratar(e, bia, j({ tipo: 'ficha.salvar', ficha: { id: 'f1' }, rev: 3 }), 4, todos)).length, 1);
});

test('ficha acima de 1,5 MB é recusada', () => {
  const e = sala();
  assert.throws(() => e.salvarFicha({ id: 'g', lixo: 'x'.repeat(LIMITE_FICHA_BYTES) }, 'A', 0, 1), ErroEstado);
  const s = tratar(e, ana, j({ tipo: 'ficha.salvar', ficha: { id: 'g', lixo: 'x'.repeat(LIMITE_FICHA_BYTES) }, rev: 0 }), 1, todos);
  assert.deepEqual(erros(s), [{ tipo: 'erro', motivo: 'ficha-grande', recusado: 'ficha.salvar' }]);
  assert.equal(e.ficha('g'), null);
});

test('entregar e sala.config são só do mestre; membro.personagem só com ficha própria', () => {
  const e = sala();
  e.salvarFicha({ id: 'f1' }, 'A', 0, 1);
  assert.equal(erros(tratar(e, ana, j({ tipo: 'ficha.entregar', fichaId: 'f1', dono: 'B' }), 1, todos)).length, 1);
  assert.equal(erros(tratar(e, ana, j({ tipo: 'sala.config', nome: 'x' }), 1, todos)).length, 1);
  assert.equal(erros(tratar(e, bia, j({ tipo: 'membro.personagem', fichaId: 'f1' }), 1, todos)).length, 1);
  const s = tratar(e, ana, j({ tipo: 'membro.personagem', fichaId: 'f1' }), 1, todos);
  assert.equal(s[0]?.msg.tipo, 'membros');
  assert.equal(e.personagem('A'), 'f1');
  tratar(e, mestre, j({ tipo: 'sala.config', nome: 'Nova', capaBlobId: 'h' }), 1, todos);
  assert.deepEqual(e.config(), { nome: 'Nova', capaBlobId: 'h', dono: 'M' });
  const ent = tratar(e, mestre, j({ tipo: 'ficha.entregar', fichaId: 'f1', dono: 'B' }), 1, todos);
  assert.equal(e.donoDaFicha('f1'), 'B');
  assert.equal(e.personagem('A'), null);
  assert.deepEqual(ent[0]?.destino, { ficha: 'B' });
  assert.equal(erros(tratar(e, mestre, j({ tipo: 'ficha.entregar', fichaId: 'nada', dono: 'B' }), 1, todos))[0]?.tipo, 'erro');
});

test('eventos: jogador só rola e muda recursos de ficha dele, e move peça; mestre só a lista', () => {
  const e = sala();
  e.salvarFicha({ id: 'f1' }, 'A', 0, 1);
  const recursos = (id: string) => evento('ficha.recursos', 'ficha', { ficha: refFicha(id), pv: 1, pvMax: 2, pd: 0, pdMax: 0 });
  const mover = evento('atlas.mover-peca', 'atlas', { mapa: 'm', peca: 'p', position: [1, 2] });
  assert.equal(permitido(rolagem('f1') as never, ana, e), true);
  assert.equal(permitido(rolagem('f1') as never, bia, e), false);
  assert.equal(permitido(rolagem('inexistente') as never, ana, e), false);
  assert.equal(permitido(recursos('f1') as never, ana, e), true);
  assert.equal(permitido(recursos('f1') as never, bia, e), false);
  assert.equal(permitido(mover as never, bia, e), true);
  assert.equal(permitido(evento('atlas.focar', 'atlas', { ref: refFicha('f1') }) as never, ana, e), false);
  assert.equal(permitido(rolagem('f1') as never, mestre, e), true);
  assert.equal(permitido(recursos('f1') as never, mestre, e), false);
  assert.equal(permitido(mover as never, mestre, e), false);
});

test('evento fora do catálogo ou malformado é recusado', () => {
  const e = sala();
  e.salvarFicha({ id: 'f1' }, 'A', 0, 1);
  const motivos = (m: unknown, quem: Eu) => erros(tratar(e, quem, j(m), 1, todos)).map(x => (x as { motivo: string }).motivo);
  assert.deepEqual(motivos(evento('ficha.inventada', 'ficha', {}), mestre), ['invalido']);
  assert.deepEqual(motivos(evento('ficha.rolagem', 'ficha', { ficha: 'lixo' }), ana), ['invalido']);
  assert.deepEqual(motivos(evento('ficha.rolagem', 'atlas', { ficha: refFicha('f1'), titulo: 't', total: 1 }), ana), ['invalido']);
  assert.deepEqual(motivos(evento('ficha.rolagem', 'ficha', { ficha: refFicha('f1'), titulo: 't', total: 1 }, { contrato: 99 }), ana), ['invalido']);
  assert.deepEqual(motivos(evento('ficha.rolagem', 'ficha', { ficha: refFicha('f1'), titulo: 't', total: 1 }, { extra: 1 }), ana), ['invalido']);
  assert.deepEqual(motivos({ tipo: 'evento' }, ana), ['formato']);
  assert.deepEqual(motivos('nada', ana), ['formato']);
});

test('o autor forjado pelo cliente é sobrescrito, e o carimbo traz as fichas do dono', () => {
  const e = sala();
  e.salvarFicha({ id: 'f1' }, 'A', 0, 1);
  e.salvarFicha({ id: 'f2' }, 'A', 0, 1);
  e.salvarFicha({ id: 'f3' }, 'B', 0, 1);
  const forjado = { discordId: 'M', nome: 'Mestre', papel: 'mestre', fichas: ['f3'] };
  const s = tratar(e, ana, j(rolagem('f1', { autor: forjado })), 5, todos);
  assert.equal(s.length, 1);
  assert.equal(s[0]?.destino, 'outros');
  const env = (s[0]?.msg as { envelope: Envelope }).envelope;
  assert.deepEqual(env.autor, { discordId: 'A', nome: 'Ana', papel: 'jogador', fichas: ['f1', 'f2'] });
  assert.deepEqual(carimbar({ tipo: 't', id: 'i', autor: 'lixo' }, mestre, []).autor, { discordId: 'M', nome: 'Mestre', papel: 'mestre', fichas: [] });
});

test('rolagens ficam podadas nas 200 últimas', () => {
  const e = sala();
  e.salvarFicha({ id: 'f1' }, 'A', 0, 1);
  for (let i = 0; i < 230; i++) {
    tratar(e, ana, j(evento('ficha.rolagem', 'ficha', { ficha: refFicha('f1'), titulo: String(i), total: i }, { id: `r${i}`, em: i + 1 })), i, todos);
  }
  const r = e.rolagens();
  assert.equal(r.length, MAX_ROLAGENS);
  assert.equal(r[0]?.id, 'r30');
  assert.equal(r.at(-1)?.id, 'r229');
});

test('canal do mestre guarda o último estado de cada canal e repassa aos outros', () => {
  const e = sala();
  const s = tratar(e, mestre, j({ tipo: 'canal', nome: 'atlas:projetor:ativo', msg: { tipo: 'estado', v: 1 } }), 1, todos);
  assert.equal(s[0]?.destino, 'outros');
  tratar(e, mestre, j({ tipo: 'canal', nome: 'atlas:projetor:ativo', msg: { tipo: 'estado', v: 2 } }), 2, todos);
  tratar(e, mestre, j({ tipo: 'canal', nome: 'atlas:projetor:ativo', msg: { tipo: 'ponteiro' } }), 3, todos);
  tratar(e, mestre, j({ tipo: 'canal', nome: 'atlas:projetor:outro', msg: { tipo: 'estado', v: 9 } }), 4, todos);
  assert.deepEqual(e.ultimoEstado(), { 'atlas:projetor:ativo': { tipo: 'estado', v: 2 }, 'atlas:projetor:outro': { tipo: 'estado', v: 9 } });
  assert.equal(erros(tratar(e, mestre, j({ tipo: 'canal', nome: 'outro:canal', msg: {} }), 5, todos)).length, 1);
});

test('quem chega atrasado recebe o último estado e as fichas certas para o papel', () => {
  const e = sala();
  e.salvarFicha({ id: 'fa', nome: 'Ana' }, 'A', 0, 1);
  e.salvarFicha({ id: 'fb', nome: 'Bia' }, 'B', 0, 1);
  e.escolherPersonagem('A', 'fa');
  tratar(e, mestre, j({ tipo: 'canal', nome: 'atlas:projetor:ativo', msg: { tipo: 'estado', v: 1 } }), 1, todos);
  const doMestre = bemVindo(e, mestre, todos);
  assert.deepEqual(doMestre.fichas.map(f => f.id), ['fa', 'fb']);
  assert.deepEqual(doMestre.ultimoEstado, { 'atlas:projetor:ativo': { tipo: 'estado', v: 1 } });
  assert.deepEqual(doMestre.config, { nome: 'Campanha', dono: 'M' });
  assert.deepEqual(doMestre.revs, { fa: 1, fb: 1 });
  assert.deepEqual(doMestre.membros.map(m => [m.discordId, m.personagem]), [['M', null], ['A', 'fa'], ['B', null]]);
  const daAna = bemVindo(e, ana, todos);
  assert.deepEqual(daAna.fichas.map(f => f.id), ['fa']);
  assert.deepEqual(daAna.eu, ana);
  assert.deepEqual(daAna.ultimoEstado, doMestre.ultimoEstado);
});

test('o personagem escolhido persiste por discordId e membros não repete conexões', () => {
  const e = sala();
  e.salvarFicha({ id: 'fa' }, 'A', 0, 1);
  e.escolherPersonagem('A', 'fa');
  const m = bemVindo(e, ana, [mestre, mestre, ana]).membros;
  assert.deepEqual(m.map(x => x.discordId), ['M', 'A']);
  assert.equal(m[1]?.personagem, 'fa');
});

test('papel efetivo pelo dono da sala', () => {
  assert.equal(papelNaSala('M', 'M'), 'mestre');
  assert.equal(papelNaSala('A', 'M'), 'jogador');
  assert.equal(papelNaSala('M', undefined), 'jogador');
  const e = criarEstado(sqlEmMemoria());
  assert.equal(e.iniciar('M', 'Sala', 'camp1'), true);
  assert.equal(e.iniciar('X', 'Roubada'), false);
  assert.deepEqual(e.config(), { nome: 'Sala', dono: 'M', campanhaId: 'camp1' });
});

test('blobs: só o mestre guarda, em pedaços, e um blob completo não se repete', () => {
  const e = sala();
  const q = (i: number, n: number, id = 'h') => codificarPedaco({ id, i, n, tipo: 'image/png' }, new Uint8Array([i, i, i]));
  assert.equal(e.temBlob('h'), false);
  assert.equal(erros(tratar(e, ana, j({ tipo: 'blob', id: 'h', tipoMime: 'image/png' }), 1, todos)).length, 1);
  assert.equal(tratarBinario(e, ana, q(0, 2)).saidas.length, 1);
  assert.equal(tratarBinario(e, mestre, q(0, 2)).repassar, true);
  assert.equal(e.temBlob('h'), false);
  tratarBinario(e, mestre, q(1, 2));
  assert.equal(e.temBlob('h'), true);
  assert.equal(tratarBinario(e, mestre, q(0, 2)).repassar, false);
  assert.deepEqual(tratar(e, mestre, j({ tipo: 'blob', id: 'h', tipoMime: 'image/png' }), 1, todos), []);
  assert.equal(tratar(e, mestre, j({ tipo: 'blob', id: 'novo', tipoMime: 'image/png' }), 1, todos)[0]?.destino, 'outros');
  assert.throws(() => e.guardarPedaco({ id: 'g', i: 0, n: 1, tipo: 'x' }, new Uint8Array(TAMANHO_PEDACO + 1)), ErroEstado);
  assert.equal(tratarBinario(e, mestre, new Uint8Array([1]).buffer).saidas.length, 1);
});

test('limite de 60 mensagens por segundo: avisa uma vez por janela', () => {
  const l = criarLimitador(60, 1000);
  const a = {};
  const b = {};
  const r: string[] = [];
  for (let i = 0; i < 65; i++) r.push(l.tentar(a, 1000 + i));
  assert.equal(r.filter(x => x === 'ok').length, 60);
  assert.deepEqual(r.slice(60), ['avisar', 'excedeu', 'excedeu', 'excedeu', 'excedeu']);
  assert.equal(l.tentar(b, 1100), 'ok'); // outra conexão tem a própria janela
  assert.equal(l.tentar(a, 2000), 'ok'); // janela nova
  for (let i = 0; i < 59; i++) l.tentar(a, 2001);
  assert.equal(l.tentar(a, 2002), 'avisar');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EVENTOS_DO_MESTRE, TAMANHO_PEDACO, codificarPedaco, decodificarPedaco, lerMensagemDaSala, lerMensagemParaSala,
} from '../../../src/online/protocolo.ts';

const env = { contrato: 1, app: 'ficha', tipo: 'ficha.rolagem', id: 'e1', em: 1, campanhaId: null, dados: {} };
const eu = { discordId: '1', nome: 'Ana', papel: 'jogador' };
const membro = { ...eu, personagem: null };
const ficha = { id: 'f1', nome: 'Rex' };
const j = JSON.stringify;

test('lerMensagemParaSala aceita todas as mensagens válidas', () => {
  const validas = [
    { tipo: 'ola', sessao: 'abc' },
    { tipo: 'canal', nome: 'atlas:projetor:ativo', msg: { tipo: 'estado' } },
    { tipo: 'evento', envelope: env },
    { tipo: 'ficha.salvar', ficha, rev: 2 },
    { tipo: 'ficha.entregar', fichaId: 'f1', dono: '2' },
    { tipo: 'blob', id: 'h', tipoMime: 'image/png' },
    { tipo: 'membro.personagem', fichaId: 'f1' },
    { tipo: 'membro.personagem', fichaId: null },
    { tipo: 'sala.config', nome: 'Campanha' },
    { tipo: 'sala.config', nome: 'Campanha', capaBlobId: 'h' },
  ];
  for (const m of validas) assert.deepEqual(lerMensagemParaSala(j(m)), m);
});

test('lerMensagemParaSala recusa lixo', () => {
  const ruins = ['nada', 'null', '[]', '1', j({}), j({ tipo: 'x' }), j({ tipo: 'ola' }), j({ tipo: 'ola', sessao: 1 }),
    j({ tipo: 'canal', msg: 1 }), j({ tipo: 'evento', envelope: { tipo: 'a' } }), j({ tipo: 'evento', envelope: 'x' }),
    j({ tipo: 'ficha.salvar', ficha: { nome: 'x' }, rev: 1 }), j({ tipo: 'ficha.salvar', ficha, rev: 'x' }),
    j({ tipo: 'ficha.entregar', fichaId: 'f' }), j({ tipo: 'blob', id: '', tipoMime: 'a' }),
    j({ tipo: 'membro.personagem' }), j({ tipo: 'sala.config', nome: 1 }), j({ tipo: 'sala.config', nome: 'a', capaBlobId: 3 })];
  for (const t of ruins) assert.equal(lerMensagemParaSala(t), null, t);
});

test('lerMensagemDaSala aceita as válidas e recusa lixo', () => {
  const validas = [
    { tipo: 'bem-vindo', eu, membros: [membro], fichas: [ficha], ultimoEstado: { 'atlas:projetor:ativo': { tipo: 'estado' } } },
    { tipo: 'membros', membros: [{ ...membro, personagem: 'f1' }] },
    { tipo: 'canal', nome: 'c', msg: 1 },
    { tipo: 'evento', envelope: env },
    { tipo: 'ficha.atualizada', ficha, rev: 3 },
    { tipo: 'ficha.atualizada', ficha, rev: 3, conflito: true },
    { tipo: 'blob', id: 'h', tipoMime: 'audio/ogg' },
    { tipo: 'erro', motivo: 'sem permissão' },
  ];
  for (const m of validas) assert.deepEqual(lerMensagemDaSala(j(m)), m);
  const ruins = ['nada', j({ tipo: 'bem-vindo', eu }), j({ tipo: 'bem-vindo', eu: { ...eu, papel: 'rei' }, membros: [], fichas: [], ultimoEstado: {} }),
    j({ tipo: 'membros', membros: [eu] }), j({ tipo: 'membros', membros: 'x' }), j({ tipo: 'ficha.atualizada', ficha, rev: 1, conflito: 'sim' }),
    j({ tipo: 'erro' }), j({ tipo: 'ola', sessao: 'a' }), j({ tipo: 'blob', id: 'h' })];
  for (const t of ruins) assert.equal(lerMensagemDaSala(t), null, t);
});

test('EVENTOS_DO_MESTRE só tem ficha.rolagem', () => {
  assert.deepEqual([...EVENTOS_DO_MESTRE], ['ficha.rolagem']);
});

test('codificarPedaco e decodificarPedaco são inversos; quadros inválidos viram null', () => {
  const dados = new Uint8Array([1, 2, 3, 250]);
  const r = decodificarPedaco(codificarPedaco({ id: 'h', i: 1, n: 3, tipo: 'image/png' }, dados));
  assert.deepEqual(r?.cab, { id: 'h', i: 1, n: 3, tipo: 'image/png' });
  assert.deepEqual([...r!.dados], [...dados]);
  assert.equal(decodificarPedaco(new ArrayBuffer(2)), null);
  assert.equal(decodificarPedaco(new Uint8Array([0, 0, 0, 200, 1]).buffer), null);
  assert.equal(decodificarPedaco(codificarPedaco({ id: 'h', i: 3, n: 3, tipo: 't' }, dados)), null);
  assert.equal(TAMANHO_PEDACO, 512 * 1024);
});

test('bem-vindo aceita config, revs e donos; erro guarda o tipo recusado', () => {
  const eu = { discordId: '1', nome: 'A', papel: 'mestre' };
  const base = { tipo: 'bem-vindo', eu, membros: [], fichas: [], ultimoEstado: {} };
  const completo = { ...base, config: { nome: 'C', dono: '1' }, revs: { f: 2 }, donos: { f: '1' } };
  assert.deepEqual(lerMensagemDaSala(JSON.stringify(completo)), completo);
  assert.equal(lerMensagemDaSala(JSON.stringify({ ...base, revs: { f: 'x' } })), null);
  assert.equal(lerMensagemDaSala(JSON.stringify({ ...base, config: {} })), null);
  assert.deepEqual(lerMensagemDaSala('{"tipo":"erro","motivo":"permissao","recusado":"canal"}'), { tipo: 'erro', motivo: 'permissao', recusado: 'canal' });
  assert.deepEqual(lerMensagemDaSala('{"tipo":"ficha.atualizada","ficha":{"id":"f"},"rev":1,"dono":"9"}'), { tipo: 'ficha.atualizada', ficha: { id: 'f' }, rev: 1, dono: '9' });
});

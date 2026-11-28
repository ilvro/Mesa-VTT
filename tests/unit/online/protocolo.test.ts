import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EVENTOS_DO_MESTRE, LIMITE_OP_CONSTRUCAO_BYTES, MAX_COMANDOS_POR_OP, TAMANHO_PEDACO,
  codificarPedaco, decodificarPedaco, lerMensagemDaSala, lerMensagemParaSala,
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
    { tipo: 'config', config: { nome: 'Campanha', capaBlobId: 'c1' } },
    { tipo: 'canal', nome: 'c', msg: 1 },
    { tipo: 'evento', envelope: env },
    { tipo: 'ficha.atualizada', ficha, rev: 3, autor: { ...eu, fichas: ['f1'] } },
    { tipo: 'ficha.atualizada', ficha, rev: 3, autor: { ...eu, fichas: [] }, conflito: true },
    { tipo: 'ficha.removida', id: 'f1' },
    { tipo: 'blob', id: 'h', tipoMime: 'audio/ogg' },
    { tipo: 'erro', motivo: 'sem permissão' },
  ];
  for (const m of validas) assert.deepEqual(lerMensagemDaSala(j(m)), m);
  const ruins = ['nada', j({ tipo: 'bem-vindo', eu }), j({ tipo: 'bem-vindo', eu: { ...eu, papel: 'rei' }, membros: [], fichas: [], ultimoEstado: {} }),
    j({ tipo: 'membros', membros: [eu] }), j({ tipo: 'membros', membros: 'x' }), j({ tipo: 'ficha.atualizada', ficha, rev: 1, autor: { ...eu, fichas: [] }, conflito: 'sim' }),
    j({ tipo: 'ficha.atualizada', ficha, rev: 3 }), j({ tipo: 'ficha.atualizada', ficha, rev: 3, autor: { ...eu, fichas: [1] } }),
    j({ tipo: 'ficha.removida' }), j({ tipo: 'ficha.removida', id: '' }),
    j({ tipo: 'erro' }), j({ tipo: 'ola', sessao: 'a' }), j({ tipo: 'blob', id: 'h' })];
  for (const t of ruins) assert.equal(lerMensagemDaSala(t), null, t);
});

test('EVENTOS_DO_MESTRE: rolagens, som do Jukebox, respostas e ping', () => {
  assert.deepEqual([...EVENTOS_DO_MESTRE], ['ficha.rolagem', 'jukebox.mix', 'jukebox.efeito-tocado', 'mesa.resposta', 'mesa.ping']);
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
  assert.deepEqual(lerMensagemDaSala('{"tipo":"ficha.atualizada","ficha":{"id":"f"},"rev":1,"dono":"9","autor":{"discordId":"1","nome":"M","papel":"mestre","fichas":[]}}'), { tipo: 'ficha.atualizada', ficha: { id: 'f' }, rev: 1, autor: { discordId: '1', nome: 'M', papel: 'mestre', fichas: [] }, dono: '9' });
});

test('protocolo de construção colaborativa: cliente -> sala', () => {
  const validas = [
    { tipo: 'sala.modo', modo: 'construcao' },
    { tipo: 'sala.modo', modo: 'sessao' },
    { tipo: 'construcao.abrir', mapa: { id: 'm1' }, nome: 'Taverna' },
    { tipo: 'construcao.abrir', blobId: 'construcao:0' },
    { tipo: 'construcao.fechar' },
    { tipo: 'construcao.comando', baseRev: 0, opId: 'op1', comandos: [{ tipo: 'comodo.criar', id: 'r1' }], rotulo: 'Criar cômodo' },
    { tipo: 'construcao.snapshot', rev: 40, mapa: { id: 'm1' } },
    { tipo: 'construcao.snapshot', rev: 40, blobId: 'construcao:40', nome: 'Taverna' },
    { tipo: 'construcao.cursor', x: 10.5, y: 20, levelId: null, ferramenta: 'pincel' },
    { tipo: 'construcao.cursor', x: 1, y: 2, levelId: 'andar-2', ferramenta: 'parede', pintando: true },
    { tipo: 'construcao.ressincronizar' },
    { tipo: 'construcao.nota', id: 'n1', texto: 'Falta iluminação' },
  ];
  for (const m of validas) assert.deepEqual(lerMensagemParaSala(j(m)), m);

  const cmdOk = { tipo: 'x' };
  const ruins = [
    j({ tipo: 'sala.modo', modo: 'editar' }),
    j({ tipo: 'sala.modo' }),
    j({ tipo: 'construcao.abrir' }),
    j({ tipo: 'construcao.abrir', mapa: {}, blobId: 'construcao:0' }),
    j({ tipo: 'construcao.abrir', blobId: '' }),
    j({ tipo: 'construcao.abrir', mapa: [], nome: 'x' }),
    j({ tipo: 'construcao.comando', baseRev: -1, opId: 'o', comandos: [cmdOk] }),
    j({ tipo: 'construcao.comando', baseRev: 1.5, opId: 'o', comandos: [cmdOk] }),
    j({ tipo: 'construcao.comando', baseRev: 0, opId: '', comandos: [cmdOk] }),
    j({ tipo: 'construcao.comando', baseRev: 0, opId: 'o', comandos: [] }),
    j({ tipo: 'construcao.comando', baseRev: 0, opId: 'o', comandos: [{ semTipo: 1 }] }),
    j({ tipo: 'construcao.comando', baseRev: 0, opId: 'o', comandos: Array.from({ length: MAX_COMANDOS_POR_OP + 1 }, () => cmdOk) }),
    j({ tipo: 'construcao.comando', baseRev: 0, opId: 'o', comandos: [{ tipo: 'big', s: 'x'.repeat(LIMITE_OP_CONSTRUCAO_BYTES) }] }),
    j({ tipo: 'construcao.snapshot', rev: -1, mapa: {} }),
    j({ tipo: 'construcao.snapshot', rev: 5 }),
    j({ tipo: 'construcao.snapshot', rev: 5, mapa: {}, blobId: 'b' }),
    j({ tipo: 'construcao.cursor', x: 1, y: 2, ferramenta: 'pincel' }),
    j({ tipo: 'construcao.cursor', x: 1, y: '2', levelId: null, ferramenta: 'pincel' }),
    j({ tipo: 'construcao.cursor', x: 1, y: 2, levelId: null, ferramenta: '' }),
    j({ tipo: 'construcao.cursor', x: 1, y: 2, levelId: null, ferramenta: 'p', pintando: 'sim' }),
    j({ tipo: 'construcao.nota', id: '', texto: 'oi' }),
    j({ tipo: 'construcao.nota', id: 'n1', texto: '   ' }),
  ];
  for (const r of ruins) assert.equal(lerMensagemParaSala(r), null, r);
});

test('protocolo de construção colaborativa: sala -> cliente, config.modo e bem-vindo.construcao', () => {
  const autor = { ...eu, fichas: ['f1'] };
  const op = { rev: 1, opId: 'op1', autor, comandos: [{ tipo: 'terreno.pintar' }], rotulo: 'Pintar', em: 100 };
  const nota = { id: 'n1', autor, texto: 'Bom trabalho', em: 120 };
  const validas = [
    { tipo: 'config', config: { nome: 'Sala', modo: 'construcao' } },
    {
      tipo: 'bem-vindo',
      eu,
      membros: [membro],
      fichas: [],
      ultimoEstado: {},
      config: { nome: 'Sala', modo: 'construcao' },
      construcao: { temMapa: true, nome: 'Taverna', rev: 3 },
    },
    { tipo: 'construcao.estado', mapa: { id: 'm1' }, nome: 'Taverna', rev: 0, ops: [op], notas: [nota] },
    { tipo: 'construcao.estado', blobId: 'construcao:10', rev: 10, ops: [] },
    { tipo: 'construcao.aplicada', rev: 2, opId: 'op2', autor, comandos: [{ tipo: 'item.adicionar' }] },
    { tipo: 'construcao.cursor', autor, x: 5, y: 6, levelId: null, ferramenta: 'selecionar', pintando: false },
    nota && { tipo: 'construcao.nota', ...nota },
    { tipo: 'construcao.fechada' },
  ];
  for (const m of validas) assert.deepEqual(lerMensagemDaSala(j(m)), m);

  const ruins = [
    j({ tipo: 'config', config: { nome: 'Sala', modo: 'invalido' } }),
    j({ tipo: 'bem-vindo', eu, membros: [], fichas: [], ultimoEstado: {}, construcao: { temMapa: 'sim', rev: 0 } }),
    j({ tipo: 'bem-vindo', eu, membros: [], fichas: [], ultimoEstado: {}, construcao: { temMapa: true, rev: -1 } }),
    j({ tipo: 'construcao.estado', rev: 0, ops: [] }),
    j({ tipo: 'construcao.estado', mapa: {}, blobId: 'construcao:0', rev: 0, ops: [] }),
    j({ tipo: 'construcao.estado', mapa: {}, rev: -1, ops: [] }),
    j({ tipo: 'construcao.estado', mapa: {}, rev: 0, ops: [{ ...op, rev: 0 }] }),
    j({ tipo: 'construcao.aplicada', rev: 0, opId: 'o', autor, comandos: [{ tipo: 'a' }] }),
    j({ tipo: 'construcao.aplicada', rev: 1, opId: 'o', autor, comandos: [] }),
    j({ tipo: 'construcao.cursor', autor: eu, x: 1, y: 2, levelId: null, ferramenta: 'pincel' }),
    j({ tipo: 'construcao.nota', id: 'n1', autor, texto: 'oi' }),
  ];
  for (const r of ruins) assert.equal(lerMensagemDaSala(r), null, r);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarPonte, type CanalLocal } from '../../../src/app/online.ts';
import type { ClienteDaSala } from '../../../src/online/cliente.ts';
import type { MensagemDaSala, MensagemParaSala, Membro } from '../../../src/online/protocolo.ts';

class Canal implements CanalLocal {
  static todos = new Map<string, Canal[]>();
  onmessage: CanalLocal['onmessage'] = null;
  postados: unknown[] = [];
  nome: string;
  constructor(nome: string) { this.nome = nome; Canal.todos.set(nome, [...(Canal.todos.get(nome) ?? []), this]); }
  postMessage(m: unknown) { this.postados.push(m); for (const c of Canal.todos.get(this.nome) ?? []) if (c !== this) c.onmessage?.({ data: m }); }
  close() { Canal.todos.set(this.nome, (Canal.todos.get(this.nome) ?? []).filter(c => c !== this)); }
}

function clienteFalso() {
  const ouvintes = new Map<string, Array<(m: never) => void>>();
  const enviadas: MensagemParaSala[] = [];
  const blobs: Array<{ id: string; blob: Blob }> = [];
  const c = {
    estado: 'aberta' as const,
    enviar(m: MensagemParaSala) { enviadas.push(m); return true; },
    ouvir(tipo: string, f: (m: never) => void) { ouvintes.set(tipo, [...(ouvintes.get(tipo) ?? []), f]); return () => {}; },
    aoMudarEstado() { return () => {}; },
    async enviarBlob(id: string, blob: Blob) { blobs.push({ id, blob }); return true; },
    ouvirBlob() { return () => {}; },
    fechar() {},
  };
  const emitir = (m: MensagemDaSala) => { for (const f of ouvintes.get(m.tipo) ?? []) f(m as never); };
  return { cliente: c as unknown as ClienteDaSala, enviadas, blobs, emitir };
}

const eu = { discordId: '1', nome: 'Mestre', papel: 'mestre' as const };
const membro = (id: string, papel: 'mestre' | 'jogador'): Membro => ({ discordId: id, nome: id, papel, personagem: null });
const bemVindo = (membros: Membro[], nome = 'teste-1'): MensagemDaSala => ({ tipo: 'bem-vindo', eu, membros, fichas: [], ultimoEstado: {}, config: { nome } });

function montar(nome = 'teste-1', extra: Partial<Parameters<typeof criarPonte>[0]> = {}) {
  Canal.todos.clear();
  const f = clienteFalso();
  const ponte = criarPonte({ cliente: f.cliente, criarCanal: n => new Canal(n), nomeDaSala: nome, hash: async b => `h${b.byteLength}`, ...extra });
  const atlas = new Canal('atlas:projetor:remoto');
  const apps = new Canal('mesa:eventos');
  return { ...f, ponte, atlas, apps };
}

test('evento fora de EVENTOS_DO_MESTRE não sai; o permitido sai; o que veio da sala não volta', () => {
  const { enviadas, apps } = montar();
  const base = { contrato: 1, app: 'ficha', em: 1, campanhaId: null, dados: {} };
  apps.postMessage({ ...base, tipo: 'atlas.focar', id: 'a' });
  assert.equal(enviadas.length, 0);
  apps.postMessage({ ...base, tipo: 'ficha.rolagem', id: 'b' });
  assert.equal(enviadas.length, 1);
  assert.equal((enviadas[0] as { envelope: { id: string } }).envelope.id, 'b');
  apps.postMessage({ ...base, tipo: 'ficha.rolagem', id: 'c', autor: { discordId: '2', nome: 'x', papel: 'jogador', fichas: [] } });
  assert.equal(enviadas.length, 1);
});

test('evento da sala vai ao mesa:eventos local com o autor', () => {
  const { emitir } = montar();
  const outro = new Canal('mesa:eventos');
  const vistos: unknown[] = [];
  outro.onmessage = ({ data }) => vistos.push(data);
  const envelope = { tipo: 'atlas.mover-peca', id: 'e1', autor: { discordId: '2', nome: 'Bia', papel: 'jogador', fichas: ['f'] } };
  emitir({ tipo: 'evento', envelope });
  assert.deepEqual(vistos, [envelope]);
});

test('Blob vira blobId (hash dos bytes) e cada id sobe uma vez', async () => {
  const { atlas, enviadas, blobs, ponte } = montar();
  const png = () => new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' });
  atlas.postMessage({ tipo: 'retrato', id: 'r1', blob: png() });
  atlas.postMessage({ tipo: 'retrato', id: 'r2', blob: png() });
  atlas.postMessage({ tipo: 'inspecao', nome: 'Carta', normal: png(), uv: new Blob([new Uint8Array([9, 9])], { type: 'image/png' }) });
  atlas.postMessage({ tipo: 'inspecao', nome: 'Outra', normal: png(), uv: null });
  await ponte.esvaziar();
  assert.deepEqual(blobs.map(b => b.id), ['h3', 'h2']);
  const msgs = enviadas.map(m => (m as { msg: Record<string, unknown> }).msg);
  assert.equal(msgs.length, 4);
  assert.deepEqual(msgs[0], { tipo: 'retrato', id: 'r1', blob: { blobId: 'h3' } });
  assert.deepEqual(msgs[1], { tipo: 'retrato', id: 'r2', blob: { blobId: 'h3' } });
  assert.deepEqual(msgs[2], { tipo: 'inspecao', nome: 'Carta', normal: { blobId: 'h3' }, uv: { blobId: 'h2' } });
  assert.deepEqual(msgs[3], { tipo: 'inspecao', nome: 'Outra', normal: { blobId: 'h3' }, uv: null });
});

test('a ponte repassa canal com o nome do canal e ignora as mensagens do projetor', async () => {
  const { atlas, enviadas, ponte } = montar();
  atlas.postMessage({ tipo: 'estado', doc: { id: 'm' }, versao: 1 });
  atlas.postMessage({ tipo: 'ola', largura: 1, altura: 1 });
  atlas.postMessage({ tipo: 'tchau' });
  await ponte.esvaziar();
  assert.deepEqual(enviadas, [{ tipo: 'canal', nome: 'atlas:projetor:remoto', msg: { tipo: 'estado', doc: { id: 'm' }, versao: 1 } }]);
});

test('o aviso sem névoa segura o estado do mapa até a confirmação; depois o último sai e a confirmação é lembrada', async () => {
  const lembrados = new Set<string>();
  const { atlas, enviadas, ponte } = montar('teste-1', { semNevoaConfirmado: m => lembrados.has(m), lembrarSemNevoa: m => { lembrados.add(m); } });
  const doc = (id: string, explorado: unknown) => ({ id, session: { explored: explorado } });
  atlas.postMessage({ tipo: 'aviso-sem-nevoa', mapa: 'm1', nome: 'Cripta' });
  assert.deepEqual(ponte.estado.semNevoa, [{ mapa: 'm1', nome: 'Cripta' }]);
  atlas.postMessage({ tipo: 'estado', doc: doc('m1', null), versao: 1 });
  atlas.postMessage({ tipo: 'estado', doc: doc('m1', null), versao: 2 });
  atlas.postMessage({ tipo: 'estado', doc: doc('outro', null), versao: 1 });
  await ponte.esvaziar();
  assert.deepEqual(enviadas.map(m => (m as { msg: { doc: { id: string } } }).msg.doc.id), ['outro'], 'só o outro mapa sai; o aviso não vai à sala');
  ponte.confirmarSemNevoa('m1');
  await ponte.esvaziar();
  assert.equal(enviadas.length, 2);
  assert.equal((enviadas[1] as { msg: { versao: number } }).msg.versao, 2, 'sai o último estado retido');
  assert.deepEqual(ponte.estado.semNevoa, []);
  assert.ok(lembrados.has('m1'));
  atlas.postMessage({ tipo: 'estado', doc: doc('m1', null), versao: 3 });
  atlas.postMessage({ tipo: 'aviso-sem-nevoa', mapa: 'm1', nome: 'Cripta' });
  await ponte.esvaziar();
  assert.equal(enviadas.length, 3, 'depois de confirmado, o estado passa direto');
  assert.deepEqual(ponte.estado.semNevoa, [], 'e não pergunta de novo');
});

test('com névoa de volta, o estado do mapa pendente sai sem confirmação', async () => {
  const { atlas, enviadas, ponte } = montar('teste-1', { semNevoaConfirmado: () => false, lembrarSemNevoa: () => {} });
  atlas.postMessage({ tipo: 'aviso-sem-nevoa', mapa: 'm1', nome: 'Cripta' });
  atlas.postMessage({ tipo: 'estado', doc: { id: 'm1', session: { explored: { res: 0.5, cells: [] } } }, versao: 1 });
  await ponte.esvaziar();
  assert.equal(enviadas.length, 1);
  assert.deepEqual(ponte.estado.semNevoa, []);
});

test('a sala comum recebe o canal remoto sem trava, mesmo fora de sala de teste', async () => {
  const { atlas, enviadas, ponte } = montar('Campanha real');
  atlas.postMessage({ tipo: 'estado', doc: { id: 'm', session: { explored: { res: 0.5, cells: [] } } }, versao: 1 });
  await ponte.esvaziar();
  assert.equal(enviadas.length, 1);
});

test('ola e tchau seguem a presença dos jogadores', () => {
  const { emitir, atlas, ponte } = montar();
  const vistos: unknown[] = [];
  const espiao = new Canal('atlas:projetor:remoto');
  espiao.onmessage = ({ data }) => vistos.push(data);
  emitir(bemVindo([membro('1', 'mestre')]));
  assert.deepEqual(vistos, []);
  emitir({ tipo: 'membros', membros: [membro('1', 'mestre'), membro('2', 'jogador')] });
  assert.deepEqual(vistos, [{ tipo: 'ola', largura: 1920, altura: 1080, remoto: true }]);
  emitir({ tipo: 'membros', membros: [membro('1', 'mestre'), membro('2', 'jogador'), membro('3', 'jogador')] });
  assert.equal(vistos.length, 1);
  emitir({ tipo: 'membros', membros: [membro('1', 'mestre'), membro('3', 'jogador')] });
  assert.equal(vistos.length, 1);
  emitir({ tipo: 'membros', membros: [membro('1', 'mestre')] });
  assert.deepEqual(vistos[1], { tipo: 'tchau' });
  assert.equal(ponte.estado.publicando, false);
  void atlas;
});

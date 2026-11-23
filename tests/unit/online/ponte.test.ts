import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarPonte, type CanalLocal } from '../../../src/app/online.ts';
import { descomprimirEstado } from '../../../src/online/estado-comprimido.ts';
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
  /** Blobs que a sala "já tem" (resposta do `blob.tem`). */
  const salaTem = new Set<string>();
  const c = {
    estado: 'aberta' as const,
    enviar(m: MensagemParaSala) {
      if (m.tipo === 'blob.tem') { queueMicrotask(() => emitir({ tipo: 'blob.tem', id: m.id, tem: salaTem.has(m.id) })); return true; }
      enviadas.push(m); return true;
    },
    ouvir(tipo: string, f: (m: never) => void) { ouvintes.set(tipo, [...(ouvintes.get(tipo) ?? []), f]); return () => {}; },
    aoMudarEstado() { return () => {}; },
    async enviarBlob(id: string, blob: Blob) { blobs.push({ id, blob }); return true; },
    ouvirBlob() { return () => {}; },
    fechar() {},
  };
  const emitir = (m: MensagemDaSala) => { for (const f of ouvintes.get(m.tipo) ?? []) f(m as never); };
  return { cliente: c as unknown as ClienteDaSala, enviadas, blobs, emitir, salaTem };
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

// ---------- R6: mapas grandes, gestos e blob.tem ----------

test('um estado de 3 MB vira blob gzip estado:<mapa>:<versao>, o canal leva só a referência e a casca descomprime igual', async () => {
  const { atlas, enviadas, blobs, ponte } = montar();
  let semente = 7;
  const aleatorio = () => { semente = (semente * 1103515245 + 12345) & 0x7fffffff; return semente.toString(36); };
  const doc = { id: 'mapa-grande', terrain: Array.from({ length: 60_000 }, aleatorio).join(''), session: { explored: null } };
  const estado = { tipo: 'estado', doc, versao: 5 };
  assert.ok(JSON.stringify(estado).length > 300 * 1024);
  atlas.postMessage(estado);
  await ponte.esvaziar();
  assert.deepEqual(enviadas, [{ tipo: 'canal', nome: 'atlas:projetor:remoto', msg: { tipo: 'estado', blobId: 'estado:mapa-grande:5', versao: 5, comprimido: true } }]);
  assert.equal(blobs.length, 1);
  assert.equal(blobs[0]!.id, 'estado:mapa-grande:5');
  assert.deepEqual(await descomprimirEstado(blobs[0]!.blob), estado);
});

test('estado abaixo do limite não é comprimido; emGesto nunca é', async () => {
  const { atlas, enviadas, blobs, ponte } = montar();
  const grande = 'x'.repeat(400 * 1024);
  atlas.postMessage({ tipo: 'estado', doc: { id: 'm', grande }, versao: 1, emGesto: true });
  atlas.postMessage({ tipo: 'estado', doc: { id: 'm' }, versao: 2 });
  await ponte.esvaziar();
  assert.equal(blobs.length, 0);
  assert.equal(enviadas.length, 2);
  assert.equal((enviadas[0] as { msg: { doc: { grande: string } } }).msg.doc.grande, grande);
});

function relogioFalso() {
  let t = 0;
  const timers: Array<{ em: number; f: () => void; vivo: boolean }> = [];
  const agendar = (f: () => void, ms: number) => { const x = { em: t + ms, f, vivo: true }; timers.push(x); return () => { x.vivo = false; }; };
  /** Avança o relógio até `ate`, disparando os timers no caminho. */
  const avancar = (ate: number) => {
    for (;;) {
      const prox = timers.filter(x => x.vivo && x.em <= ate).sort((a, b) => a.em - b.em)[0];
      if (!prox) break;
      prox.vivo = false; t = Math.max(t, prox.em); prox.f();
    }
    t = ate;
  };
  return { agora: () => t, agendar, avancar };
}

test('gestos saem no máximo 15 por segundo e o último sempre sai', async () => {
  const r = relogioFalso();
  const { atlas, enviadas, ponte } = montar('teste-1', { agora: r.agora, agendar: r.agendar });
  // 100 quadros de 10 ms (1 s de arrasto) da mesma peça, alternando com o estado de gesto
  for (let i = 0; i < 100; i++) {
    r.avancar(i * 10);
    atlas.postMessage({ tipo: 'peca-gesto', id: 'p1', position: [i, 0], facing: 'n' });
    atlas.postMessage({ tipo: 'estado', doc: { id: 'm' }, versao: i, emGesto: true });
    await ponte.esvaziar();
  }
  const pecas = () => enviadas.filter(m => (m as { msg: { tipo: string } }).msg.tipo === 'peca-gesto').map(m => (m as { msg: { position: number[] } }).msg.position[0]);
  assert.ok(pecas().length <= 16, `saíram ${pecas().length} peca-gesto em 1 s`);
  assert.ok(pecas().length >= 10);
  assert.ok(enviadas.filter(m => (m as { msg: { tipo: string } }).msg.tipo === 'estado').length <= 16);
  r.avancar(2000); // o gesto parou: o que esperava sai
  await ponte.esvaziar();
  assert.equal(pecas().at(-1), 99, 'o último quadro do gesto sai, não fica parado no meio');
  const estados = enviadas.filter(m => (m as { msg: { tipo: string } }).msg.tipo === 'estado').map(m => (m as { msg: { versao: number } }).msg.versao);
  assert.equal(estados.at(-1), 99);
});

test('um estado firme descarta o estado de gesto que esperava', async () => {
  const r = relogioFalso();
  const { atlas, enviadas, ponte } = montar('teste-1', { agora: r.agora, agendar: r.agendar });
  atlas.postMessage({ tipo: 'estado', doc: { id: 'm' }, versao: 1, emGesto: true });
  atlas.postMessage({ tipo: 'estado', doc: { id: 'm' }, versao: 2, emGesto: true });
  atlas.postMessage({ tipo: 'estado', doc: { id: 'm' }, versao: 3 });
  r.avancar(1000);
  await ponte.esvaziar();
  assert.deepEqual(enviadas.map(m => (m as { msg: { versao: number } }).msg.versao), [1, 3]);
});

test('blob.tem: a ponte pergunta antes de subir e não sobe o que a sala já tem', async () => {
  const { atlas, enviadas, blobs, ponte, salaTem } = montar();
  salaTem.add('h3');
  const png = () => new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' });
  atlas.postMessage({ tipo: 'retrato', id: 'r1', blob: png() });
  atlas.postMessage({ tipo: 'inspecao', nome: 'C', normal: png(), uv: new Blob([new Uint8Array([9, 9])], { type: 'image/png' }) });
  await ponte.esvaziar();
  assert.deepEqual(blobs.map(b => b.id), ['h2'], 'só o que a sala não tem sobe');
  const msgs = enviadas.map(m => (m as { msg: Record<string, unknown> }).msg);
  assert.deepEqual(msgs[0], { tipo: 'retrato', id: 'r1', blob: { blobId: 'h3' } });
  assert.equal(msgs.length, 2);
});

test('blob.tem sem resposta a tempo: sobe assim mesmo', async () => {
  const r = relogioFalso();
  const f = clienteFalso();
  (f.cliente as unknown as { enviar: (m: MensagemParaSala) => boolean }).enviar = () => true; // a sala nunca responde
  Canal.todos.clear();
  const ponte = criarPonte({ cliente: f.cliente, criarCanal: n => new Canal(n), hash: async b => `h${b.byteLength}`, agendar: r.agendar, agora: r.agora });
  const atlas = new Canal('atlas:projetor:remoto');
  atlas.postMessage({ tipo: 'retrato', id: 'r', blob: new Blob([new Uint8Array([1])], { type: 'image/png' }) });
  await Promise.resolve(); await new Promise(res => setTimeout(res, 5));
  r.avancar(6000);
  await ponte.esvaziar();
  assert.deepEqual(f.blobs.map(b => b.id), ['h1']);
});

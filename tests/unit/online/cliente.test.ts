import { test } from 'node:test';
import assert from 'node:assert/strict';
import { conectarSala, type WebSocketLike } from '../../../src/online/cliente.ts';
import { decodificarPedaco, TAMANHO_PEDACO } from '../../../src/online/protocolo.ts';

class Falso implements WebSocketLike {
  static todos: Falso[] = [];
  readyState = 0;
  binaryType = 'blob';
  onopen: WebSocketLike['onopen'] = null;
  onmessage: WebSocketLike['onmessage'] = null;
  onclose: WebSocketLike['onclose'] = null;
  onerror: WebSocketLike['onerror'] = null;
  enviadas: Array<string | ArrayBuffer> = [];
  url: string;
  constructor(url: string) { this.url = url; Falso.todos.push(this); }
  send(d: string | ArrayBuffer) { this.enviadas.push(d); }
  close() { this.readyState = 3; }
  abrir() { this.readyState = 1; this.onopen?.({}); }
  receber(m: unknown) { this.onmessage?.({ data: typeof m === 'string' || m instanceof ArrayBuffer ? m : JSON.stringify(m) }); }
  cair(code = 1006) { this.readyState = 3; this.onclose?.({ code }); }
}

const eu = { discordId: '1', nome: 'Ana', papel: 'jogador' };
const bemVindo = { tipo: 'bem-vindo', eu, membros: [], fichas: [], ultimoEstado: {} };

function preparar() {
  Falso.todos = [];
  const esperas: Array<{ f: () => void; ms: number; cancelada: boolean }> = [];
  const cliente = conectarSala({
    url: 'wss://x/sala', sessao: 'tok', WebSocket: Falso,
    agendar: (f, ms) => { const e = { f, ms, cancelada: false }; esperas.push(e); return () => { e.cancelada = true; }; },
  });
  return { cliente, esperas, ws: () => Falso.todos[Falso.todos.length - 1]! };
}

test('manda o ola ao abrir, vira aberta no bem-vindo e entrega mensagens por tipo', () => {
  const { cliente, ws } = preparar();
  assert.equal(cliente.estado, 'conectando');
  const recebidos: unknown[] = [];
  cliente.ouvir('erro', m => recebidos.push(m.motivo));
  ws().abrir();
  assert.deepEqual(JSON.parse(ws().enviadas[0] as string), { tipo: 'ola', sessao: 'tok' });
  assert.equal(cliente.enviar({ tipo: 'sala.config', nome: 'x' }), false);
  ws().receber(bemVindo);
  assert.equal(cliente.estado, 'aberta');
  assert.equal(cliente.enviar({ tipo: 'sala.config', nome: 'x' }), true);
  ws().receber({ tipo: 'erro', motivo: 'não' });
  ws().receber('lixo');
  assert.deepEqual(recebidos, ['não']);
});

test('reconecta com espera 1, 2, 4… até 30 s, refaz o ola e zera a espera no bem-vindo', () => {
  const { cliente, esperas, ws } = preparar();
  const estados: string[] = [];
  cliente.aoMudarEstado(e => estados.push(e));
  const tempos: number[] = [];
  for (let i = 0; i < 7; i++) {
    ws().abrir();
    ws().cair();
    tempos.push(esperas[esperas.length - 1]!.ms);
    assert.equal(cliente.estado, 'caiu');
    esperas[esperas.length - 1]!.f();
    assert.equal(cliente.estado, 'conectando');
  }
  assert.deepEqual(tempos, [1000, 2000, 4000, 8000, 16000, 30000, 30000]);
  ws().abrir();
  assert.deepEqual(JSON.parse(ws().enviadas[0] as string), { tipo: 'ola', sessao: 'tok' });
  ws().receber(bemVindo);
  assert.equal(cliente.estado, 'aberta');
  ws().cair();
  assert.equal(esperas[esperas.length - 1]!.ms, 1000);
  assert.deepEqual(estados.slice(0, 3), ['caiu', 'conectando', 'caiu']);
  assert.equal(Falso.todos.length, 8);
});

test('não reconecta com sessão inválida (4001) nem depois de fechar', () => {
  const a = preparar();
  a.ws().abrir(); a.ws().cair(4001);
  assert.equal(a.esperas.length, 0);
  const b = preparar();
  b.ws().abrir(); b.ws().receber(bemVindo);
  b.cliente.fechar();
  b.ws().cair(1000);
  assert.equal(b.esperas.length, 0);
  assert.equal(b.cliente.estado, 'caiu');
});

test('fechar cancela a espera de reconexão', () => {
  const { cliente, esperas, ws } = preparar();
  ws().abrir(); ws().cair();
  cliente.fechar();
  assert.equal(esperas[0]!.cancelada, true);
});

test('um blob de 1,3 MB é dividido em pedaços de 512 KB e remontado igual', async () => {
  const a = preparar();
  a.ws().abrir(); a.ws().receber(bemVindo);
  const bytes = new Uint8Array(Math.round(1.3 * 1024 * 1024)).map((_, i) => (i * 31 + 7) % 256);
  assert.equal(await a.cliente.enviarBlob('hash1', new Blob([bytes], { type: 'image/png' })), true);
  const [, anuncio, ...quadros] = a.ws().enviadas;
  assert.deepEqual(JSON.parse(anuncio as string), { tipo: 'blob', id: 'hash1', tipoMime: 'image/png' });
  assert.equal(quadros.length, 3);
  const pedacos = quadros.map(q => decodificarPedaco(q as ArrayBuffer)!);
  assert.deepEqual(pedacos.map(p => p.dados.length), [TAMANHO_PEDACO, TAMANHO_PEDACO, bytes.length - 2 * TAMANHO_PEDACO]);
  assert.deepEqual(pedacos.map(p => p.cab.i), [0, 1, 2]);

  const b = preparar();
  b.ws().abrir(); b.ws().receber(bemVindo);
  const feitos: Array<{ id: string; blob: Blob }> = [];
  b.cliente.ouvirBlob((id, blob) => feitos.push({ id, blob }));
  for (const q of [quadros[2], quadros[0], quadros[1]]) b.ws().receber(q as ArrayBuffer);
  assert.equal(feitos.length, 1);
  assert.equal(feitos[0]!.id, 'hash1');
  assert.equal(feitos[0]!.blob.type, 'image/png');
  assert.deepEqual(new Uint8Array(await feitos[0]!.blob.arrayBuffer()), bytes);
});

test('sala inexistente (4004) não reconecta, e aoFechar recebe o código', () => {
  Falso.todos = [];
  const esperas: number[] = [];
  const codigos: Array<number | undefined> = [];
  conectarSala({ url: 'wss://x/sala', sessao: 'tok', WebSocket: Falso, agendar: (_f, ms) => { esperas.push(ms); return () => {}; }, aoFechar: c => codigos.push(c) });
  Falso.todos[0]!.abrir(); Falso.todos[0]!.cair(4004);
  assert.deepEqual(esperas, []);
  assert.deepEqual(codigos, [4004]);
});

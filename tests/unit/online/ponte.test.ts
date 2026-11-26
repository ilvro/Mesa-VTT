import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarPonte, fichaEhAmeaca, LIMITE_SOM_BYTES, type CanalLocal } from '../../../src/app/online.ts';
import { descomprimirEstado } from '../../../src/online/estado-comprimido.ts';
import { criarBarramento } from '#mesa';
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
  /** O tamanho que a sala diz ter de cada blob (resposta do `blob.tem`). */
  const tamanhos = new Map<string, number>();
  /** A ordem em que as coisas saíram: `blob:<id>` e `evento:<tipo>`. */
  const ordem: string[] = [];
  const c = {
    estado: 'aberta' as const,
    enviar(m: MensagemParaSala) {
      if (m.tipo === 'blob.tem') { queueMicrotask(() => emitir({ tipo: 'blob.tem', id: m.id, tem: salaTem.has(m.id), ...(tamanhos.has(m.id) ? { tamanho: tamanhos.get(m.id)! } : {}) })); return true; }
      if (m.tipo === 'evento') ordem.push(`evento:${m.envelope.tipo}`);
      enviadas.push(m); return true;
    },
    ouvir(tipo: string, f: (m: never) => void) { ouvintes.set(tipo, [...(ouvintes.get(tipo) ?? []), f]); return () => {}; },
    aoMudarEstado() { return () => {}; },
    async enviarBlob(id: string, blob: Blob) { blobs.push({ id, blob }); ordem.push(`blob:${id}`); return true; },
    ouvirBlob() { return () => {}; },
    fechar() {},
  };
  const emitir = (m: MensagemDaSala) => { for (const f of ouvintes.get(m.tipo) ?? []) f(m as never); };
  return { cliente: c as unknown as ClienteDaSala, enviadas, blobs, emitir, salaTem, tamanhos, ordem };
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

test('rolagem de ameaça do mestre não sai; a de personagem sai', () => {
  const { enviadas, apps } = montar('teste-1', { ehAmeaca: id => id === 'monstro' });
  const rolagem = (id: string, ficha: string) => ({ contrato: 1, app: 'ficha', em: 1, campanhaId: null, tipo: 'ficha.rolagem', id, dados: { ficha: { app: 'ficha', tipo: 'ficha', id: ficha }, titulo: 'Garras', total: 14 } });
  apps.postMessage(rolagem('r1', 'monstro'));
  assert.equal(enviadas.length, 0);
  apps.postMessage(rolagem('r2', 'heroi'));
  assert.equal(enviadas.length, 1);
  assert.equal((enviadas[0] as { envelope: { id: string } }).envelope.id, 'r2');
});

test('fichaEhAmeaca consulta as entidades ameaca da campanha pelo Ref da ficha', () => {
  const ref = (id: string) => ({ app: 'ficha' as const, tipo: 'ficha', id });
  const ents = [{ tipo: 'ameaca' as const, refs: [ref('m1')] }, { tipo: 'personagem' as const, refs: [ref('p1')] }];
  assert.equal(fichaEhAmeaca(ents as never, 'm1'), true);
  assert.equal(fichaEhAmeaca(ents as never, 'p1'), false);
  assert.equal(fichaEhAmeaca(ents as never, 'x'), false);
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

test('mesa.resposta do mestre vai à sala pelo canal de eventos', () => {
  const { enviadas } = montar();
  const atlas = new Canal('mesa:eventos');
  const resp = { contrato: 1, app: 'atlas', tipo: 'mesa.resposta', id: 'r1', em: 1, campanhaId: null, respondeA: 'p1', dados: { ok: false, motivo: 'Recusado.' } };
  atlas.postMessage(resp);
  assert.deepEqual(enviadas, [{ tipo: 'evento', envelope: resp }]);
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


// ---------- som do Jukebox (R22) ----------

const estadoDaFaixa = { volume: 1, efeitos: [], ajustes: {}, regioes: [] };
const faixa = (faixaId: string, extra: object = {}) => ({ faixaId, titulo: `Título ${faixaId}`, loop: true, posicao: 3, taxa: 1, desde: 1000, pausada: false, estado: estadoDaFaixa, ...extra });
let seq = 0;
const envMix = (faixas: object[], cena: unknown = { app: 'jukebox', tipo: 'cena-sonora', id: 'Traição do rei' }) =>
  ({ contrato: 1, app: 'jukebox', tipo: 'jukebox.mix', id: `mix${++seq}`, em: 1, campanhaId: null, dados: { cena, mestre: 1, faixas } });
const envEfeito = (faixaId: string, extra: object = {}) =>
  ({ contrato: 1, app: 'jukebox', tipo: 'jukebox.efeito-tocado', id: `ef${++seq}`, em: 1, campanhaId: null, dados: { faixaId, titulo: `Título ${faixaId}`, estado: estadoDaFaixa, ...extra } });
const audio = (bytes: number) => new Blob([new Uint8Array(bytes)], { type: 'audio/mpeg' });

/** Um Jukebox falso: guarda os pedidos e responde `jukebox.arquivo` com os blobs de `arquivos`, esperando `portao` se houver. */
function jukeboxFalso(arquivos: Record<string, Blob>) {
  const pedidos: Array<{ tipo: string; dados: unknown; prazoMs: number }> = [];
  const subidas: string[] = [];
  let emVoo = 0, maxEmVoo = 0;
  let portao: Promise<void> | null = null;
  const jukebox = {
    pedidos, subidas,
    segurar() { let abrir!: () => void; portao = new Promise(r => { abrir = r; }); return () => { portao = null; abrir(); }; },
    get maxEmVoo() { return maxEmVoo; },
    async pedir(tipo: 'jukebox.ouvir' | 'jukebox.arquivo', dados: unknown, prazoMs: number) {
      pedidos.push({ tipo, dados, prazoMs });
      if (tipo === 'jukebox.ouvir') return { ok: true as const, dados: undefined };
      const id = (dados as { faixaId: string }).faixaId;
      subidas.push(id);
      emVoo++; maxEmVoo = Math.max(maxEmVoo, emVoo);
      const espera = portao;
      if (espera) await espera;
      emVoo--;
      const blob = arquivos[id];
      return blob ? { ok: true as const, dados: { blob, tipo: blob.type } } : { ok: false as const, motivo: 'desconhecida' };
    },
  };
  return jukebox;
}
const montarSom = (arquivos: Record<string, Blob>, extra: Partial<Parameters<typeof criarPonte>[0]> = {}) => {
  const jk = jukeboxFalso(arquivos);
  // relógio falso por padrão: o `jukebox.ouvir` se repete sozinho e um timer real seguraria o processo
  const m = montar('teste-1', { pedirAoJukebox: jk.pedir, agendar: relogioFalso().agendar, ...extra });
  return { ...m, jk };
};
const eventosEnviados = (enviadas: MensagemParaSala[], tipo: string) =>
  enviadas.flatMap(m => (m.tipo === 'evento' && m.envelope.tipo === tipo ? [m.envelope as unknown as { dados: Record<string, any> }] : []));

test('o mix sai sem titulo e sem cena, mantém o url, e uma faixa com url não é pedida nem subida', async () => {
  const { apps, enviadas, blobs, jk, ponte } = montarSom({ aa: audio(10) });
  apps.postMessage(envMix([faixa('aa'), faixa('bb', { url: 'sample/chuva.mp3' })]));
  await ponte.esvaziar();
  assert.deepEqual(jk.subidas, ['aa'], 'só a sem url vai ao Jukebox');
  assert.deepEqual(blobs.map(b => b.id), ['aa']);
  const [mix] = eventosEnviados(enviadas, 'jukebox.mix');
  assert.ok(mix);
  assert.equal('cena' in mix.dados, false);
  assert.equal(mix.dados.faixas.some((f: Record<string, unknown>) => 'titulo' in f), false);
  assert.equal(mix.dados.faixas[1].url, 'sample/chuva.mp3');
  assert.equal(mix.dados.faixas[0].url, undefined);
  assert.equal(mix.dados.faixas[0].estado.volume, 1, 'o resto da faixa segue igual');
  assert.equal(mix.dados.mestre, 1);
  assert.equal(JSON.stringify(mix).includes('Título'), false);
  assert.equal(JSON.stringify(mix).includes('Traição'), false);
});

test('o efeito tocado sai sem titulo; com url sai direto, sem subir nada', async () => {
  const { apps, enviadas, blobs, jk, ponte } = montarSom({ ef: audio(5) });
  apps.postMessage(envEfeito('pages', { url: 'sample/trovao.mp3' }));
  await ponte.esvaziar();
  assert.equal(blobs.length, 0);
  assert.deepEqual(jk.subidas, []);
  apps.postMessage(envEfeito('ef'));
  await ponte.esvaziar();
  const efeitos = eventosEnviados(enviadas, 'jukebox.efeito-tocado');
  assert.equal(efeitos.length, 2);
  assert.equal(efeitos.some(e => 'titulo' in e.dados), false);
  assert.equal(efeitos[0]!.dados.url, 'sample/trovao.mp3');
  assert.deepEqual(blobs.map(b => b.id), ['ef']);
});

test('o mix sai depois do arquivo, e cada arquivo sobe uma vez', async () => {
  const { apps, ordem, blobs, jk, ponte } = montarSom({ aa: audio(10), bb: audio(20) });
  apps.postMessage(envMix([faixa('aa'), faixa('bb')]));
  await ponte.esvaziar();
  assert.deepEqual(ordem, ['blob:aa', 'blob:bb', 'evento:jukebox.mix']);
  apps.postMessage(envMix([faixa('aa'), faixa('bb')]));
  apps.postMessage(envMix([faixa('bb')]));
  await ponte.esvaziar();
  assert.deepEqual(blobs.map(b => b.id), ['aa', 'bb']);
  assert.deepEqual(jk.subidas, ['aa', 'bb']);
  assert.deepEqual(ordem.slice(3), ['evento:jukebox.mix', 'evento:jukebox.mix']);
});

test('o que a sala já tem não é pedido ao Jukebox nem subido, e o mix sai', async () => {
  const { apps, enviadas, blobs, jk, ponte, salaTem, tamanhos } = montarSom({});
  salaTem.add('aa'); tamanhos.set('aa', 1234);
  apps.postMessage(envMix([faixa('aa')]));
  await ponte.esvaziar();
  assert.deepEqual(jk.subidas, []);
  assert.equal(blobs.length, 0);
  assert.equal(eventosEnviados(enviadas, 'jukebox.mix').length, 1);
  assert.deepEqual(ponte.estado.sons, { total: 1, naSala: 1, bytes: 1234, grandes: [], falhas: 0 });
});

test('fila: um arquivo por vez, com as faixas do mix atual primeiro', async () => {
  const { apps, ordem, jk, ponte } = montarSom({ a: audio(1), m1: audio(2), m2: audio(3), e1: audio(4), antigo: audio(5) });
  const soltar = jk.segurar();
  apps.postMessage(envMix([faixa('a')]));
  await new Promise(r => setTimeout(r, 5)); // `a` já está em voo
  apps.postMessage(envMix([faixa('antigo')])); // um mix velho, ainda sem arquivo
  apps.postMessage(envEfeito('e1'));
  apps.postMessage(envMix([faixa('m1'), faixa('m2')])); // o mix atual: sobe antes dos outros
  await new Promise(r => setTimeout(r, 5));
  soltar();
  await ponte.esvaziar();
  assert.equal(jk.maxEmVoo, 1, 'um arquivo por vez');
  assert.deepEqual(jk.subidas, ['a', 'm1', 'm2', 'antigo', 'e1']);
  // só o mix mais novo saiu (o que esperava foi trocado); o efeito esperou além do prazo? não: saiu depois do arquivo
  assert.equal(ordem.filter(x => x === 'evento:jukebox.mix').length >= 1, true);
  assert.ok(ordem.indexOf('blob:m2') < ordem.lastIndexOf('evento:jukebox.mix'));
});

test('arquivo acima de 40 MB não sobe, aparece na tela e o mix sai assim mesmo', async () => {
  const { apps, enviadas, blobs, ponte } = montarSom({ grande: audio(LIMITE_SOM_BYTES + 1), ok: audio(100) });
  apps.postMessage(envMix([faixa('grande', { titulo: 'Batalha final' }), faixa('ok')]));
  await ponte.esvaziar();
  assert.deepEqual(blobs.map(b => b.id), ['ok']);
  assert.equal(eventosEnviados(enviadas, 'jukebox.mix').length, 1);
  assert.deepEqual(ponte.estado.sons.grandes, [{ faixaId: 'grande', titulo: 'Batalha final', bytes: LIMITE_SOM_BYTES + 1 }]);
  assert.equal(ponte.estado.sons.total, 2);
  assert.equal(ponte.estado.sons.naSala, 1);
  assert.equal(ponte.estado.sons.bytes, 100);
  // exatamente 40 MB ainda sobe
  const { apps: apps2, blobs: blobs2, ponte: ponte2 } = montarSom({ limite: audio(LIMITE_SOM_BYTES) });
  apps2.postMessage(envMix([faixa('limite')]));
  await ponte2.esvaziar();
  assert.deepEqual(blobs2.map(b => b.id), ['limite']);
});

test('Jukebox sem resposta: o mix sai assim mesmo, o som fica como falha e volta à fila depois de 15 s', async () => {
  const r = relogioFalso();
  const { apps, enviadas, jk, ponte } = montarSom({}, { agora: r.agora, agendar: r.agendar });
  apps.postMessage(envMix([faixa('sumiu')]));
  await ponte.esvaziar();
  assert.equal(eventosEnviados(enviadas, 'jukebox.mix').length, 1);
  assert.equal(ponte.estado.sons.falhas, 1);
  apps.postMessage(envMix([faixa('sumiu')]));
  await ponte.esvaziar();
  assert.deepEqual(jk.subidas, ['sumiu'], 'não insiste logo em seguida');
  r.avancar(16_000);
  apps.postMessage(envMix([faixa('sumiu')]));
  await ponte.esvaziar();
  assert.deepEqual(jk.subidas, ['sumiu', 'sumiu']);
});

test('um efeito cujo arquivo sobe sai depois dele; mesmo efeito de novo sai na hora', async () => {
  const { apps, enviadas, ordem, ponte } = montarSom({ ef: audio(8) });
  apps.postMessage(envEfeito('ef'));
  await ponte.esvaziar();
  assert.deepEqual(ordem, ['blob:ef', 'evento:jukebox.efeito-tocado']);
  apps.postMessage(envEfeito('ef'));
  assert.equal(eventosEnviados(enviadas, 'jukebox.efeito-tocado').length, 2, 'saiu sem esperar');
});

test('jukebox.ouvir: liga ao abrir, repete a cada 10 s e desliga ao fechar', async () => {
  const r = relogioFalso();
  const { jk, ponte } = montarSom({}, { agora: r.agora, agendar: r.agendar });
  const ouvir = () => jk.pedidos.filter(p => p.tipo === 'jukebox.ouvir').map(p => (p.dados as { ligado: boolean }).ligado);
  assert.deepEqual(ouvir(), [true]);
  r.avancar(9_999);
  assert.deepEqual(ouvir(), [true]);
  r.avancar(10_000);
  assert.deepEqual(ouvir(), [true, true]);
  r.avancar(35_000);
  assert.deepEqual(ouvir(), [true, true, true, true]);
  ponte.fechar();
  assert.deepEqual(ouvir(), [true, true, true, true, false]);
  r.avancar(120_000);
  assert.equal(ouvir().length, 5, 'fechada, não repete mais');
  ponte.fechar();
  assert.equal(ouvir().length, 5, 'fechar duas vezes manda um só desligar');
});

test('sem Jukebox ligado à ponte, o som não sai e nada é pedido', async () => {
  const { apps, enviadas, ponte } = montar();
  apps.postMessage(envMix([faixa('aa')]));
  await ponte.esvaziar();
  assert.deepEqual(eventosEnviados(enviadas, 'jukebox.mix'), []);
});

test('o mix que veio da sala (com autor) não volta para ela', async () => {
  const { apps, enviadas, ponte } = montarSom({});
  apps.postMessage({ ...envMix([faixa('aa', { url: 'sample/a.mp3' })]), autor: { discordId: '2', nome: 'x', papel: 'jogador', fichas: [] } });
  await ponte.esvaziar();
  assert.deepEqual(enviadas, []);
});

// ---------- fichas da sala no Dossiê do mestre (R13) ----------

const autorMestre = { ...eu, fichas: [] as string[] };
const fichaX = (id: string, extra: Record<string, unknown> = {}) => ({ id, name: id.toUpperCase(), ...extra });
/** O Dossiê do mestre: um barramento `ficha` no `mesa:eventos`, depois da ponte (montar limpa os canais). */
function comDossie() {
  const m = montar();
  const dossie = criarBarramento({ app: 'ficha', campanhaId: null, criarCanal: () => new Canal('mesa:eventos'), aviso: () => {} });
  const fatos: Array<Record<string, any>> = [];
  dossie.ouvir('sala.ficha-atualizada', e => { fatos.push(e as unknown as Record<string, any>); });
  const conexoes: boolean[] = [];
  dossie.ouvir('sala.conexao', e => { conexoes.push((e.dados as { conectada: boolean }).conectada); });
  return { ...m, dossie, fatos, conexoes };
}

test('sala.fichas: sem a sala conectada é recusada; depois do bem-vindo traz fichas, revs, donos, membros e quem sou eu', async () => {
  const { dossie, emitir, conexoes, ponte } = comDossie();
  const antes = await dossie.pedir('sala.fichas', {}, { prazoMs: 100 });
  assert.equal(antes.ok, false);
  emitir({ ...bemVindo([membro('1', 'mestre'), { ...membro('2', 'jogador'), personagem: 'a' }]), fichas: [fichaX('a'), fichaX('b')], revs: { a: 2, b: 1 }, donos: { a: '2', b: '1' } } as MensagemDaSala);
  assert.deepEqual(conexoes, [true], 'a Mesa avisa que a sala abriu');
  const r = await dossie.pedir('sala.fichas', {}) as unknown as { ok: boolean; resposta: Record<string, any> };
  assert.equal(r.ok, true);
  assert.deepEqual(r.resposta.fichas.map((f: { id: string }) => f.id), ['a', 'b']);
  assert.deepEqual(r.resposta.revs, { a: 2, b: 1 });
  assert.deepEqual(r.resposta.donos, { a: '2', b: '1' });
  assert.deepEqual(r.resposta.eu, { discordId: '1', nome: 'Mestre' });
  assert.equal(r.resposta.nome, 'teste-1');
  assert.deepEqual(r.resposta.membros.map((m: { discordId: string; personagem: string | null }) => `${m.discordId}:${m.personagem}`), ['1:null', '2:a']);
  assert.equal(r.resposta.nomes['2'], '2');
  ponte.fechar();
  assert.deepEqual(conexoes, [true, false], 'fechar a ponte avisa que a sala saiu');
});

test('sala.salvar-ficha vira ficha.salvar com o rev da sala; ficha nova vai com rev 0; sem conexão, recusa', async () => {
  const { dossie, emitir, enviadas, ponte } = comDossie();
  assert.equal((await dossie.pedir('sala.salvar-ficha', { ficha: fichaX('a'), rev: 0 }, { prazoMs: 100 })).ok, false);
  emitir({ ...bemVindo([membro('1', 'mestre')]), fichas: [fichaX('a')], revs: { a: 3 }, donos: { a: '2' } } as MensagemDaSala);
  assert.equal((await dossie.pedir('sala.salvar-ficha', { ficha: fichaX('a', { pv: 1 }), rev: 0 })).ok, true);
  assert.deepEqual(enviadas, [{ tipo: 'ficha.salvar', ficha: fichaX('a', { pv: 1 }), rev: 3 }]);
  await dossie.pedir('sala.salvar-ficha', { ficha: fichaX('nova'), rev: 0 });
  assert.equal((enviadas[1] as { rev: number }).rev, 0);
  ponte.fechar();
});

test('sala.entregar-ficha vira ficha.entregar', async () => {
  const { dossie, emitir, enviadas, ponte } = comDossie();
  emitir({ ...bemVindo([membro('1', 'mestre'), membro('2', 'jogador')]), fichas: [fichaX('a')] } as MensagemDaSala);
  assert.equal((await dossie.pedir('sala.entregar-ficha', { fichaId: 'a', dono: '2' })).ok, true);
  assert.deepEqual(enviadas, [{ tipo: 'ficha.entregar', fichaId: 'a', dono: '2' }]);
  ponte.fechar();
});

test('ficha.atualizada da sala vira sala.ficha-atualizada com o autor da sala, e a ponte guarda o rev e o dono', async () => {
  const { dossie, emitir, fatos, ponte } = comDossie();
  emitir(bemVindo([membro('1', 'mestre'), membro('2', 'jogador')]));
  emitir({ tipo: 'ficha.atualizada', ficha: fichaX('a', { pv: 4 }), rev: 5, autor: { discordId: '2', nome: 'Ana', papel: 'jogador', fichas: ['a'] }, dono: '2', conflito: true });
  assert.equal(fatos.length, 1);
  assert.equal(fatos[0]!.app, 'mesa');
  assert.deepEqual(fatos[0]!.dados, { ficha: fichaX('a', { pv: 4 }), rev: 5, conflito: true, dono: '2' });
  assert.equal(fatos[0]!.autor.nome, 'Ana');
  emitir({ tipo: 'ficha.atualizada', ficha: fichaX('b'), rev: 1, autor: autorMestre, dono: '2' });
  const r = await dossie.pedir('sala.fichas', {}) as unknown as { resposta: Record<string, any> };
  assert.deepEqual(r.resposta.revs, { a: 5, b: 1 });
  assert.deepEqual(r.resposta.donos, { a: '2', b: '2' });
  assert.equal(r.resposta.nomes['2'], 'Ana');
  ponte.fechar();
});

test('configDaSala manda sala.config ao receber bem-vindo', async () => {
  const { emitir, enviadas, ponte } = montar('teste-1', { configDaSala: () => ({ nome: 'Ordem', capa: null }) });
  emitir(bemVindo([membro('1', 'mestre')]));
  await new Promise(r => setTimeout(r, 0));
  assert.deepEqual(enviadas, [{ tipo: 'sala.config', nome: 'Ordem' }]);
  ponte.fechar();
});

test('ponte responde precisa-ola do Atlas com ola remoto quando há jogadores na sala', async () => {
  const { emitir, atlas, ponte } = montar('teste-1');
  const recebidas: unknown[] = [];
  atlas.onmessage = m => recebidas.push(m.data);

  atlas.postMessage({ tipo: 'precisa-ola' });
  assert.equal(recebidas.length, 0, 'sem jogadores não responde ola');

  emitir(bemVindo([membro('1', 'mestre'), membro('2', 'jogador')]));
  recebidas.length = 0;
  atlas.postMessage({ tipo: 'precisa-ola' });
  assert.deepEqual(recebidas, [{ tipo: 'ola', largura: 1920, altura: 1080, remoto: true }]);
  ponte.fechar();
});

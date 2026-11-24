import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarPonte } from '../../../src/app/online.ts';
import { PRAZO_DO_BLOB_MS, criarPonteDoJogador, eventoPodeSair, type CanalLocal } from '../../../src/jogar/ponte-jogador.ts';
import { criarBarramento } from '#mesa';
import { comprimirEstado } from '../../../src/online/estado-comprimido.ts';
import type { ClienteDaSala } from '../../../src/online/cliente.ts';
import type { MensagemDaSala, MensagemParaSala } from '../../../src/online/protocolo.ts';

/** `BroadcastChannel` falso, na mesma "origem": quem posta não recebe a própria mensagem, os outros do mesmo nome sim. */
class Canal implements CanalLocal {
  static todos = new Map<string, Canal[]>();
  static escritos: string[] = [];
  onmessage: CanalLocal['onmessage'] = null;
  nome: string;
  constructor(nome: string) { this.nome = nome; Canal.todos.set(nome, [...(Canal.todos.get(nome) ?? []), this]); }
  postMessage(m: unknown) { Canal.escritos.push(this.nome); for (const c of Canal.todos.get(this.nome) ?? []) if (c !== this) c.onmessage?.({ data: m }); }
  close() { Canal.todos.set(this.nome, (Canal.todos.get(this.nome) ?? []).filter(c => c !== this)); }
}

function clienteFalso() {
  const ouvintes = new Map<string, Array<(m: never) => void>>();
  let ouvintesBlob: Array<(id: string, b: Blob) => void> = [];
  const enviadas: MensagemParaSala[] = [];
  const c = {
    estado: 'aberta' as const,
    enviar(m: MensagemParaSala) { if (m.tipo === 'blob.tem') return true; enviadas.push(m); return true; },
    ouvir(tipo: string, f: (m: never) => void) { ouvintes.set(tipo, [...(ouvintes.get(tipo) ?? []), f]); return () => { ouvintes.set(tipo, (ouvintes.get(tipo) ?? []).filter(x => x !== f)); }; },
    aoMudarEstado() { return () => {}; },
    async enviarBlob() { return true; },
    ouvirBlob(f: (id: string, b: Blob) => void) { ouvintesBlob.push(f); return () => { ouvintesBlob = ouvintesBlob.filter(x => x !== f); }; },
    fechar() {},
  };
  const emitir = (m: MensagemDaSala) => { for (const f of ouvintes.get(m.tipo) ?? []) f(m as never); };
  const chegouBlob = (id: string, b: Blob) => { for (const f of ouvintesBlob) f(id, b); };
  return { cliente: c as unknown as ClienteDaSala, enviadas, emitir, chegouBlob };
}

const SALA = 'abc123';
const eu = { discordId: '2', nome: 'Ana', papel: 'jogador' as const };
const autor = { discordId: '1', nome: 'Mestre', papel: 'mestre' as const, fichas: [] };
const base = { contrato: 1, app: 'ficha', em: 1, campanhaId: null, dados: {} };

function montar(extra: Partial<Parameters<typeof criarPonteDoJogador>[0]> = {}) {
  Canal.todos.clear(); Canal.escritos = [];
  const f = clienteFalso();
  const avisos: string[] = [];
  const ponte = criarPonteDoJogador({ cliente: f.cliente, salaId: SALA, criarCanal: n => new Canal(n), aviso: t => avisos.push(t), ...extra });
  const projetor = new Canal(`sala:${SALA}:atlas:projetor`);
  const vistos: unknown[] = [];
  projetor.onmessage = ({ data }) => vistos.push(data);
  const eventos = new Canal(`sala:${SALA}:mesa:eventos`);
  return { ...f, ponte, projetor, eventos, vistos, avisos };
}

test('o canal da sala vai ao canal local com o prefixo da sala', async () => {
  const { emitir, ponte, vistos } = montar();
  const msg = { tipo: 'estado', doc: { id: 'm' }, versao: 1 };
  emitir({ tipo: 'canal', nome: 'atlas:projetor:remoto', msg });
  emitir({ tipo: 'canal', nome: 'atlas:projetor:remoto', msg: { tipo: 'camera', caixa: { x0: 0, y0: 0, x1: 1, y1: 1 } } });
  await ponte.esvaziar();
  assert.equal(vistos.length, 2);
  assert.deepEqual(vistos[0], msg);
  assert.equal(ponte.temMapa, true);
  assert.deepEqual([...new Set(Canal.escritos)], [`sala:${SALA}:atlas:projetor`]);
});

test('{ blobId } vira o Blob; o blob que chega depois também', async () => {
  const { emitir, chegouBlob, ponte, vistos } = montar();
  const png = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' });
  chegouBlob('h1', png);
  emitir({ tipo: 'canal', nome: 'atlas:projetor:remoto', msg: { tipo: 'retrato', id: 'r1', blob: { blobId: 'h1' } } });
  emitir({ tipo: 'canal', nome: 'atlas:projetor:remoto', msg: { tipo: 'inspecao', nome: 'Carta', normal: { blobId: 'h2' }, uv: null } });
  emitir({ tipo: 'canal', nome: 'atlas:projetor:remoto', msg: { tipo: 'letreiro-fim' } });
  await new Promise(r => setTimeout(r, 5));
  assert.equal(vistos.length, 1, 'a inspeção espera o blob h2 e segura a fila (a ordem importa)');
  assert.equal((vistos[0] as { blob: Blob }).blob, png);
  const h2 = new Blob([new Uint8Array([9])], { type: 'image/png' });
  chegouBlob('h2', h2);
  await ponte.esvaziar();
  assert.equal(vistos.length, 3);
  assert.equal((vistos[1] as { normal: Blob }).normal, h2);
  assert.equal((vistos[1] as { uv: unknown }).uv, null);
  assert.equal((vistos[2] as { tipo: string }).tipo, 'letreiro-fim');
});

test('o blob que não chega em 15 s derruba a mensagem, com aviso, e a fila segue', async () => {
  const agendadas: Array<{ f: () => void; ms: number }> = [];
  const { emitir, ponte, vistos, avisos } = montar({ agendar: (f, ms) => { const a = { f, ms }; agendadas.push(a); return () => { a.f = () => {}; }; } });
  emitir({ tipo: 'canal', nome: 'atlas:projetor:remoto', msg: { tipo: 'retrato', id: 'r1', blob: { blobId: 'sumiu' } } });
  emitir({ tipo: 'canal', nome: 'atlas:projetor:remoto', msg: { tipo: 'letreiro-fim' } });
  await Promise.resolve();
  assert.equal(agendadas[0]!.ms, PRAZO_DO_BLOB_MS);
  assert.equal(PRAZO_DO_BLOB_MS, 15_000);
  agendadas[0]!.f();
  await ponte.esvaziar();
  assert.deepEqual(vistos, [{ tipo: 'letreiro-fim' }]);
  assert.equal(avisos.length, 1);
  assert.match(avisos[0]!, /sumiu/);
});

test('o estado comprimido é descomprimido antes de postar (blob antes ou depois)', async () => {
  const { emitir, chegouBlob, ponte, vistos } = montar();
  const completo = { tipo: 'estado', doc: { id: 'grande', nome: 'x'.repeat(50) }, versao: 7 };
  const blob = await comprimirEstado(completo);
  emitir({ tipo: 'canal', nome: 'atlas:projetor:remoto', msg: { tipo: 'estado', blobId: 'estado:grande:7', versao: 7, comprimido: true } });
  chegouBlob('estado:grande:7', blob);
  await ponte.esvaziar();
  assert.deepEqual(vistos, [completo]);
  chegouBlob('estado:grande:8', await comprimirEstado({ ...completo, versao: 8 }));
  emitir({ tipo: 'canal', nome: 'atlas:projetor:remoto', msg: { tipo: 'estado', blobId: 'estado:grande:8', versao: 8, comprimido: true } });
  await ponte.esvaziar();
  assert.equal((vistos[1] as { versao: number }).versao, 8);
});

test('o ultimoEstado do bem-vindo também chega, e um "ola" do projetor recebe o último estado e a câmera', async () => {
  const { emitir, ponte, vistos, projetor, enviadas } = montar();
  emitir({ tipo: 'bem-vindo', eu, membros: [], fichas: [], ultimoEstado: { 'atlas:projetor:remoto': { tipo: 'estado', doc: { id: 'm' }, versao: 2 } } });
  await ponte.esvaziar();
  assert.equal(vistos.length, 1);
  emitir({ tipo: 'canal', nome: 'atlas:projetor:remoto', msg: { tipo: 'camera', caixa: { x0: 0, y0: 0, x1: 2, y1: 2 } } });
  await ponte.esvaziar();
  vistos.length = 0;
  projetor.postMessage({ tipo: 'ola', largura: 800, altura: 600 });
  assert.deepEqual(vistos.map(v => (v as { tipo: string }).tipo), ['estado', 'camera']);
  assert.deepEqual(enviadas, [], 'a mensagem do projetor não sai para a sala');
  projetor.postMessage({ tipo: 'tamanho', largura: 1, altura: 1 });
  projetor.postMessage({ tipo: 'tchau' });
  projetor.postMessage({ tipo: 'soltou' });
  assert.deepEqual(enviadas, []);
});

test('evento da sala vai ao canal local de eventos da sala, com o autor', () => {
  const { emitir, eventos } = montar();
  const outro = new Canal(`sala:${SALA}:mesa:eventos`);
  const vistos: unknown[] = [];
  outro.onmessage = ({ data }) => vistos.push(data);
  const envelope = { ...base, tipo: 'ficha.rolagem', id: 'e1', autor };
  emitir({ tipo: 'evento', envelope });
  assert.deepEqual(vistos, [envelope]);
  void eventos;
});

test('só saem os eventos permitidos a jogador e sem autor', () => {
  const { enviadas, eventos } = montar();
  const outro = new Canal(`sala:${SALA}:mesa:eventos`);
  void eventos;
  for (const tipo of ['ficha.rolagem', 'ficha.recursos', 'atlas.mover-peca']) outro.postMessage({ ...base, tipo, id: `ok-${tipo}` });
  assert.equal(enviadas.length, 3);
  outro.postMessage({ ...base, tipo: 'atlas.focar', id: 'x1' });
  outro.postMessage({ ...base, tipo: 'sala.membros', id: 'x2' });
  outro.postMessage({ ...base, tipo: 'ficha.rolagem', id: 'x3', autor });
  outro.postMessage({ tipo: 'ficha.rolagem' });
  assert.equal(enviadas.length, 3);
  assert.equal(eventoPodeSair({ ...base, tipo: 'ficha.rolagem', id: 'a' }), true);
  assert.equal(eventoPodeSair({ ...base, tipo: 'ficha.rolagem', id: 'a', autor: undefined }), false);
});

test('a ponte do jogador nunca abre nem escreve nos canais do mestre', async () => {
  const abertos: string[] = [];
  const { emitir, ponte } = montar({ criarCanal: n => { abertos.push(n); return new Canal(n); } });
  emitir({ tipo: 'canal', nome: 'atlas:projetor:ativo', msg: { tipo: 'letreiro-fim' } });
  emitir({ tipo: 'evento', envelope: { ...base, tipo: 'ficha.rolagem', id: 'e', autor } });
  await ponte.esvaziar();
  for (const n of [...abertos, ...Canal.escritos]) assert.ok(n.startsWith(`sala:${SALA}:`), n);
  for (const proibido of ['atlas:projetor:ativo', 'atlas:projetor:remoto', 'atlas:projetor:m', 'mesa:eventos']) assert.ok(!abertos.includes(proibido) && !Canal.escritos.includes(proibido));
  assert.throws(() => criarPonteDoJogador({ cliente: clienteFalso().cliente, salaId: SALA, criarCanal: n => { throw new Error(n); } }));
});

test('sem eco: com a ponte do mestre e a casca na mesma origem, nada do que a casca recebe volta para a sala', async () => {
  Canal.todos.clear(); Canal.escritos = [];
  const mestre = clienteFalso(), jogador = clienteFalso();
  const pm = criarPonte({ cliente: mestre.cliente, criarCanal: n => new Canal(n), nomeDaSala: 'teste-1', hash: async b => `h${b.byteLength}` });
  const pj = criarPonteDoJogador({ cliente: jogador.cliente, salaId: SALA, criarCanal: n => new Canal(n), aviso: () => {} });
  mestre.enviadas.length = 0;
  // o "iframe" do Atlas e o "Dossiê" ouvem e falam nos canais da sala, e "o mestre" local nos dele
  const projetor = new Canal(`sala:${SALA}:atlas:projetor`), eventos = new Canal(`sala:${SALA}:mesa:eventos`);
  const projetorDoMestre = new Canal('atlas:projetor:remoto'), eventosDoMestre = new Canal('mesa:eventos');
  const noMestre: unknown[] = [];
  projetorDoMestre.onmessage = ({ data }) => noMestre.push(data);
  eventosDoMestre.onmessage = ({ data }) => noMestre.push(data);
  projetor.onmessage = () => { projetor.postMessage({ tipo: 'tamanho', largura: 1, altura: 1 }); };
  eventos.onmessage = ({ data }) => eventos.postMessage({ ...(data as object), id: 'eco' });

  jogador.emitir({ tipo: 'canal', nome: 'atlas:projetor:remoto', msg: { tipo: 'estado', doc: { id: 'm' }, versao: 1 } });
  jogador.emitir({ tipo: 'canal', nome: 'atlas:projetor:remoto', msg: { tipo: 'camera', caixa: { x0: 0, y0: 0, x1: 1, y1: 1 } } });
  jogador.emitir({ tipo: 'evento', envelope: { ...base, tipo: 'ficha.rolagem', id: 'r1', autor } });
  projetor.postMessage({ tipo: 'ola', largura: 1, altura: 1 });
  await pj.esvaziar(); await pm.esvaziar();
  assert.deepEqual(mestre.enviadas, [], 'o cliente do mestre não recebeu nada');
  assert.deepEqual(jogador.enviadas, [], 'e o do jogador também não mandou nada à sala');
  assert.deepEqual(noMestre, [], 'os canais do mestre não ouviram nada');
  // o contrário: o que o mestre posta localmente só sai pela ponte do mestre
  eventosDoMestre.postMessage({ ...base, tipo: 'ficha.rolagem', id: 'm1' });
  assert.equal(mestre.enviadas.length, 1);
  assert.equal(jogador.enviadas.length, 0);
  pm.fechar(); pj.fechar();
});

// ---------- fichas (R11) ----------

const mestre = { discordId: '1', nome: 'Mestre', papel: 'mestre' as const };
const ficha = (id: string, extra: Record<string, unknown> = {}) => ({ id, name: id.toUpperCase(), ...extra });

/** O Dossiê em modo jogador: um barramento `ficha` no mesmo canal local da sala. */
function comDossie() {
  const m = montar();
  const dossie = criarBarramento({ app: 'ficha', campanhaId: null, criarCanal: () => new Canal(`sala:${SALA}:mesa:eventos`) });
  const fatos: Array<Record<string, any>> = [];
  dossie.ouvir('sala.ficha-atualizada', e => { fatos.push(e as unknown as Record<string, any>); });
  return { ...m, dossie, fatos };
}
const bemVindo = (fichas: unknown[], extra: Record<string, unknown> = {}) => ({ tipo: 'bem-vindo' as const, eu, membros: [{ ...mestre, personagem: null }], fichas, ultimoEstado: {}, ...extra }) as unknown as MensagemDaSala;

test('sala.fichas responde com as fichas do bem-vindo, os revs e quem é o jogador, mesmo se o pedido chega antes', async () => {
  const { dossie, emitir, ponte } = comDossie();
  const cedo = dossie.pedir('sala.fichas', {}, { prazoMs: 2000 });
  await new Promise(r => setTimeout(r, 5));
  emitir(bemVindo([ficha('a'), ficha('b')], { revs: { a: 3, b: 1 }, donos: { a: '2', b: '2' } }));
  const r = await cedo;
  assert.equal(r.ok, true);
  const d = (r as { resposta: any }).resposta;
  assert.deepEqual(d.fichas.map((f: { id: string }) => f.id), ['a', 'b']);
  assert.deepEqual(d.revs, { a: 3, b: 1 });
  assert.deepEqual(d.eu, { discordId: '2', nome: 'Ana' });
  const de_novo = await dossie.pedir('sala.fichas', {});
  assert.equal(de_novo.ok, true);
  ponte.fechar();
});

test('sala.salvar-ficha vira ficha.salvar com o rev mais recente que a ponte conhece', async () => {
  const { dossie, emitir, enviadas, ponte } = comDossie();
  emitir(bemVindo([ficha('a')], { revs: { a: 3 }, donos: { a: '2' } }));
  const r1 = await dossie.pedir('sala.salvar-ficha', { ficha: ficha('a', { pv: 1 }), rev: 0 });
  assert.equal(r1.ok, true);
  assert.deepEqual(enviadas, [{ tipo: 'ficha.salvar', ficha: ficha('a', { pv: 1 }), rev: 3 }], 'o rev do bem-vindo vale mais que o do Dossiê');
  emitir({ tipo: 'ficha.atualizada', ficha: ficha('a', { pv: 1 }), rev: 4, dono: '2' });
  await dossie.pedir('sala.salvar-ficha', { ficha: ficha('a', { pv: 2 }), rev: 0 });
  assert.equal((enviadas[1] as { rev: number }).rev, 4, 'o rev da ficha.atualizada');
  await dossie.pedir('sala.salvar-ficha', { ficha: ficha('nova'), rev: 0 });
  assert.equal((enviadas[2] as { rev: number }).rev, 0, 'ficha nova, rev 0');
  ponte.fechar();
});

test('ficha.atualizada da sala vira sala.ficha-atualizada no canal local, com o autor: o mestre, ou o próprio jogador no eco', async () => {
  const { dossie, emitir, fatos, ponte } = comDossie();
  emitir({ ...bemVindo([ficha('a', { pv: 5 })], { donos: { a: '2' } }) } as MensagemDaSala);
  emitir({ tipo: 'ficha.atualizada', ficha: ficha('a', { pv: 2 }), rev: 2, dono: '2' });
  assert.equal(fatos.length, 1);
  assert.equal(fatos[0]!.app, 'mesa');
  assert.deepEqual(fatos[0]!.dados, { ficha: ficha('a', { pv: 2 }), rev: 2 });
  assert.equal(fatos[0]!.autor.papel, 'mestre');
  assert.equal(fatos[0]!.autor.discordId, '1');
  // o eco da própria gravação: a ponte mandou essa ficha, então o autor é o jogador
  await dossie.pedir('sala.salvar-ficha', { ficha: ficha('a', { pv: 1 }), rev: 2 });
  emitir({ tipo: 'ficha.atualizada', ficha: ficha('a', { pv: 1 }), rev: 3, dono: '2', conflito: true });
  assert.equal(fatos[1]!.autor.discordId, '2');
  assert.equal(fatos[1]!.autor.papel, 'jogador');
  assert.deepEqual(fatos[1]!.autor.fichas, ['a']);
  assert.equal(fatos[1]!.dados.conflito, true);
  ponte.fechar();
});

test('os pedidos de ficha e as respostas ficam só no canal da sala, e nada disso vai para a sala', async () => {
  const { dossie, emitir, enviadas, ponte } = comDossie();
  emitir(bemVindo([ficha('a')], { donos: { a: '2' } }));
  await dossie.pedir('sala.fichas', {});
  emitir({ tipo: 'ficha.atualizada', ficha: ficha('a', { pv: 9 }), rev: 2, dono: '2' });
  assert.ok(Canal.escritos.every(n => n.startsWith(`sala:${SALA}:`)), [...new Set(Canal.escritos)].join());
  assert.deepEqual(enviadas, [], 'só o sala.salvar-ficha vira ficha.salvar');
  // uma rolagem do Dossiê continua saindo
  dossie.emitir('ficha.rolagem', { ficha: { app: 'ficha', tipo: 'ficha', id: 'a' }, titulo: 'Luta', total: 12 });
  assert.equal(enviadas.length, 1);
  assert.equal((enviadas[0] as unknown as { tipo: string }).tipo, 'evento');
  ponte.fechar();
});

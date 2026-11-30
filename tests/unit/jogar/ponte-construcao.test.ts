import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_ATIVIDADES,
  MAX_NOTAS,
  PRAZO_DO_BLOB_MS,
  canalConstrucaoDaSala,
  corDoColaborador,
  criarPonteConstrucao,
  enderecoDaConstrucaoRemota,
  enderecoDoAtlasNoModo,
  formatarHora,
  resumoDaFicha,
  type AtividadeConstrucao,
} from '../../../src/jogar/ponte-construcao.ts';
import type { CanalLocal } from '../../../src/jogar/ponte-jogador.ts';
import { LIMITE_ESTADO_BYTES, comprimirEstado } from '../../../src/online/estado-comprimido.ts';
import type { ClienteDaSala } from '../../../src/online/cliente.ts';
import type { Autor, Eu, MensagemDaSala, MensagemParaSala, NotaConstrucao } from '../../../src/online/protocolo.ts';

class Canal implements CanalLocal {
  static todos = new Map<string, Canal[]>();
  static escritos: string[] = [];
  onmessage: CanalLocal['onmessage'] = null;
  nome: string;
  constructor(nome: string) {
    this.nome = nome;
    Canal.todos.set(nome, [...(Canal.todos.get(nome) ?? []), this]);
  }
  postMessage(m: unknown) {
    Canal.escritos.push(this.nome);
    for (const c of Canal.todos.get(this.nome) ?? []) {
      if (c !== this) c.onmessage?.({ data: m });
    }
  }
  close() {
    Canal.todos.set(this.nome, (Canal.todos.get(this.nome) ?? []).filter(c => c !== this));
  }
}

function clienteFalso() {
  const ouvintes = new Map<string, Array<(m: never) => void>>();
  let ouvintesBlob: Array<(id: string, b: Blob) => void> = [];
  const enviadas: MensagemParaSala[] = [];
  const blobsEnviados: Array<{ id: string; blob: Blob }> = [];
  const c = {
    estado: 'aberta' as const,
    enviar(m: MensagemParaSala) {
      enviadas.push(m);
      return true;
    },
    ouvir(tipo: string, f: (m: never) => void) {
      ouvintes.set(tipo, [...(ouvintes.get(tipo) ?? []), f]);
      return () => {
        ouvintes.set(tipo, (ouvintes.get(tipo) ?? []).filter(x => x !== f));
      };
    },
    aoMudarEstado() { return () => {}; },
    async enviarBlob(id: string, blob: Blob) {
      blobsEnviados.push({ id, blob });
      return true;
    },
    ouvirBlob(f: (id: string, b: Blob) => void) {
      ouvintesBlob.push(f);
      return () => {
        ouvintesBlob = ouvintesBlob.filter(x => x !== f);
      };
    },
    fechar() {},
  };
  const emitir = (m: MensagemDaSala) => {
    for (const f of ouvintes.get(m.tipo) ?? []) f(m as never);
  };
  const chegouBlob = (id: string, b: Blob) => {
    for (const f of ouvintesBlob) f(id, b);
  };
  return { cliente: c as unknown as ClienteDaSala, enviadas, blobsEnviados, emitir, chegouBlob };
}

const SALA = 'sala-construcao-1';
const euJogador: Eu = { discordId: '222', nome: 'Ana', papel: 'jogador' };
const autorMestre: Autor = { discordId: '111', nome: 'Mestre', papel: 'mestre', fichas: [] };
const autorAna: Autor = { discordId: '222', nome: 'Ana', papel: 'jogador', fichas: [] };

function montar(extra: Partial<Parameters<typeof criarPonteConstrucao>[0]> = {}) {
  Canal.todos.clear();
  Canal.escritos = [];
  const f = clienteFalso();
  const avisos: string[] = [];
  const atividadesVistas: AtividadeConstrucao[][] = [];
  const notasVistas: NotaConstrucao[][] = [];
  const ponte = criarPonteConstrucao({
    cliente: f.cliente,
    salaId: SALA,
    criarCanal: n => new Canal(n),
    agora: () => 1_700_000_000_000,
    aviso: t => avisos.push(t),
    aoMudarAtividades: a => atividadesVistas.push(a),
    aoMudarNotas: n => notasVistas.push(n),
    ...extra,
  });
  const atlas = new Canal(canalConstrucaoDaSala(SALA));
  const vistos: Array<Record<string, unknown>> = [];
  atlas.onmessage = ({ data }) => vistos.push(data as Record<string, unknown>);
  return { ...f, ponte, atlas, vistos, avisos, atividadesVistas, notasVistas };
}

test('ida e volta de construcao.comando e construcao.aplicada sem eco, alimentando atividades', async () => {
  const { emitir, enviadas, ponte, atlas, vistos, atividadesVistas } = montar();
  emitir({ tipo: 'bem-vindo', eu: euJogador, membros: [], fichas: [], ultimoEstado: {} });
  emitir({
    tipo: 'construcao.estado',
    mapa: { id: 'm1', name: 'Mansão' },
    rev: 0,
    ops: [
      { rev: 1, opId: 'op-0', autor: autorMestre, comandos: [{ tipo: 'comodo.criar' }], rotulo: 'Criar sala', em: 1000 },
    ],
    nome: 'Mansão',
  });
  await ponte.esvaziar();

  assert.equal(vistos.length, 1);
  assert.equal(vistos[0]?.tipo, 'construcao.estado');
  assert.equal(vistos[0]?.rev, 0);
  assert.equal(vistos[0]?.nome, 'Mansão');
  assert.deepEqual(vistos[0]?.eu, euJogador);
  assert.equal(atividadesVistas.at(-1)?.length, 1);
  assert.equal(atividadesVistas.at(-1)?.[0]?.rotulo, 'Criar sala');

  // Atlas envia comando local (sem autor) -> sai para a sala
  atlas.postMessage({
    tipo: 'construcao.comando',
    baseRev: 1,
    opId: 'op-1',
    comandos: [{ tipo: 'item.adicionar', id: 'mesa' }],
    rotulo: 'Adicionar mesa',
  });
  assert.deepEqual(enviadas, [{
    tipo: 'construcao.comando',
    baseRev: 1,
    opId: 'op-1',
    comandos: [{ tipo: 'item.adicionar', id: 'mesa' }],
    rotulo: 'Adicionar mesa',
  }]);

  // Mensagem com autor (eco da própria sala ou de outro participante no canal) NÃO volta para a sala
  atlas.postMessage({
    tipo: 'construcao.comando',
    baseRev: 1,
    opId: 'op-eco',
    autor: autorAna,
    comandos: [{ tipo: 'item.adicionar', id: 'eco' }],
  });
  assert.equal(enviadas.length, 1);

  // Sala confirma com construcao.aplicada -> entrega ao Atlas e atualiza lista de atividades (mais recente no topo)
  emitir({
    tipo: 'construcao.aplicada',
    rev: 2,
    opId: 'op-1',
    autor: autorAna,
    comandos: [{ tipo: 'item.adicionar', id: 'mesa' }],
    rotulo: 'Adicionar mesa',
  });
  await ponte.esvaziar();

  assert.equal(vistos.length, 2);
  assert.equal(vistos[1]?.tipo, 'construcao.aplicada');
  assert.equal(vistos[1]?.rev, 2);
  const atvs = atividadesVistas.at(-1)!;
  assert.equal(atvs.length, 2);
  assert.equal(atvs[0]?.rev, 2);
  assert.equal(atvs[0]?.rotulo, 'Adicionar mesa');
  assert.equal(atvs[1]?.rev, 1);

  ponte.fechar();
});

test('limite de MAX_ATIVIDADES (50) é respeitado ao acumular construcao.aplicada', async () => {
  const { emitir, ponte, atividadesVistas } = montar();
  emitir({ tipo: 'construcao.estado', mapa: { id: 'm1', name: 'Mapa' }, rev: 0, ops: [] });
  for (let i = 1; i <= MAX_ATIVIDADES + 10; i++) {
    emitir({
      tipo: 'construcao.aplicada',
      rev: i,
      opId: `op-${i}`,
      autor: autorAna,
      comandos: [{ tipo: 'terreno.pintar' }],
      rotulo: `Pintura ${i}`,
    });
  }
  await ponte.esvaziar();
  const ultimas = atividadesVistas.at(-1)!;
  assert.equal(ultimas.length, MAX_ATIVIDADES);
  assert.equal(ultimas[0]?.rev, MAX_ATIVIDADES + 10);
  assert.equal(ultimas.at(-1)?.rev, 11);
  ponte.fechar();
});

test('construcao.cursor atravessa nos dois sentidos sem eco', () => {
  const { emitir, enviadas, ponte, atlas, vistos } = montar();
  atlas.postMessage({ tipo: 'construcao.cursor', x: 10, y: 20, levelId: null, ferramenta: 'parede', pintando: true });
  assert.deepEqual(enviadas, [{ tipo: 'construcao.cursor', x: 10, y: 20, levelId: null, ferramenta: 'parede', pintando: true }]);

  // Cursor com autor (vindo da sala) não é reenviado
  atlas.postMessage({ tipo: 'construcao.cursor', autor: autorMestre, x: 5, y: 5, levelId: 'a1', ferramenta: 'selecionar' });
  assert.equal(enviadas.length, 1);

  emitir({ tipo: 'construcao.cursor', autor: autorMestre, x: 30, y: 40, levelId: 'andar-2', ferramenta: 'pincel', pintando: false });
  assert.deepEqual(vistos, [{ tipo: 'construcao.cursor', autor: autorMestre, x: 30, y: 40, levelId: 'andar-2', ferramenta: 'pincel', pintando: false }]);
  ponte.fechar();
});

test('construcao.estado comprimido via blobId pede blob, aguarda e descomprime antes de entregar', async () => {
  const { emitir, enviadas, chegouBlob, ponte, vistos } = montar();
  const mapaGrande = { id: 'm-grande', name: 'Catedral', conteudo: 'x'.repeat(200) };
  const blob = await comprimirEstado(mapaGrande);

  emitir({
    tipo: 'construcao.estado',
    blobId: 'construcao:12',
    nome: 'Catedral',
    rev: 12,
    ops: [],
  });
  // Enquanto o blob não chega, construcao.aplicada espera na fila
  emitir({
    tipo: 'construcao.aplicada',
    rev: 13,
    opId: 'op-13',
    autor: autorMestre,
    comandos: [{ tipo: 'luz.adicionar' }],
    rotulo: 'Adicionar luz',
  });

  await new Promise(r => setTimeout(r, 5));
  assert.deepEqual(enviadas, [{ tipo: 'blob.pedir', id: 'construcao:12' }]);
  assert.equal(vistos.length, 0);

  chegouBlob('construcao:12', blob);
  await ponte.esvaziar();

  assert.equal(vistos.length, 2);
  assert.equal(vistos[0]?.tipo, 'construcao.estado');
  assert.deepEqual(vistos[0]?.mapa, mapaGrande);
  assert.equal(vistos[1]?.tipo, 'construcao.aplicada');
  assert.equal(vistos[1]?.rev, 13);
  assert.deepEqual(ponte.mapaParaDownload(), { mapa: mapaGrande, nome: 'Catedral', rev: 12 });
  ponte.fechar();
});

test('construcao.estado com blob que estoura prazo é descartado com aviso', async () => {
  const agendadas: Array<{ f: () => void; ms: number }> = [];
  const { emitir, ponte, vistos, avisos } = montar({
    agendar: (f, ms) => {
      const a = { f, ms };
      agendadas.push(a);
      return () => { a.f = () => {}; };
    },
  });
  emitir({ tipo: 'construcao.estado', blobId: 'construcao:sumiu', rev: 1, ops: [] });
  await Promise.resolve();
  assert.equal(agendadas[0]?.ms, PRAZO_DO_BLOB_MS);
  assert.equal(PRAZO_DO_BLOB_MS, 15_000);
  agendadas[0]?.f();
  await ponte.esvaziar();
  assert.equal(vistos.length, 0);
  assert.equal(avisos.length, 1);
  assert.match(avisos[0]!, /construcao:sumiu/);
  ponte.fechar();
});

test('construcao.snapshot pequeno envia direto e grande (> 256 KB) comprime e sobe como blob construcao:<rev>', async () => {
  const { enviadas, blobsEnviados, ponte, atlas } = montar();
  const mapaPequeno = { id: 'm1', name: 'Pequeno', rooms: {} };
  atlas.postMessage({ tipo: 'construcao.snapshot', rev: 5, mapa: mapaPequeno, nome: 'Pequeno' });
  await ponte.esvaziar();

  assert.equal(blobsEnviados.length, 0);
  assert.deepEqual(enviadas, [{ tipo: 'construcao.snapshot', rev: 5, mapa: mapaPequeno, nome: 'Pequeno' }]);
  assert.deepEqual(ponte.mapaParaDownload(), { mapa: mapaPequeno, nome: 'Pequeno', rev: 5 });

  enviadas.length = 0;
  const blocoGrande = 'a'.repeat(LIMITE_ESTADO_BYTES + 4096);
  const mapaGrande = { id: 'm1', name: 'Grande', notes: blocoGrande };
  atlas.postMessage({ tipo: 'construcao.snapshot', rev: 40, mapa: mapaGrande, nome: 'Grande' });
  await ponte.esvaziar();

  assert.equal(blobsEnviados.length, 1);
  assert.equal(blobsEnviados[0]?.id, 'construcao:40');
  assert.deepEqual(enviadas, [{ tipo: 'construcao.snapshot', rev: 40, blobId: 'construcao:40', nome: 'Grande' }]);
  assert.deepEqual(ponte.mapaParaDownload(), { mapa: mapaGrande, nome: 'Grande', rev: 40 });
  ponte.fechar();
});

test('construcao.nota envia com trim e deduplica na recepção até MAX_NOTAS', () => {
  const { emitir, enviadas, ponte, notasVistas } = montar();
  assert.equal(ponte.enviarNota('   '), false);
  assert.equal(enviadas.length, 0);

  assert.equal(ponte.enviarNota('  Fazer porta secreta no porão  '), true);
  assert.equal(enviadas.length, 1);
  const enviada = enviadas[0] as Extract<MensagemParaSala, { tipo: 'construcao.nota' }>;
  assert.equal(enviada.tipo, 'construcao.nota');
  assert.equal(enviada.texto, 'Fazer porta secreta no porão');
  assert.ok(enviada.id.length > 0);

  emitir({ tipo: 'construcao.nota', id: 'n1', autor: autorAna, texto: 'Primeira', em: 100 });
  emitir({ tipo: 'construcao.nota', id: 'n1', autor: autorAna, texto: 'Duplicada', em: 101 });
  assert.equal(notasVistas.at(-1)?.length, 1);
  assert.equal(notasVistas.at(-1)?.[0]?.texto, 'Primeira');

  for (let i = 2; i <= MAX_NOTAS + 5; i++) {
    emitir({ tipo: 'construcao.nota', id: `n${i}`, autor: autorMestre, texto: `Nota ${i}`, em: i * 10 });
  }
  const finais = notasVistas.at(-1)!;
  assert.equal(finais.length, MAX_NOTAS);
  assert.equal(finais[0]?.id, 'n6');
  assert.equal(finais.at(-1)?.id, `n${MAX_NOTAS + 5}`);
  ponte.fechar();
});

test('isolamento de prefixo de canal: nunca abre ou escreve em canais do mestre', async () => {
  const abertos: string[] = [];
  const { emitir, ponte, atlas } = montar({
    criarCanal: n => {
      abertos.push(n);
      return new Canal(n);
    },
  });
  emitir({ tipo: 'construcao.estado', mapa: { id: 'm1', name: 'Teste' }, rev: 0, ops: [] });
  atlas.postMessage({ tipo: 'construcao.cursor', x: 1, y: 2, levelId: null, ferramenta: 'selecionar' });
  await ponte.esvaziar();

  for (const n of [...abertos, ...Canal.escritos]) {
    assert.ok(n.startsWith(`sala:${SALA}:`), n);
  }
  for (const proibido of ['atlas:projetor:ativo', 'atlas:projetor:remoto', 'mesa:eventos', 'atlas:construcao']) {
    assert.ok(!abertos.includes(proibido) && !Canal.escritos.includes(proibido));
  }
  assert.throws(() => criarPonteConstrucao({
    cliente: clienteFalso().cliente,
    salaId: SALA,
    criarCanal: n => { throw new Error(n); },
  }));
  ponte.fechar();
});

test('atlas-construcao.pronto envia identidade e reentrega estado em cache ou pede ressincronizar', async () => {
  const { emitir, enviadas, ponte, atlas, vistos } = montar();

  // Sem estado ainda -> pede ressincronizar
  atlas.postMessage({ tipo: 'atlas-construcao.pronto' });
  assert.deepEqual(enviadas, [{ tipo: 'construcao.ressincronizar' }]);

  // Chega bem-vindo depois que o canal já está pronto -> envia identidade
  emitir({ tipo: 'bem-vindo', eu: euJogador, membros: [], fichas: [], ultimoEstado: {} });
  assert.deepEqual(vistos, [{ tipo: 'construcao.identidade', discordId: euJogador.discordId }]);

  // Chega estado + aplicada -> acumula ops
  emitir({ tipo: 'construcao.estado', mapa: { id: 'm1', name: 'Base' }, rev: 0, ops: [] });
  emitir({
    tipo: 'construcao.aplicada',
    rev: 1,
    opId: 'op-1',
    autor: autorMestre,
    comandos: [{ tipo: 'comodo.criar' }],
    rotulo: 'Sala',
  });
  await ponte.esvaziar();
  vistos.length = 0;
  enviadas.length = 0;

  // Iframe recarrega / reenvia pronto -> recebe identidade e estado com ops acumuladas, sem pedir ressincronizar
  atlas.postMessage({ tipo: 'atlas-construcao.pronto' });
  assert.deepEqual(enviadas, []);
  assert.equal(vistos.length, 2);
  assert.deepEqual(vistos[0], { tipo: 'construcao.identidade', discordId: euJogador.discordId });
  const estadoReentregue = vistos[1] as Record<string, unknown>;
  assert.equal(estadoReentregue.tipo, 'construcao.estado');
  assert.equal((estadoReentregue.ops as unknown[]).length, 1);

  // Fechamento limpa o cache e avisa o Atlas
  emitir({ tipo: 'construcao.fechada' });
  await ponte.esvaziar();
  assert.equal(vistos.at(-1)?.tipo, 'construcao.fechada');
  assert.equal(ponte.mapaParaDownload(), null);
  ponte.fechar();
});

test('enderecoDoAtlasNoModo alterna entre projetor-remoto e construir-remoto e corDoColaborador bate com pings do Atlas', () => {
  assert.equal(enderecoDaConstrucaoRemota('/atlas/', 'sala 1'), '/atlas/#/construir-remoto/sala%201');
  assert.equal(enderecoDoAtlasNoModo('sessao', '/atlas/', 'sala-1'), '/atlas/#/projetor-remoto/sala-1');
  assert.equal(enderecoDoAtlasNoModo('construcao', '/atlas/', 'sala-1'), '/atlas/#/construir-remoto/sala-1');

  assert.equal(corDoColaborador('qualquer', 'mestre'), '#f59e0b');
  const corJogadorA = corDoColaborador('123456', 'jogador');
  const corJogadorB = corDoColaborador('123456', 'jogador');
  assert.equal(corJogadorA, corJogadorB);
  assert.ok(['#38bdf8', '#34d399', '#a78bfa', '#fb7185', '#22d3ee', '#a3e635', '#f472b6', '#60a5fa'].includes(corJogadorA));
});

test('helpers puros de PainelConstrucao: resumoDaFicha e formatarHora', () => {
  assert.equal(
    resumoDaFicha({ id: 'f1', name: 'Arthur', systemMode: 'original', classeId: 'combatente', nex: 45, pv: 60, maxPv: 80, san: 32, maxSan: 40 }),
    'Combatente · NEX 45% · PV 60/80 · SAN 32/40',
  );
  assert.equal(
    resumoDaFicha({ id: 'f2', name: 'Mia', systemMode: 'ordem2', pv: 20, maxPv: 22, pd: 10, maxPd: 12 }),
    'PV 20/22 · PD 10/12',
  );
  assert.equal(
    resumoDaFicha({ id: 'f3', name: 'Zumbi', systemMode: 'threat', vd: 20, pv: 45, maxPv: 45 }),
    'VD 20 · PV 45/45',
  );
  assert.match(formatarHora(new Date(2026, 0, 1, 9, 5).getTime()), /^09:05$/);
});

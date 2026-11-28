import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  criarEstado, ErroEstado, LIMITE_NOTA_CONSTRUCAO_BYTES, LIMITE_SNAPSHOT_CONSTRUCAO_BYTES,
  MAX_NOTAS_CONSTRUCAO, MAX_PEDACOS_CONSTRUCAO,
} from '../../../sala/estado.ts';
import {
  bemVindo, blobConstrucaoParaQuemChega, blobsParaQuemChega, construcaoParaQuemChega, MAX_CURSORES_POR_SEGUNDO,
  tratar, tratarBinario,
} from '../../../sala/mensagens.ts';
import { permitido } from '../../../sala/permissoes.ts';
import {
  codificarPedaco, LIMITE_OP_CONSTRUCAO_BYTES, MAX_COMANDOS_POR_OP, type Eu,
} from '../../../src/online/protocolo.ts';
import { sqlEmMemoria } from './sql-teste.ts';

const mestre: Eu = { discordId: 'M', nome: 'Mestre', papel: 'mestre' };
const ana: Eu = { discordId: 'A', nome: 'Ana', papel: 'jogador' };
const bia: Eu = { discordId: 'B', nome: 'Bia', papel: 'jogador' };
const todos = [mestre, ana, bia];
const j = (o: unknown) => JSON.stringify(o);

function sala() {
  const e = criarEstado(sqlEmMemoria());
  e.iniciar('M', 'Campanha');
  return e;
}

const erros = (saidas: ReturnType<typeof tratar>) => saidas.map(s => s.msg).filter(m => m.tipo === 'erro');

test('modo da sala: padrão sessao, só o mestre alterna, persiste e preserva estado de sessão e construção', () => {
  const e = sala();
  assert.equal(e.modo(), 'sessao');
  assert.equal(bemVindo(e, ana, todos).construcao?.temMapa, false);

  // Jogador não alterna modo
  assert.deepEqual(erros(tratar(e, ana, j({ tipo: 'sala.modo', modo: 'construcao' }), 1, todos)), [
    { tipo: 'erro', motivo: 'permissao', recusado: 'sala.modo' },
  ]);
  assert.equal(e.modo(), 'sessao');

  // Dados da sessão e ficha antes de entrar em construção
  e.salvarFicha({ id: 'f1', nome: 'Lia' }, 'A', 0, 1);
  e.escolherPersonagem('A', 'f1');
  tratar(e, mestre, j({ tipo: 'canal', nome: 'atlas:projetor:remoto', msg: { tipo: 'estado', doc: { id: 'sessao-1' } } }), 2, todos);

  // Mestre alterna para construção
  const s = tratar(e, mestre, j({ tipo: 'sala.modo', modo: 'construcao' }), 3, todos);
  assert.equal(s.length, 1);
  assert.equal(s[0]?.destino, 'todos');
  assert.deepEqual(s[0]?.msg, { tipo: 'config', config: { nome: 'Campanha', dono: 'M', modo: 'construcao' } });
  assert.equal(e.modo(), 'construcao');

  // Abre mapa em construção e volta para sessão sem apagar nada de nenhum lado
  tratar(e, mestre, j({ tipo: 'construcao.abrir', mapa: { id: 'c1', name: 'Taverna' } }), 4, todos);
  tratar(e, mestre, j({ tipo: 'sala.modo', modo: 'sessao' }), 5, todos);
  assert.equal(e.modo(), 'sessao');
  assert.equal(e.ficha('f1')?.ficha.nome, 'Lia');
  assert.equal(e.personagem('A'), 'f1');
  assert.deepEqual(e.ultimoEstado(), { 'atlas:projetor:remoto': { tipo: 'estado', doc: { id: 'sessao-1' } } });
  assert.equal(e.temMapaConstrucao(), true);
  assert.deepEqual(e.resumoConstrucao(), { temMapa: true, nome: 'Taverna', rev: 0 });
});

test('permissões de construção: abrir/fechar só do mestre; comandos/snapshot/cursor exigem modo construcao e mapa aberto', () => {
  const e = sala();
  const cmd = j({ tipo: 'construcao.comando', baseRev: 0, opId: 'op1', comandos: [{ tipo: 'mapa.renomear', nome: 'X' }] });
  const snap = j({ tipo: 'construcao.snapshot', rev: 0, mapa: { id: 'm' } });
  const cursor = j({ tipo: 'construcao.cursor', x: 1, y: 2, levelId: null, ferramenta: 'pincel' });
  const resync = j({ tipo: 'construcao.ressincronizar' });
  const nota = j({ tipo: 'construcao.nota', id: 'n1', texto: 'oi' });

  // Em sessao, tudo de construção é recusado (inclusive para mestre)
  for (const quem of [ana, mestre]) {
    for (const payload of [cmd, snap, cursor, resync, nota]) {
      const m = erros(tratar(e, quem, payload, 1, todos));
      assert.equal(m.length, 1);
      assert.equal((m[0] as { motivo: string }).motivo, 'permissao');
    }
  }

  // Jogador não abre nem fecha mapa
  tratar(e, mestre, j({ tipo: 'sala.modo', modo: 'construcao' }), 2, todos);
  assert.deepEqual(erros(tratar(e, ana, j({ tipo: 'construcao.abrir', mapa: { id: 'm1' } }), 3, todos)), [
    { tipo: 'erro', motivo: 'permissao', recusado: 'construcao.abrir' },
  ]);
  assert.deepEqual(erros(tratar(e, ana, j({ tipo: 'construcao.fechar' }), 4, todos)), [
    { tipo: 'erro', motivo: 'permissao', recusado: 'construcao.fechar' },
  ]);

  // Em construcao mas sem mapa aberto: comando, snapshot e cursor são recusados; nota funciona e resync devolve fechada
  for (const payload of [cmd, snap, cursor]) {
    assert.deepEqual(erros(tratar(e, ana, payload, 5, todos)).map(x => (x as { motivo: string }).motivo), ['permissao']);
  }
  assert.equal(tratar(e, ana, resync, 6, todos)[0]?.msg.tipo, 'construcao.fechada');
  assert.equal(tratar(e, ana, nota, 7, todos)[0]?.msg.tipo, 'construcao.nota');
  assert.equal(permitido({ tipo: 'construcao.abrir', mapa: {} }, mestre, e), true);
  assert.equal(permitido({ tipo: 'construcao.abrir', mapa: {} }, ana, e), false);
});

test('construcao.comando serializa com rev monotônica, carimba autor e espalha para todos', () => {
  const e = sala();
  e.salvarFicha({ id: 'f-ana' }, 'A', 0, 1);
  tratar(e, mestre, j({ tipo: 'sala.modo', modo: 'construcao' }), 1, todos);

  const abriu = tratar(e, mestre, j({ tipo: 'construcao.abrir', mapa: { id: 'm1', name: 'Masmorra' } }), 2, todos);
  assert.equal(abriu[0]?.destino, 'todos');
  assert.deepEqual(abriu[0]?.msg, {
    tipo: 'construcao.estado',
    mapa: { id: 'm1', name: 'Masmorra' },
    nome: 'Masmorra',
    rev: 0,
    ops: [],
  });

  const s1 = tratar(
    e,
    ana,
    j({ tipo: 'construcao.comando', baseRev: 0, opId: 'op-a', comandos: [{ tipo: 'terreno.pintar', material: 'pedra', celulas: [[1, 1]] }], rotulo: 'Pintar terreno' }),
    10,
    todos,
  );
  assert.equal(s1[0]?.destino, 'todos');
  assert.deepEqual(s1[0]?.msg, {
    tipo: 'construcao.aplicada',
    rev: 1,
    opId: 'op-a',
    autor: { discordId: 'A', nome: 'Ana', papel: 'jogador', fichas: ['f-ana'] },
    comandos: [{ tipo: 'terreno.pintar', material: 'pedra', celulas: [[1, 1]] }],
    rotulo: 'Pintar terreno',
  });

  const s2 = tratar(
    e,
    bia,
    j({ tipo: 'construcao.comando', baseRev: 0, opId: 'op-b', comandos: [{ tipo: 'item.adicionar', colecao: 'props', item: { id: 'mesa-1' } }] }),
    11,
    todos,
  );
  assert.equal(s2[0]?.destino, 'todos');
  assert.deepEqual(s2[0]?.msg, {
    tipo: 'construcao.aplicada',
    rev: 2,
    opId: 'op-b',
    autor: { discordId: 'B', nome: 'Bia', papel: 'jogador', fichas: [] },
    comandos: [{ tipo: 'item.adicionar', colecao: 'props', item: { id: 'mesa-1' } }],
  });

  const estado = e.estadoConstrucao()!;
  assert.equal(estado.rev, 0);
  assert.deepEqual(estado.ops.map(o => [o.rev, o.opId, o.autor.discordId]), [
    [1, 'op-a', 'A'],
    [2, 'op-b', 'B'],
  ]);
  assert.deepEqual(e.resumoConstrucao(), { temMapa: true, nome: 'Masmorra', rev: 2 });
});

test('construcao.snapshot compacta ops <= rev, mantém posteriores e só aceita rev maior', () => {
  const e = sala();
  tratar(e, mestre, j({ tipo: 'sala.modo', modo: 'construcao' }), 1, todos);
  tratar(e, mestre, j({ tipo: 'construcao.abrir', mapa: { id: 'm1', v: 0 }, nome: 'Castelo' }), 2, todos);

  for (let i = 1; i <= 3; i++) {
    tratar(e, ana, j({ tipo: 'construcao.comando', baseRev: i - 1, opId: `op-${i}`, comandos: [{ tipo: 'x', i }] }), 10 + i, todos);
  }

  // Compacta até rev = 2: ops 1 e 2 somem, op 3 fica
  const res = tratar(e, bia, j({ tipo: 'construcao.snapshot', rev: 2, mapa: { id: 'm1', v: 2 } }), 20, todos);
  assert.deepEqual(res, []);
  const est = e.estadoConstrucao()!;
  assert.equal(est.rev, 2);
  assert.equal(est.nome, 'Castelo');
  assert.deepEqual(est.mapa, { id: 'm1', v: 2 });
  assert.deepEqual(est.ops.map(o => o.rev), [3]);

  // Próxima op continua em rev = 4
  const s4 = tratar(e, ana, j({ tipo: 'construcao.comando', baseRev: 3, opId: 'op-4', comandos: [{ tipo: 'x', i: 4 }] }), 21, todos);
  assert.equal((s4[0]?.msg as { rev: number }).rev, 4);

  // Snapshot atrasado (rev = 1 ou 2) ou impossível (rev = 99) é ignorado
  assert.equal(e.salvarSnapshotConstrucao({ rev: 1, mapa: { id: 'velho' } }), false);
  assert.equal(e.salvarSnapshotConstrucao({ rev: 2, mapa: { id: 'repetido' } }), false);
  assert.equal(e.salvarSnapshotConstrucao({ rev: 99, mapa: { id: 'futuro' } }), false);
  assert.deepEqual(e.estadoConstrucao()?.mapa, { id: 'm1', v: 2 });
});

test('blobs de construção: jogadores sobem construcao:<rev> em construcao, blobsPedidos/blobsParaQuemChega entregam e antigos são limpos', () => {
  const e = sala();
  const pedaco = (id: string, bytes = new Uint8Array([1, 2, 3])) =>
    codificarPedaco({ id, i: 0, n: 1, tipo: 'application/gzip' }, bytes);

  // Em sessao, jogador não anuncia nem manda binário construcao:
  assert.equal(erros(tratar(e, ana, j({ tipo: 'blob', id: 'construcao:0', tipoMime: 'application/gzip' }), 1, todos)).length, 1);
  assert.equal(tratarBinario(e, ana, pedaco('construcao:0')).saidas.length, 1);

  // Mestre entra em construcao e abre com blob construcao:0
  tratar(e, mestre, j({ tipo: 'sala.modo', modo: 'construcao' }), 2, todos);
  assert.equal(tratar(e, mestre, j({ tipo: 'blob', id: 'construcao:0', tipoMime: 'application/gzip' }), 3, todos)[0]?.destino, 'outros');
  assert.equal(tratarBinario(e, mestre, pedaco('construcao:0', new Uint8Array([10]))).repassar, true);
  tratar(e, mestre, j({ tipo: 'construcao.abrir', blobId: 'construcao:0', nome: 'Grande' }), 4, todos);

  assert.equal(e.blobsPedidos().includes('construcao:0'), true);
  assert.deepEqual(blobsParaQuemChega(e).map(b => b.anuncio.id), ['construcao:0']);
  assert.deepEqual(blobConstrucaoParaQuemChega(e).map(b => b.anuncio.id), ['construcao:0']);

  // Jogador não pode subir blob fora do prefixo construcao:
  assert.equal(erros(tratar(e, ana, j({ tipo: 'blob', id: 'outro:1', tipoMime: 'image/png' }), 5, todos)).length, 1);
  assert.equal(tratarBinario(e, ana, pedaco('outro:1')).repassar, false);

  // Jogador pode subir snapshot construcao:2 em modo construcao
  tratar(e, ana, j({ tipo: 'construcao.comando', baseRev: 0, opId: 'o1', comandos: [{ tipo: 'x' }] }), 6, todos);
  tratar(e, bia, j({ tipo: 'construcao.comando', baseRev: 1, opId: 'o2', comandos: [{ tipo: 'y' }] }), 7, todos);
  assert.equal(tratar(e, ana, j({ tipo: 'blob', id: 'construcao:2', tipoMime: 'application/gzip' }), 8, todos)[0]?.destino, 'outros');
  assert.equal(tratarBinario(e, ana, pedaco('construcao:2', new Uint8Array([20, 21]))).repassar, true);
  tratar(e, ana, j({ tipo: 'construcao.snapshot', rev: 2, blobId: 'construcao:2' }), 9, todos);

  // Antigo construcao:0 foi apagado; construcao:2 permanece
  assert.equal(e.temBlob('construcao:0'), false);
  assert.equal(e.temBlob('construcao:2'), true);
  assert.equal(e.blobsPedidos().includes('construcao:0'), false);
  assert.equal(e.blobsPedidos().includes('construcao:2'), true);
  assert.deepEqual(blobsParaQuemChega(e).map(b => b.anuncio.id), ['construcao:2']);

  // Snapshot atrasado com blob órfão não substitui e limpa o órfão
  tratarBinario(e, bia, pedaco('construcao:1', new Uint8Array([99])));
  assert.equal(e.temBlob('construcao:1'), true);
  tratar(e, bia, j({ tipo: 'construcao.snapshot', rev: 1, blobId: 'construcao:1' }), 10, todos);
  assert.equal(e.temBlob('construcao:1'), false);
  assert.equal(e.temBlob('construcao:2'), true);

  // Fechar construção limpa tabela e blobs construcao:
  const fechou = tratar(e, mestre, j({ tipo: 'construcao.fechar' }), 11, todos);
  assert.deepEqual(fechou, [{ destino: 'todos', msg: { tipo: 'construcao.fechada' } }]);
  assert.equal(e.temBlob('construcao:2'), false);
  assert.equal(e.estadoConstrucao(), null);
  assert.equal(construcaoParaQuemChega(e), null);
});

test('construcao.cursor é efêmero, carimbado com autor e limitado a 15/s por conexão', () => {
  const e = sala();
  tratar(e, mestre, j({ tipo: 'sala.modo', modo: 'construcao' }), 1, todos);
  tratar(e, mestre, j({ tipo: 'construcao.abrir', mapa: { id: 'm1' } }), 2, todos);

  const wsA = {};
  const wsB = {};
  const cursorMsg = (x: number) => j({ tipo: 'construcao.cursor', x, y: 10, levelId: null, ferramenta: 'parede', pintando: true });

  const s0 = tratar(e, ana, cursorMsg(1), 1000, todos, wsA);
  assert.equal(s0.length, 1);
  assert.equal(s0[0]?.destino, 'outros');
  assert.deepEqual(s0[0]?.msg, {
    tipo: 'construcao.cursor',
    autor: { discordId: 'A', nome: 'Ana', papel: 'jogador', fichas: [] },
    x: 1,
    y: 10,
    levelId: null,
    ferramenta: 'parede',
    pintando: true,
  });

  // Mais 14 passam na mesma janela de 1000 ms; a 16ª é descartada silenciosamente (sem erro)
  for (let i = 2; i <= MAX_CURSORES_POR_SEGUNDO; i++) {
    assert.equal(tratar(e, ana, cursorMsg(i), 1000 + i, todos, wsA).length, 1);
  }
  const excedente = tratar(e, ana, cursorMsg(99), 1500, todos, wsA);
  assert.deepEqual(excedente, []);

  // Outra conexão tem janela própria e na próxima janela (2000 ms) volta a passar
  assert.equal(tratar(e, bia, cursorMsg(5), 1500, todos, wsB).length, 1);
  assert.equal(tratar(e, ana, cursorMsg(6), 2000, todos, wsA).length, 1);
});

test('notas rápidas, ressincronização e entrega na chegada (bemVindo + construcaoParaQuemChega)', () => {
  const e = sala();
  tratar(e, mestre, j({ tipo: 'sala.modo', modo: 'construcao' }), 1, todos);
  tratar(e, mestre, j({ tipo: 'construcao.abrir', mapa: { id: 'm1', name: 'Cripta' } }), 2, todos);

  const n1 = tratar(e, ana, j({ tipo: 'construcao.nota', id: 'n1', texto: 'Falta saída sul' }), 100, todos);
  assert.equal(n1[0]?.destino, 'todos');
  assert.deepEqual(n1[0]?.msg, {
    tipo: 'construcao.nota',
    id: 'n1',
    autor: { discordId: 'A', nome: 'Ana', papel: 'jogador', fichas: [] },
    texto: 'Falta saída sul',
    em: 100,
  });

  // Podagem das notas nas 100 últimas
  for (let i = 2; i <= MAX_NOTAS_CONSTRUCAO + 10; i++) {
    tratar(e, bia, j({ tipo: 'construcao.nota', id: `n${i}`, texto: `Nota ${i}` }), 100 + i, todos);
  }
  const notas = e.notasConstrucao();
  assert.equal(notas.length, MAX_NOTAS_CONSTRUCAO);
  assert.equal(notas[0]?.id, 'n11');
  assert.equal(notas.at(-1)?.id, `n${MAX_NOTAS_CONSTRUCAO + 10}`);

  // Quem entra depois recebe resumo no bemVindo e construcao.estado completo via construcaoParaQuemChega
  tratar(e, ana, j({ tipo: 'construcao.comando', baseRev: 0, opId: 'o1', comandos: [{ tipo: 'a' }] }), 300, todos);
  const bv = bemVindo(e, mestre, todos, 301);
  assert.deepEqual(bv.construcao, { temMapa: true, nome: 'Cripta', rev: 1 });
  const chegada = construcaoParaQuemChega(e)!;
  assert.equal(chegada.tipo, 'construcao.estado');
  assert.equal(chegada.rev, 0);
  assert.equal(chegada.ops.length, 1);
  assert.equal(chegada.notas?.length, MAX_NOTAS_CONSTRUCAO);

  // Ressincronizar responde só ao remetente
  const resync = tratar(e, bia, j({ tipo: 'construcao.ressincronizar' }), 302, todos);
  assert.equal(resync.length, 1);
  assert.equal(resync[0]?.destino, 'remetente');
  assert.deepEqual(resync[0]?.msg, chegada);
});

test('limites de tamanho em estado.ts: op grande, snapshot inline grande, blob grande e nota grande', () => {
  const e = sala();
  e.definirModo('construcao');
  const autor = { discordId: 'A', nome: 'Ana', papel: 'jogador' as const, fichas: [] };

  assert.throws(
    () => e.abrirConstrucao({ mapa: { grande: 'x'.repeat(LIMITE_SNAPSHOT_CONSTRUCAO_BYTES) } }),
    (err: unknown) => err instanceof ErroEstado && err.codigo === 'snapshot-grande',
  );

  e.abrirConstrucao({ mapa: { id: 'm1' } });
  const muitos = Array.from({ length: MAX_COMANDOS_POR_OP + 1 }, (_, i) => ({ tipo: `c${i}` }));
  assert.throws(
    () => e.registrarOpConstrucao({ opId: 'op-muitos', autor, comandos: muitos, em: 1 }),
    (err: unknown) => err instanceof ErroEstado && err.codigo === 'op-grande',
  );
  assert.throws(
    () => e.registrarOpConstrucao({ opId: 'op-gigante', autor, comandos: [{ tipo: 'p', s: 'x'.repeat(LIMITE_OP_CONSTRUCAO_BYTES) }], em: 1 }),
    (err: unknown) => err instanceof ErroEstado && err.codigo === 'op-grande',
  );
  assert.throws(
    () => e.registrarNotaConstrucao({ id: 'ng', autor, texto: 'x'.repeat(LIMITE_NOTA_CONSTRUCAO_BYTES + 1), em: 1 }),
    (err: unknown) => err instanceof ErroEstado && err.codigo === 'nota-grande',
  );
  assert.throws(
    () => e.guardarPedaco({ id: 'construcao:9', i: 0, n: MAX_PEDACOS_CONSTRUCAO + 1, tipo: 'application/gzip' }, new Uint8Array([1])),
    (err: unknown) => err instanceof ErroEstado && err.codigo === 'pedaco-invalido',
  );
});

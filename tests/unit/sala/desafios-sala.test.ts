import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarEstado } from '../../../sala/estado.ts';
import { bemVindo, tratar, type Saida } from '../../../sala/mensagens.ts';
import {
  criarEsconderijo,
  criarLockpick,
  criarPerseguicao,
  type DesafioEsconderijo,
  type DesafioLockpick,
} from '../../../src/dominio/desafios.ts';
import { lerMensagemDaSala, lerMensagemParaSala, type Eu } from '../../../src/online/protocolo.ts';
import { sqlEmMemoria } from './sql-teste.ts';

const mestre: Eu = { discordId: 'M', nome: 'Mestre', papel: 'mestre' };
const ana: Eu = { discordId: 'A', nome: 'Ana', papel: 'jogador' };
const bia: Eu = { discordId: 'B', nome: 'Bia', papel: 'jogador' };
const todos = [mestre, ana, bia];
const j = (o: unknown) => JSON.stringify(o);

function criarSala() {
  const e = criarEstado(sqlEmMemoria());
  e.iniciar('M', 'Campanha');
  return e;
}

function saidaPara(saidas: Saida[], destino: 'mestre' | 'jogadores') {
  return saidas.find((s) => s.destino === destino);
}

test('desafio.definir só é aceito pelo mestre e recusado para jogador', () => {
  const e = criarSala();
  const lockpick = criarLockpick({ id: 'lp1', dados: [6, 6, 6], senha: [2, 4, 6], agora: 100 });

  const recusa = tratar(e, ana, j({ tipo: 'desafio.definir', desafio: lockpick }), 101, todos);
  assert.equal(recusa.length, 1);
  assert.equal(recusa[0]!.destino, 'remetente');
  assert.deepEqual(recusa[0]!.msg, { tipo: 'erro', motivo: 'permissao', recusado: 'desafio.definir' });
  assert.equal(e.desafio(), null);

  const ok = tratar(e, mestre, j({ tipo: 'desafio.definir', desafio: lockpick }), 102, todos);
  assert.equal(ok.length, 2);
  assert.ok(saidaPara(ok, 'mestre'));
  assert.ok(saidaPara(ok, 'jogadores'));
  assert.equal(e.desafio()?.id, 'lp1');
});

test('lockpick oculta senha para jogadores e avalia tentativas no servidor sem vazar até acertar', () => {
  const e = criarSala();
  e.salvarFicha({ id: 'ficha-ana' }, 'A', 0, 1);
  const lockpick = criarLockpick({
    id: 'lp2',
    dados: [6, 6, 6],
    senha: [2, 5, 3],
    modoDica: 'posicional',
    maxTentativas: 4,
    jogadorAutorizadoId: 'ficha-ana',
    agora: 100,
  });

  const def = tratar(e, mestre, j({ tipo: 'desafio.definir', desafio: lockpick }), 101, todos);
  const msgMestre = saidaPara(def, 'mestre')!.msg as { tipo: 'desafio.estado'; desafio: DesafioLockpick };
  const msgJogadores = saidaPara(def, 'jogadores')!.msg as { tipo: 'desafio.estado'; desafio: DesafioLockpick };
  assert.deepEqual(msgMestre.desafio.senha, [2, 5, 3]);
  assert.equal('senha' in msgJogadores.desafio, false);

  // bem-vindo também sanitiza por papel
  const bvMestre = bemVindo(e, mestre, todos, 102);
  const bvAna = bemVindo(e, ana, todos, 102);
  assert.deepEqual((bvMestre.desafio as DesafioLockpick).senha, [2, 5, 3]);
  assert.equal('senha' in (bvAna.desafio as DesafioLockpick), false);

  // protocolo valida bem-vindo e desafio.estado
  assert.ok(lerMensagemDaSala(j(bvAna)));
  assert.ok(lerMensagemDaSala(j(msgJogadores)));
  assert.ok(lerMensagemParaSala(j({ tipo: 'desafio.definir', desafio: lockpick })));

  // Bia não é autorizada (ficha-ana pertence a Ana)
  const negadoBia = tratar(
    e,
    bia,
    j({ tipo: 'desafio.acao', acao: { tipo: 'lockpick.tentar', valores: [1, 1, 1], autorNome: 'Bia' } }),
    103,
    todos,
  );
  assert.deepEqual(negadoBia[0]!.msg, { tipo: 'erro', motivo: 'permissao', recusado: 'desafio.acao' });

  // Ana tenta e erra: recebe feedback posicional, mas sem vazar a senha
  const tentativa1 = tratar(
    e,
    ana,
    j({ tipo: 'desafio.acao', acao: { tipo: 'lockpick.tentar', valores: [1, 6, 3], autorNome: 'Ana' } }),
    104,
    todos,
  );
  const jog1 = (saidaPara(tentativa1, 'jogadores')!.msg as { tipo: 'desafio.estado'; desafio: DesafioLockpick }).desafio;
  const mes1 = (saidaPara(tentativa1, 'mestre')!.msg as { tipo: 'desafio.estado'; desafio: DesafioLockpick }).desafio;
  assert.equal('senha' in jog1, false);
  assert.deepEqual(mes1.senha, [2, 5, 3]);
  assert.equal(jog1.status, 'ativo');
  assert.deepEqual(jog1.tentativas[0]!.feedbackPosicional, ['alto', 'baixo', 'exato']);

  // Ana acerta: status vira 'aberto' e senha pode ser exibida
  const tentativa2 = tratar(
    e,
    ana,
    j({ tipo: 'desafio.acao', acao: { tipo: 'lockpick.tentar', valores: [2, 5, 3], autorNome: 'Ana' } }),
    105,
    todos,
  );
  const jog2 = (saidaPara(tentativa2, 'jogadores')!.msg as { tipo: 'desafio.estado'; desafio: DesafioLockpick }).desafio;
  assert.equal(jog2.status, 'aberto');
  assert.deepEqual(jog2.senha, [2, 5, 3]);
});

test('esconderijo com ocultarDoMestre mascara valores para o mestre e mantém reais para jogadores e busca da criatura', () => {
  const e = criarSala();
  const esc = criarEsconderijo({
    id: 'esc1',
    participantes: [
      { id: 'p1', nome: 'Ana', donoDiscordId: 'A' },
      { id: 'p2', nome: 'Bia', donoDiscordId: 'B' },
    ],
    ocultarDoMestre: true,
    agora: 200,
  });

  tratar(e, mestre, j({ tipo: 'desafio.definir', desafio: esc }), 201, todos);

  // Ana adiciona dado valor 4 e valor 2
  tratar(
    e,
    ana,
    j({ tipo: 'desafio.acao', acao: { tipo: 'esconderijo.adicionar-dado', participanteId: 'p1', lados: 6, valor: 4 } }),
    202,
    todos,
  );
  const add2 = tratar(
    e,
    ana,
    j({ tipo: 'desafio.acao', acao: { tipo: 'esconderijo.adicionar-dado', participanteId: 'p1', lados: 6, valor: 2 } }),
    203,
    todos,
  );

  const paraMestre = (saidaPara(add2, 'mestre')!.msg as { tipo: 'desafio.estado'; desafio: DesafioEsconderijo }).desafio;
  const paraJogadores = (saidaPara(add2, 'jogadores')!.msg as { tipo: 'desafio.estado'; desafio: DesafioEsconderijo }).desafio;

  assert.deepEqual(paraMestre.participantes[0]!.dados.map((d) => d.valor), [0, 0]);
  assert.deepEqual(paraJogadores.participantes[0]!.dados.map((d) => d.valor), [4, 2]);

  // Jogador não pode executar ações exclusivas do mestre
  const recusaBusca = tratar(
    e,
    ana,
    j({ tipo: 'desafio.acao', acao: { tipo: 'esconderijo.buscar-criatura', dados: [{ lados: 6, valor: 4 }] } }),
    204,
    todos,
  );
  assert.deepEqual(recusaBusca[0]!.msg, { tipo: 'erro', motivo: 'permissao', recusado: 'desafio.acao' });

  const recusaFase = tratar(
    e,
    ana,
    j({ tipo: 'desafio.acao', acao: { tipo: 'esconderijo.proxima-fase' } }),
    205,
    todos,
  );
  assert.deepEqual(recusaFase[0]!.msg, { tipo: 'erro', motivo: 'permissao', recusado: 'desafio.acao' });

  // Mestre busca criatura com valor 4: remove o dado 4 de Ana e reporta em ultimaBusca.atingidos
  const busca = tratar(
    e,
    mestre,
    j({ tipo: 'desafio.acao', acao: { tipo: 'esconderijo.buscar-criatura', dados: [{ lados: 6, valor: 4 }] } }),
    206,
    todos,
  );
  const aposMestre = (saidaPara(busca, 'mestre')!.msg as { tipo: 'desafio.estado'; desafio: DesafioEsconderijo }).desafio;
  const aposJogadores = (saidaPara(busca, 'jogadores')!.msg as { tipo: 'desafio.estado'; desafio: DesafioEsconderijo }).desafio;

  assert.equal(aposMestre.participantes[0]!.dados.length, 1);
  assert.deepEqual(aposMestre.participantes[0]!.dados.map((d) => d.valor), [0]);
  assert.deepEqual(aposJogadores.participantes[0]!.dados.map((d) => d.valor), [2]);
  assert.equal(aposMestre.ultimaBusca?.atingidos.length, 1);
  assert.deepEqual(aposMestre.ultimaBusca?.atingidos[0], {
    participanteId: 'p1',
    nome: 'Ana',
    valores: [4],
    ficouEncontrado: false,
  });
});

test('perseguicao.encerrar-rodada é exclusiva do mestre e limparSessao limpa o desafio ativo', () => {
  const e = criarSala();
  const pers = criarPerseguicao({
    id: 'pers1',
    participantes: [{ id: 'p1', nome: 'Ana' }],
    agora: 300,
  });

  tratar(e, mestre, j({ tipo: 'desafio.definir', desafio: pers }), 301, todos);
  assert.equal(e.desafio()?.id, 'pers1');

  const recusa = tratar(
    e,
    ana,
    j({ tipo: 'desafio.acao', acao: { tipo: 'perseguicao.encerrar-rodada' } }),
    302,
    todos,
  );
  assert.deepEqual(recusa[0]!.msg, { tipo: 'erro', motivo: 'permissao', recusado: 'desafio.acao' });

  const ok = tratar(
    e,
    mestre,
    j({ tipo: 'desafio.acao', acao: { tipo: 'perseguicao.encerrar-rodada' } }),
    303,
    todos,
  );
  assert.equal(ok.length, 2);

  e.limparSessao();
  assert.equal(e.desafio(), null);
  assert.equal(bemVindo(e, mestre, todos, 304).desafio, null);
});

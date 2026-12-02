import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  aplicarAcaoDesafio,
  criarEquilibrio,
  criarEscalada,
  criarEsconderijo,
  criarLockpick,
  criarPerseguicao,
  ehDesafioAtivo,
  rolarDado,
  sanitizarDesafioPara,
  totaisEquilibrio,
  type DesafioEquilibrio,
  type DesafioEscalada,
  type DesafioEsconderijo,
  type DesafioLockpick,
  type DesafioPerseguicao,
  type ParticipanteDesafio,
} from '../../../src/dominio/desafios.ts';
import { extrairSugestoesDaFicha } from '../../../src/dominio/desafios-ficha.ts';

const P1: ParticipanteDesafio = { id: 'p1', nome: 'Arthur' };
const P2: ParticipanteDesafio = { id: 'p2', nome: 'Dante' };
const P3: ParticipanteDesafio = { id: 'p3', nome: 'Beatrice' };

describe('dominio/desafios — rolarDado e validação', () => {
  it('rolarDado respeita intervalo 1..lados com rng determinístico', () => {
    assert.equal(rolarDado(6, () => 0), 1);
    assert.equal(rolarDado(6, () => 0.9999), 6);
    assert.equal(rolarDado(10, () => 0.5), 6);
    assert.equal(rolarDado(20, () => 0.95), 20);
  });

  it('ehDesafioAtivo valida todos os tipos e rejeita entradas inválidas', () => {
    assert.equal(ehDesafioAtivo(criarLockpick({ agora: 1 })), true);
    assert.equal(ehDesafioAtivo(criarEquilibrio({ personagem: P1, agora: 1 })), true);
    assert.equal(ehDesafioAtivo(criarEsconderijo({ participantes: [P1], agora: 1 })), true);
    assert.equal(ehDesafioAtivo(criarPerseguicao({ participantes: [P1], agora: 1 })), true);
    assert.equal(ehDesafioAtivo(criarEscalada({ participantes: [P1], agora: 1 })), true);

    assert.equal(ehDesafioAtivo(null), false);
    assert.equal(ehDesafioAtivo({}), false);
    assert.equal(ehDesafioAtivo({ tipo: 'invalido', id: 'x', titulo: 't', atualizadoEm: 1 }), false);
    assert.equal(ehDesafioAtivo({ tipo: 'lockpick', id: 'x', titulo: 't', atualizadoEm: 1 }), false);
  });
});

describe('dominio/desafios — Lockpick', () => {
  it('segue a convenção baixo/exato/alto do PDF (senha 3-5-2 vs palpite 4-5-1)', () => {
    const inicial = criarLockpick({
      id: 'lp-1',
      dados: [6, 6, 6],
      senha: [3, 5, 2],
      modoDica: 'posicional',
      maxTentativas: 3,
      agora: 100,
    });

    const apos1 = aplicarAcaoDesafio(
      inicial,
      { tipo: 'lockpick.tentar', valores: [4, 5, 1], autorNome: 'Arthur' },
      { agora: 200 },
    ) as DesafioLockpick;

    assert.equal(apos1.status, 'ativo');
    assert.equal(apos1.tentativas.length, 1);
    assert.deepEqual(apos1.tentativas[0]?.feedbackPosicional, ['baixo', 'exato', 'alto']);
    assert.equal(apos1.tentativas[0]?.acertou, false);

    const apos2 = aplicarAcaoDesafio(
      apos1,
      { tipo: 'lockpick.tentar', valores: [3, 5, 2], autorNome: 'Arthur' },
      { agora: 300 },
    ) as DesafioLockpick;

    assert.equal(apos2.status, 'aberto');
    assert.equal(apos2.tentativas[1]?.acertou, true);
    assert.deepEqual(apos2.tentativas[1]?.feedbackPosicional, ['exato', 'exato', 'exato']);
  });

  it('modo embaralhado conta corretos, altos e baixos sem revelar posições e trava ao esgotar tentativas', () => {
    const inicial = criarLockpick({
      id: 'lp-2',
      dados: [6, 6, 6],
      senha: [3, 5, 2],
      modoDica: 'embaralhado',
      maxTentativas: 2,
      agora: 100,
    });

    const apos1 = aplicarAcaoDesafio(
      inicial,
      { tipo: 'lockpick.tentar', valores: [4, 5, 1], autorNome: 'Dante' },
      { agora: 200 },
    ) as DesafioLockpick;

    assert.equal(apos1.tentativas[0]?.feedbackPosicional, undefined);
    assert.deepEqual(apos1.tentativas[0]?.feedbackEmbaralhado, {
      corretos: 1,
      altos: 1,
      baixos: 1,
    });
    assert.equal(apos1.status, 'ativo');

    const apos2 = aplicarAcaoDesafio(
      apos1,
      { tipo: 'lockpick.tentar', valores: [6, 6, 6], autorNome: 'Dante' },
      { agora: 300 },
    ) as DesafioLockpick;

    assert.equal(apos2.status, 'travado');
    assert.deepEqual(apos2.tentativas[1]?.feedbackEmbaralhado, {
      corretos: 0,
      altos: 0,
      baixos: 3,
    });
  });

  it('sanitizarDesafioPara oculta senha para jogador enquanto não aberto e revela ao abrir', () => {
    const ativo = criarLockpick({ senha: [2, 4, 6], agora: 10 });
    const visaoJogadorAtivo = sanitizarDesafioPara(ativo, 'jogador') as DesafioLockpick;
    assert.equal(visaoJogadorAtivo.senha, undefined);

    const visaoMestre = sanitizarDesafioPara(ativo, 'mestre') as DesafioLockpick;
    assert.deepEqual(visaoMestre.senha, [2, 4, 6]);

    const aberto = aplicarAcaoDesafio(
      ativo,
      { tipo: 'lockpick.tentar', valores: [2, 4, 6], autorNome: 'Arthur' },
      { agora: 20 },
    ) as DesafioLockpick;
    const visaoJogadorAberto = sanitizarDesafioPara(aberto, 'jogador') as DesafioLockpick;
    assert.deepEqual(visaoJogadorAberto.senha, [2, 4, 6]);
  });
});

describe('dominio/desafios — Equilíbrio', () => {
  it('avalia 5 e 5 (equilibrado), 5 e 6 (equilibrado), 5 e 7 (desequilibrado) e estouro 9 e 11', () => {
    const base = criarEquilibrio({
      id: 'eq-1',
      personagem: P1,
      dadosEquilibrioTotal: 2,
      agora: 100,
    });

    const eq55 = aplicarAcaoDesafio(
      base,
      { tipo: 'equilibrio.rolar-inicial', dadoEsq: 5, dadoDir: 5 },
      { agora: 110 },
    ) as DesafioEquilibrio;
    assert.equal(eq55.status, 'equilibrado');
    assert.deepEqual(totaisEquilibrio(eq55), { esq: 5, dir: 5, diferenca: 0, restantes: 2 });

    const eq56 = aplicarAcaoDesafio(
      base,
      { tipo: 'equilibrio.rolar-inicial', dadoEsq: 5, dadoDir: 6 },
      { agora: 120 },
    ) as DesafioEquilibrio;
    assert.equal(eq56.status, 'equilibrado');
    assert.deepEqual(totaisEquilibrio(eq56), { esq: 5, dir: 6, diferenca: 1, restantes: 2 });

    const eq57 = aplicarAcaoDesafio(
      base,
      { tipo: 'equilibrio.rolar-inicial', dadoEsq: 5, dadoDir: 7 },
      { agora: 130 },
    ) as DesafioEquilibrio;
    assert.equal(eq57.status, 'desequilibrado');
    assert.deepEqual(totaisEquilibrio(eq57), { esq: 5, dir: 7, diferenca: 2, restantes: 2 });

    // Estouro: 5 e 7 -> soma +4 na esquerda (9 e 7, ainda desequilibrado) -> soma +4 na direita (9 e 11, caiu!)
    const r1 = aplicarAcaoDesafio(
      eq57,
      { tipo: 'equilibrio.rolar-d4', valor: 4 },
      { agora: 140 },
    ) as DesafioEquilibrio;
    assert.equal(r1.d4Pendente, 4);
    assert.equal(totaisEquilibrio(r1).restantes, 1);

    const a1 = aplicarAcaoDesafio(
      r1,
      { tipo: 'equilibrio.aplicar-d4', lado: 'esq' },
      { agora: 150 },
    ) as DesafioEquilibrio;
    assert.equal(a1.status, 'desequilibrado');
    assert.deepEqual(totaisEquilibrio(a1), { esq: 9, dir: 7, diferenca: 2, restantes: 1 });

    const r2 = aplicarAcaoDesafio(
      a1,
      { tipo: 'equilibrio.rolar-d4', valor: 4 },
      { agora: 160 },
    ) as DesafioEquilibrio;
    assert.equal(r2.status, 'desequilibrado');
    assert.equal(totaisEquilibrio(r2).restantes, 0);

    const a2 = aplicarAcaoDesafio(
      r2,
      { tipo: 'equilibrio.aplicar-d4', lado: 'dir' },
      { agora: 170 },
    ) as DesafioEquilibrio;
    assert.equal(a2.status, 'caiu');
    assert.deepEqual(totaisEquilibrio(a2), { esq: 9, dir: 11, diferenca: 2, restantes: 0 });
  });

  it('recupera equilíbrio ao aplicar d4 no lado certo', () => {
    const base = criarEquilibrio({ personagem: P1, dadosEquilibrioTotal: 1, agora: 10 });
    const deseq = aplicarAcaoDesafio(
      base,
      { tipo: 'equilibrio.rolar-inicial', dadoEsq: 4, dadoDir: 7 },
      { agora: 20 },
    ) as DesafioEquilibrio;
    const rolado = aplicarAcaoDesafio(
      deseq,
      { tipo: 'equilibrio.rolar-d4', valor: 2 },
      { agora: 30 },
    ) as DesafioEquilibrio;
    const equilibrado = aplicarAcaoDesafio(
      rolado,
      { tipo: 'equilibrio.aplicar-d4', lado: 'esq' },
      { agora: 40 },
    ) as DesafioEquilibrio;

    assert.equal(equilibrado.status, 'equilibrado');
    assert.deepEqual(totaisEquilibrio(equilibrado), { esq: 6, dir: 7, diferenca: 1, restantes: 0 });
  });
});

describe('dominio/desafios — Esconderijo', () => {
  it('esconder-se soma +3 na DT individual, distrair soma +3 na DT global, chamar-atencao transfere e descarta', () => {
    let d = criarEsconderijo({
      id: 'esc-1',
      participantes: [P1, P2],
      ocultarDoMestre: true,
      agora: 100,
    });

    // Definir dados iniciais
    d = aplicarAcaoDesafio(
      d,
      {
        tipo: 'esconderijo.definir-dados',
        participanteId: 'p1',
        dados: [
          { lados: 6, valor: 2 },
          { lados: 6, valor: 5 },
        ],
      },
      { agora: 110, rng: () => 0.1 },
    ) as DesafioEsconderijo;

    // Esconder-se falhou: ainda soma +3 na DT do personagem e não adiciona dado
    const dtInicialP1 = d.participantes[0]!.dtEsconderSe;
    d = aplicarAcaoDesafio(
      d,
      { tipo: 'esconderijo.esconder-se', participanteId: 'p1', passou: false },
      { agora: 120 },
    ) as DesafioEsconderijo;
    assert.equal(d.participantes[0]!.dtEsconderSe, dtInicialP1 + 3);
    assert.equal(d.participantes[0]!.dados.length, 2);

    // Esconder-se passou: soma +3 novamente e adiciona dado
    d = aplicarAcaoDesafio(
      d,
      { tipo: 'esconderijo.esconder-se', participanteId: 'p1', passou: true, lados: 8, valor: 7 },
      { agora: 130, rng: () => 0.2 },
    ) as DesafioEsconderijo;
    assert.equal(d.participantes[0]!.dtEsconderSe, dtInicialP1 + 6);
    assert.equal(d.participantes[0]!.dados.length, 3);

    // Distrair: soma +3 na DT global e adiciona dado ao alvo quando passa
    const dtDistrairInicial = d.dtDistrair;
    d = aplicarAcaoDesafio(
      d,
      { tipo: 'esconderijo.distrair', alvoParticipanteId: 'p2', passou: false },
      { agora: 140 },
    ) as DesafioEsconderijo;
    assert.equal(d.dtDistrair, dtDistrairInicial + 3);
    assert.equal(d.participantes[1]!.dados.length, 0);

    d = aplicarAcaoDesafio(
      d,
      { tipo: 'esconderijo.distrair', alvoParticipanteId: 'p2', passou: true, lados: 6, valor: 4 },
      { agora: 150, rng: () => 0.3 },
    ) as DesafioEsconderijo;
    assert.equal(d.dtDistrair, dtDistrairInicial + 6);
    assert.equal(d.participantes[1]!.dados.length, 1);

    // Chamar atenção: transfere 1 dado de p1 para p2 e descarta outro dado de p1
    const dadoTransf = d.participantes[0]!.dados[0]!;
    const dadoDesc = d.participantes[0]!.dados[1]!;
    d = aplicarAcaoDesafio(
      d,
      {
        tipo: 'esconderijo.chamar-atencao',
        origemId: 'p1',
        destinoId: 'p2',
        dadoTransferirId: dadoTransf.id,
        dadoDescartarId: dadoDesc.id,
      },
      { agora: 160 },
    ) as DesafioEsconderijo;

    assert.equal(d.participantes[0]!.dados.length, 1);
    assert.equal(d.participantes[0]!.dados[0]!.valor, 7);
    assert.equal(d.participantes[1]!.dados.length, 2);
    assert.equal(d.participantes[1]!.dados.some((x) => x.id === dadoTransf.id), true);

    // Sanitização para o mestre quando ocultarDoMestre === true
    const visaoMestre = sanitizarDesafioPara(d, 'mestre') as DesafioEsconderijo;
    assert.equal(
      visaoMestre.participantes.every((p) => p.dados.every((dado) => dado.valor === 0)),
      true,
    );
    const visaoJogador = sanitizarDesafioPara(d, 'jogador') as DesafioEsconderijo;
    assert.equal(visaoJogador.participantes[0]!.dados[0]!.valor, 7);

    // Busca da criatura remove dados iguais e marca encontrado quando zera
    d = aplicarAcaoDesafio(
      d,
      {
        tipo: 'esconderijo.buscar-criatura',
        dados: [
          { lados: 8, valor: 7 },
          { lados: 6, valor: 4 },
        ],
      },
      { agora: 170, rng: () => 0.4 },
    ) as DesafioEsconderijo;

    assert.equal(d.participantes[0]!.dados.length, 0);
    assert.equal(d.participantes[0]!.encontrado, true);
    assert.equal(d.participantes[1]!.dados.length, 1);
    assert.equal(d.participantes[1]!.encontrado, false);
    assert.equal(d.ultimaBusca?.atingidos.length, 2);
    assert.deepEqual(d.ultimaBusca?.atingidos[0], {
      participanteId: 'p1',
      nome: 'Arthur',
      valores: [7],
      ficouEncontrado: true,
    });

    // Próxima fase alterna personagens -> criaturas -> personagens (rodada + 1)
    d = aplicarAcaoDesafio(d, { tipo: 'esconderijo.proxima-fase' }, { agora: 180 }) as DesafioEsconderijo;
    assert.equal(d.fase, 'criaturas');
    assert.equal(d.rodada, 1);
    d = aplicarAcaoDesafio(d, { tipo: 'esconderijo.proxima-fase' }, { agora: 190 }) as DesafioEsconderijo;
    assert.equal(d.fase, 'personagens');
    assert.equal(d.rodada, 2);
  });
});

describe('dominio/desafios — Perseguição', () => {
  it('aplica limiares 5/15/25, fôlego, esforço extra e carregar outro participante', () => {
    let d = criarPerseguicao({
      id: 'pers-1',
      participantes: [
        { ...P1, folegoTotal: 3 },
        { ...P2, folegoTotal: 2 },
        { ...P3, folegoTotal: 2 },
      ],
      totalRodadas: 3,
      metaPa: 25,
      limiaresPorRodada: { 1: 5, 2: 15, 3: 25 },
      agora: 100,
    });

    // Fôlego e avanço com esforço extra
    d = aplicarAcaoDesafio(
      d,
      { tipo: 'perseguicao.gastar-folego', participanteId: 'p1', quantidade: 2 },
      { agora: 110 },
    ) as DesafioPerseguicao;
    assert.equal(d.participantes[0]!.folegoRestante, 1);

    d = aplicarAcaoDesafio(
      d,
      { tipo: 'perseguicao.avancar', participanteId: 'p1', pontos: 8, esforcoExtra: true },
      { agora: 120 },
    ) as DesafioPerseguicao;
    d = aplicarAcaoDesafio(
      d,
      { tipo: 'perseguicao.avancar', participanteId: 'p2', pontos: 4 },
      { agora: 130 },
    ) as DesafioPerseguicao;
    d = aplicarAcaoDesafio(
      d,
      { tipo: 'perseguicao.avancar', participanteId: 'p3', pontos: 6 },
      { agora: 140 },
    ) as DesafioPerseguicao;

    assert.equal(d.participantes[0]!.esforcoExtraUsos, 1);

    // Encerra rodada 1 (limiar 5): p2 (4 PA) é derrubado
    d = aplicarAcaoDesafio(d, { tipo: 'perseguicao.encerrar-rodada' }, { agora: 150 }) as DesafioPerseguicao;
    assert.equal(d.rodada, 2);
    assert.equal(d.participantes[0]!.status, 'correndo');
    assert.equal(d.participantes[1]!.status, 'derrubado');
    assert.equal(d.participantes[1]!.rodadaDerrubado, 1);
    assert.equal(d.participantes[2]!.status, 'correndo');

    // Carregar: p1 (8 PA) carrega p2 (4 PA) com +5 pontos -> iguala a 4 e ambos vão para 9
    d = aplicarAcaoDesafio(
      d,
      { tipo: 'perseguicao.carregar', carregadorId: 'p1', alvoId: 'p2', pontos: 5, esforcoExtra: true },
      { agora: 160 },
    ) as DesafioPerseguicao;
    assert.equal(d.participantes[0]!.pa, 9);
    assert.equal(d.participantes[1]!.pa, 9);
    assert.equal(d.participantes[0]!.carregandoId, 'p2');
    assert.equal(d.participantes[1]!.carregadoPorId, 'p1');
    assert.equal(d.participantes[0]!.esforcoExtraUsos, 2);

    // p3 avança para 25 PA -> seguro
    d = aplicarAcaoDesafio(
      d,
      { tipo: 'perseguicao.avancar', participanteId: 'p3', pontos: 19 },
      { agora: 170 },
    ) as DesafioPerseguicao;
    assert.equal(d.participantes[2]!.status, 'seguro');

    // Encerra rodada 2 (limiar 15): p1 (9 PA) é derrubado; p3 segue seguro
    d = aplicarAcaoDesafio(d, { tipo: 'perseguicao.encerrar-rodada' }, { agora: 180 }) as DesafioPerseguicao;
    assert.equal(d.rodada, 3);
    assert.equal(d.participantes[0]!.status, 'derrubado');
    assert.equal(d.participantes[0]!.rodadaDerrubado, 2);
    assert.equal(d.participantes[2]!.status, 'seguro');
  });
});

describe('dominio/desafios — Escalada', () => {
  it('acumula pontos até o topo e aplica dano de queda igual aos pontos acumulados', () => {
    let d = criarEscalada({
      id: 'esc-2',
      participantes: [P1, P2],
      metaPontos: 5,
      dtRapida: 12,
      dtCautelosa: 9,
      agora: 100,
    });

    d = aplicarAcaoDesafio(
      d,
      { tipo: 'escalada.registrar', participanteId: 'p1', passou: true, pontos: 3 },
      { agora: 110 },
    ) as DesafioEscalada;
    assert.equal(d.participantes[0]!.pontos, 3);
    assert.equal(d.participantes[0]!.status, 'escalando');

    d = aplicarAcaoDesafio(
      d,
      { tipo: 'escalada.registrar', participanteId: 'p1', passou: false },
      { agora: 120 },
    ) as DesafioEscalada;
    assert.equal(d.participantes[0]!.status, 'caiu');
    assert.equal(d.participantes[0]!.ultimoDanoQueda, 3);

    d = aplicarAcaoDesafio(
      d,
      { tipo: 'escalada.registrar', participanteId: 'p2', passou: true, pontos: 5 },
      { agora: 130 },
    ) as DesafioEscalada;
    assert.equal(d.participantes[1]!.status, 'topo');
  });
});

describe('dominio/desafios-ficha — extrairSugestoesDaFicha', () => {
  it('extrai perícias com normalização de acentos/caixa e calcula dados derivados', () => {
    const sug = extrairSugestoesDaFicha({
      name: 'Arthur Cervero',
      tokenImage: 'https://exemplo/arthur.png',
      skills: [
        { name: 'Acrobácia', skillDie: 8 },
        { name: 'vigor', skillDie: 10 },
        { name: 'CRIME', skillDie: 6 },
        { name: 'Furtividade', skillDie: 12 },
        { name: 'Atletismo', skillDie: 4 },
      ],
    });

    assert.deepEqual(sug, {
      nome: 'Arthur Cervero',
      retrato: 'https://exemplo/arthur.png',
      acrobaciaDado: 8,
      dadosEquilibrio: 4,
      vigorDado: 10,
      dadosFolego: 5,
      crimeDado: 6,
      tentativasCrime: 3,
      furtividadeDado: 12,
      atletismoDado: 4,
    });
  });

  it('usa defaults seguros quando ficha é nula ou faltam perícias', () => {
    const sug = extrairSugestoesDaFicha(null);
    assert.deepEqual(sug, {
      nome: 'Personagem',
      acrobaciaDado: 4,
      dadosEquilibrio: 2,
      vigorDado: 4,
      dadosFolego: 2,
      crimeDado: 4,
      tentativasCrime: 2,
      furtividadeDado: 4,
      atletismoDado: 4,
    });

    const comFirstName = extrairSugestoesDaFicha({ firstName: 'Dante', skills: [] });
    assert.equal(comFirstName.nome, 'Dante');
    assert.equal(comFirstName.retrato, undefined);
  });
});

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Entidade, Ligacao, Ref } from '#mesa';
import {
  candidatosDeMapa,
  candidatosDePistas,
  candidatosDeParticipantes,
  candidatosDeTrilha,
  casaCena,
  entidadePorRef,
  extrairPacoteDeCena,
  refParaLigacao,
} from '../../src/dominio/cenas.ts';
import { refDaEntidade } from '../../src/dominio/notas.ts';
import { ehEncontro } from '../../src/dominio/entidades.ts';

const baseEntidade = (dados: Partial<Entidade> & { id: string; tipo: Entidade['tipo']; nome: string }): Entidade => ({
  campanhaId: 'camp-1',
  refs: [],
  tags: [],
  notas: '',
  criadaPor: 'mesa',
  criadaEm: Date.now(),
  atualizadaEm: Date.now(),
  ...dados,
});

const baseLigacao = (dados: Partial<Ligacao> & Pick<Ligacao, 'id' | 'tipo' | 'de' | 'para'>): Ligacao => ({
  campanhaId: 'camp-1',
  criadaPor: 'mesa',
  criadaEm: Date.now(),
  ...dados,
});

describe('cenas e encontros (domínio)', () => {
  it('refParaLigacao prefere a ref do aplicativo externo ou cai na ref da mesa', () => {
    const mapaAtlas = baseEntidade({
      id: 'lugar-1',
      tipo: 'lugar',
      nome: 'Mansão Degolificada',
      refs: [{ app: 'atlas', tipo: 'mapa', id: 'mapa-123' }],
    });
    assert.deepEqual(refParaLigacao(mapaAtlas), {
      app: 'atlas',
      tipo: 'mapa',
      id: 'mapa-123',
    });

    const cenaMesa = baseEntidade({
      id: 'cena-1',
      tipo: 'cena',
      nome: 'Emboscada no Salão',
      refs: [],
    });
    assert.deepEqual(refParaLigacao(cenaMesa), refDaEntidade('cena-1'));
  });

  it('entidadePorRef localiza entidade tanto por ref da mesa quanto por ref externa', () => {
    const p1 = baseEntidade({
      id: 'p1',
      tipo: 'personagem',
      nome: 'Arthur Cervero',
      refs: [{ app: 'ficha', tipo: 'ficha', id: 'ficha-arthur' }],
    });
    const l1 = baseEntidade({
      id: 'l1',
      tipo: 'lugar',
      nome: 'Sanatório',
      refs: [],
    });
    const lista = [p1, l1];

    // Por ref da mesa
    assert.equal(entidadePorRef(refDaEntidade('l1'), lista), l1);
    // Por ref do aplicativo externo
    assert.equal(
      entidadePorRef({ app: 'ficha', tipo: 'ficha', id: 'ficha-arthur' }, lista),
      p1,
    );
    // Ref inexistente
    assert.equal(
      entidadePorRef({ app: 'ficha', tipo: 'ficha', id: 'desconhecido' }, lista),
      undefined,
    );
  });

  it('casaCena reconhece ligações feitas com ref da mesa ou com ref do aplicativo dono', () => {
    const cena = baseEntidade({
      id: 'cena-x',
      tipo: 'cena',
      nome: 'Investigação Noturna',
      refs: [{ app: 'mesa', tipo: 'cena', id: 'cena-externa-1' }],
    });
    const refMesa = refDaEntidade('cena-x');

    assert.equal(casaCena(refMesa, cena, refMesa), true);
    assert.equal(
      casaCena({ app: 'mesa', tipo: 'cena', id: 'cena-externa-1' }, cena, refMesa),
      true,
    );
    assert.equal(
      casaCena({ app: 'mesa', tipo: 'cena', id: 'outra-cena' }, cena, refMesa),
      false,
    );
  });

  it('extrairPacoteDeCena monta mapa, trilha, participantes ordenados e pistas', () => {
    const cena = baseEntidade({
      id: 'cena-1',
      tipo: 'cena',
      nome: 'Ritual no Porão',
      refs: [],
    });
    const refCena = refDaEntidade('cena-1');

    const mapa = baseEntidade({
      id: 'mapa-1',
      tipo: 'lugar',
      nome: 'Porão Sombrio',
      refs: [{ app: 'atlas', tipo: 'mapa', id: 'atlas-porao' }],
    });
    const trilha = baseEntidade({
      id: 'trilha-1',
      tipo: 'efeito',
      nome: 'Tensão Oculta',
      refs: [{ app: 'jukebox', tipo: 'cena-sonora', id: 'som-tensao' }],
    });
    const jogador1 = baseEntidade({
      id: 'jog-1',
      tipo: 'personagem',
      nome: 'Thiago Fritz',
      refs: [{ app: 'ficha', tipo: 'ficha', id: 'f-thiago' }],
    });
    const jogador2 = baseEntidade({
      id: 'jog-2',
      tipo: 'personagem',
      nome: 'Alexandre Ramos',
      refs: [{ app: 'ficha', tipo: 'ficha', id: 'f-alexandre' }],
    });
    const zumbi = baseEntidade({
      id: 'ameaca-1',
      tipo: 'ameaca',
      nome: 'Zumbi de Sangue',
      refs: [{ app: 'ficha', tipo: 'ficha', id: 'f-zumbi' }],
    });
    const aberacao = baseEntidade({
      id: 'ameaca-2',
      tipo: 'ameaca',
      nome: 'Aberração de Carne',
      refs: [{ app: 'ficha', tipo: 'ficha', id: 'f-aberracao' }],
    });
    const pista = baseEntidade({
      id: 'pista-1',
      tipo: 'pista',
      nome: 'Símbolo Gravado',
      refs: [{ app: 'atelie', tipo: 'documento', id: 'doc-simbolo' }],
    });

    const entidades = [cena, mapa, trilha, jogador1, jogador2, zumbi, aberacao, pista];

    const ligacoes: Ligacao[] = [
      baseLigacao({
        id: 'lig-mapa',
        tipo: 'esta-em',
        de: refCena,
        para: { app: 'atlas', tipo: 'mapa', id: 'atlas-porao' },
      }),
      baseLigacao({
        id: 'lig-trilha',
        tipo: 'toca-em',
        de: refCena,
        para: { app: 'jukebox', tipo: 'cena-sonora', id: 'som-tensao' },
      }),
      baseLigacao({
        id: 'lig-jog-2',
        tipo: 'aparece-em',
        de: { app: 'ficha', tipo: 'ficha', id: 'f-alexandre' },
        para: refCena,
      }),
      baseLigacao({
        id: 'lig-jog-1',
        tipo: 'aparece-em',
        de: { app: 'ficha', tipo: 'ficha', id: 'f-thiago' },
        para: refCena,
      }),
      baseLigacao({
        id: 'lig-zumbi',
        tipo: 'aparece-em',
        de: { app: 'ficha', tipo: 'ficha', id: 'f-zumbi' },
        para: refCena,
      }),
      baseLigacao({
        id: 'lig-aberracao',
        tipo: 'aparece-em',
        de: { app: 'ficha', tipo: 'ficha', id: 'f-aberracao' },
        para: refCena,
      }),
      baseLigacao({
        id: 'lig-pista',
        tipo: 'revela',
        de: refCena,
        para: { app: 'atelie', tipo: 'documento', id: 'doc-simbolo' },
      }),
    ];

    const pacote = extrairPacoteDeCena(cena, entidades, ligacoes);

    assert.equal(pacote.cenaId, 'cena-1');
    assert.equal(pacote.mapa?.entidade?.nome, 'Porão Sombrio');
    assert.equal(pacote.trilha?.entidade?.nome, 'Tensão Oculta');
    assert.equal(pacote.pistas.length, 1);
    assert.equal(pacote.pistas[0]?.entidade?.nome, 'Símbolo Gravado');

    // Participantes: personagens primeiro (Alexandre, Thiago), depois ameaças (Aberração, Zumbi)
    assert.equal(pacote.participantes.length, 4);
    assert.deepEqual(
      pacote.participantes.map(p => ({
        nome: p.entidade?.nome,
        ehAmeaca: p.ehAmeaca,
      })),
      [
        { nome: 'Alexandre Ramos', ehAmeaca: false },
        { nome: 'Thiago Fritz', ehAmeaca: false },
        { nome: 'Aberração de Carne', ehAmeaca: true },
        { nome: 'Zumbi de Sangue', ehAmeaca: true },
      ],
    );
  });

  it('candidatos de mapa, trilha, participantes e pistas filtram e ordenam corretamente', () => {
    const l1 = baseEntidade({ id: 'l1', tipo: 'lugar', nome: 'Zoológico Abandonado' });
    const l2 = baseEntidade({ id: 'l2', tipo: 'lugar', nome: 'Asilo Arkham' });
    const c1 = baseEntidade({ id: 'c1', tipo: 'cena', nome: 'Cena Qualquer' });
    const t1 = baseEntidade({
      id: 't1',
      tipo: 'efeito',
      nome: 'Chuva Forte',
      refs: [{ app: 'jukebox', tipo: 'efeito', id: 'chuva' }],
    });
    const p1 = baseEntidade({ id: 'p1', tipo: 'personagem', nome: 'Dante' });
    const p2 = baseEntidade({ id: 'p2', tipo: 'personagem', nome: 'Bia' });
    const a1 = baseEntidade({ id: 'a1', tipo: 'ameaca', nome: 'Zumbi de Sangue' });
    const doc1 = baseEntidade({ id: 'd1', tipo: 'pista', nome: 'Carta Rasgada' });

    const todas = [l1, l2, c1, t1, p1, p2, a1, doc1];

    // Candidatos de mapa: apenas lugares, ordenados alfabeticamente
    const mapas = candidatosDeMapa(todas);
    assert.deepEqual(mapas.map(m => m.nome), ['Asilo Arkham', 'Zoológico Abandonado']);

    // Candidatos de trilha: e.refs de jukebox ou tipo efeito
    const trilhas = candidatosDeTrilha(todas);
    assert.deepEqual(trilhas.map(t => t.nome), ['Chuva Forte']);

    // Candidatos de participantes: personagens primeiro, depois ameaças; exclui já participantes
    const partesDisponiveis = candidatosDeParticipantes(todas, [
      {
        ref: refDaEntidade('p2'),
        entidade: p2,
        ehAmeaca: false,
        ligacaoId: 'lig-1',
      },
    ]);
    assert.deepEqual(partesDisponiveis.map(p => p.nome), ['Dante', 'Zumbi de Sangue']);

    // Candidatos de pistas: exclui já pistas ligadas
    const pistasDisponiveis = candidatosDePistas(todas, [
      {
        ref: refDaEntidade('d1'),
        entidade: doc1,
        ligacaoId: 'lig-pista',
      },
    ]);
    assert.equal(pistasDisponiveis.length, 0);
  });

  it('ehEncontro reconhece tag encontro e combate', () => {
    const cenaNormal = baseEntidade({ id: 'c1', tipo: 'cena', nome: 'Diálogo', tags: ['investigação'] });
    const cenaEncontro = baseEntidade({ id: 'c2', tipo: 'cena', nome: 'Emboscada', tags: ['#encontro'] });
    const cenaCombate = baseEntidade({ id: 'c3', tipo: 'cena', nome: 'Chefe Final', tags: ['combate'] });
    const outroTipo = baseEntidade({ id: 'p1', tipo: 'personagem', nome: 'Guerreiro', tags: ['combate'] });

    assert.equal(ehEncontro(cenaNormal), false);
    assert.equal(ehEncontro(cenaEncontro), true);
    assert.equal(ehEncontro(cenaCombate), true);
    assert.equal(ehEncontro(outroTipo), false);
  });
});

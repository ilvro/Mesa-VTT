import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Entidade } from '#mesa';
import {
  pendenciasDaCena,
  pendenciasDaSessao,
  type FatosDaCampanha,
  type Pendencia,
} from '../../src/dominio/prontidao.ts';
import type { PacoteDeCena } from '../../src/dominio/cenas.ts';

function entidadeTeste(parcial: Partial<Entidade> & { id: string; tipo: Entidade['tipo']; nome: string }): Entidade {
  return {
    campanhaId: 'camp-1',
    notas: '',
    refs: [],
    tags: [],
    criadaPor: 'mesa',
    criadaEm: 1,
    atualizadaEm: 1,
    ...parcial,
  };
}

describe('prontidao (domínio)', () => {
  const fatosVazios: FatosDaCampanha = {
    documentosEntregues: new Set(),
    trilhas: new Map(),
    elenco: undefined,
  };

  it('cena sem nada não gera erro e aponta sem-mapa', () => {
    const vazia: PacoteDeCena = {
      cenaId: 'c-vazia',
      mapa: null,
      trilha: null,
      participantes: [],
      pistas: [],
    };
    let pendencias: Pendencia[] = [];
    assert.doesNotThrow(() => {
      pendencias = pendenciasDaCena(vazia, fatosVazios);
    });
    assert.ok(Array.isArray(pendencias));
    assert.equal(pendencias.length, 1);
    assert.equal(pendencias[0]?.tipo, 'sem-mapa');
    assert.equal(pendencias[0]?.cenaId, 'c-vazia');
  });

  it('detecta momento-sem-mapa quando há momento de abertura mas não há mapa', () => {
    const pacote: PacoteDeCena = {
      cenaId: 'c-momento',
      mapa: null,
      momento: 'O Despertar',
      trilha: null,
      participantes: [],
      pistas: [],
    };
    const pendencias = pendenciasDaCena(pacote, fatosVazios);
    assert.equal(pendencias.length, 1);
    assert.equal(pendencias[0]?.tipo, 'momento-sem-mapa');
    assert.equal(pendencias[0]?.cenaId, 'c-momento');
  });

  it('detecta trilha-incompleta quando há faixas faltando na Jukebox', () => {
    const fatos: FatosDaCampanha = {
      ...fatosVazios,
      trilhas: new Map([['t1', { total: 4, faltando: 2 }]]),
    };
    const pacote: PacoteDeCena = {
      cenaId: 'c-trilha',
      mapa: { ref: { app: 'atlas', tipo: 'mapa', id: 'm1' }, ligacaoId: 'l1' },
      trilha: { ref: { app: 'jukebox', tipo: 'cena-sonora', id: 't1' }, ligacaoId: 'l2' },
      participantes: [],
      pistas: [],
    };
    const pendencias = pendenciasDaCena(pacote, fatos);
    assert.equal(pendencias.length, 1);
    assert.equal(pendencias[0]?.tipo, 'trilha-incompleta');
    if (pendencias[0]?.tipo === 'trilha-incompleta') {
      assert.equal(pendencias[0].total, 4);
      assert.equal(pendencias[0].faltando, 2);
    }
  });

  it('detecta trilha-desconhecida quando a Jukebox não respondeu (null)', () => {
    const fatos: FatosDaCampanha = {
      ...fatosVazios,
      trilhas: new Map([['t-desconhecida', null]]),
    };
    const pacote: PacoteDeCena = {
      cenaId: 'c-trilha-desc',
      mapa: { ref: { app: 'atlas', tipo: 'mapa', id: 'm1' }, ligacaoId: 'l1' },
      trilha: { ref: { app: 'jukebox', tipo: 'cena-sonora', id: 't-desconhecida' }, ligacaoId: 'l2' },
      participantes: [],
      pistas: [],
    };
    const pendencias = pendenciasDaCena(pacote, fatos);
    assert.equal(pendencias.length, 1);
    assert.equal(pendencias[0]?.tipo, 'trilha-desconhecida');
  });

  it('detecta documento-nao-entregue para pistas cujo ID não está no banco', () => {
    const fatos: FatosDaCampanha = {
      ...fatosVazios,
      documentosEntregues: new Set(['doc-entregue']),
    };
    const pacote: PacoteDeCena = {
      cenaId: 'c-pistas',
      mapa: { ref: { app: 'atlas', tipo: 'mapa', id: 'm1' }, ligacaoId: 'l1' },
      trilha: null,
      participantes: [],
      pistas: [
        {
          ref: { app: 'atelie', tipo: 'documento', id: 'doc-entregue' },
          ligacaoId: 'lp1',
          entidade: entidadeTeste({ id: 'e-doc1', tipo: 'pista', nome: 'Carta Entregue' }),
        },
        {
          ref: { app: 'atelie', tipo: 'documento', id: 'doc-pendente' },
          ligacaoId: 'lp2',
          entidade: entidadeTeste({ id: 'e-doc2', tipo: 'pista', nome: 'Diário Secreto' }),
        },
      ],
    };
    const pendencias = pendenciasDaCena(pacote, fatos);
    assert.equal(pendencias.length, 1);
    assert.equal(pendencias[0]?.tipo, 'documento-nao-entregue');
    if (pendencias[0]?.tipo === 'documento-nao-entregue') {
      assert.equal(pendencias[0].entidadeId, 'e-doc2');
      assert.equal(pendencias[0].nome, 'Diário Secreto');
    }
  });

  it('detecta fora-do-elenco apenas para personagens quando elenco está definido', () => {
    const fatos: FatosDaCampanha = {
      ...fatosVazios,
      elenco: ['p-elenco-1'],
    };
    const pacote: PacoteDeCena = {
      cenaId: 'c-participantes',
      mapa: { ref: { app: 'atlas', tipo: 'mapa', id: 'm1' }, ligacaoId: 'l1' },
      trilha: null,
      participantes: [
        {
          ref: { app: 'ficha', tipo: 'personagem', id: 'f1' },
          ligacaoId: 'l-part1',
          ehAmeaca: false,
          entidade: entidadeTeste({ id: 'p-elenco-1', tipo: 'personagem', nome: 'Investigador Arthur' }),
        },
        {
          ref: { app: 'ficha', tipo: 'personagem', id: 'f2' },
          ligacaoId: 'l-part2',
          ehAmeaca: false,
          entidade: entidadeTeste({ id: 'p-fora', tipo: 'personagem', nome: 'Detetive Boris' }),
        },
        {
          ref: { app: 'ficha', tipo: 'ameaca', id: 'a1' },
          ligacaoId: 'l-part3',
          ehAmeaca: true,
          entidade: entidadeTeste({ id: 'ameaca-1', tipo: 'ameaca', nome: 'Zumbi de Sangue' }),
        },
      ],
      pistas: [],
    };
    const pendencias = pendenciasDaCena(pacote, fatos);
    assert.equal(pendencias.length, 1);
    assert.equal(pendencias[0]?.tipo, 'fora-do-elenco');
    if (pendencias[0]?.tipo === 'fora-do-elenco') {
      assert.equal(pendencias[0].entidadeId, 'p-fora');
      assert.equal(pendencias[0].nome, 'Detetive Boris');
    }
  });

  it('com elenco undefined, nada de fora-do-elenco', () => {
    const fatos: FatosDaCampanha = {
      ...fatosVazios,
      elenco: undefined,
    };
    const pacote: PacoteDeCena = {
      cenaId: 'c-sem-elenco-definido',
      mapa: { ref: { app: 'atlas', tipo: 'mapa', id: 'm1' }, ligacaoId: 'l1' },
      trilha: null,
      participantes: [
        {
          ref: { app: 'ficha', tipo: 'personagem', id: 'f2' },
          ligacaoId: 'l-part2',
          ehAmeaca: false,
          entidade: entidadeTeste({ id: 'p-fora', tipo: 'personagem', nome: 'Detetive Boris' }),
        },
      ],
      pistas: [],
    };
    const pendencias = pendenciasDaCena(pacote, fatos);
    assert.equal(pendencias.length, 0);
  });

  it('pendenciasDaSessao agrega pendências de múltiplos pacotes de cena', () => {
    const fatos: FatosDaCampanha = {
      ...fatosVazios,
      elenco: ['p1'],
    };
    const pacotes: PacoteDeCena[] = [
      {
        cenaId: 'cena-1',
        mapa: null,
        trilha: null,
        participantes: [],
        pistas: [],
      },
      {
        cenaId: 'cena-2',
        mapa: { ref: { app: 'atlas', tipo: 'mapa', id: 'm1' }, ligacaoId: 'l1' },
        trilha: null,
        participantes: [
          {
            ref: { app: 'ficha', tipo: 'personagem', id: 'f2' },
            ligacaoId: 'l2',
            ehAmeaca: false,
            entidade: entidadeTeste({ id: 'p-fora', tipo: 'personagem', nome: 'Clara' }),
          },
        ],
        pistas: [],
      },
    ];
    const pendencias = pendenciasDaSessao(pacotes, fatos);
    assert.equal(pendencias.length, 2);
    assert.equal(pendencias[0]?.tipo, 'sem-mapa');
    assert.equal(pendencias[1]?.tipo, 'fora-do-elenco');
  });
});


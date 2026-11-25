import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  atualizarAmostraRelogio,
  deveCorrigirPosicao,
  estimarDiferencaRelogio,
  ganhoEfetivo,
  gravarPreferenciasDeSom,
  lerDadosDoEfeito,
  lerDadosDoMix,
  lerPreferenciasDeSom,
  mixEstaVelho,
  posicaoEsperada,
  resolverUrlDoSom,
} from '../../../src/online/sincronia.ts';

describe('sincronia de relógio', () => {
  it('estima diferença descontando metade do RTT e prefere menor RTT', () => {
    const a1 = estimarDiferencaRelogio(1000, 1100, 5050);
    assert.equal(a1.rttMs, 100);
    assert.equal(a1.diferencaMs, 4000);

    const a2 = estimarDiferencaRelogio(2000, 2300, 6150);
    assert.equal(a2.rttMs, 300);
    assert.equal(atualizarAmostraRelogio(a1, a2), a1);

    const a3 = estimarDiferencaRelogio(3000, 3040, 7020);
    assert.equal(a3.rttMs, 40);
    assert.equal(atualizarAmostraRelogio(a1, a3), a3);
  });
});

describe('posição esperada e deriva', () => {
  it('calcula posição considerando taxa e pausada', () => {
    assert.equal(posicaoEsperada({ posicao: 10, taxa: 1.5, desde: 1000, pausada: false }, 3000), 13);
    assert.equal(posicaoEsperada({ posicao: 10, taxa: 1.5, desde: 1000, pausada: true }, 9000), 10);
    assert.equal(posicaoEsperada({ posicao: 5, taxa: 1, desde: 5000, pausada: false }, 4000), 5);
  });

  it('decide corrigir apenas acima de 1,5 s', () => {
    assert.equal(deveCorrigirPosicao(10, 11.4), false);
    assert.equal(deveCorrigirPosicao(10, 11.5), false);
    assert.equal(deveCorrigirPosicao(10, 11.6), true);
  });

  it('detecta mix velho após 10 s', () => {
    assert.equal(mixEstaVelho([], 50_000), false);
    assert.equal(mixEstaVelho([{ desde: 42_000 }], 50_000), false);
    assert.equal(mixEstaVelho([{ desde: 39_000 }], 50_000), true);
  });
});

describe('preferências de som e URLs', () => {
  it('lê e grava preferências com fallback seguro e multiplica pelo mestre', () => {
    const mapa = new Map<string, string>();
    const storage = {
      getItem: (k: string) => mapa.get(k) ?? null,
      setItem: (k: string, v: string) => { mapa.set(k, v); },
    };

    assert.deepEqual(lerPreferenciasDeSom(storage), { musica: 1, efeitos: 1, mudo: false });
    gravarPreferenciasDeSom({ musica: 0.6, efeitos: 0.4, mudo: false }, storage);
    const lido = lerPreferenciasDeSom(storage);
    assert.deepEqual(lido, { musica: 0.6, efeitos: 0.4, mudo: false });

    assert.ok(Math.abs(ganhoEfetivo('musica', lido, 0.5) - 0.3) < 1e-9);
    assert.equal(ganhoEfetivo('musica', { ...lido, mudo: true }, 1), 0);
  });

  it('resolve URL de sample contra a base do Jukebox (normal e Discord)', () => {
    assert.equal(
      resolverUrlDoSom('sample/chuva.mp3', 'http://127.0.0.1:5100/Jukebox/'),
      'http://127.0.0.1:5100/Jukebox/sample/chuva.mp3',
    );
    assert.equal(
      resolverUrlDoSom('/sample/chuva.mp3', 'https://1573405277389197415.discordsays.com/.proxy/Jukebox/'),
      'https://1573405277389197415.discordsays.com/.proxy/Jukebox/sample/chuva.mp3',
    );
  });

  it('lê dados de mix e efeito com segurança', () => {
    assert.equal(lerDadosDoMix(null), null);
    assert.deepEqual(lerDadosDoMix({ mestre: 0.8, faixas: [{ faixaId: 'f1', posicao: 2, taxa: 1, desde: 100, pausada: false }] }), {
      mestre: 0.8,
      faixas: [{ faixaId: 'f1', posicao: 2, taxa: 1, desde: 100, pausada: false }],
    });
    assert.deepEqual(lerDadosDoEfeito({ faixaId: 'sfx1', url: 'sample/b.mp3' }), {
      faixaId: 'sfx1',
      url: 'sample/b.mp3',
    });
  });
});

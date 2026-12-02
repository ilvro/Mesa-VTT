import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CHAVE_PREFS_SOM } from '../../../src/online/sincronia.ts';
import { resetarSomDesafios, tocarEfeitoDesafio, type EfeitoDesafio } from '../../../src/jogar/som-desafios.ts';

const TODOS_EFEITOS: readonly EfeitoDesafio[] = [
  'pino-girar',
  'pino-tentar',
  'lockpick-aberto',
  'lockpick-travado',
  'balanca-inclinar',
  'balanca-estavel',
  'balanca-queda',
  'esconderijo-dado',
  'esconderijo-busca',
  'esconderijo-descoberto',
  'folego-gastar',
  'perseguicao-avanco',
  'perseguicao-derrubado',
  'escalada-subir',
  'escalada-queda',
];

function criarParamMock() {
  return {
    setValueAtTime: (_v: number, _t: number) => {},
    linearRampToValueAtTime: (_v: number, _t: number) => {},
    exponentialRampToValueAtTime: (_v: number, _t: number) => {},
  };
}

class MockAudioContext {
  static instancias: MockAudioContext[] = [];
  state: AudioContextState = 'running';
  currentTime = 1.5;
  sampleRate = 44100;
  destination = { tipo: 'destination' } as unknown as AudioDestinationNode;
  conexoesAoDestino = 0;
  chamadasResume = 0;

  constructor() {
    MockAudioContext.instancias.push(this);
  }

  resume(): Promise<void> {
    this.chamadasResume++;
    return Promise.resolve();
  }

  private criarNoBase() {
    return {
      connect: (alvo: unknown) => {
        if (alvo === this.destination) {
          this.conexoesAoDestino++;
        }
        return alvo;
      },
    };
  }

  createGain() {
    return {
      ...this.criarNoBase(),
      gain: criarParamMock(),
    };
  }

  createOscillator() {
    return {
      ...this.criarNoBase(),
      type: 'sine' as OscillatorType,
      frequency: criarParamMock(),
      start: (_t?: number) => {},
      stop: (_t?: number) => {},
    };
  }

  createBiquadFilter() {
    return {
      ...this.criarNoBase(),
      type: 'lowpass' as BiquadFilterType,
      frequency: criarParamMock(),
      Q: criarParamMock(),
    };
  }

  createBuffer(_canais: number, tamanho: number) {
    const dados = new Float32Array(tamanho);
    return {
      getChannelData: () => dados,
    };
  }

  createBufferSource() {
    return {
      ...this.criarNoBase(),
      buffer: null as AudioBuffer | null,
      start: (_t?: number) => {},
      stop: (_t?: number) => {},
    };
  }
}

function criarStorageMemoria(inicial: Record<string, string> = {}) {
  const mapa = new Map<string, string>(Object.entries(inicial));
  return {
    getItem: (chave: string) => mapa.get(chave) ?? null,
    setItem: (chave: string, valor: string) => {
      mapa.set(chave, valor);
    },
    removeItem: (chave: string) => {
      mapa.delete(chave);
    },
    clear: () => {
      mapa.clear();
    },
  };
}

describe('som-desafios', () => {
  const audioContextOriginal = (globalThis as Record<string, unknown>).AudioContext;
  const webkitAudioContextOriginal = (globalThis as Record<string, unknown>).webkitAudioContext;
  const localStorageOriginal = (globalThis as Record<string, unknown>).localStorage;

  beforeEach(() => {
    resetarSomDesafios();
    MockAudioContext.instancias = [];
    Object.defineProperty(globalThis, 'localStorage', {
      value: criarStorageMemoria(),
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    resetarSomDesafios();
    if (audioContextOriginal === undefined) {
      delete (globalThis as Record<string, unknown>).AudioContext;
    } else {
      Object.defineProperty(globalThis, 'AudioContext', {
        value: audioContextOriginal,
        configurable: true,
        writable: true,
      });
    }
    if (webkitAudioContextOriginal === undefined) {
      delete (globalThis as Record<string, unknown>).webkitAudioContext;
    } else {
      Object.defineProperty(globalThis, 'webkitAudioContext', {
        value: webkitAudioContextOriginal,
        configurable: true,
        writable: true,
      });
    }
    if (localStorageOriginal === undefined) {
      delete (globalThis as Record<string, unknown>).localStorage;
    } else {
      Object.defineProperty(globalThis, 'localStorage', {
        value: localStorageOriginal,
        configurable: true,
        writable: true,
      });
    }
  });

  it('não lança exceção quando AudioContext não existe', () => {
    delete (globalThis as Record<string, unknown>).AudioContext;
    delete (globalThis as Record<string, unknown>).webkitAudioContext;

    for (const efeito of TODOS_EFEITOS) {
      assert.doesNotThrow(() => tocarEfeitoDesafio(efeito));
    }
  });

  it('não cria AudioContext nem toca som quando mudo está ativo ou efeitos = 0', () => {
    Object.defineProperty(globalThis, 'AudioContext', {
      value: MockAudioContext,
      configurable: true,
      writable: true,
    });

    localStorage.setItem(CHAVE_PREFS_SOM, JSON.stringify({ musica: 1, efeitos: 1, mudo: true }));
    tocarEfeitoDesafio('pino-girar');
    assert.equal(MockAudioContext.instancias.length, 0);

    localStorage.setItem(CHAVE_PREFS_SOM, JSON.stringify({ musica: 1, efeitos: 0, mudo: false }));
    tocarEfeitoDesafio('lockpick-aberto');
    assert.equal(MockAudioContext.instancias.length, 0);
  });

  it('executa todos os 15 tipos de EfeitoDesafio sem erro, reutiliza o contexto e conecta ao destino', () => {
    Object.defineProperty(globalThis, 'AudioContext', {
      value: MockAudioContext,
      configurable: true,
      writable: true,
    });

    assert.equal(TODOS_EFEITOS.length, 15);

    for (let i = 0; i < TODOS_EFEITOS.length; i++) {
      const efeito = TODOS_EFEITOS[i]!;
      assert.doesNotThrow(() => tocarEfeitoDesafio(efeito));
      assert.equal(MockAudioContext.instancias.length, 1);
      assert.equal(MockAudioContext.instancias[0]!.conexoesAoDestino, i + 1);
    }
  });

  it('chama resume() quando o AudioContext está suspenso', () => {
    class MockSuspendedAudioContext extends MockAudioContext {
      override state: AudioContextState = 'suspended';
    }
    Object.defineProperty(globalThis, 'AudioContext', {
      value: MockSuspendedAudioContext,
      configurable: true,
      writable: true,
    });

    tocarEfeitoDesafio('folego-gastar');
    assert.equal(MockAudioContext.instancias.length, 1);
    assert.equal(MockAudioContext.instancias[0]!.chamadasResume, 1);
    assert.equal(MockAudioContext.instancias[0]!.conexoesAoDestino, 1);
  });
});

/**
 * Efeitos sonoros procedurais (Web Audio API) para os desafios de Ordem Paranormal 2.
 * Leve, tátil, discreto e 100% seguro em ambientes sem `AudioContext`.
 * Respeita o volume de efeitos e o mudo configurados em `lerPreferenciasDeSom`.
 */
import { ganhoEfetivo, lerPreferenciasDeSom } from '../online/sincronia.ts';

export type EfeitoDesafio =
  | 'pino-girar'
  | 'pino-tentar'
  | 'lockpick-aberto'
  | 'lockpick-travado'
  | 'balanca-inclinar'
  | 'balanca-estavel'
  | 'balanca-queda'
  | 'esconderijo-dado'
  | 'esconderijo-busca'
  | 'esconderijo-descoberto'
  | 'folego-gastar'
  | 'perseguicao-avanco'
  | 'perseguicao-derrubado'
  | 'escalada-subir'
  | 'escalada-queda';

const NIVEL_BASE = 0.36;
const LIMIAR_SILENCIO = 0.001;
const MIN_EXP = 0.0001;

type ConstrutorAudioContext = new () => AudioContext;

let contextoUnico: AudioContext | null = null;
let bufferRuidoCache: AudioBuffer | null = null;

function obterConstrutorAudioContext(): ConstrutorAudioContext | null {
  const g = globalThis as typeof globalThis & {
    AudioContext?: ConstrutorAudioContext;
    webkitAudioContext?: ConstrutorAudioContext;
  };
  return g.AudioContext ?? g.webkitAudioContext ?? null;
}

function obterContexto(): AudioContext | null {
  if (contextoUnico && contextoUnico.state !== 'closed') {
    return contextoUnico;
  }
  const Ctor = obterConstrutorAudioContext();
  if (!Ctor) return null;
  contextoUnico = new Ctor();
  bufferRuidoCache = null;
  return contextoUnico;
}

function obterBufferRuido(ctx: AudioContext): AudioBuffer {
  if (bufferRuidoCache) return bufferRuidoCache;
  const taxa = ctx.sampleRate || 44100;
  const tamanho = Math.max(1, Math.floor(taxa * 0.5));
  const buffer = ctx.createBuffer(1, tamanho, taxa);
  const canal = buffer.getChannelData(0);
  for (let i = 0; i < tamanho; i++) {
    canal[i] = Math.random() * 2 - 1;
  }
  bufferRuidoCache = buffer;
  return buffer;
}

/** Reinicia o contexto de áudio em cache (útil para testes). */
export function resetarSomDesafios(): void {
  contextoUnico = null;
  bufferRuidoCache = null;
}

function criarTom(
  ctx: AudioContext,
  destino: AudioNode,
  opcoes: {
    tipo: OscillatorType;
    inicio: number;
    duracao: number;
    freqInicial: number;
    freqFinal?: number;
    ataque?: number;
    ganho: number;
    filtro?: { tipo: BiquadFilterType; freqInicial: number; freqFinal?: number; q?: number };
  },
): void {
  const { tipo, inicio, duracao, freqInicial, freqFinal, ataque = 0.006, ganho, filtro } = opcoes;
  const fim = inicio + duracao;

  const osc = ctx.createOscillator();
  osc.type = tipo;
  osc.frequency.setValueAtTime(Math.max(1, freqInicial), inicio);
  if (freqFinal !== undefined && freqFinal !== freqInicial) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqFinal), fim);
  }

  const env = ctx.createGain();
  const pico = Math.max(MIN_EXP, ganho);
  env.gain.setValueAtTime(MIN_EXP, inicio);
  env.gain.linearRampToValueAtTime(pico, inicio + Math.min(ataque, duracao * 0.5));
  env.gain.exponentialRampToValueAtTime(MIN_EXP, fim);

  if (filtro) {
    const flt = ctx.createBiquadFilter();
    flt.type = filtro.tipo;
    flt.frequency.setValueAtTime(Math.max(1, filtro.freqInicial), inicio);
    if (filtro.freqFinal !== undefined && filtro.freqFinal !== filtro.freqInicial) {
      flt.frequency.exponentialRampToValueAtTime(Math.max(1, filtro.freqFinal), fim);
    }
    if (filtro.q !== undefined) {
      flt.Q.setValueAtTime(filtro.q, inicio);
    }
    osc.connect(flt);
    flt.connect(env);
  } else {
    osc.connect(env);
  }

  env.connect(destino);
  osc.start(inicio);
  osc.stop(fim + 0.01);
}

function criarRuido(
  ctx: AudioContext,
  destino: AudioNode,
  opcoes: {
    inicio: number;
    duracao: number;
    ataque?: number;
    ganho: number;
    filtroTipo: BiquadFilterType;
    freqInicial: number;
    freqFinal?: number;
    q?: number;
  },
): void {
  const { inicio, duracao, ataque = 0.004, ganho, filtroTipo, freqInicial, freqFinal, q = 1.5 } = opcoes;
  const fim = inicio + duracao;

  const src = ctx.createBufferSource();
  src.buffer = obterBufferRuido(ctx);

  const flt = ctx.createBiquadFilter();
  flt.type = filtroTipo;
  flt.frequency.setValueAtTime(Math.max(1, freqInicial), inicio);
  if (freqFinal !== undefined && freqFinal !== freqInicial) {
    flt.frequency.exponentialRampToValueAtTime(Math.max(1, freqFinal), fim);
  }
  flt.Q.setValueAtTime(q, inicio);

  const env = ctx.createGain();
  const pico = Math.max(MIN_EXP, ganho);
  env.gain.setValueAtTime(MIN_EXP, inicio);
  env.gain.linearRampToValueAtTime(pico, inicio + Math.min(ataque, duracao * 0.5));
  env.gain.exponentialRampToValueAtTime(MIN_EXP, fim);

  src.connect(flt);
  flt.connect(env);
  env.connect(destino);
  src.start(inicio);
  src.stop(fim + 0.01);
}

function sintetizarEfeito(ctx: AudioContext, saida: AudioNode, efeito: EfeitoDesafio, t: number): void {
  switch (efeito) {
    case 'pino-girar': {
      criarRuido(ctx, saida, {
        inicio: t,
        duracao: 0.035,
        ataque: 0.002,
        ganho: 0.55,
        filtroTipo: 'bandpass',
        freqInicial: 2400,
        q: 4.5,
      });
      criarTom(ctx, saida, {
        tipo: 'sine',
        inicio: t,
        duracao: 0.025,
        freqInicial: 3100,
        freqFinal: 2200,
        ataque: 0.002,
        ganho: 0.14,
      });
      return;
    }

    case 'pino-tentar': {
      criarRuido(ctx, saida, {
        inicio: t,
        duracao: 0.038,
        ataque: 0.002,
        ganho: 0.5,
        filtroTipo: 'bandpass',
        freqInicial: 1400,
        q: 5,
      });
      criarTom(ctx, saida, {
        tipo: 'triangle',
        inicio: t,
        duracao: 0.032,
        freqInicial: 1400,
        freqFinal: 1120,
        ataque: 0.002,
        ganho: 0.2,
      });
      criarRuido(ctx, saida, {
        inicio: t + 0.055,
        duracao: 0.045,
        ataque: 0.002,
        ganho: 0.55,
        filtroTipo: 'bandpass',
        freqInicial: 900,
        q: 4,
      });
      criarTom(ctx, saida, {
        tipo: 'triangle',
        inicio: t + 0.055,
        duracao: 0.04,
        freqInicial: 900,
        freqFinal: 680,
        ataque: 0.002,
        ganho: 0.22,
      });
      return;
    }

    case 'lockpick-aberto': {
      criarRuido(ctx, saida, {
        inicio: t,
        duracao: 0.055,
        ataque: 0.003,
        ganho: 0.45,
        filtroTipo: 'bandpass',
        freqInicial: 1850,
        freqFinal: 1200,
        q: 3.5,
      });
      criarTom(ctx, saida, {
        tipo: 'sine',
        inicio: t,
        duracao: 0.065,
        freqInicial: 230,
        freqFinal: 145,
        ataque: 0.003,
        ganho: 0.35,
      });
      const notas = [
        { freq: 329.63, tipo: 'triangle' as const, ganho: 0.24 },
        { freq: 493.88, tipo: 'sine' as const, ganho: 0.2 },
        { freq: 659.25, tipo: 'sine' as const, ganho: 0.14 },
      ];
      for (const nota of notas) {
        criarTom(ctx, saida, {
          tipo: nota.tipo,
          inicio: t + 0.05,
          duracao: 0.36,
          freqInicial: nota.freq,
          ataque: 0.015,
          ganho: nota.ganho,
        });
      }
      return;
    }

    case 'lockpick-travado': {
      criarTom(ctx, saida, {
        tipo: 'sawtooth',
        inicio: t,
        duracao: 0.15,
        freqInicial: 120,
        freqFinal: 55,
        ataque: 0.003,
        ganho: 0.55,
        filtro: { tipo: 'lowpass', freqInicial: 420, freqFinal: 160, q: 1.5 },
      });
      criarRuido(ctx, saida, {
        inicio: t,
        duracao: 0.075,
        ataque: 0.002,
        ganho: 0.45,
        filtroTipo: 'bandpass',
        freqInicial: 650,
        freqFinal: 320,
        q: 2.5,
      });
      return;
    }

    case 'balanca-inclinar': {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(180, t);
      osc.frequency.exponentialRampToValueAtTime(235, t + 0.11);
      osc.frequency.exponentialRampToValueAtTime(165, t + 0.24);

      const flt = ctx.createBiquadFilter();
      flt.type = 'bandpass';
      flt.frequency.setValueAtTime(720, t);
      flt.frequency.exponentialRampToValueAtTime(920, t + 0.11);
      flt.frequency.exponentialRampToValueAtTime(600, t + 0.24);
      flt.Q.setValueAtTime(4, t);

      const env = ctx.createGain();
      env.gain.setValueAtTime(MIN_EXP, t);
      env.gain.linearRampToValueAtTime(0.28, t + 0.05);
      env.gain.exponentialRampToValueAtTime(MIN_EXP, t + 0.25);

      osc.connect(flt);
      flt.connect(env);
      env.connect(saida);
      osc.start(t);
      osc.stop(t + 0.26);

      criarRuido(ctx, saida, {
        inicio: t + 0.02,
        duracao: 0.14,
        ataque: 0.02,
        ganho: 0.15,
        filtroTipo: 'bandpass',
        freqInicial: 2500,
        freqFinal: 1900,
        q: 3,
      });
      return;
    }

    case 'balanca-estavel': {
      criarTom(ctx, saida, {
        tipo: 'sine',
        inicio: t,
        duracao: 0.38,
        freqInicial: 528,
        ataque: 0.008,
        ganho: 0.34,
      });
      criarTom(ctx, saida, {
        tipo: 'sine',
        inicio: t,
        duracao: 0.28,
        freqInicial: 1056,
        ataque: 0.008,
        ganho: 0.12,
      });
      return;
    }

    case 'balanca-queda': {
      criarTom(ctx, saida, {
        tipo: 'sine',
        inicio: t,
        duracao: 0.34,
        freqInicial: 190,
        freqFinal: 46,
        ataque: 0.005,
        ganho: 0.65,
      });
      criarRuido(ctx, saida, {
        inicio: t + 0.03,
        duracao: 0.28,
        ataque: 0.008,
        ganho: 0.4,
        filtroTipo: 'lowpass',
        freqInicial: 520,
        freqFinal: 140,
        q: 1.2,
      });
      return;
    }

    case 'esconderijo-dado': {
      criarRuido(ctx, saida, {
        inicio: t,
        duracao: 0.032,
        ataque: 0.002,
        ganho: 0.3,
        filtroTipo: 'bandpass',
        freqInicial: 950,
        q: 3,
      });
      criarTom(ctx, saida, {
        tipo: 'sine',
        inicio: t,
        duracao: 0.035,
        freqInicial: 300,
        freqFinal: 210,
        ataque: 0.002,
        ganho: 0.22,
      });
      criarRuido(ctx, saida, {
        inicio: t + 0.065,
        duracao: 0.028,
        ataque: 0.002,
        ganho: 0.2,
        filtroTipo: 'bandpass',
        freqInicial: 1050,
        q: 3.2,
      });
      criarRuido(ctx, saida, {
        inicio: t + 0.02,
        duracao: 0.1,
        ataque: 0.02,
        ganho: 0.12,
        filtroTipo: 'bandpass',
        freqInicial: 1800,
        q: 1.6,
      });
      return;
    }

    case 'esconderijo-busca': {
      criarTom(ctx, saida, {
        tipo: 'sine',
        inicio: t,
        duracao: 0.13,
        freqInicial: 68,
        freqFinal: 42,
        ataque: 0.01,
        ganho: 0.65,
      });
      criarTom(ctx, saida, {
        tipo: 'sine',
        inicio: t + 0.16,
        duracao: 0.17,
        freqInicial: 60,
        freqFinal: 38,
        ataque: 0.01,
        ganho: 0.48,
      });
      criarRuido(ctx, saida, {
        inicio: t,
        duracao: 0.28,
        ataque: 0.03,
        ganho: 0.14,
        filtroTipo: 'lowpass',
        freqInicial: 220,
        freqFinal: 130,
        q: 1,
      });
      return;
    }

    case 'esconderijo-descoberto': {
      criarTom(ctx, saida, {
        tipo: 'sawtooth',
        inicio: t,
        duracao: 0.38,
        freqInicial: 220,
        freqFinal: 214,
        ataque: 0.008,
        ganho: 0.32,
        filtro: { tipo: 'lowpass', freqInicial: 1600, freqFinal: 520, q: 2 },
      });
      criarTom(ctx, saida, {
        tipo: 'sawtooth',
        inicio: t,
        duracao: 0.38,
        freqInicial: 311.13,
        freqFinal: 304,
        ataque: 0.008,
        ganho: 0.3,
        filtro: { tipo: 'lowpass', freqInicial: 1600, freqFinal: 520, q: 2 },
      });
      criarTom(ctx, saida, {
        tipo: 'sine',
        inicio: t,
        duracao: 0.2,
        freqInicial: 76,
        freqFinal: 44,
        ataque: 0.005,
        ganho: 0.5,
      });
      return;
    }

    case 'folego-gastar': {
      const src = ctx.createBufferSource();
      src.buffer = obterBufferRuido(ctx);

      const flt = ctx.createBiquadFilter();
      flt.type = 'bandpass';
      flt.frequency.setValueAtTime(680, t);
      flt.frequency.exponentialRampToValueAtTime(1150, t + 0.09);
      flt.frequency.exponentialRampToValueAtTime(620, t + 0.3);
      flt.Q.setValueAtTime(1.8, t);

      const env = ctx.createGain();
      env.gain.setValueAtTime(MIN_EXP, t);
      env.gain.linearRampToValueAtTime(0.45, t + 0.075);
      env.gain.exponentialRampToValueAtTime(MIN_EXP, t + 0.31);

      src.connect(flt);
      flt.connect(env);
      env.connect(saida);
      src.start(t);
      src.stop(t + 0.32);
      return;
    }

    case 'perseguicao-avanco': {
      criarTom(ctx, saida, {
        tipo: 'sine',
        inicio: t,
        duracao: 0.075,
        freqInicial: 132,
        freqFinal: 52,
        ataque: 0.003,
        ganho: 0.55,
      });
      criarRuido(ctx, saida, {
        inicio: t,
        duracao: 0.055,
        ataque: 0.003,
        ganho: 0.36,
        filtroTipo: 'bandpass',
        freqInicial: 850,
        freqFinal: 480,
        q: 1.5,
      });
      return;
    }

    case 'perseguicao-derrubado': {
      criarRuido(ctx, saida, {
        inicio: t,
        duracao: 0.35,
        ataque: 0.008,
        ganho: 0.58,
        filtroTipo: 'lowpass',
        freqInicial: 920,
        freqFinal: 170,
        q: 1.1,
      });
      criarTom(ctx, saida, {
        tipo: 'sine',
        inicio: t,
        duracao: 0.26,
        freqInicial: 115,
        freqFinal: 38,
        ataque: 0.005,
        ganho: 0.6,
      });
      return;
    }

    case 'escalada-subir': {
      criarRuido(ctx, saida, {
        inicio: t,
        duracao: 0.085,
        ataque: 0.005,
        ganho: 0.34,
        filtroTipo: 'bandpass',
        freqInicial: 1500,
        freqFinal: 2100,
        q: 2.2,
      });
      criarRuido(ctx, saida, {
        inicio: t + 0.05,
        duracao: 0.032,
        ataque: 0.002,
        ganho: 0.42,
        filtroTipo: 'bandpass',
        freqInicial: 2200,
        q: 4,
      });
      criarTom(ctx, saida, {
        tipo: 'sine',
        inicio: t + 0.05,
        duracao: 0.035,
        freqInicial: 420,
        freqFinal: 260,
        ataque: 0.002,
        ganho: 0.2,
      });
      return;
    }

    case 'escalada-queda': {
      criarTom(ctx, saida, {
        tipo: 'triangle',
        inicio: t,
        duracao: 0.36,
        freqInicial: 165,
        freqFinal: 44,
        ataque: 0.006,
        ganho: 0.55,
        filtro: { tipo: 'lowpass', freqInicial: 450, freqFinal: 150, q: 1.2 },
      });
      criarRuido(ctx, saida, {
        inicio: t + 0.02,
        duracao: 0.34,
        ataque: 0.015,
        ganho: 0.36,
        filtroTipo: 'lowpass',
        freqInicial: 660,
        freqFinal: 160,
        q: 1,
      });
      return;
    }
  }
}

export function tocarEfeitoDesafio(efeito: EfeitoDesafio): void {
  try {
    const prefs = lerPreferenciasDeSom();
    const volume = ganhoEfetivo('efeitos', prefs, 1);
    if (volume <= LIMIAR_SILENCIO) return;

    const ctx = obterContexto();
    if (!ctx) return;

    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const saida = ctx.createGain();
    saida.gain.setValueAtTime(volume * NIVEL_BASE, ctx.currentTime);
    saida.connect(ctx.destination);

    sintetizarEfeito(ctx, saida, efeito, ctx.currentTime);
  } catch {
    /* silencioso quando Web Audio não estiver disponível ou falhar */
  }
}

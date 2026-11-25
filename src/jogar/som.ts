/**
 * Som sincronizado na casca do jogador (R23):
 * - Um único `AudioContext` + motor de mixagem importado de `/Jukebox/mixing/motor.js`;
 * - Relógio sincronizado com a sala (`bem-vindo.agora` e `ping`/`pong` a cada 30 s);
 * - Download e cache local (Cache Storage) por `faixaId`;
 * - Controles independentes de Música, Efeitos e Mudo no `localStorage`.
 */
import type { ClienteDaSala } from '../online/cliente.ts';
import {
  INTERVALO_PING_RELOGIO_MS,
  agoraDaSala,
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
  type AmostraRelogio,
  type DadosDoMix,
  type EstadoDaFaixa,
  type FaixaDoMix,
  type PreferenciasDeSom,
} from '../online/sincronia.ts';

const CACHE_SONS = 'mesa-online-sons-v1';
const FADE_SAIDA_MS = 300;
const PRAZO_BLOB_SOM_MS = 30_000;

interface FaixaMotor {
  aplicar(estado?: EstadoDaFaixa): void;
  soltar(): void;
}
interface MotorJukebox {
  prepararFaixa(audio: HTMLAudioElement, opcoes?: { destino?: AudioNode }): FaixaMotor;
  volumeMestre(valor: number): void;
}
type CriarMotorFn = (opcoes?: { audioContext?: AudioContext; destino?: AudioNode }) => MotorJukebox;

export interface EstadoDoSomNaCasca {
  preferencias: PreferenciasDeSom;
  bloqueado: boolean;
  preparando: boolean;
}

export interface SomDaCasca {
  readonly estado: EstadoDoSomNaCasca;
  liberar(): void;
  definirMusica(v: number): void;
  definirEfeitos(v: number): void;
  alternarMudo(): void;
  aoMudar(f: (estado: EstadoDoSomNaCasca) => void): () => void;
  fechar(): void;
}

interface FaixaTocando {
  chave: string;
  faixaId: string;
  audio: HTMLAudioElement;
  motor: FaixaMotor;
  saindo?: boolean;
}

export function criarSomDaCasca(o: {
  cliente: ClienteDaSala;
  baseJukebox: string;
  importarMotor?: () => Promise<{ criarMotor: CriarMotorFn }>;
}): SomDaCasca {
  const { cliente, baseJukebox } = o;
  const importarMotor = o.importarMotor ?? (() => import(/* @vite-ignore */ `${baseJukebox}mixing/motor.js`) as Promise<{ criarMotor: CriarMotorFn }>);

  let fechada = false;
  let prefs = lerPreferenciasDeSom();
  let volumeMestreSala = 1;
  let bloqueado = false;
  let preparando = false;
  let liberadoPorGesto = false;

  let amostra: AmostraRelogio | null = null;
  let diferencaFallbackMs = 0;
  let ultimoMix: DadosDoMix | null = null;

  let ctx: AudioContext | null = null;
  let motor: MotorJukebox | null = null;
  let ganhoMusica: GainNode | null = null;
  let ganhoEfeitos: GainNode | null = null;
  let carregandoMotor: Promise<boolean> | null = null;

  const ouvintes = new Set<(e: EstadoDoSomNaCasca) => void>();
  const blobUrls = new Map<string, string>();
  const downloadsEmCurso = new Map<string, Promise<string | null>>();
  const esperandoBlobs = new Map<string, Set<(b: Blob | null) => void>>();
  const faixasAtivas = new Map<string, FaixaTocando>();
  const sfxAtivos = new Set<{ audio: HTMLAudioElement; motor: FaixaMotor }>();

  const snapshot = (): EstadoDoSomNaCasca => ({
    preferencias: { ...prefs },
    bloqueado,
    preparando,
  });
  const notificar = () => {
    const s = snapshot();
    for (const f of [...ouvintes]) f(s);
  };

  const agoraSala = (): number => agoraDaSala(amostra ? amostra.diferencaMs : diferencaFallbackMs);

  const atualizarGanhos = () => {
    if (ganhoMusica) ganhoMusica.gain.value = ganhoEfetivo('musica', prefs, volumeMestreSala);
    if (ganhoEfeitos) ganhoEfeitos.gain.value = ganhoEfetivo('efeitos', prefs, volumeMestreSala);
  };

  async function garantirMotor(): Promise<boolean> {
    if (fechada) return false;
    if (motor && ctx) return true;
    if (carregandoMotor) return carregandoMotor;
    carregandoMotor = (async () => {
      try {
        const AudioCtx = globalThis.AudioContext || (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioCtx) return false;
        ctx = new AudioCtx({ latencyHint: 'playback' });
        ganhoMusica = ctx.createGain();
        ganhoEfeitos = ctx.createGain();
        ganhoMusica.connect(ctx.destination);
        ganhoEfeitos.connect(ctx.destination);
        atualizarGanhos();
        const mod = await importarMotor();
        if (fechada) return false;
        motor = mod.criarMotor({ audioContext: ctx, destino: ctx.destination });
        if (ctx.state === 'suspended' && liberadoPorGesto) {
          await ctx.resume().catch(() => {});
        }
        bloqueado = ctx.state === 'suspended';
        notificar();
        return true;
      } catch {
        return false;
      } finally {
        carregandoMotor = null;
      }
    })();
    return carregandoMotor;
  }

  async function lerDoCache(faixaId: string): Promise<Blob | null> {
    try {
      if (typeof caches === 'undefined') return null;
      const cache = await caches.open(CACHE_SONS);
      const resp = await cache.match(`https://mesa.local/sons/${encodeURIComponent(faixaId)}`);
      return resp ? await resp.blob() : null;
    } catch {
      return null;
    }
  }

  async function gravarNoCache(faixaId: string, blob: Blob): Promise<void> {
    try {
      if (typeof caches === 'undefined') return;
      const cache = await caches.open(CACHE_SONS);
      await cache.put(
        `https://mesa.local/sons/${encodeURIComponent(faixaId)}`,
        new Response(blob, { headers: { 'Content-Type': blob.type || 'audio/mpeg' } }),
      );
    } catch {
      /* sem Cache Storage */
    }
  }

  function pedirBlobASala(faixaId: string): Promise<Blob | null> {
    return new Promise(resolver => {
      const fila = esperandoBlobs.get(faixaId) ?? new Set();
      esperandoBlobs.set(faixaId, fila);
      const timer = setTimeout(() => {
        fila.delete(entregar);
        if (!fila.size) esperandoBlobs.delete(faixaId);
        resolver(null);
      }, PRAZO_BLOB_SOM_MS);
      const entregar = (b: Blob | null) => {
        clearTimeout(timer);
        fila.delete(entregar);
        if (!fila.size) esperandoBlobs.delete(faixaId);
        resolver(b);
      };
      fila.add(entregar);
      cliente.enviar({ tipo: 'blob.pedir', id: faixaId });
    });
  }

  function obterUrlLocal(faixaId: string, url?: string): Promise<string | null> {
    const pronta = blobUrls.get(faixaId);
    if (pronta) return Promise.resolve(pronta);
    const emCurso = downloadsEmCurso.get(faixaId);
    if (emCurso) return emCurso;

    const p = (async () => {
      try {
        let blob = await lerDoCache(faixaId);
        if (!blob) {
          if (url) {
            const resp = await fetch(resolverUrlDoSom(url, baseJukebox));
            if (resp.ok) blob = await resp.blob();
          } else {
            blob = await pedirBlobASala(faixaId);
          }
          if (blob) void gravarNoCache(faixaId, blob);
        }
        if (!blob || fechada) return null;
        const objectUrl = URL.createObjectURL(blob);
        blobUrls.set(faixaId, objectUrl);
        return objectUrl;
      } catch {
        return null;
      } finally {
        downloadsEmCurso.delete(faixaId);
      }
    })();

    downloadsEmCurso.set(faixaId, p);
    return p;
  }

  function encerrarFaixaSuave(item: FaixaTocando): void {
    if (item.saindo) return;
    item.saindo = true;
    faixasAtivas.delete(item.chave);
    const volInicial = item.audio.volume;
    const passos = 6;
    let i = 0;
    const timer = setInterval(() => {
      i++;
      if (i >= passos || fechada) {
        clearInterval(timer);
        try { item.audio.pause(); } catch { /* */ }
        try { item.motor.soltar(); } catch { /* */ }
        return;
      }
      try { item.audio.volume = Math.max(0, volInicial * (1 - i / passos)); } catch { /* */ }
    }, Math.round(FADE_SAIDA_MS / passos));
  }

  function chaveDaFaixa(f: FaixaDoMix): string {
    return `${f.faixaId}:${f.crossfade ? 'xf' : 'main'}`;
  }

  async function aplicarMix(mix: DadosDoMix): Promise<void> {
    if (fechada) return;
    ultimoMix = mix;
    if (mix.mestre !== undefined) {
      volumeMestreSala = mix.mestre;
      atualizarGanhos();
    }

    if (mixEstaVelho(mix.faixas, agoraSala())) {
      for (const item of [...faixasAtivas.values()]) encerrarFaixaSuave(item);
      if (preparando) { preparando = false; notificar(); }
      return;
    }

    const desejadas = new Set(mix.faixas.map(chaveDaFaixa));
    for (const [chave, item] of [...faixasAtivas.entries()]) {
      if (!desejadas.has(chave)) encerrarFaixaSuave(item);
    }

    if (mix.faixas.length === 0) {
      if (preparando) { preparando = false; notificar(); }
      return;
    }

    const faltando = mix.faixas.some(f => !blobUrls.has(f.faixaId));
    if (faltando && !preparando) {
      preparando = true;
      notificar();
    }

    await garantirMotor();
    const urls = await Promise.all(mix.faixas.map(f => obterUrlLocal(f.faixaId, f.url)));
    if (fechada || ultimoMix !== mix) return;

    if (preparando) {
      preparando = false;
      notificar();
    }

    if (!motor || !ganhoMusica) return;

    mix.faixas.forEach((f, idx) => {
      const src = urls[idx];
      if (!src) return;
      const chave = chaveDaFaixa(f);
      let item = faixasAtivas.get(chave);
      const nova = !item;

      if (!item) {
        const audio = new Audio(src);
        audio.preload = 'auto';
        audio.loop = Boolean(f.loop);
        const faixaMotor = motor!.prepararFaixa(audio, { destino: ganhoMusica! });
        item = { chave, faixaId: f.faixaId, audio, motor: faixaMotor };
        faixasAtivas.set(chave, item);
      } else {
        item.audio.loop = Boolean(f.loop);
      }

      if (f.estado) item.motor.aplicar(f.estado);

      const esperada = posicaoEsperada(f, agoraSala());
      if (f.pausada) {
        if (!item.audio.paused) item.audio.pause();
        if (deveCorrigirPosicao(item.audio.currentTime, esperada)) {
          try { item.audio.currentTime = esperada; } catch { /* */ }
        }
      } else {
        if (nova || deveCorrigirPosicao(item.audio.currentTime, esperada)) {
          const alvo = Number.isFinite(item.audio.duration) && item.audio.duration > 0
            ? Math.min(esperada, Math.max(0, item.audio.duration - 0.05))
            : esperada;
          try { item.audio.currentTime = alvo; } catch { /* */ }
        }
        if (item.audio.paused) {
          void item.audio.play().then(
            () => {
              if (bloqueado) { bloqueado = false; notificar(); }
            },
            () => {
              if (!bloqueado) { bloqueado = true; notificar(); }
            },
          );
        }
      }
    });
  }

  async function tocarEfeito(faixaId: string, url?: string, estado?: EstadoDaFaixa): Promise<void> {
    if (fechada) return;
    await garantirMotor();
    const src = await obterUrlLocal(faixaId, url);
    if (!src || fechada || !motor || !ganhoEfeitos) return;

    const audio = new Audio(src);
    audio.preload = 'auto';
    const faixaMotor = motor.prepararFaixa(audio, { destino: ganhoEfeitos });
    if (estado) faixaMotor.aplicar(estado);

    const registro = { audio, motor: faixaMotor };
    sfxAtivos.add(registro);
    const limpar = () => {
      if (!sfxAtivos.has(registro)) return;
      sfxAtivos.delete(registro);
      try { faixaMotor.soltar(); } catch { /* */ }
    };
    audio.addEventListener('ended', limpar, { once: true });
    audio.addEventListener('error', limpar, { once: true });

    void audio.play().catch(() => {
      limpar();
      if (!bloqueado) { bloqueado = true; notificar(); }
    });
  }

  const mandarPing = () => {
    cliente.enviar({ tipo: 'ping', em: Date.now() });
  };

  const soltar = [
    cliente.ouvir('bem-vindo', m => {
      if (typeof m.agora === 'number') diferencaFallbackMs = m.agora - Date.now();
      mandarPing();
    }),
    cliente.ouvir('pong', m => {
      amostra = atualizarAmostraRelogio(amostra, estimarDiferencaRelogio(m.em, Date.now(), m.agora));
    }),
    cliente.ouvir('evento', m => {
      if (m.envelope.tipo === 'jukebox.mix') {
        const mix = lerDadosDoMix(m.envelope.dados);
        if (mix) void aplicarMix(mix);
      } else if (m.envelope.tipo === 'jukebox.efeito-tocado') {
        const ef = lerDadosDoEfeito(m.envelope.dados);
        if (ef) void tocarEfeito(ef.faixaId, ef.url, ef.estado);
      }
    }),
    cliente.ouvirBlob((id, b) => {
      const fila = esperandoBlobs.get(id);
      if (!fila) return;
      for (const f of [...fila]) f(b);
    }),
  ];

  const timerPing = setInterval(() => {
    if (!fechada && cliente.estado === 'aberta') mandarPing();
  }, INTERVALO_PING_RELOGIO_MS);

  const liberar = () => {
    liberadoPorGesto = true;
    void garantirMotor().then(ok => {
      if (!ok || !ctx || fechada) return;
      void ctx.resume().then(() => {
        bloqueado = ctx!.state === 'suspended';
        notificar();
        if (ultimoMix) void aplicarMix(ultimoMix);
      }).catch(() => {});
    });
  };

  return {
    get estado() { return snapshot(); },
    liberar,
    definirMusica(v) {
      prefs = { ...prefs, musica: Math.max(0, Math.min(1, v)), mudo: false };
      gravarPreferenciasDeSom(prefs);
      atualizarGanhos();
      notificar();
    },
    definirEfeitos(v) {
      prefs = { ...prefs, efeitos: Math.max(0, Math.min(1, v)), mudo: false };
      gravarPreferenciasDeSom(prefs);
      atualizarGanhos();
      notificar();
    },
    alternarMudo() {
      prefs = { ...prefs, mudo: !prefs.mudo };
      gravarPreferenciasDeSom(prefs);
      atualizarGanhos();
      notificar();
    },
    aoMudar(f) {
      ouvintes.add(f);
      return () => { ouvintes.delete(f); };
    },
    fechar() {
      fechada = true;
      clearInterval(timerPing);
      for (const f of soltar) f();
      for (const fila of [...esperandoBlobs.values()]) for (const f of [...fila]) f(null);
      esperandoBlobs.clear();
      for (const item of [...faixasAtivas.values()]) {
        try { item.audio.pause(); } catch { /* */ }
        try { item.motor.soltar(); } catch { /* */ }
      }
      faixasAtivas.clear();
      for (const s of [...sfxAtivos]) {
        try { s.audio.pause(); } catch { /* */ }
        try { s.motor.soltar(); } catch { /* */ }
      }
      sfxAtivos.clear();
      for (const u of blobUrls.values()) URL.revokeObjectURL(u);
      blobUrls.clear();
      if (ctx) { void ctx.close().catch(() => {}); ctx = null; }
    },
  };
}

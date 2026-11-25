/** Lógica pura de sincronia de relógio, posição de faixas e preferências de som (R23). Sem DOM. */

export const LIMITE_DERIVA_SEG = 1.5;
export const LIMITE_MIX_VELHO_MS = 10_000;
export const INTERVALO_PING_RELOGIO_MS = 30_000;
export const CHAVE_PREFS_SOM = 'mesa:jogar-som';

export interface AmostraRelogio {
  diferencaMs: number;
  rttMs: number;
}

export interface EstadoDaFaixa {
  volume?: number;
  efeitos?: string[];
  ajustes?: Record<string, unknown>;
  regioes?: unknown[];
}

export interface FaixaDoMix {
  faixaId: string;
  url?: string;
  loop?: boolean;
  crossfade?: boolean;
  posicao: number;
  taxa: number;
  desde: number;
  pausada: boolean;
  estado?: EstadoDaFaixa;
}

export interface DadosDoMix {
  mestre?: number;
  faixas: FaixaDoMix[];
}

export interface DadosDoEfeito {
  faixaId: string;
  url?: string;
  estado?: EstadoDaFaixa;
}

export interface PreferenciasDeSom {
  musica: number;
  efeitos: number;
  mudo: boolean;
}

export const PREFERENCIAS_PADRAO: PreferenciasDeSom = { musica: 1, efeitos: 1, mudo: false };

const clamp01 = (v: number): number => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 1);

/** Estima `agoraDaSala - agoraLocal` a partir de um par `ping`/`pong` (descontando metade do RTT). */
export function estimarDiferencaRelogio(enviadoEm: number, recebidoEm: number, agoraDaSala: number): AmostraRelogio {
  const rttMs = Math.max(0, recebidoEm - enviadoEm);
  return { diferencaMs: agoraDaSala + rttMs / 2 - recebidoEm, rttMs };
}

/** Prefere a amostra com menor RTT (ou a primeira disponível). */
export function atualizarAmostraRelogio(atual: AmostraRelogio | null, nova: AmostraRelogio): AmostraRelogio {
  if (!atual || nova.rttMs <= atual.rttMs) return nova;
  return atual;
}

/** Instante estimado no relógio da sala. */
export function agoraDaSala(diferencaMs: number, agoraLocal: number = Date.now()): number {
  return agoraLocal + diferencaMs;
}

/** Posição esperada (em segundos) de uma faixa no instante `agoraDaSalaMs`, considerando `taxa` e `pausada`. */
export function posicaoEsperada(
  faixa: Pick<FaixaDoMix, 'posicao' | 'taxa' | 'desde' | 'pausada'>,
  agoraDaSalaMs: number,
): number {
  const base = Number.isFinite(faixa.posicao) ? Math.max(0, faixa.posicao) : 0;
  if (faixa.pausada) return base;
  const taxa = Number.isFinite(faixa.taxa) && faixa.taxa > 0 ? faixa.taxa : 1;
  const decorridoSeg = Math.max(0, (agoraDaSalaMs - faixa.desde) / 1000);
  return Math.max(0, base + decorridoSeg * taxa);
}

/** Só corrige a posição se a deriva passar do limite (padrão 1,5 s), para não ficar pulando. */
export function deveCorrigirPosicao(atualSeg: number, esperadaSeg: number, limiteSeg: number = LIMITE_DERIVA_SEG): boolean {
  if (!Number.isFinite(atualSeg) || !Number.isFinite(esperadaSeg)) return false;
  return Math.abs(atualSeg - esperadaSeg) > limiteSeg;
}

/** Um `mix` com faixas sem atualização há mais de `limiteMs` (10 s) é velho e não deve tocar. */
export function mixEstaVelho(
  faixas: readonly Pick<FaixaDoMix, 'desde'>[],
  agoraDaSalaMs: number,
  limiteMs: number = LIMITE_MIX_VELHO_MS,
): boolean {
  if (faixas.length === 0) return false;
  const maisNovo = Math.max(...faixas.map(f => (Number.isFinite(f.desde) ? f.desde : 0)));
  return agoraDaSalaMs - maisNovo > limiteMs;
}

/** Ganho final do canal (0..1), multiplicando o volume do jogador pelo volume mestre da sala. */
export function ganhoEfetivo(canal: 'musica' | 'efeitos', prefs: PreferenciasDeSom, mestre: number = 1): number {
  if (prefs.mudo) return 0;
  return clamp01(prefs[canal]) * clamp01(mestre);
}

type ArmazemLeitura = Pick<Storage, 'getItem'>;
type ArmazemEscrita = Pick<Storage, 'setItem'>;

export function lerPreferenciasDeSom(storage?: ArmazemLeitura): PreferenciasDeSom {
  try {
    const s = storage ?? (typeof localStorage === 'undefined' ? undefined : localStorage);
    const bruto = s?.getItem(CHAVE_PREFS_SOM);
    if (!bruto) return { ...PREFERENCIAS_PADRAO };
    const p = JSON.parse(bruto) as Partial<PreferenciasDeSom> | null;
    if (!p || typeof p !== 'object') return { ...PREFERENCIAS_PADRAO };
    return {
      musica: typeof p.musica === 'number' ? clamp01(p.musica) : 1,
      efeitos: typeof p.efeitos === 'number' ? clamp01(p.efeitos) : 1,
      mudo: typeof p.mudo === 'boolean' ? p.mudo : false,
    };
  } catch {
    return { ...PREFERENCIAS_PADRAO };
  }
}

export function gravarPreferenciasDeSom(prefs: PreferenciasDeSom, storage?: ArmazemEscrita): void {
  try {
    const s = storage ?? (typeof localStorage === 'undefined' ? undefined : localStorage);
    s?.setItem(CHAVE_PREFS_SOM, JSON.stringify({
      musica: clamp01(prefs.musica),
      efeitos: clamp01(prefs.efeitos),
      mudo: Boolean(prefs.mudo),
    }));
  } catch {
    /* sem localStorage: segue só em memória */
  }
}

/** Resolve a URL de uma faixa publicada no `sample/` contra a base do Jukebox (funciona também sob `/.proxy/Jukebox/`). */
export function resolverUrlDoSom(url: string, baseJukebox: string): string {
  const limpa = url.replace(/^\/+/, '');
  return new URL(limpa, baseJukebox).href;
}

export function lerDadosDoMix(dados: unknown): DadosDoMix | null {
  if (!dados || typeof dados !== 'object') return null;
  const d = dados as Record<string, unknown>;
  if (!Array.isArray(d.faixas)) return null;
  const faixas: FaixaDoMix[] = [];
  for (const item of d.faixas) {
    if (!item || typeof item !== 'object') continue;
    const f = item as Record<string, unknown>;
    if (typeof f.faixaId !== 'string' || !f.faixaId) continue;
    faixas.push({
      faixaId: f.faixaId,
      ...(typeof f.url === 'string' && f.url ? { url: f.url } : {}),
      ...(typeof f.loop === 'boolean' ? { loop: f.loop } : {}),
      ...(typeof f.crossfade === 'boolean' ? { crossfade: f.crossfade } : {}),
      posicao: typeof f.posicao === 'number' && Number.isFinite(f.posicao) ? f.posicao : 0,
      taxa: typeof f.taxa === 'number' && Number.isFinite(f.taxa) ? f.taxa : 1,
      desde: typeof f.desde === 'number' && Number.isFinite(f.desde) ? f.desde : 0,
      pausada: Boolean(f.pausada),
      ...(f.estado && typeof f.estado === 'object' ? { estado: f.estado as EstadoDaFaixa } : {}),
    });
  }
  return {
    ...(typeof d.mestre === 'number' && Number.isFinite(d.mestre) ? { mestre: clamp01(d.mestre) } : {}),
    faixas,
  };
}

export function lerDadosDoEfeito(dados: unknown): DadosDoEfeito | null {
  if (!dados || typeof dados !== 'object') return null;
  const d = dados as Record<string, unknown>;
  if (typeof d.faixaId !== 'string' || !d.faixaId) return null;
  return {
    faixaId: d.faixaId,
    ...(typeof d.url === 'string' && d.url ? { url: d.url } : {}),
    ...(d.estado && typeof d.estado === 'object' ? { estado: d.estado as EstadoDaFaixa } : {}),
  };
}

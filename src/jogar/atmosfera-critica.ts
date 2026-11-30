/**
 * Atmosfera crítica na casca do jogador: lógica pura, sem DOM. O Dossiê (iframe) avisa o estado de PV e PD da ficha aberta
 * e a casca desenha a vinheta sobre o mapa e a ficha. Enquanto o Dossiê não avisa, o estado sai direto da `FichaDaSala`.
 */
import type { FichaDaSala } from '../online/protocolo.ts';

export type RecursoCritico = {
  value: number; max: number; ratio: number;
  warning: boolean; vignette: boolean; special: boolean; critical: boolean;
  warningIntensity: number; vignetteIntensity: number; specialIntensity: number;
};
export type EstadoCritico = { pv: RecursoCritico; pd: RecursoCritico; active: boolean };
export type EfeitosCriticos = { pv: boolean; pd: boolean };
export type AtmosferaCritica = { fichaId: string | null; estado: EstadoCritico; efeitos: EfeitosCriticos };

const num = (v: unknown): number => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

/** Os mesmos limiares do Dossiê: aviso ≤ 50%, vinheta ≤ 35%, crítico (tentáculos) ≤ 25%. */
export function recursoCritico(atual: unknown, maximo: unknown): RecursoCritico {
  const max = Math.max(0, num(maximo)), value = Math.max(0, num(atual));
  const ratio = max > 0 ? Math.min(1, value / max) : 1;
  const warning = max > 0 && ratio <= 0.5, vignette = max > 0 && ratio <= 0.35, special = max > 0 && ratio <= 0.25;
  const progresso = (limite: number, piso: number) => (ratio <= limite ? Math.min(1, piso + ((limite - ratio) / limite) * (1 - piso)) : 0);
  return { value, max, ratio, warning, vignette, special, critical: special, warningIntensity: progresso(0.5, 0.12), vignetteIntensity: progresso(0.35, 0.08), specialIntensity: progresso(0.25, 0.08) };
}

export const RECURSO_NEUTRO: RecursoCritico = recursoCritico(0, 0);
export const ESTADO_NEUTRO: EstadoCritico = { pv: RECURSO_NEUTRO, pd: RECURSO_NEUTRO, active: false };
export const EFEITOS_PADRAO: EfeitosCriticos = { pv: true, pd: true };

/** Estado crítico calculado da ficha da sala. Ameaças não têm atmosfera. Ordem 1 usa Sanidade (ou PE com `usaPD`); Ordem 2 usa PD. */
export function estadoCriticoDaFicha(ficha: FichaDaSala | null | undefined): EstadoCritico {
  if (!ficha || ficha.systemMode === 'threat') return ESTADO_NEUTRO;
  const pv = recursoCritico(ficha.pv, ficha.maxPv);
  const original = ficha.systemMode === 'original';
  const pd = original
    ? (ficha.usaPD ? recursoCritico(ficha.pe, ficha.maxPe) : recursoCritico(ficha.san, ficha.maxSan))
    : recursoCritico(ficha.pd, ficha.maxPd);
  return { pv, pd, active: pv.critical || pd.critical };
}

type Evento = { source: unknown; origin: string; data: unknown };

function recursoValido(v: unknown): v is RecursoCritico {
  if (!v || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  return ['value', 'max', 'ratio', 'warningIntensity', 'vignetteIntensity', 'specialIntensity'].every(k => typeof r[k] === 'number' && Number.isFinite(r[k] as number))
    && ['warning', 'vignette', 'special', 'critical'].every(k => typeof r[k] === 'boolean');
}

/** `dossie.atmosfera-critica` só vale vindo do iframe da ficha, na mesma origem e bem formado. */
export function atmosferaPedidaPeloDossie(ev: Evento, janelaDoDossie: unknown, origemLocal: string): AtmosferaCritica | null {
  if (!janelaDoDossie || ev.source !== janelaDoDossie || ev.origin !== origemLocal) return null;
  const d = ev.data as { tipo?: unknown; fichaId?: unknown; pv?: unknown; pd?: unknown; efeitos?: { pv?: unknown; pd?: unknown } } | null;
  if (!d || typeof d !== 'object' || d.tipo !== 'dossie.atmosfera-critica') return null;
  if (!recursoValido(d.pv) || !recursoValido(d.pd)) return null;
  const efeitos = { pv: d.efeitos?.pv !== false, pd: d.efeitos?.pd !== false };
  return { fichaId: typeof d.fichaId === 'string' ? d.fichaId : null, estado: { pv: d.pv, pd: d.pd, active: d.pv.critical || d.pd.critical }, efeitos };
}

/** `dossie.batimento-critico`: o pulso do coração, para sincronizar a vinheta com o som (que fica no Dossiê). */
export function batimentoDoDossie(ev: Evento, janelaDoDossie: unknown, origemLocal: string): boolean {
  if (!janelaDoDossie || ev.source !== janelaDoDossie || ev.origin !== origemLocal) return false;
  const d = ev.data as { tipo?: unknown } | null;
  return !!d && typeof d === 'object' && d.tipo === 'dossie.batimento-critico';
}

/** Classes e variáveis CSS da camada, as mesmas do Dossiê (vinheta de PV, escuridão/vinheta/tentáculos de PD). */
export function aparenciaDaAtmosfera(a: AtmosferaCritica) {
  const { pv, pd } = a.estado;
  const pvAtm = a.efeitos.pv && pv.vignette, pdAtm = a.efeitos.pd && pd.vignette;
  const pvSpecial = a.efeitos.pv && pv.special, pdSpecial = a.efeitos.pd && pd.special;
  const f = (n: number) => n.toFixed(3);
  return {
    pv: pvAtm, pd: pdAtm, pvSpecial, pdSpecial, combinado: pvAtm && pdAtm,
    vars: {
      '--pv-vignette-rest': f(0.1 + pv.vignetteIntensity * 0.6),
      '--pv-vignette-peak': f(0.28 + pv.specialIntensity * 0.65),
      '--pv-vignette-echo': f(0.2 + pv.specialIntensity * 0.54),
      '--pd-vignette-opacity': f(0.32 + pd.vignetteIntensity * 0.65),
      '--pd-tendril-opacity': f(0.1 + pd.specialIntensity * 0.48),
      '--pd-distortion-opacity': f(0.05 + pd.specialIntensity * 0.25),
      '--pd-darkness-opacity': f(0.2 + pd.vignetteIntensity * 0.55),
    } as Record<string, string>,
  };
}

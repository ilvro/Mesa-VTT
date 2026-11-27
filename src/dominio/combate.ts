import { chaveDaRef, mesmaRef, type Entidade, type Ref } from '#mesa';
import type { Recursos } from './recursos-das-fichas.ts';

export const CANAL_COMBATE = 'atlas:combate';

export interface CombatenteDoAtlas {
  tokenId: string;
  nome: string;
  jogador: boolean;
  estado: string;
  refs: Ref[];
  pv?: number;
  pvMax?: number;
  pd?: number;
  pdMax?: number;
}

export interface EstadoDeIniciativaAtlas {
  tipo: 'iniciativa';
  mapaId: string;
  mapaNome: string;
  ativa: boolean;
  rodada: number;
  atual: number;
  ordem: { tokenId: string; valor: number }[];
  combatentes: CombatenteDoAtlas[];
}

export type ComandoDeIniciativaMesa =
  | { tipo: 'estado' }
  | { tipo: 'iniciar'; entradas?: { tokenId: string; valor: number }[] }
  | { tipo: 'passo'; direcao: 1 | -1 }
  | { tipo: 'definir-valor'; tokenId: string; valor: number }
  | { tipo: 'focar-peca'; tokenId: string }
  | { tipo: 'ajustar-pv'; tokenId: string; deltaPv?: number; pv?: number; deltaPd?: number; pd?: number }
  | { tipo: 'encerrar' };

export interface CombatenteDaSessao {
  tokenId: string;
  nome: string;
  jogador: boolean;
  valorIniciativa: number | null;
  ehVez: boolean;
  estado: string;
  entidadeId: string | null;
  fichaId: string | null;
  refFicha: Ref | null;
  retrato?: Blob;
  pv: number | null;
  pvMax: number | null;
  pd: number | null;
  pdMax: number | null;
  critico: boolean;
}

export interface EstadoDeCombateDaSessao {
  conectado: boolean;
  mapaId: string | null;
  mapaNome: string | null;
  ativa: boolean;
  rodada: number;
  combatentes: CombatenteDaSessao[];
  daVez: CombatenteDaSessao | null;
}

export type MapaDeRecursos = Readonly<Record<string, Recursos>> | ReadonlyMap<string, Recursos>;

function buscarRecurso(mapa: MapaDeRecursos, chave: string): Recursos | undefined {
  if (mapa instanceof Map) return mapa.get(chave);
  if (typeof (mapa as ReadonlyMap<string, Recursos>).get === 'function') {
    return (mapa as ReadonlyMap<string, Recursos>).get(chave);
  }
  return (mapa as Readonly<Record<string, Recursos>>)[chave];
}

function encontrarEntidadePorRefs(refs: readonly Ref[], entidades: readonly Entidade[]): Entidade | null {
  if (refs.length === 0) return null;
  for (const entidade of entidades) {
    if (entidade.refs.some(er => refs.some(r => mesmaRef(er, r)))) {
      return entidade;
    }
  }
  return null;
}

function extrairRefFicha(refs: readonly Ref[], entidade: Entidade | null): Ref | null {
  return (
    refs.find(r => r.app === 'ficha' && r.tipo === 'ficha')
    ?? entidade?.refs.find(r => r.app === 'ficha' && r.tipo === 'ficha')
    ?? null
  );
}

function montarCombatente(
  c: CombatenteDoAtlas,
  entidades: readonly Entidade[],
  recursosFichas: MapaDeRecursos,
  valorIniciativa: number | null,
  ehVez: boolean,
): CombatenteDaSessao {
  const entidade = encontrarEntidadePorRefs(c.refs, entidades);
  const refFicha = extrairRefFicha(c.refs, entidade);
  const fichaId = refFicha?.id ?? null;

  const recFicha = c.jogador && refFicha ? buscarRecurso(recursosFichas, chaveDaRef(refFicha)) : undefined;

  const pv = recFicha ? recFicha.pv : (c.pv ?? null);
  const pvMax = recFicha ? recFicha.pvMax : (c.pvMax ?? null);
  const pd = recFicha ? recFicha.pd : (c.pd ?? null);
  const pdMax = recFicha ? recFicha.pdMax : (c.pdMax ?? null);
  const critico = pv !== null && pvMax !== null && pvMax > 0 && pv / pvMax <= 0.25;

  return {
    tokenId: c.tokenId,
    nome: c.nome,
    jogador: c.jogador,
    valorIniciativa,
    ehVez,
    estado: c.estado,
    entidadeId: entidade?.id ?? null,
    fichaId,
    refFicha,
    ...(entidade?.retrato ? { retrato: entidade.retrato } : {}),
    pv,
    pvMax,
    pd,
    pdMax,
    critico,
  };
}

/**
 * Monta o estado puro do combate da sessão combinando o snapshot vindo do Atlas,
 * as entidades da campanha (para vínculo de entidade/retrato) e os recursos vivos das fichas do Dossiê.
 */
export function montarEstadoDeCombate(
  eventoAtlas: EstadoDeIniciativaAtlas | null,
  entidades: readonly Entidade[],
  recursosFichas: MapaDeRecursos,
): EstadoDeCombateDaSessao {
  if (eventoAtlas === null) {
    return {
      conectado: false,
      mapaId: null,
      mapaNome: null,
      ativa: false,
      rodada: 1,
      combatentes: [],
      daVez: null,
    };
  }

  if (eventoAtlas.ativa) {
    const porToken = new Map<string, CombatenteDoAtlas>();
    for (const c of eventoAtlas.combatentes) porToken.set(c.tokenId, c);

    const combatentes: CombatenteDaSessao[] = [];
    let daVez: CombatenteDaSessao | null = null;

    for (let i = 0; i < eventoAtlas.ordem.length; i++) {
      const entrada = eventoAtlas.ordem[i];
      if (!entrada) continue;
      const bruto = porToken.get(entrada.tokenId);
      if (!bruto) continue;
      const ehVez = i === eventoAtlas.atual;
      const montado = montarCombatente(bruto, entidades, recursosFichas, entrada.valor, ehVez);
      combatentes.push(montado);
      if (ehVez) daVez = montado;
    }

    return {
      conectado: true,
      mapaId: eventoAtlas.mapaId,
      mapaNome: eventoAtlas.mapaNome,
      ativa: true,
      rodada: eventoAtlas.rodada,
      combatentes,
      daVez,
    };
  }

  const combatentes = eventoAtlas.combatentes.map(c =>
    montarCombatente(c, entidades, recursosFichas, null, false),
  );

  return {
    conectado: true,
    mapaId: eventoAtlas.mapaId,
    mapaNome: eventoAtlas.mapaNome,
    ativa: false,
    rodada: 1,
    combatentes,
    daVez: null,
  };
}

/**
 * Interpreta uma entrada rápida de PV/PD digitada pelo mestre:
 * - `"-5"` ou `"+3"` → `{ delta: -5 }` / `{ delta: 3 }`
 * - `"18"` → `{ absoluto: 18 }`
 * - qualquer outra coisa → `null`
 */
export function interpretarEntradaPv(texto: string): { delta?: number; absoluto?: number } | null {
  const s = texto.trim();
  if (!s) return null;

  if (/^[+-]\d+$/.test(s)) {
    const n = Number(s);
    if (!Number.isSafeInteger(n)) return null;
    return { delta: n === 0 ? 0 : n };
  }

  if (/^\d+$/.test(s)) {
    const n = Number(s);
    if (!Number.isSafeInteger(n)) return null;
    return { absoluto: n };
  }

  return null;
}

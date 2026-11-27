import { computed, signal } from '@preact/signals';
import {
  CANAL_COMBATE,
  montarEstadoDeCombate,
  type CombatenteDaSessao,
  type ComandoDeIniciativaMesa,
  type EstadoDeCombateDaSessao,
  type EstadoDeIniciativaAtlas,
} from '../dominio/combate.ts';
import { entidades } from './campanha.ts';
import { recursosDasFichas } from './recursos-das-fichas.ts';
import { escolhas, fichasEmAbas, mudarEscolhas, personagens } from './sessao.ts';

export interface CanalCombateLike {
  postMessage(msg: unknown): void;
  onmessage: ((ev: { data: unknown }) => void) | null;
  close(): void;
}

/** Último snapshot bruto recebido do Atlas via `BroadcastChannel('atlas:combate')`. */
export const estadoBrutoDoAtlas = signal<EstadoDeIniciativaAtlas | null>(null);

/** Quando ativo, trocar o turno no combate foca automaticamente a aba da ficha do combatente da vez. */
export const seguirTurnoNasFichas = signal(true);

/** Estado reativo de combate da sessão, combinando Atlas, campanha e recursos das fichas. */
export const estadoDoCombate = computed<EstadoDeCombateDaSessao>(() =>
  montarEstadoDeCombate(estadoBrutoDoAtlas.value, entidades.value, recursosDasFichas.value),
);

let canalAtivo: CanalCombateLike | null = null;
let assinantes = 0;

function ehEstadoDeIniciativaAtlas(v: unknown): v is EstadoDeIniciativaAtlas {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return (
    o.tipo === 'iniciativa'
    && typeof o.mapaId === 'string'
    && typeof o.mapaNome === 'string'
    && typeof o.ativa === 'boolean'
    && Array.isArray(o.combatentes)
  );
}

function aoReceberMensagem(ev: { data: unknown }): void {
  if (!ehEstadoDeIniciativaAtlas(ev.data)) return;

  const daVezAnterior = estadoDoCombate.peek().daVez?.tokenId ?? null;
  estadoBrutoDoAtlas.value = ev.data;

  if (!seguirTurnoNasFichas.peek()) return;
  const novoDaVez = estadoDoCombate.peek().daVez;
  if (!novoDaVez || novoDaVez.tokenId === daVezAnterior || !novoDaVez.fichaId) return;

  if (fichasEmAbas.peek().some(f => f.fichaId === novoDaVez.fichaId)) {
    mudarEscolhas({ ativa: novoDaVez.fichaId });
  }
}

/**
 * Abre (ou reutiliza via contagem de referência) o canal `BroadcastChannel('atlas:combate')`
 * e pede imediatamente o estado atual ao Atlas. Retorna função de limpeza segura para `useEffect`.
 */
export function iniciarCombateCanal(
  criarCanal?: (nome: string) => CanalCombateLike,
): () => void {
  assinantes += 1;

  if (!canalAtivo) {
    try {
      canalAtivo = criarCanal
        ? criarCanal(CANAL_COMBATE)
        : typeof BroadcastChannel !== 'undefined'
          ? (new BroadcastChannel(CANAL_COMBATE) as unknown as CanalCombateLike)
          : null;
    } catch {
      canalAtivo = null;
    }

    if (canalAtivo) {
      canalAtivo.onmessage = aoReceberMensagem;
    }
  }

  if (canalAtivo) {
    try {
      canalAtivo.postMessage({ tipo: 'estado' } satisfies ComandoDeIniciativaMesa);
    } catch { /* ignora erro de postMessage */ }
  }

  let parado = false;
  return () => {
    if (parado) return;
    parado = true;
    pararCombateCanal();
  };
}

/** Decrementa a contagem de assinantes e fecha o canal quando o último sair. */
export function pararCombateCanal(): void {
  if (assinantes <= 0) return;
  assinantes -= 1;
  if (assinantes === 0 && canalAtivo) {
    try {
      canalAtivo.onmessage = null;
      canalAtivo.close();
    } catch { /* ignora */ }
    canalAtivo = null;
  }
}

/** Envia um comando de iniciativa/combate ao Atlas pelo canal `'atlas:combate'`. */
export function enviarComandoDeCombate(cmd: ComandoDeIniciativaMesa): void {
  if (canalAtivo) {
    try {
      canalAtivo.postMessage(cmd);
    } catch { /* ignora */ }
    return;
  }

  if (typeof BroadcastChannel === 'undefined') return;
  try {
    const temp = new BroadcastChannel(CANAL_COMBATE);
    temp.postMessage(cmd);
    temp.close();
  } catch { /* ignora */ }
}

export function iniciarCombateNaSessao(): void {
  enviarComandoDeCombate({ tipo: 'iniciar' });
}

export function avancarTurno(direcao: 1 | -1): void {
  enviarComandoDeCombate({ tipo: 'passo', direcao });
}

export function definirIniciativa(tokenId: string, valor: number): void {
  enviarComandoDeCombate({ tipo: 'definir-valor', tokenId, valor });
}

export function encerrarCombateNaSessao(): void {
  enviarComandoDeCombate({ tipo: 'encerrar' });
}

export function ajustarPvCombatente(
  combatente: CombatenteDaSessao,
  ajuste: { deltaPv?: number; pv?: number; deltaPd?: number; pd?: number },
): void {
  enviarComandoDeCombate({
    tipo: 'ajustar-pv',
    tokenId: combatente.tokenId,
    ...ajuste,
  });
}

export function focarCombatente(combatente: CombatenteDaSessao): void {
  enviarComandoDeCombate({ tipo: 'focar-peca', tokenId: combatente.tokenId });

  if (!combatente.fichaId) return;
  const atuais = escolhas.peek().fichas ?? personagens.peek().map(p => p.fichaId);
  if (!atuais.includes(combatente.fichaId)) {
    mudarEscolhas({ fichas: [...atuais, combatente.fichaId], ativa: combatente.fichaId });
  } else {
    mudarEscolhas({ ativa: combatente.fichaId });
  }
}

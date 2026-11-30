/**
 * A entrada da ficha em tela cheia (expandir ou projetar): lógica pura, sem DOM, para a casca testar a sequência
 * `inativa → preparando → ativa → saindo → retornando → inativa` (a volta, `retornando`, é só da ficha expandida: o card reaparece depois de pintado) sem montar o `iframe`.
 */
export type FaseTelaFicha = 'inativa' | 'preparando' | 'ativa' | 'saindo' | 'retornando';

/** Teto da espera pelo Dossiê: se ele demorar, a ficha aparece assim mesmo. */
export const ESPERA_MAXIMA_FICHA_MS = 180;

export interface RelogioDaFicha {
  quadro: (f: () => void) => unknown;
  cancelarQuadro: (id: unknown) => void;
  esperar: (f: () => void, ms: number) => unknown;
  cancelarEspera: (id: unknown) => void;
}

const relogioDoNavegador: RelogioDaFicha = {
  quadro: f => requestAnimationFrame(f),
  cancelarQuadro: id => cancelAnimationFrame(id as number),
  esperar: (f, ms) => setTimeout(f, ms),
  cancelarEspera: id => clearTimeout(id as ReturnType<typeof setTimeout>),
};

/**
 * Chama `ativar` quando o `opacity: 0` da fase `preparando` já foi pintado (dois quadros seguidos) **e** o Dossiê avisou
 * (`ouvirSinal`) que aplicou a vista; ou, no máximo, depois de `maximoMs`. Devolve o cancelamento.
 */
export function agendarEntradaDaFicha(
  ativar: () => void,
  ouvirSinal: (aoReceber: () => void) => () => void,
  relogio: RelogioDaFicha = relogioDoNavegador,
  maximoMs = ESPERA_MAXIMA_FICHA_MS,
): () => void {
  let quadros = 0, sinal = false, feito = false;
  let idQuadro: unknown = null, idEspera: unknown = null;
  let soltarSinal: (() => void) | null = null;
  const limpar = () => {
    feito = true;
    if (idQuadro !== null) relogio.cancelarQuadro(idQuadro);
    if (idEspera !== null) relogio.cancelarEspera(idEspera);
    soltarSinal?.();
  };
  const concluir = () => { if (feito) return; limpar(); ativar(); };
  const tentar = () => { if (quadros >= 2 && sinal) concluir(); };
  const proximoQuadro = () => {
    idQuadro = relogio.quadro(() => { idQuadro = null; quadros += 1; if (quadros < 2) proximoQuadro(); else tentar(); });
  };
  soltarSinal = ouvirSinal(() => { sinal = true; tentar(); });
  proximoQuadro();
  idEspera = relogio.esperar(() => { idEspera = null; concluir(); }, maximoMs);
  return () => { if (!feito) limpar(); };
}

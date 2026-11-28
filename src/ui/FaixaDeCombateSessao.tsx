import { useEffect, useRef, useState } from 'preact/hooks';
import {
  ajustarPvCombatente,
  avancarTurno,
  definirIniciativa,
  encerrarCombateNaSessao,
  estadoDoCombate,
  focarCombatente,
  iniciarCombateCanal,
  iniciarCombateNaSessao,
  seguirTurnoNasFichas,
} from '../app/combate.ts';
import { interpretarEntradaPv, type CombatenteDaSessao } from '../dominio/combate.ts';
import { cx } from './cx.ts';
import './fase-8.css';

function useUrlDoBlob(blob?: Blob): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
      setUrl(null);
      return;
    }
    const criada = URL.createObjectURL(blob);
    setUrl(criada);
    return () => {
      try {
        URL.revokeObjectURL(criada);
      } catch { /* ignora */ }
    };
  }, [blob]);
  return url;
}

function percentual(atual: number, max: number): number {
  if (max <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((atual / max) * 100)));
}

function CartaoCombatente({ c }: { c: CombatenteDaSessao }) {
  const retratoUrl = useUrlDoBlob(c.retrato);
  const cartaoRef = useRef<HTMLDivElement>(null);
  const cancelouPv = useRef(false);

  const [iniTexto, setIniTexto] = useState(c.valorIniciativa !== null ? String(c.valorIniciativa) : '');
  const [editandoPv, setEditandoPv] = useState(false);
  const [pvTexto, setPvTexto] = useState('');

  useEffect(() => {
    setIniTexto(c.valorIniciativa !== null ? String(c.valorIniciativa) : '');
  }, [c.valorIniciativa]);

  useEffect(() => {
    if (c.ehVez) {
      cartaoRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }, [c.ehVez]);

  const temPv = c.pv !== null && c.pvMax !== null && c.pvMax > 0;
  const temPd = c.pd !== null && c.pdMax !== null && c.pdMax > 0;
  const inicial = (c.nome.trim()[0] ?? '?').toUpperCase();

  const confirmarPv = () => {
    if (cancelouPv.current) {
      cancelouPv.current = false;
      setEditandoPv(false);
      return;
    }
    const interpretado = interpretarEntradaPv(pvTexto);
    setEditandoPv(false);
    setPvTexto('');
    if (!interpretado) return;
    if (interpretado.delta !== undefined) {
      ajustarPvCombatente(c, { deltaPv: interpretado.delta });
    } else if (interpretado.absoluto !== undefined) {
      ajustarPvCombatente(c, { pv: interpretado.absoluto });
    }
  };

  return (
    <div
      ref={cartaoRef}
      role="listitem"
      class={cx('combate-cartao', c.ehVez && 'atual', c.critico && 'critico')}
      data-atual={c.ehVez ? 'true' : 'false'}
      data-testid={`combate-item-${c.tokenId}`}
    >
      <div class="combate-cartao-topo">
        <button
          type="button"
          class="combate-identidade"
          onClick={() => focarCombatente(c)}
          title="Focar peça no Atlas e abrir ficha"
        >
          <span class="combate-retrato" aria-hidden="true">
            {retratoUrl ? <img src={retratoUrl} alt="" /> : inicial}
          </span>
          <span class="combate-nome">{c.nome}</span>
        </button>
        <input
          type="number"
          class="combate-ini-input"
          data-testid={`combate-ini-${c.tokenId}`}
          aria-label={`Iniciativa de ${c.nome}`}
          title="Iniciativa"
          value={iniTexto}
          onInput={ev => {
            setIniTexto(ev.currentTarget.value);
          }}
          onChange={ev => {
            const bruto = ev.currentTarget.value.trim();
            const v = Number(bruto);
            if (bruto !== '' && Number.isFinite(v)) {
              definirIniciativa(c.tokenId, v);
            } else {
              setIniTexto(c.valorIniciativa !== null ? String(c.valorIniciativa) : '');
            }
          }}
        />
      </div>

      {temPv && (
        <div class="combate-recursos">
          <div class="combate-pv-linha">
            <button
              type="button"
              class="combate-pv-btn"
              data-testid={`combate-pv-menos-${c.tokenId}`}
              title="Reduzir PV (−1; Shift+clique: −5)"
              aria-label={`Reduzir PV de ${c.nome}`}
              onClick={ev => ajustarPvCombatente(c, { deltaPv: ev.shiftKey ? -5 : -1 })}
            >
              −
            </button>

            {editandoPv ? (
              <input
                type="text"
                class="combate-pv-entrada"
                data-testid={`combate-pv-input-${c.tokenId}`}
                aria-label={`Ajustar PV de ${c.nome}`}
                placeholder="-5, +4 ou 15"
                value={pvTexto}
                autoFocus
                onInput={ev => setPvTexto(ev.currentTarget.value)}
                onKeyDown={ev => {
                  if (ev.key === 'Enter') {
                    ev.preventDefault();
                    confirmarPv();
                  } else if (ev.key === 'Escape') {
                    ev.preventDefault();
                    cancelouPv.current = true;
                    setEditandoPv(false);
                    setPvTexto('');
                  }
                }}
                onBlur={confirmarPv}
              />
            ) : (
              <button
                type="button"
                class="combate-barra"
                data-testid={`combate-pv-barra-${c.tokenId}`}
                title="Clique para digitar ajuste de PV (ex.: -7, +4 ou 15)"
                onClick={() => {
                  cancelouPv.current = false;
                  setPvTexto('');
                  setEditandoPv(true);
                }}
              >
                <span
                  class="combate-barra-preenchimento"
                  style={{ width: `${percentual(c.pv!, c.pvMax!)}%` }}
                />
                <span class="combate-barra-texto">
                  PV {c.pv}/{c.pvMax}
                </span>
              </button>
            )}

            <button
              type="button"
              class="combate-pv-btn"
              data-testid={`combate-pv-mais-${c.tokenId}`}
              title="Aumentar PV (+1; Shift+clique: +5)"
              aria-label={`Aumentar PV de ${c.nome}`}
              onClick={ev => ajustarPvCombatente(c, { deltaPv: ev.shiftKey ? 5 : 1 })}
            >
              +
            </button>
          </div>

          {temPd && (
            <div class="combate-pd-barra" title={`PD ${c.pd}/${c.pdMax}`}>
              <span
                class="combate-pd-preenchimento"
                style={{ width: `${percentual(c.pd!, c.pdMax!)}%` }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Faixa tática de combate e iniciativa no topo do Modo Sessão,
 * sincronizada em tempo real com o Atlas e as fichas do Dossiê.
 */
export function FaixaDeCombateSessao() {
  useEffect(() => iniciarCombateCanal(), []);

  const combate = estadoDoCombate.value;
  const seguir = seguirTurnoNasFichas.value;

  if (!combate.conectado || (!combate.ativa && combate.combatentes.length === 0)) {
    return null;
  }

  if (!combate.ativa) {
    const total = combate.combatentes.length;
    return (
      <div class="sessao-faixa-combate recolhida" data-testid="sessao-faixa-combate-recolhida">
        <div class="combate-recolhida-info">
          <span class="combate-recolhida-mapa">{combate.mapaNome || 'Mapa ativo'}</span>
          <span class="selo">
            {total} {total === 1 ? 'peça' : 'peças'} no mapa
          </span>
        </div>
        <button
          type="button"
          class="botao-pilula destaque"
          data-testid="combate-iniciar"
          onClick={() => iniciarCombateNaSessao()}
        >
          ⚔ Iniciar combate
        </button>
      </div>
    );
  }

  return (
    <div class="sessao-faixa-combate" data-testid="sessao-faixa-combate">
      <div class="combate-controles">
        <span class="selo combate-rodada" data-testid="combate-rodada">
          Rodada {combate.rodada}
        </span>
        <button
          type="button"
          class="botao-pilula combate-passo-btn"
          data-testid="combate-turno-anterior"
          title="Turno anterior"
          aria-label="Turno anterior"
          onClick={() => avancarTurno(-1)}
        >
          ◀
        </button>
        <button
          type="button"
          class="botao-pilula destaque combate-proximo-btn"
          data-testid="combate-proximo-turno"
          onClick={() => avancarTurno(1)}
        >
          Próximo turno ▶
        </button>
        <button
          type="button"
          class="botao-pilula combate-seguir-btn"
          data-testid="combate-seguir-fichas"
          aria-pressed={seguir}
          title="Ao avançar o turno, focar automaticamente a aba da ficha do combatente da vez"
          onClick={() => {
            seguirTurnoNasFichas.value = !seguir;
          }}
        >
          Seguir fichas
        </button>
        <button
          type="button"
          class="botao-pilula perigo combate-encerrar-btn"
          data-testid="combate-encerrar"
          onClick={() => encerrarCombateNaSessao()}
        >
          ✕ Encerrar
        </button>
      </div>

      <div class="combate-fila" role="list" aria-label="Ordem de iniciativa">
        {combate.combatentes.map(c => (
          <CartaoCombatente key={c.tokenId} c={c} />
        ))}
      </div>
    </div>
  );
}

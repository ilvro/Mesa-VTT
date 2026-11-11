// Só em desenvolvimento: montado pelo selo (`SeloDoAssistente.tsx`), que só entra pela ponte; o estilo vai num <style>, fora do build.
import { atividadeDoAssistente, desfazerChamada } from '../app/atividade-do-assistente.ts';
import { entidadesDestacadas } from '../app/assistente-slot.ts';
import { entidadesAfetadas, type Chamada } from '../dominio/efeitos.ts';
import { abrirEntidade, tela } from '../app/rotas.ts';

const ESTILO = `
.painel-assistente-mesa {
  position: fixed;
  top: 56px;
  right: 16px;
  z-index: 50;
  width: 340px;
  max-height: min(70vh, 560px);
  display: flex;
  flex-direction: column;
  background: var(--painel, #1e1e1e);
  border: 1px solid var(--linha-forte, #3a3a3a);
  border-radius: 10px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);
  color: var(--texto, #f0f0f0);
  font: 12px/1.4 var(--corpo, sans-serif);
  overflow: hidden;
}
.painel-assistente-mesa h2 {
  margin: 0;
  padding: 10px 14px;
  font: 700 11px var(--corpo, sans-serif);
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--acento, #e06c75);
  border-bottom: 1px solid var(--linha, #2d2d2d);
}
.painel-assistente-mesa .corpo {
  overflow-y: auto;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.painel-assistente-mesa .vazio {
  padding: 14px 6px;
  color: var(--apagado, #888);
  text-align: center;
}
.painel-assistente-mesa .item {
  padding: 7px 10px;
  border: 1px solid var(--linha, #2d2d2d);
  border-radius: var(--raio, 6px);
  background: var(--superficie, #252525);
  cursor: default;
}
.painel-assistente-mesa .item.com-ids {
  cursor: pointer;
}
.painel-assistente-mesa .item:hover {
  border-color: var(--acento, #e06c75);
}
.painel-assistente-mesa .item.desfeita {
  opacity: 0.6;
}
.painel-assistente-mesa .linha {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.painel-assistente-mesa .rotulo {
  font-weight: 700;
  flex: 1;
  word-break: break-word;
}
.painel-assistente-mesa .hora {
  color: var(--apagado, #888);
  font-size: 11px;
}
.painel-assistente-mesa .detalhe {
  margin-top: 3px;
  color: var(--apagado, #888);
}
.painel-assistente-mesa .acoes {
  display: flex;
  gap: 6px;
  margin-top: 6px;
}
.painel-assistente-mesa .botao-pilula {
  padding: 4px 10px;
  font-size: 11px;
  border-radius: 999px;
  border: 1px solid var(--linha, #444);
  background: var(--superficie-alta, #333);
  color: var(--texto, #fff);
  cursor: pointer;
}
.painel-assistente-mesa .botao-pilula:hover:not(:disabled) {
  border-color: var(--acento, #e06c75);
  background: var(--acento-suave, rgba(224, 108, 117, 0.15));
}
.painel-assistente-mesa .botao-pilula:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.cartao-colecao.destacado-assistente,
.item.destacado-assistente {
  outline: 2px solid var(--acento, #e06c75) !important;
  box-shadow: 0 0 12px color-mix(in srgb, var(--acento, #e06c75) 40%, transparent) !important;
}
`;

const hora = (t: number) =>
  new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

function destacar(c: Chamada): void {
  const afetadas = entidadesAfetadas(c);
  if (afetadas.length > 0) {
    entidadesDestacadas.value = new Set(afetadas);
  }
}

function soltar(): void {
  entidadesDestacadas.value = new Set();
}

function abrirPrimeira(c: Chamada): void {
  const afetadas = entidadesAfetadas(c);
  if (afetadas.length > 0) {
    abrirEntidade(afetadas[0]!);
    tela.value = 'entidades';
  }
}

export function PainelDoAssistente() {
  const lista = atividadeDoAssistente.value;

  return (
    <section
      class="painel-assistente painel-assistente-mesa"
      data-testid="painel-assistente-mesa"
      aria-label="Atividade do assistente"
      onMouseLeave={soltar}
    >
      <style>{ESTILO}</style>
      <h2>Assistente</h2>
      <div class="corpo">
        {!lista.length ? (
          <div class="vazio">Nada por aqui ainda: as chamadas do assistente aparecem aqui.</div>
        ) : null}
        {lista.map(c => {
          const afetadas = entidadesAfetadas(c);
          return (
            <div
              key={c.id}
              class={`item ${c.desfeita ? 'desfeita' : ''} ${afetadas.length ? 'com-ids' : ''}`}
              data-testid="item-assistente"
              onMouseEnter={() => destacar(c)}
              onMouseLeave={soltar}
              onClick={() => abrirPrimeira(c)}
            >
              <div class="linha">
                <span class="rotulo">{c.resumo}</span>
                <span class="hora">{hora(c.quando)}</span>
              </div>
              {afetadas.length ? (
                <div class="detalhe">
                  {afetadas.length} {afetadas.length === 1 ? 'item afetado' : 'itens afetados'}
                </div>
              ) : null}
              <div class="acoes">
                <button
                  type="button"
                  class="botao-pilula"
                  disabled={c.desfeita}
                  onClick={async (e) => {
                    e.stopPropagation();
                    await desfazerChamada(c.id);
                  }}
                  data-testid="desfazer-chamada"
                >
                  {c.desfeita ? 'Desfeita' : 'Desfazer'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

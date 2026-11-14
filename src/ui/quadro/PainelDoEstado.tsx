import { useSignal } from '@preact/signals';
import type { EstadoDoMundo } from '../../dominio/estado-do-mundo.ts';

interface PainelDoEstadoProps {
  estado: EstadoDoMundo;
  onDefinirFato: (chave: string, valor: string | boolean | undefined) => void;
  onAlternarFato: (chave: string) => void;
  onFechar: () => void;
}

export function PainelDoEstado({
  estado,
  onDefinirFato,
  onAlternarFato,
  onFechar,
}: PainelDoEstadoProps) {
  const novaChave = useSignal('');
  const novoValor = useSignal('');
  const entradas = Object.entries(estado.fatos).sort(([a], [b]) =>
    a.localeCompare(b, 'pt-BR'),
  );

  const adicionar = (e: Event) => {
    e.preventDefault();
    const k = novaChave.value.trim();
    if (!k) return;
    const v = novoValor.value.trim();
    onDefinirFato(k, v ? v : true);
    novaChave.value = '';
    novoValor.value = '';
  };

  return (
    <aside
      class="painel-fundo painel-estado"
      data-testid="painel-estado"
      aria-label="Estado do mundo"
      onPointerDown={(e) => e.stopPropagation()}
      onDblClick={(e) => e.stopPropagation()}
    >
      <div class="painel-fundo-topo">
        <span class="faixa pequena">Estado do mundo</span>
        <button
          type="button"
          class="botao-pilula"
          data-testid="fechar-painel-estado"
          onClick={onFechar}
        >
          Fechar
        </button>
      </div>

      <form class="painel-estado-form" onSubmit={adicionar}>
        <input
          type="text"
          placeholder="Fato (ex: poeira)"
          data-testid="estado-nova-chave"
          value={novaChave.value}
          onInput={(e) => {
            novaChave.value = e.currentTarget.value;
          }}
        />
        <input
          type="text"
          placeholder="Valor (vazio = sim)"
          data-testid="estado-novo-valor"
          value={novoValor.value}
          onInput={(e) => {
            novoValor.value = e.currentTarget.value;
          }}
        />
        <button type="submit" class="botao-pilula destaque" data-testid="estado-adicionar">
          +
        </button>
      </form>

      {entradas.length === 0 ? (
        <p class="dica">Nenhum fato registrado ainda.</p>
      ) : (
        <ul class="painel-estado-lista" data-testid="estado-lista">
          {entradas.map(([chave, valor]) => (
            <li key={chave} class="painel-estado-linha">
              <span class="painel-estado-chave">{chave}</span>
              {typeof valor === 'boolean' ? (
                <button
                  type="button"
                  class={`chip-filtro ${valor ? 'ativa' : ''}`}
                  data-testid={`estado-toggle-${chave}`}
                  onClick={() => onAlternarFato(chave)}
                >
                  {valor ? 'Ativo' : 'Inativo'}
                </button>
              ) : (
                <input
                  type="text"
                  class="painel-estado-valor"
                  data-testid={`estado-valor-${chave}`}
                  value={valor}
                  onChange={(e) => onDefinirFato(chave, e.currentTarget.value)}
                />
              )}
              <button
                type="button"
                class="botao-pilula perigo"
                title="Remover fato"
                onClick={() => onDefinirFato(chave, undefined)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}

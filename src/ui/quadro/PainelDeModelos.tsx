import { useSignal } from '@preact/signals';
import {
  apagarModelo,
  modeloEscolhidoId,
  modelosVisiveis,
  renomearModelo,
} from '../../app/modelos.ts';
import { cx } from '../cx.ts';

/** Mini-painel da ferramenta Modelo: escolher, renomear e apagar; o clique no quadro carimba. */
export function PainelDeModelos() {
  const renomeando = useSignal<{ id: string; nome: string } | null>(null);
  const apagando = useSignal<string | null>(null);
  const lista = modelosVisiveis.value;

  const confirmarRenome = () => {
    const r = renomeando.value;
    if (!r) return;
    void renomearModelo(r.id, r.nome);
    renomeando.value = null;
  };

  return (
    <aside
      class="painel-fundo painel-modelos"
      data-testid="painel-modelos"
      onPointerDown={(e) => e.stopPropagation()}
      onDblClick={(e) => e.stopPropagation()}
    >
      <div class="painel-fundo-topo">
        <span class="faixa pequena">Modelos de cena</span>
      </div>
      {lista.length === 0 ? (
        <p class="meta" data-testid="modelos-vazio">
          Nenhum modelo. Selecione itens, abra o menu (botão direito) e escolha “Salvar como modelo…”.
        </p>
      ) : (
        <p class="meta">
          {modeloEscolhidoId.value
            ? 'Clique no quadro para carimbar.'
            : 'Escolha um modelo e clique no quadro.'}
        </p>
      )}
      <ul class="modelos-lista">
        {lista.map((m) => (
          <li key={m.id} class={cx('modelo-linha', modeloEscolhidoId.value === m.id && 'escolhido')}>
            {renomeando.value?.id === m.id ? (
              <>
                <input
                  type="text"
                  class="modelo-nome-input"
                  data-testid={`modelo-renomear-input-${m.id}`}
                  value={renomeando.value.nome}
                  maxLength={80}
                  autoFocus
                  onInput={(e) => {
                    renomeando.value = { id: m.id, nome: e.currentTarget.value };
                  }}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === 'Enter') confirmarRenome();
                    if (e.key === 'Escape') renomeando.value = null;
                  }}
                />
                <button
                  type="button"
                  class="botao-pilula"
                  data-testid={`modelo-renomear-ok-${m.id}`}
                  onClick={confirmarRenome}
                >
                  OK
                </button>
              </>
            ) : apagando.value === m.id ? (
              <>
                <span class="modelo-confirma">Apagar “{m.nome}”?</span>
                <button
                  type="button"
                  class="botao-pilula perigo"
                  data-testid={`modelo-apagar-confirmar-${m.id}`}
                  onClick={() => {
                    apagando.value = null;
                    void apagarModelo(m.id);
                  }}
                >
                  Apagar
                </button>
                <button
                  type="button"
                  class="botao-pilula"
                  data-testid={`modelo-apagar-cancelar-${m.id}`}
                  onClick={() => {
                    apagando.value = null;
                  }}
                >
                  Não
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  class="modelo-escolher"
                  data-testid={`modelo-escolher-${m.id}`}
                  aria-pressed={modeloEscolhidoId.value === m.id}
                  onClick={() => {
                    modeloEscolhidoId.value = m.id;
                  }}
                >
                  <span>{m.nome}</span>
                  <span class="meta">{m.campanhaId === null ? 'todas' : 'campanha'}</span>
                </button>
                <button
                  type="button"
                  class="botao-pilula"
                  data-testid={`modelo-renomear-${m.id}`}
                  onClick={() => {
                    renomeando.value = { id: m.id, nome: m.nome };
                  }}
                >
                  Renomear
                </button>
                <button
                  type="button"
                  class="botao-pilula"
                  data-testid={`modelo-apagar-${m.id}`}
                  onClick={() => {
                    apagando.value = m.id;
                  }}
                >
                  Apagar
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
    </aside>
  );
}

import { useSignal } from '@preact/signals';
import type { ExamePacoteMiro } from '../../app/importar-miro.ts';
import type { FiltroMolduras } from '../../dominio/molduras-miro.ts';

interface Props {
  exame: ExamePacoteMiro;
  aoCancelar: () => void;
  aoImportar: (filtro: FiltroMolduras) => void;
}

/** Escolha das molduras do Miro a importar (uma por aventura ou arco). */
export function DialogoMolduras({ exame, aoCancelar, aoImportar }: Props) {
  const marcadas = useSignal<string[]>(exame.molduras.map((m) => m.id));
  const soltos = useSignal(exame.soltos > 0);
  const busca = useSignal('');

  const termo = busca.value.trim().toLowerCase();
  const visiveis = exame.molduras.filter((m) => !termo || m.titulo.toLowerCase().includes(termo));
  const todas = marcadas.value.length === exame.molduras.length && (soltos.value || exame.soltos === 0);
  const nada = marcadas.value.length === 0 && !soltos.value;

  const alternar = (id: string) => {
    marcadas.value = marcadas.value.includes(id)
      ? marcadas.value.filter((x) => x !== id)
      : [...marcadas.value, id];
  };

  return (
    <div
      class="miro-molduras-fundo"
      data-testid="dialogo-molduras-miro"
      onKeyDown={(e) => {
        if (e.key === 'Escape') aoCancelar();
      }}
    >
      <div class="miro-molduras-dialogo" role="dialog" aria-label="Escolher molduras do Miro">
        <h2 class="miro-molduras-titulo">Importar do Miro: {exame.nome}</h2>
        <p class="meta">Escolha as molduras que viram este quadro. As outras ficam de fora.</p>
        <input
          type="text"
          class="campo-inline"
          placeholder="Buscar moldura"
          aria-label="Buscar moldura"
          data-testid="molduras-miro-busca"
          value={busca.value}
          onInput={(e) => {
            busca.value = e.currentTarget.value;
          }}
        />
        <label class="miro-molduras-linha">
          <input
            type="checkbox"
            data-testid="molduras-miro-todas"
            checked={todas}
            onChange={(e) => {
              const on = e.currentTarget.checked;
              marcadas.value = on ? exame.molduras.map((m) => m.id) : [];
              soltos.value = on && exame.soltos > 0;
            }}
          />
          <span>Marcar todas</span>
        </label>
        <div class="miro-molduras-lista" data-testid="molduras-miro-lista">
          {visiveis.map((m) => (
            <label key={m.id} class="miro-molduras-linha" data-testid={`moldura-miro-linha-${m.id}`}>
              <input
                type="checkbox"
                data-testid={`moldura-miro-${m.id}`}
                checked={marcadas.value.includes(m.id)}
                onChange={() => alternar(m.id)}
              />
              <span class="miro-molduras-nome">{m.titulo}</span>
              <span class="meta" data-testid={`moldura-miro-contagem-${m.id}`}>
                {m.itens} {m.itens === 1 ? 'item' : 'itens'}
              </span>
            </label>
          ))}
          {visiveis.length === 0 ? <p class="meta">Nenhuma moldura com esse nome.</p> : null}
        </div>
        <label class="miro-molduras-linha">
          <input
            type="checkbox"
            data-testid="molduras-miro-soltos"
            checked={soltos.value}
            onChange={(e) => {
              soltos.value = e.currentTarget.checked;
            }}
          />
          <span class="miro-molduras-nome">Itens fora de molduras</span>
          <span class="meta" data-testid="molduras-miro-soltos-contagem">
            {exame.soltos} {exame.soltos === 1 ? 'item' : 'itens'}
          </span>
        </label>
        <div class="miro-molduras-rodape">
          <button type="button" class="botao-pilula" data-testid="molduras-miro-cancelar" onClick={aoCancelar}>
            Cancelar
          </button>
          <button
            type="button"
            class="botao-pilula destaque"
            data-testid="molduras-miro-importar"
            disabled={nada}
            onClick={() => aoImportar({ molduras: marcadas.value, soltos: soltos.value })}
          >
            Importar
          </button>
        </div>
      </div>
    </div>
  );
}

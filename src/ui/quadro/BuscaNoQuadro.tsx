import { useEffect, useRef } from 'preact/hooks';
import type { ResultadoBuscaQuadro } from '../../dominio/busca-quadro.ts';
import type { Item } from '../../dominio/quadro.ts';

interface BuscaNoQuadroProps {
  termo: string;
  resultados: readonly ResultadoBuscaQuadro[];
  indiceAtivo: number;
  onMudarTermo: (termo: string) => void;
  onIrPara: (indice: number, item: Item) => void;
  onFechar: () => void;
}

export function BuscaNoQuadro({
  termo,
  resultados,
  indiceAtivo,
  onMudarTermo,
  onIrPara,
  onFechar,
}: BuscaNoQuadroProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const irParaDelta = (delta: number) => {
    if (resultados.length === 0) return;
    const prox = (indiceAtivo + delta + resultados.length) % resultados.length;
    const alvo = resultados[prox];
    if (alvo) onIrPara(prox, alvo.item);
  };

  return (
    <aside
      class="painel-fundo busca-quadro"
      data-testid="busca-quadro"
      aria-label="Buscar no quadro"
      onPointerDown={(e) => e.stopPropagation()}
      onDblClick={(e) => e.stopPropagation()}
    >
      <div class="busca-quadro-topo">
        <input
          ref={inputRef}
          type="search"
          data-testid="busca-quadro-input"
          placeholder="Buscar no quadro..."
          value={termo}
          onInput={(e) => onMudarTermo(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              irParaDelta(e.shiftKey ? -1 : 1);
            } else if (e.key === 'Escape') {
              e.preventDefault();
              onFechar();
            }
          }}
        />
        <span class="meta busca-quadro-contagem" data-testid="busca-quadro-contagem">
          {resultados.length > 0 ? `${indiceAtivo + 1}/${resultados.length}` : '0'}
        </span>
        <button
          type="button"
          class="botao-pilula"
          title="Anterior (Shift+Enter)"
          data-testid="busca-quadro-anterior"
          disabled={resultados.length === 0}
          onClick={() => irParaDelta(-1)}
        >
          ↑
        </button>
        <button
          type="button"
          class="botao-pilula"
          title="Próximo (Enter)"
          data-testid="busca-quadro-proximo"
          disabled={resultados.length === 0}
          onClick={() => irParaDelta(1)}
        >
          ↓
        </button>
        <button
          type="button"
          class="botao-pilula"
          data-testid="fechar-busca-quadro"
          onClick={onFechar}
        >
          ✕
        </button>
      </div>

      {termo.trim() && resultados.length > 0 ? (
        <ul class="busca-quadro-lista" data-testid="busca-quadro-lista">
          {resultados.map((r, idx) => (
            <li key={r.item.id}>
              <button
                type="button"
                class={`busca-quadro-item ${idx === indiceAtivo ? 'ativa' : ''}`}
                data-testid={`busca-quadro-res-${r.item.id}`}
                onClick={() => onIrPara(idx, r.item)}
              >
                <span class="selo">{r.item.tipo}</span>
                <span class="busca-quadro-trecho">{r.trecho}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </aside>
  );
}

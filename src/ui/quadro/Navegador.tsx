import { useSignal } from '@preact/signals';
import { linkDaMoldura, ordemDeLeitura, type ItemMoldura } from '../../dominio/molduras.ts';
import type { Item } from '../../dominio/quadro.ts';

interface NavegadorProps {
  quadroId: string;
  itens: ReadonlyMap<string, Item>;
  onFocarMoldura: (moldura: ItemMoldura) => void;
  onFechar: () => void;
}

export function Navegador({
  quadroId,
  itens,
  onFocarMoldura,
  onFechar,
}: NavegadorProps) {
  const busca = useSignal('');
  const copiadoId = useSignal<string | null>(null);

  const todasMolduras: ItemMoldura[] = [];
  for (const it of itens.values()) {
    if (it.tipo === 'moldura') todasMolduras.push(it);
  }
  const ordenadas = ordemDeLeitura(todasMolduras);
  const termo = busca.value.trim().toLowerCase();
  const filtradas = termo
    ? ordenadas.filter((m) => m.titulo.toLowerCase().includes(termo))
    : ordenadas;

  const copiarLink = async (m: ItemMoldura) => {
    const link = linkDaMoldura(quadroId, m.id);
    try {
      await navigator.clipboard?.writeText(link);
    } catch {
      /* ignora */
    }
    copiadoId.value = m.id;
    setTimeout(() => {
      if (copiadoId.value === m.id) copiadoId.value = null;
    }, 1500);
  };

  return (
    <aside class="navegador-molduras" data-testid="navegador-molduras">
      <div class="navegador-cabecalho">
        <strong>Molduras ({ordenadas.length})</strong>
        <button
          type="button"
          class="fmt-btn"
          data-testid="navegador-fechar"
          aria-label="Fechar navegador"
          onClick={onFechar}
        >
          ✕
        </button>
      </div>
      <input
        type="search"
        class="navegador-busca"
        data-testid="navegador-busca"
        placeholder="Filtrar molduras…"
        value={busca.value}
        onInput={(e) => {
          busca.value = e.currentTarget.value;
        }}
      />
      <div class="navegador-lista">
        {filtradas.length === 0 ? (
          <p class="meta">Nenhuma moldura.</p>
        ) : (
          filtradas.map((m, idx) => (
            <div key={m.id} class="navegador-item">
              <button
                type="button"
                class="navegador-item-btn"
                data-testid={`nav-moldura-${m.id}`}
                onClick={() => onFocarMoldura(m)}
              >
                <span class="meta">{idx + 1}.</span> {m.titulo || 'Sem título'}
              </button>
              <button
                type="button"
                class="fmt-btn"
                data-testid={`nav-copiar-${m.id}`}
                title="Copiar link"
                onClick={() => void copiarLink(m)}
              >
                {copiadoId.value === m.id ? '✓' : '🔗'}
              </button>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}

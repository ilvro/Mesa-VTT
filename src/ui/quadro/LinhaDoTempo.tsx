import { useEffect, useState } from 'preact/hooks';
import {
  extrairLinhaDoTempo,
  type MarcoDaLinhaDoTempo,
} from '../../dominio/linha-do-tempo.ts';
import type { Item } from '../../dominio/quadro.ts';
import { listarItens, listarQuadros } from '../../app/banco-quadros.ts';
import { campanhaAtiva } from '../../app/campanha.ts';

interface LinhaDoTempoProps {
  onAbrirItem: (quadroId: string, itemId: string) => void;
  onFechar: () => void;
}

export function LinhaDoTempo({ onAbrirItem, onFechar }: LinhaDoTempoProps) {
  const [marcos, setMarcos] = useState<MarcoDaLinhaDoTempo[]>([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let cancelado = false;
    const carregar = async () => {
      const c = campanhaAtiva.value;
      if (!c) {
        if (!cancelado) {
          setMarcos([]);
          setCarregando(false);
        }
        return;
      }
      const quadros = await listarQuadros(c.id);
      const todosItens: Item[] = [];
      for (const q of quadros) {
        const lista = await listarItens(q.id);
        todosItens.push(...lista);
      }
      if (!cancelado) {
        setMarcos(extrairLinhaDoTempo(todosItens, quadros));
        setCarregando(false);
      }
    };
    void carregar();
    return () => {
      cancelado = true;
    };
  }, []);

  return (
    <div
      class="painel-flutuante painel-segredos"
      data-testid="painel-linha-do-tempo"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div class="painel-flutuante-cabecalho">
        <strong>Linha do tempo</strong>
        <button
          type="button"
          class="fmt-btn"
          aria-label="Fechar"
          onClick={onFechar}
        >
          ✕
        </button>
      </div>
      {carregando ? (
        <p class="meta">Carregando datas…</p>
      ) : marcos.length === 0 ? (
        <p class="meta">
          Nenhum marco encontrado. Use <code>[DATA 1240]</code> ou{' '}
          <code>[DATA 1240-03-15]</code> nos cartões.
        </p>
      ) : (
        <ul class="painel-segredos-lista">
          {marcos.map((m, idx) => (
            <li key={`${m.itemId}-${idx}`} class="painel-segredos-item">
              <button
                type="button"
                class="painel-segredos-ir"
                onClick={() => onAbrirItem(m.quadroId, m.itemId)}
              >
                <span class="painel-segredos-status">{m.dataTexto}</span>
                <span class="painel-segredos-texto">{m.trecho}</span>
                <span class="painel-segredos-meta">{m.quadroTitulo}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

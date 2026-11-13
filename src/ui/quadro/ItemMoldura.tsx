import { useSignal } from '@preact/signals';
import { useEffect, useRef } from 'preact/hooks';
import type { ItemMoldura as ItemMolduraModelo } from '../../dominio/molduras.ts';

interface ItemMolduraProps {
  item: ItemMolduraModelo;
  zoom: number;
  editando: boolean;
  onSairTitulo: (novoTitulo: string) => void;
}

export function ItemMoldura({
  item,
  zoom,
  editando,
  onSairTitulo,
}: ItemMolduraProps) {
  const texto = useSignal(item.titulo);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const invZoom = 1 / Math.max(0.02, zoom);

  useEffect(() => {
    texto.value = item.titulo;
  }, [item.titulo]);

  useEffect(() => {
    if (editando) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editando]);

  const c = item.caixa;
  return (
    <div
      class="item-quadro item-moldura"
      data-testid={`item-${item.id}`}
      data-item-id={item.id}
      style={{
        left: `${item.x}px`,
        top: `${item.y}px`,
        width: `${item.largura}px`,
        height: `${item.altura}px`,
        transform: item.rotacao ? `rotate(${item.rotacao}deg)` : undefined,
        opacity: c.opacidade,
        backgroundColor: c.fundo ?? 'rgba(255, 255, 255, 0.02)',
        border:
          c.espessuraBorda > 0 && c.borda
            ? `${c.espessuraBorda}px ${c.tracejado === 'tracejado' ? 'dashed' : c.tracejado === 'pontilhado' ? 'dotted' : 'solid'} ${c.borda}`
            : '1.5px solid var(--borda)',
        borderRadius: `${c.raio}px`,
        zIndex: 0,
      }}
    >
      <div
        class="item-moldura-titulo-wrap"
        data-item-id={item.id}
        style={{
          transform: `scale(${invZoom})`,
          transformOrigin: 'bottom left',
        }}
      >
        {editando ? (
          <input
            ref={inputRef}
            type="text"
            class="item-moldura-titulo-input"
            data-testid="moldura-titulo-input"
            value={texto.value}
            onInput={(e) => {
              texto.value = e.currentTarget.value;
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === 'Escape') {
                e.preventDefault();
                onSairTitulo(e.key === 'Escape' ? item.titulo : texto.value.trim() || 'Moldura');
              }
            }}
            onBlur={() => {
              onSairTitulo(texto.value.trim() || 'Moldura');
            }}
          />
        ) : (
          <span class="item-moldura-titulo" data-item-id={item.id}>
            {item.titulo}
          </span>
        )}
      </div>
    </div>
  );
}

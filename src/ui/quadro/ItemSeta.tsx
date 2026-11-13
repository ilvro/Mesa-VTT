import { useSignal } from '@preact/signals';
import { useEffect, useRef } from 'preact/hooks';
import type { Cabeca, Item } from '../../dominio/quadro.ts';
import {
  caminhoCabecaSeta,
  caminhoDaSeta,
  type ItemSeta as ItemSetaModelo,
} from '../../dominio/setas.ts';

interface ItemSetaProps {
  item: ItemSetaModelo;
  itens: ReadonlyMap<string, Item>;
  editando: boolean;
  onSairRotulo: (novoRotulo: string) => void;
}

function CabecaSvg({
  cabeca,
  x,
  y,
  angulo,
  cor,
  espessura,
}: {
  cabeca: Cabeca;
  x: number;
  y: number;
  angulo: number;
  cor: string;
  espessura: number;
}) {
  if (cabeca === 'nenhuma') return null;
  const escala = Math.max(0.85, Math.min(2, espessura / 2));
  if (cabeca === 'circulo') {
    return (
      <circle
        cx={x}
        cy={y}
        r={4 * escala}
        fill={cor}
        pointerEvents="none"
      />
    );
  }
  const d = caminhoCabecaSeta(cabeca);
  if (!d) return null;
  const preenchida = cabeca === 'triangulo' || cabeca === 'losango';
  return (
    <path
      d={d}
      transform={`translate(${x}, ${y}) rotate(${angulo}) scale(${escala})`}
      fill={preenchida ? cor : 'none'}
      stroke={cor}
      strokeWidth={preenchida ? 1 : 2}
      strokeLinecap="round"
      strokeLinejoin="round"
      pointerEvents="none"
    />
  );
}

export function ItemSeta({ item, itens, editando, onSairRotulo }: ItemSetaProps) {
  const cam = caminhoDaSeta(item, itens);
  const texto = useSignal(item.rotulo);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    texto.value = item.rotulo;
  }, [item.rotulo]);

  useEffect(() => {
    if (editando) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editando]);

  const dashArray =
    item.tracejado === 'tracejado'
      ? `${item.espessura * 4} ${item.espessura * 3}`
      : item.tracejado === 'pontilhado'
        ? `${item.espessura} ${item.espessura * 2.5}`
        : undefined;

  return (
    <>
      <svg
        class="item-quadro item-seta"
        data-testid={`item-${item.id}`}
        data-item-id={item.id}
        style={{
          left: '0px',
          top: '0px',
          width: '1px',
          height: '1px',
          overflow: 'visible',
          pointerEvents: 'none',
          zIndex: item.z,
        }}
      >
        <path
          d={cam.d}
          fill="none"
          stroke="transparent"
          strokeWidth={Math.max(16, item.espessura + 12)}
          pointerEvents="stroke"
          data-item-id={item.id}
        />
        <path
          d={cam.d}
          fill="none"
          stroke={item.cor}
          strokeWidth={item.espessura}
          strokeDasharray={dashArray}
          strokeLinecap="round"
          strokeLinejoin="round"
          pointerEvents="none"
        />
        <CabecaSvg
          cabeca={item.inicio}
          x={cam.inicio.x}
          y={cam.inicio.y}
          angulo={cam.angInicio + 180}
          cor={item.cor}
          espessura={item.espessura}
        />
        <CabecaSvg
          cabeca={item.fim}
          x={cam.fim.x}
          y={cam.fim.y}
          angulo={cam.angFim}
          cor={item.cor}
          espessura={item.espessura}
        />
      </svg>

      {editando ? (
        <input
          ref={inputRef}
          type="text"
          class="item-seta-rotulo-input"
          data-testid="seta-rotulo-input"
          data-item-id={item.id}
          style={{
            left: `${cam.meio[0]}px`,
            top: `${cam.meio[1]}px`,
            zIndex: item.z + 1,
          }}
          value={texto.value}
          onInput={(e) => {
            texto.value = e.currentTarget.value;
          }}
          onPointerDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === 'Escape') {
              e.preventDefault();
              onSairRotulo(e.key === 'Escape' ? item.rotulo : texto.value.trim());
            }
          }}
          onBlur={() => {
            onSairRotulo(texto.value.trim());
          }}
        />
      ) : item.rotulo ? (
        <div
          class="item-seta-rotulo"
          data-item-id={item.id}
          style={{
            left: `${cam.meio[0]}px`,
            top: `${cam.meio[1]}px`,
            zIndex: item.z + 1,
          }}
        >
          {item.rotulo}
        </div>
      ) : null}
    </>
  );
}

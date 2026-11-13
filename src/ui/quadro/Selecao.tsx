import { ALCAS, caixaDe, type Alca } from '../../dominio/geometria.ts';
import type { Caixa } from '../../dominio/camera.ts';
import type { Item } from '../../dominio/quadro.ts';

interface SelecaoProps {
  selecionados: Item[];
  zoom: number;
  retanguloSelecao: Caixa | null;
  onIniciarRedimensionar: (alca: Alca, e: PointerEvent) => void;
  onIniciarGirar: (e: PointerEvent) => void;
}

const POSICAO_ALCA: Record<Alca, { left: string; top: string; cursor: string }> = {
  nw: { left: '0%', top: '0%', cursor: 'nwse-resize' },
  n: { left: '50%', top: '0%', cursor: 'ns-resize' },
  ne: { left: '100%', top: '0%', cursor: 'nesw-resize' },
  e: { left: '100%', top: '50%', cursor: 'ew-resize' },
  se: { left: '100%', top: '100%', cursor: 'nwse-resize' },
  s: { left: '50%', top: '100%', cursor: 'ns-resize' },
  sw: { left: '0%', top: '100%', cursor: 'nesw-resize' },
  w: { left: '0%', top: '50%', cursor: 'ew-resize' },
};

function caixaCombinada(itens: Item[]): Caixa | null {
  if (itens.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const item of itens) {
    const c = caixaDe(item);
    if (c.x < minX) minX = c.x;
    if (c.y < minY) minY = c.y;
    if (c.x + c.largura > maxX) maxX = c.x + c.largura;
    if (c.y + c.altura > maxY) maxY = c.y + c.altura;
  }
  return { x: minX, y: minY, largura: maxX - minX, altura: maxY - minY };
}

export function Selecao({
  selecionados,
  zoom,
  retanguloSelecao,
  onIniciarRedimensionar,
  onIniciarGirar,
}: SelecaoProps) {
  const invZoom = 1 / Math.max(0.02, zoom);
  const todosTravados = selecionados.length > 0 && selecionados.every((i) => i.travado);
  const unico = selecionados.length === 1 ? selecionados[0] : undefined;
  const caixa = unico
    ? { x: unico.x, y: unico.y, largura: unico.largura, altura: unico.altura }
    : caixaCombinada(selecionados);
  const rotacao = unico ? unico.rotacao : 0;

  return (
    <>
      {caixa ? (
        <div
          class={`caixa-selecao ${todosTravados ? 'travada' : ''}`}
          data-testid="caixa-selecao"
          style={{
            left: `${caixa.x}px`,
            top: `${caixa.y}px`,
            width: `${caixa.largura}px`,
            height: `${caixa.altura}px`,
            transform: rotacao ? `rotate(${rotacao}deg)` : undefined,
            borderWidth: `${1.5 * invZoom}px`,
          }}
        >
          {!todosTravados &&
            ALCAS.map((alca) => {
              const p = POSICAO_ALCA[alca];
              return (
                <div
                  key={alca}
                  class="alca-redimensionar"
                  data-testid={`alca-${alca}`}
                  style={{
                    left: p.left,
                    top: p.top,
                    cursor: p.cursor,
                    width: `${10 * invZoom}px`,
                    height: `${10 * invZoom}px`,
                    borderWidth: `${1.5 * invZoom}px`,
                  }}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    onIniciarRedimensionar(alca, e);
                  }}
                />
              );
            })}
          {!todosTravados && unico ? (
            <div
              class="alca-girar"
              data-testid="alca-girar"
              title="Girar (Shift encaixa 15°)"
              style={{
                top: `${-24 * invZoom}px`,
                width: `${12 * invZoom}px`,
                height: `${12 * invZoom}px`,
                borderWidth: `${1.5 * invZoom}px`,
              }}
              onPointerDown={(e) => {
                e.stopPropagation();
                onIniciarGirar(e);
              }}
            />
          ) : null}
        </div>
      ) : null}

      {retanguloSelecao ? (
        <div
          class="retangulo-selecao"
          data-testid="retangulo-selecao"
          style={{
            left: `${Math.min(retanguloSelecao.x, retanguloSelecao.x + retanguloSelecao.largura)}px`,
            top: `${Math.min(retanguloSelecao.y, retanguloSelecao.y + retanguloSelecao.altura)}px`,
            width: `${Math.abs(retanguloSelecao.largura)}px`,
            height: `${Math.abs(retanguloSelecao.altura)}px`,
            borderWidth: `${1.5 * invZoom}px`,
          }}
        />
      ) : null}
    </>
  );
}

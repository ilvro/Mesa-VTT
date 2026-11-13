import { ALCAS, caixaDe, type Alca } from '../../dominio/geometria.ts';
import type { Caixa } from '../../dominio/camera.ts';
import type { Item } from '../../dominio/quadro.ts';
import { caminhoDaSeta, type LadoResolvido } from '../../dominio/setas.ts';

interface SelecaoProps {
  selecionados: Item[];
  todosItens: ReadonlyMap<string, Item>;
  zoom: number;
  retanguloSelecao: Caixa | null;
  onIniciarRedimensionar: (alca: Alca, e: PointerEvent) => void;
  onIniciarGirar: (e: PointerEvent) => void;
  onIniciarConector: (itemId: string, lado: LadoResolvido, e: PointerEvent) => void;
  onIniciarPontaSeta: (setaId: string, ponta: 'de' | 'para', e: PointerEvent) => void;
}

const CONECTORES: { lado: LadoResolvido; left: string; top: string; dx: number; dy: number }[] = [
  { lado: 'cima', left: '50%', top: '0%', dx: 0, dy: -18 },
  { lado: 'direita', left: '100%', top: '50%', dx: 18, dy: 0 },
  { lado: 'baixo', left: '50%', top: '100%', dx: 0, dy: 18 },
  { lado: 'esquerda', left: '0%', top: '50%', dx: -18, dy: 0 },
];

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
  todosItens,
  zoom,
  retanguloSelecao,
  onIniciarRedimensionar,
  onIniciarGirar,
  onIniciarConector,
  onIniciarPontaSeta,
}: SelecaoProps) {
  const invZoom = 1 / Math.max(0.02, zoom);
  const todosTravados = selecionados.length > 0 && selecionados.every((i) => i.travado);
  const unico = selecionados.length === 1 ? selecionados[0] : undefined;
  const unicaSeta = unico?.tipo === 'seta' ? unico : undefined;
  const caminhoSeta = unicaSeta ? caminhoDaSeta(unicaSeta, todosItens) : null;
  const caixa = unicaSeta
    ? null
    : unico
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
            <>
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
              {CONECTORES.map((c) => (
                <div
                  key={c.lado}
                  class="alca-conector"
                  data-testid={`conector-${c.lado}`}
                  title="Arrastar para ligar com seta"
                  style={{
                    left: `calc(${c.left} + ${c.dx * invZoom}px)`,
                    top: `calc(${c.top} + ${c.dy * invZoom}px)`,
                    width: `${10 * invZoom}px`,
                    height: `${10 * invZoom}px`,
                    borderWidth: `${1.5 * invZoom}px`,
                  }}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    onIniciarConector(unico.id, c.lado, e);
                  }}
                />
              ))}
            </>
          ) : null}
        </div>
      ) : null}

      {unicaSeta && caminhoSeta && !unicaSeta.travado ? (
        <>
          <div
            class="alca-ponta-seta"
            data-testid="seta-ponta-de"
            style={{
              left: `${caminhoSeta.inicio.x}px`,
              top: `${caminhoSeta.inicio.y}px`,
              width: `${12 * invZoom}px`,
              height: `${12 * invZoom}px`,
              borderWidth: `${2 * invZoom}px`,
            }}
            onPointerDown={(e) => {
              e.stopPropagation();
              onIniciarPontaSeta(unicaSeta.id, 'de', e);
            }}
          />
          <div
            class="alca-ponta-seta"
            data-testid="seta-ponta-para"
            style={{
              left: `${caminhoSeta.fim.x}px`,
              top: `${caminhoSeta.fim.y}px`,
              width: `${12 * invZoom}px`,
              height: `${12 * invZoom}px`,
              borderWidth: `${2 * invZoom}px`,
            }}
            onPointerDown={(e) => {
              e.stopPropagation();
              onIniciarPontaSeta(unicaSeta.id, 'para', e);
            }}
          />
        </>
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

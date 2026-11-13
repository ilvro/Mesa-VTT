import { useMemo } from 'preact/hooks';
import {
  caixaVisivel,
  itensVisiveis,
  type Camera,
  type Tamanho,
} from '../../dominio/camera.ts';
import type { Item } from '../../dominio/quadro.ts';

interface MundoProps {
  camera: Camera;
  tamanhoTela: Tamanho;
  itens: ReadonlyMap<string, Item>;
}

export function Mundo({ camera, tamanhoTela, itens }: MundoProps) {
  const visiveis = useMemo(() => {
    const caixa = caixaVisivel(camera, tamanhoTela);
    const margem = 120 / Math.max(0.02, camera.zoom);
    return itensVisiveis(itens.values(), caixa, margem).sort(
      (a, b) => a.z - b.z || a.id.localeCompare(b.id),
    );
  }, [camera, tamanhoTela, itens]);

  return (
    <div
      class="mundo-quadro"
      data-testid="mundo-quadro"
      style={{
        transform: `translate(${-camera.x * camera.zoom}px, ${-camera.y * camera.zoom}px) scale(${camera.zoom})`,
        transformOrigin: '0 0',
      }}
    >
      {visiveis.map((item) => (
        <div
          key={item.id}
          class="item-teste"
          data-testid={`item-${item.id}`}
          style={{
            left: `${item.x}px`,
            top: `${item.y}px`,
            width: `${item.largura}px`,
            height: `${item.altura}px`,
            zIndex: item.z,
            transform: item.rotacao ? `rotate(${item.rotacao}deg)` : undefined,
          }}
        />
      ))}
    </div>
  );
}

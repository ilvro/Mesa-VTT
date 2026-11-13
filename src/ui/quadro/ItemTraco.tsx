import { caminhoDoTraco, type ItemTraco as ItemTracoModelo } from '../../dominio/tracos.ts';

interface ItemTracoProps {
  item: ItemTracoModelo;
}

export function ItemTraco({ item }: ItemTracoProps) {
  const d = caminhoDoTraco(item);
  return (
    <svg
      class="item-quadro item-traco"
      data-testid={`item-${item.id}`}
      data-item-id={item.id}
      style={{
        left: `${item.x}px`,
        top: `${item.y}px`,
        width: `${item.largura}px`,
        height: `${item.altura}px`,
        transform: item.rotacao ? `rotate(${item.rotacao}deg)` : undefined,
        opacity: item.opacidade,
        zIndex: item.z,
        overflow: 'visible',
      }}
    >
      <path d={d} fill={item.cor} data-item-id={item.id} />
    </svg>
  );
}

import { useSignal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import type { Item } from '../../dominio/quadro.ts';
import { obterUrlImagemSincrona, urlDaImagem } from '../../app/imagens-quadro.ts';

type ItemImagemModelo = Extract<Item, { tipo: 'imagem' }>;

interface ItemImagemProps {
  item: ItemImagemModelo;
}

export function ItemImagem({ item }: ItemImagemProps) {
  const url = useSignal<string | null>(obterUrlImagemSincrona(item.imagemId));

  useEffect(() => {
    let ativo = true;
    const sincrona = obterUrlImagemSincrona(item.imagemId);
    if (sincrona) {
      url.value = sincrona;
      return;
    }
    void urlDaImagem(item.imagemId).then((res) => {
      if (ativo) url.value = res;
    });
    return () => {
      ativo = false;
    };
  }, [item.imagemId]);

  const c = item.caixa;
  const estilo = {
    left: `${item.x}px`,
    top: `${item.y}px`,
    width: `${item.largura}px`,
    height: `${item.altura}px`,
    transform: item.rotacao ? `rotate(${item.rotacao}deg)` : undefined,
    opacity: c.opacidade,
    border:
      c.espessuraBorda > 0 && c.borda
        ? `${c.espessuraBorda}px ${c.tracejado === 'tracejado' ? 'dashed' : c.tracejado === 'pontilhado' ? 'dotted' : 'solid'} ${c.borda}`
        : undefined,
    borderRadius: `${c.raio}px`,
    boxShadow: c.sombra ? 'var(--sombra-flutuante)' : undefined,
    backgroundColor: c.fundo ?? undefined,
  };

  return (
    <div
      class="item-quadro item-imagem"
      data-testid={`item-${item.id}`}
      data-item-id={item.id}
      style={estilo}
    >
      {url.value ? (
        <img
          src={url.value}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
        />
      ) : (
        <span class="meta">Carregando imagem…</span>
      )}
    </div>
  );
}

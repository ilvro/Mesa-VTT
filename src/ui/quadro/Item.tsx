import { memo } from 'preact/compat';
import { useEffect, useRef } from 'preact/hooks';
import { docDeTexto, textoPuro, type Item as ItemModelo } from '../../dominio/quadro.ts';

interface ItemProps {
  item: ItemModelo;
  editando: boolean;
  onSairEdicao: (novoTexto?: string) => void;
}

const ALINHAMENTO_CSS = {
  esquerda: 'left',
  centro: 'center',
  direita: 'right',
  justificado: 'justify',
} as const;

const VERTICAL_CSS = {
  topo: 'flex-start',
  meio: 'center',
  base: 'flex-end',
} as const;

function estiloCaixaCss(item: Extract<ItemModelo, { tipo: 'texto' }>) {
  const c = item.caixa;
  return {
    backgroundColor: c.fundo ?? 'transparent',
    opacity: c.fundo ? c.opacidade : 1,
    border: c.borda && c.espessuraBorda > 0 ? `${c.espessuraBorda}px ${c.tracejado === 'tracejado' ? 'dashed' : c.tracejado === 'pontilhado' ? 'dotted' : 'solid'} ${c.borda}` : undefined,
    borderRadius: c.raio ? `${c.raio}px` : undefined,
    boxShadow: c.sombra ? '0 8px 20px rgba(0, 0, 0, 0.35)' : undefined,
    padding: `${c.padding}px`,
    color: item.texto.cor,
    fontSize: `${item.texto.tamanho}px`,
    textAlign: ALINHAMENTO_CSS[item.texto.alinhamento],
    justifyContent: VERTICAL_CSS[item.texto.vertical],
  };
}

function ItemBase({ item, editando, onSairEdicao }: ItemProps) {
  const areaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editando && areaRef.current) {
      areaRef.current.focus();
      const len = areaRef.current.value.length;
      areaRef.current.setSelectionRange(len, len);
    }
  }, [editando]);

  const estiloPosicao = {
    left: `${item.x}px`,
    top: `${item.y}px`,
    width: `${item.largura}px`,
    height: item.tipo === 'texto' && item.alturaAuto ? 'auto' : `${item.altura}px`,
    minHeight: item.tipo === 'texto' && item.alturaAuto ? `${item.altura}px` : undefined,
    zIndex: item.z,
    transform: item.rotacao ? `rotate(${item.rotacao}deg)` : undefined,
  };

  if (item.tipo === 'texto') {
    const texto = textoPuro(item.doc);
    return (
      <div
        class="item-quadro item-texto"
        data-testid={`item-${item.id}`}
        data-item-id={item.id}
        style={{ ...estiloPosicao, ...estiloCaixaCss(item) }}
      >
        {editando ? (
          <textarea
            ref={areaRef}
            class="item-textarea-provisoria"
            data-testid={`editor-texto-${item.id}`}
            defaultValue={texto}
            onPointerDown={(e) => e.stopPropagation()}
            onBlur={(e) => onSairEdicao(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.stopPropagation();
                onSairEdicao(e.currentTarget.value);
              }
            }}
          />
        ) : (
          <div class="item-texto-conteudo">{texto || ' '}</div>
        )}
      </div>
    );
  }

  // Outros tipos ainda provisórios na Q2a
  void docDeTexto;
  return (
    <div
      class="item-quadro item-provisorio"
      data-testid={`item-${item.id}`}
      data-item-id={item.id}
      style={estiloPosicao}
    >
      <span class="meta">{item.tipo}</span>
    </div>
  );
}

export const Item = memo(
  ItemBase,
  (prev, next) => prev.item === next.item && prev.editando === next.editando,
);

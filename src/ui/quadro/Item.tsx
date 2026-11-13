import type { Editor } from '@tiptap/core';
import { memo } from 'preact/compat';
import { docParaHtml } from '../../dominio/doc-rico.ts';
import type { DocRico, Item as ItemModelo } from '../../dominio/quadro.ts';
import { EditorRico } from './EditorRico.tsx';

interface ItemProps {
  item: ItemModelo;
  editando: boolean;
  onSairEdicao: (novoDoc?: DocRico, novaAltura?: number) => void;
  onEditorPronto?: (editor: Editor | null) => void;
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

const FAMILIA_FONTE: Record<string, string> = {
  'open-sans': "'Open Sans', sans-serif",
  'pt-serif': "'PT Serif', serif",
  hanken: "'Hanken Grotesk Variable', 'Hanken Grotesk', sans-serif",
  cinzel: "'Cinzel', Georgia, serif",
  caveat: "'Caveat', cursive",
  'jetbrains-mono': "'JetBrains Mono', monospace",
};

function estiloCaixaCss(item: Extract<ItemModelo, { tipo: 'texto' }>) {
  const c = item.caixa;
  return {
    backgroundColor: c.fundo ?? 'transparent',
    opacity: c.fundo ? c.opacidade : 1,
    border:
      c.borda && c.espessuraBorda > 0
        ? `${c.espessuraBorda}px ${
            c.tracejado === 'tracejado'
              ? 'dashed'
              : c.tracejado === 'pontilhado'
                ? 'dotted'
                : 'solid'
          } ${c.borda}`
        : undefined,
    borderRadius: c.raio ? `${c.raio}px` : undefined,
    boxShadow: c.sombra ? '0 8px 20px rgba(0, 0, 0, 0.35)' : undefined,
    padding: `${c.padding}px`,
    color: item.texto.cor,
    fontFamily: FAMILIA_FONTE[item.texto.fonte],
    fontSize: `${item.texto.tamanho}px`,
    textAlign: ALINHAMENTO_CSS[item.texto.alinhamento],
    justifyContent: VERTICAL_CSS[item.texto.vertical],
  };
}

function ItemBase({ item, editando, onSairEdicao, onEditorPronto }: ItemProps) {
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
    return (
      <div
        class="item-quadro item-texto"
        data-testid={`item-${item.id}`}
        data-item-id={item.id}
        style={{ ...estiloPosicao, ...estiloCaixaCss(item) }}
      >
        {editando ? (
          <EditorRico
            doc={item.doc}
            alturaAuto={item.alturaAuto}
            padding={item.caixa.padding}
            onSair={(novoDoc, novaAltura) => onSairEdicao(novoDoc, novaAltura)}
            onEditorPronto={onEditorPronto}
          />
        ) : (
          <div
            class="item-texto-conteudo doc-rico-html"
            dangerouslySetInnerHTML={{ __html: docParaHtml(item.doc) }}
          />
        )}
      </div>
    );
  }

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

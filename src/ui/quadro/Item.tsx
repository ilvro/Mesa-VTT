import type { Editor } from '@tiptap/core';
import { memo } from 'preact/compat';
import { docParaHtml } from '../../dominio/doc-rico.ts';
import { familiaCss } from '../../dominio/fontes.ts';
import type { DocRico, Item as ItemModelo } from '../../dominio/quadro.ts';
import { EditorRico } from './EditorRico.tsx';
import { ItemForma } from './ItemForma.tsx';
import { ItemImagem } from './ItemImagem.tsx';
import { ItemMoldura } from './ItemMoldura.tsx';
import { ItemSeta } from './ItemSeta.tsx';
import { ItemTraco } from './ItemTraco.tsx';

interface ItemProps {
  item: ItemModelo;
  todosItens?: ReadonlyMap<string, ItemModelo>;
  zoom?: number;
  lodSimples?: boolean;
  editando: boolean;
  onSairEdicao: (novoDoc?: DocRico, novaAltura?: number) => void;
  onSairRotulo?: (novoRotulo: string) => void;
  onSairTitulo?: (novoTitulo: string) => void;
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
    fontFamily: familiaCss(item.texto.fonte),
    fontSize: `${item.texto.tamanho}px`,
    textAlign: ALINHAMENTO_CSS[item.texto.alinhamento],
    justifyContent: VERTICAL_CSS[item.texto.vertical],
  };
}

function ItemBase({
  item,
  todosItens,
  zoom = 1,
  lodSimples = false,
  editando,
  onSairEdicao,
  onSairRotulo,
  onSairTitulo,
  onEditorPronto,
}: ItemProps) {
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
        ) : lodSimples ? (
          <div class="item-lod-linhas" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
        ) : (
          <div
            class="item-texto-conteudo doc-rico-html"
            dangerouslySetInnerHTML={{ __html: docParaHtml(item.doc) }}
          />
        )}
      </div>
    );
  }

  if (item.tipo === 'forma') {
    return (
      <ItemForma
        item={item}
        editando={editando}
        lodSimples={lodSimples}
        onSairEdicao={onSairEdicao}
        onEditorPronto={onEditorPronto}
      />
    );
  }

  if (item.tipo === 'imagem') {
    return <ItemImagem item={item} />;
  }

  if (item.tipo === 'seta') {
    return (
      <ItemSeta
        item={item}
        itens={todosItens ?? new Map()}
        editando={editando}
        onSairRotulo={(r) => onSairRotulo?.(r)}
      />
    );
  }

  if (item.tipo === 'traco') {
    return <ItemTraco item={item} />;
  }

  if (item.tipo === 'moldura') {
    return (
      <ItemMoldura
        item={item}
        zoom={zoom}
        editando={editando}
        onSairTitulo={(t) => onSairTitulo?.(t)}
      />
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
  (prev, next) =>
    prev.item === next.item &&
    prev.editando === next.editando &&
    ((next.item.tipo !== 'texto' && next.item.tipo !== 'forma') ||
      prev.lodSimples === next.lodSimples) &&
    (next.item.tipo !== 'seta' || prev.todosItens === next.todosItens) &&
    (next.item.tipo !== 'moldura' || prev.zoom === next.zoom),
);

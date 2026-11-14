import type { Editor } from '@tiptap/core';
import { memo } from 'preact/compat';
import { docParaHtml } from '../../dominio/doc-rico.ts';
import { familiaCss } from '../../dominio/fontes.ts';
import {
  PALETA_PADRAO,
  corComOpacidade,
  corDoTexto,
  decorarMarcadores,
  fundoEfetivo,
  type PaletaDaCampanha,
} from '../../dominio/paleta.ts';
import {
  chaveDaCondicao,
  condicoesDoItem,
  itemAtendeCondicoes,
} from '../../dominio/estado-do-mundo.ts';
import type { DocRico, Item as ItemModelo } from '../../dominio/quadro.ts';
import { abrirNoApp } from '../../app/barramento.ts';
import { entidades } from '../../app/campanha.ts';
import { alternarFato, estadoDoMundo, marcarFeito, paletaDaCampanha } from '../../app/quadros.ts';
import { abrirEntidade } from '../../app/rotas.ts';
import { EditorRico } from './EditorRico.tsx';
import { ItemForma } from './ItemForma.tsx';
import { ItemImagem } from './ItemImagem.tsx';
import { ItemMoldura } from './ItemMoldura.tsx';
import { ItemRef } from './ItemRef.tsx';
import { ItemSeta } from './ItemSeta.tsx';
import { ItemTraco } from './ItemTraco.tsx';

function aoClicarTextoDecorado(e: MouseEvent) {
  const alvo = e.target as HTMLElement | null;
  if (!alvo) return;
  const elCond = alvo.closest<HTMLElement>('[data-condicao]');
  if (elCond) {
    e.preventDefault();
    e.stopPropagation();
    const cond = elCond.dataset.condicao;
    if (cond) void alternarFato(chaveDaCondicao(cond));
    return;
  }
  const elEnt = alvo.closest<HTMLElement>('[data-entidade-id]');
  if (elEnt) {
    e.preventDefault();
    e.stopPropagation();
    const id = elEnt.dataset.entidadeId;
    if (id) abrirEntidade(id);
    return;
  }
  const elRef = alvo.closest<HTMLElement>('[data-ref-app]');
  if (elRef) {
    e.preventDefault();
    e.stopPropagation();
    const app = elRef.dataset.refApp;
    const tipo = elRef.dataset.refTipo;
    const id = elRef.dataset.refId;
    if (app && tipo && id) {
      void abrirNoApp({ app: app as 'mesa', tipo, id });
    }
  }
}

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

function estiloCaixaCss(
  item: Extract<ItemModelo, { tipo: 'texto' }>,
  paleta: PaletaDaCampanha,
) {
  const c = item.caixa;
  const fundo = fundoEfetivo(item, paleta);
  const cor = item.semantica && !c.fundo && fundo ? corDoTexto(fundo) : item.texto.cor;
  return {
    backgroundColor: fundo ? corComOpacidade(fundo, c.opacidade) : 'transparent',
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
    color: cor,
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
    const paleta =
      item.semantica && !item.caixa.fundo ? paletaDaCampanha.value : PALETA_PADRAO;
    const conds = condicoesDoItem(item);
    const estado = conds.length > 0 ? estadoDoMundo.value : undefined;
    const condOk = estado ? itemAtendeCondicoes(item, estado) : true;
    const estiloCaixa = estiloCaixaCss(item, paleta);
    return (
      <div
        class={`item-quadro item-texto ${item.revisao ? 'em-revisao' : ''}`}
        data-testid={`item-${item.id}`}
        data-item-id={item.id}
        data-semantica={item.semantica ?? undefined}
        data-em-revisao={item.revisao ? 'true' : undefined}
        style={{
          ...estiloPosicao,
          ...estiloCaixa,
          opacity: condOk ? 1 : 0.35,
        }}
      >
        {!condOk ? (
          <span class="selo-condicao" data-testid={`selo-condicao-${item.id}`}>
            se: {conds.join(', ')}
          </span>
        ) : null}
        <button
          type="button"
          class={`item-feito-btn ${item.feito ? 'ativo' : ''}`}
          title={item.feito ? 'Desmarcar feito (X)' : 'Marcar feito (X)'}
          data-testid={`feito-${item.id}`}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            marcarFeito([item.id]);
          }}
        >
          ✓
        </button>
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
            onClick={aoClicarTextoDecorado}
            onPointerDown={(e) => {
              if ((e.target as HTMLElement | null)?.closest('[data-entidade-id],[data-ref-app],[data-condicao]')) {
                e.stopPropagation();
              }
            }}
            dangerouslySetInnerHTML={{
              __html: docParaHtml(item.doc, {
                decorar: (t) => decorarMarcadores(t, entidades.value, estado),
              }),
            }}
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

  if (item.tipo === 'ref') {
    return <ItemRef item={item} />;
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

  return null;
}

function pontasSetaIguais(
  seta: Extract<ItemModelo, { tipo: 'seta' }>,
  a: ReadonlyMap<string, ItemModelo> | undefined,
  b: ReadonlyMap<string, ItemModelo> | undefined,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if ('itemId' in seta.de && a.get(seta.de.itemId) !== b.get(seta.de.itemId)) {
    return false;
  }
  if ('itemId' in seta.para && a.get(seta.para.itemId) !== b.get(seta.para.itemId)) {
    return false;
  }
  return true;
}

export const Item = memo(
  ItemBase,
  (prev, next) =>
    prev.item === next.item &&
    prev.editando === next.editando &&
    ((next.item.tipo !== 'texto' && next.item.tipo !== 'forma') ||
      prev.lodSimples === next.lodSimples) &&
    (next.item.tipo !== 'seta' ||
      pontasSetaIguais(next.item, prev.todosItens, next.todosItens)) &&
    (next.item.tipo !== 'moldura' || prev.zoom === next.zoom),
);

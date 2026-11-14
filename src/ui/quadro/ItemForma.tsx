import type { Editor } from '@tiptap/core';
import { docParaHtml } from '../../dominio/doc-rico.ts';
import { familiaCss } from '../../dominio/fontes.ts';
import { areaUtil, caminhoDaForma } from '../../dominio/formas.ts';
import {
  PALETA_PADRAO,
  corDoTexto,
  decorarMarcadores,
  fundoEfetivo,
} from '../../dominio/paleta.ts';
import {
  chaveDaCondicao,
  condicoesDoItem,
  itemAtendeCondicoes,
} from '../../dominio/estado-do-mundo.ts';
import type { DocRico, Item } from '../../dominio/quadro.ts';
import { abrirNoApp } from '../../app/barramento.ts';
import { entidades } from '../../app/campanha.ts';
import { ancorasDoItem } from '../../app/foco-do-quadro.ts';
import { alternarFato, estadoDoMundo, paletaDaCampanha } from '../../app/quadros.ts';
import { abrirEntidade } from '../../app/rotas.ts';
import { EditorRico } from './EditorRico.tsx';

interface ItemFormaProps {
  item: Extract<Item, { tipo: 'forma' }>;
  editando: boolean;
  lodSimples?: boolean;
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

export function ItemForma({
  item,
  editando,
  lodSimples = false,
  onSairEdicao,
  onEditorPronto,
}: ItemFormaProps) {
  const c = item.caixa;
  const paleta = item.semantica && !c.fundo ? paletaDaCampanha.value : PALETA_PADRAO;
  const fundo = fundoEfetivo(item, paleta);
  const corTexto = item.semantica && !c.fundo && fundo ? corDoTexto(fundo) : item.texto.cor;
  const conds = condicoesDoItem(item);
  const estado = conds.length > 0 ? estadoDoMundo.value : undefined;
  const condOk = estado ? itemAtendeCondicoes(item, estado) : true;
  const d = caminhoDaForma(item.forma, item.largura, item.altura, c.raio);
  const util = areaUtil(item.forma, {
    x: 0,
    y: 0,
    largura: item.largura,
    altura: item.altura,
  });

  const dashArray =
    c.tracejado === 'tracejado'
      ? `${Math.max(4, c.espessuraBorda * 3)} ${Math.max(3, c.espessuraBorda * 2)}`
      : c.tracejado === 'pontilhado'
        ? `${Math.max(1, c.espessuraBorda)} ${Math.max(3, c.espessuraBorda * 2)}`
        : undefined;

  return (
    <div
      class={`item-quadro item-forma ${item.revisao ? 'em-revisao' : ''}`}
      data-testid={`item-${item.id}`}
      data-item-id={item.id}
      data-semantica={item.semantica ?? undefined}
      data-em-revisao={item.revisao ? 'true' : undefined}
      style={{
        left: `${item.x}px`,
        top: `${item.y}px`,
        width: `${item.largura}px`,
        height: `${item.altura}px`,
        zIndex: item.z,
        transform: item.rotacao ? `rotate(${item.rotacao}deg)` : undefined,
        opacity: condOk ? 1 : 0.35,
        filter: c.sombra ? 'drop-shadow(0 8px 16px rgba(0, 0, 0, 0.35))' : undefined,
      }}
    >
      <svg
        class="item-forma-svg"
        width={item.largura}
        height={item.altura}
        viewBox={`0 0 ${Math.max(1, item.largura)} ${Math.max(1, item.altura)}`}
      >
        <path
          d={d}
          fill={fundo ?? 'transparent'}
          fill-opacity={fundo ? c.opacidade : 0}
          stroke={c.borda ?? 'none'}
          stroke-width={c.espessuraBorda}
          stroke-dasharray={dashArray}
        />
      </svg>

      {(() => {
        const ancs = ancorasDoItem(item.quadroId, item.id);
        if (ancs.length === 0) return null;
        return (
          <button
            type="button"
            class="item-pino-ancora"
            title={`Ver no mapa (${ancs[0]!.para.tipo}: ${ancs[0]!.para.id})`}
            data-testid={`pino-ancora-${item.id}`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              void abrirNoApp(ancs[0]!.para);
            }}
          >
            📍
          </button>
        );
      })()}

      <div
        class="item-forma-conteudo"
        style={{
          left: `${util.x}px`,
          top: `${util.y}px`,
          width: `${util.largura}px`,
          height: `${util.altura}px`,
          padding: `${c.padding}px`,
          color: corTexto,
          fontFamily: familiaCss(item.texto.fonte),
          fontSize: `${item.texto.tamanho}px`,
          textAlign: ALINHAMENTO_CSS[item.texto.alinhamento],
          justifyContent: VERTICAL_CSS[item.texto.vertical],
        }}
      >
        {editando ? (
          <EditorRico
            doc={item.doc}
            alturaAuto={false}
            padding={c.padding}
            onSair={(novoDoc) => onSairEdicao(novoDoc)}
            onEditorPronto={onEditorPronto}
          />
        ) : lodSimples ? (
          <div class="item-lod-linhas" aria-hidden="true">
            <span />
            <span />
          </div>
        ) : (
          <div
            class="item-texto-conteudo doc-rico-html"
            onClick={(e) => {
              const alvo = e.target as HTMLElement | null;
              const elCond = alvo?.closest<HTMLElement>('[data-condicao]');
              if (elCond) {
                e.preventDefault();
                e.stopPropagation();
                if (elCond.dataset.condicao) {
                  void alternarFato(chaveDaCondicao(elCond.dataset.condicao));
                }
                return;
              }
              const elEnt = alvo?.closest<HTMLElement>('[data-entidade-id]');
              if (elEnt) {
                e.preventDefault();
                e.stopPropagation();
                if (elEnt.dataset.entidadeId) abrirEntidade(elEnt.dataset.entidadeId);
                return;
              }
              const elRef = alvo?.closest<HTMLElement>('[data-ref-app]');
              if (elRef && elRef.dataset.refApp && elRef.dataset.refTipo && elRef.dataset.refId) {
                e.preventDefault();
                e.stopPropagation();
                void abrirNoApp({
                  app: elRef.dataset.refApp as 'mesa',
                  tipo: elRef.dataset.refTipo,
                  id: elRef.dataset.refId,
                });
              }
            }}
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
    </div>
  );
}

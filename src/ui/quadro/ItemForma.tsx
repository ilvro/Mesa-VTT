import type { Editor } from '@tiptap/core';
import { familiaCss } from '../../dominio/fontes.ts';
import { areaUtil, caminhoDaForma } from '../../dominio/formas.ts';
import {
  PALETA_PADRAO,
  corDoTexto,
  fundoEfetivo,
} from '../../dominio/paleta.ts';
import {
  condicoesDoItem,
  itemAtendeCondicoes,
} from '../../dominio/estado-do-mundo.ts';
import type { DocRico, Item } from '../../dominio/quadro.ts';
import { estadoDoMundo, paletaDaCampanha } from '../../app/quadros.ts';
import { EditorRico } from './EditorRico.tsx';
import {
  ALINHAMENTO_CSS,
  ConteudoDecorado,
  PinoAncora,
  VERTICAL_CSS,
} from './TextoDecorado.tsx';

interface ItemFormaProps {
  item: Extract<Item, { tipo: 'forma' }>;
  editando: boolean;
  onSairEdicao: (novoDoc?: DocRico, novaAltura?: number) => void;
  onEditorPronto?: (editor: Editor | null) => void;
}

export function ItemForma({
  item,
  editando,
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
      class={`item-quadro item-forma ${item.revisao ? (item.revisao.origem === 'assistente' ? 'em-revisao em-revisao-assistente' : 'em-revisao') : ''}`}
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

      <PinoAncora quadroId={item.quadroId} itemId={item.id} />

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
        ) : (
          <ConteudoDecorado doc={item.doc} estado={estado} />
        )}
      </div>
    </div>
  );
}

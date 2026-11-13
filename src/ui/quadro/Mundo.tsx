import type { Editor } from '@tiptap/core';
import { useMemo } from 'preact/hooks';
import {
  caixaVisivel,
  itensVisiveis,
  type Caixa,
  type Camera,
  type Tamanho,
} from '../../dominio/camera.ts';
import type { LinhaGuia } from '../../dominio/alinhamento.ts';
import type { Alca } from '../../dominio/geometria.ts';
import type { DocRico, Item as ItemModelo } from '../../dominio/quadro.ts';
import type { LadoResolvido } from '../../dominio/setas.ts';
import { caminhoDoTraco, type PontoTraco } from '../../dominio/tracos.ts';
import { Item } from './Item.tsx';
import { Selecao } from './Selecao.tsx';

export interface TracoPreview {
  ferramenta: 'caneta' | 'marca-texto';
  pontos: PontoTraco[];
  cor: string;
  espessura: number;
  opacidade: number;
}

interface MundoProps {
  camera: Camera;
  tamanhoTela: Tamanho;
  itens: ReadonlyMap<string, ItemModelo>;
  selecao: ReadonlySet<string>;
  editandoId: string | null;
  retanguloSelecao: Caixa | null;
  tracoEmDesenho?: TracoPreview | null;
  linhasGuia?: readonly LinhaGuia[];
  onSairEdicao: (id: string, novoDoc?: DocRico, novaAltura?: number) => void;
  onSairRotulo: (id: string, novoRotulo: string) => void;
  onSairTitulo: (id: string, novoTitulo: string) => void;
  onEditorPronto?: (editor: Editor | null) => void;
  onIniciarRedimensionar: (alca: Alca, e: PointerEvent) => void;
  onIniciarGirar: (e: PointerEvent) => void;
  onIniciarConector: (itemId: string, lado: LadoResolvido, e: PointerEvent) => void;
  onIniciarPontaSeta: (setaId: string, ponta: 'de' | 'para', e: PointerEvent) => void;
}

export function Mundo({
  camera,
  tamanhoTela,
  itens,
  selecao,
  editandoId,
  retanguloSelecao,
  tracoEmDesenho,
  linhasGuia,
  onSairEdicao,
  onSairRotulo,
  onSairTitulo,
  onEditorPronto,
  onIniciarRedimensionar,
  onIniciarGirar,
  onIniciarConector,
  onIniciarPontaSeta,
}: MundoProps) {
  const visiveis = useMemo(() => {
    const caixa = caixaVisivel(camera, tamanhoTela);
    const margem = 120 / Math.max(0.02, camera.zoom);
    return itensVisiveis(itens.values(), caixa, margem).sort(
      (a, b) =>
        (a.tipo === 'moldura' ? 0 : 1) - (b.tipo === 'moldura' ? 0 : 1) ||
        a.z - b.z ||
        a.id.localeCompare(b.id),
    );
  }, [camera, tamanhoTela, itens]);

  const selecionados = useMemo(() => {
    const lista: ItemModelo[] = [];
    for (const id of selecao) {
      const it = itens.get(id);
      if (it) lista.push(it);
    }
    return lista;
  }, [selecao, itens]);

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
        <Item
          key={item.id}
          item={item}
          todosItens={itens}
          zoom={camera.zoom}
          editando={editandoId === item.id}
          onSairEdicao={(novoDoc, novaAltura) => onSairEdicao(item.id, novoDoc, novaAltura)}
          onSairRotulo={(novoRotulo) => onSairRotulo(item.id, novoRotulo)}
          onSairTitulo={(novoTitulo) => onSairTitulo(item.id, novoTitulo)}
          onEditorPronto={onEditorPronto}
        />
      ))}
      {tracoEmDesenho && tracoEmDesenho.pontos.length > 0 ? (
        <svg
          class="traco-preview"
          style={{
            position: 'absolute',
            left: '0px',
            top: '0px',
            width: '1px',
            height: '1px',
            overflow: 'visible',
            pointerEvents: 'none',
            opacity: tracoEmDesenho.opacidade,
          }}
        >
          <path d={caminhoDoTraco(tracoEmDesenho)} fill={tracoEmDesenho.cor} />
        </svg>
      ) : null}
      <Selecao
        selecionados={selecionados}
        todosItens={itens}
        zoom={camera.zoom}
        retanguloSelecao={retanguloSelecao}
        onIniciarRedimensionar={onIniciarRedimensionar}
        onIniciarGirar={onIniciarGirar}
        onIniciarConector={onIniciarConector}
        onIniciarPontaSeta={onIniciarPontaSeta}
      />
      {linhasGuia && linhasGuia.length > 0 ? (
        <svg
          class="linhas-guia"
          style={{
            position: 'absolute',
            left: '0px',
            top: '0px',
            width: '1px',
            height: '1px',
            overflow: 'visible',
            pointerEvents: 'none',
          }}
        >
          {linhasGuia.map((l, idx) =>
            l.eixo === 'x' ? (
              <line
                key={idx}
                x1={l.pos}
                y1={l.de}
                x2={l.pos}
                y2={l.ate}
                stroke="var(--acento)"
                strokeWidth={1 / Math.max(0.05, camera.zoom)}
                strokeDasharray={`${4 / Math.max(0.05, camera.zoom)} ${4 / Math.max(0.05, camera.zoom)}`}
              />
            ) : (
              <line
                key={idx}
                x1={l.de}
                y1={l.pos}
                x2={l.ate}
                y2={l.pos}
                stroke="var(--acento)"
                strokeWidth={1 / Math.max(0.05, camera.zoom)}
                strokeDasharray={`${4 / Math.max(0.05, camera.zoom)} ${4 / Math.max(0.05, camera.zoom)}`}
              />
            ),
          )}
        </svg>
      ) : null}
    </div>
  );
}

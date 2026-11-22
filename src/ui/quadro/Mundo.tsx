import type { Editor } from '@tiptap/core';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import {
  caixaVisivel,
  itensVisiveis,
  type Caixa,
  type Camera,
  type Tamanho,
} from '../../dominio/camera.ts';
import type { LinhaGuia } from '../../dominio/alinhamento.ts';
import type { Alca } from '../../dominio/geometria.ts';
import { itemEhSecreto, itemPassaNoFiltro } from '../../dominio/busca-quadro.ts';
import type { DocRico, Item as ItemModelo, TipoSemantico } from '../../dominio/quadro.ts';
import { paletaDaCampanha } from '../../app/quadros.ts';
import type { LadoResolvido } from '../../dominio/setas.ts';
import { caminhoDoTraco, type PontoTraco } from '../../dominio/tracos.ts';
import { Item } from './Item.tsx';
import { Selecao } from './Selecao.tsx';
import { desenharLod, esquecerImagensLod } from './desenho-lod.ts';

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
  tiposFiltro?: ReadonlySet<TipoSemantico>;
  esconderSegredos?: boolean;
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
  tiposFiltro,
  esconderSegredos = false,
  onSairEdicao,
  onSairRotulo,
  onSairTitulo,
  onEditorPronto,
  onIniciarRedimensionar,
  onIniciarGirar,
  onIniciarConector,
  onIniciarPontaSeta,
}: MundoProps) {
  // A ordem (molduras atrás, depois z) só muda quando entra/sai item ou muda um z.
  // Num arrasto, o mapa muda a cada movimento: reaproveitar a ordem evita reordenar o quadro todo.
  const ordemRef = useRef<{ ids: string[]; z: number[] } | null>(null);
  const itensOrdenados = useMemo(() => {
    const anterior = ordemRef.current;
    if (anterior && anterior.ids.length === itens.size) {
      const lista: ItemModelo[] = new Array(anterior.ids.length);
      let igual = true;
      for (let i = 0; i < anterior.ids.length; i++) {
        const it = itens.get(anterior.ids[i]!);
        if (!it || it.z !== anterior.z[i]) {
          igual = false;
          break;
        }
        lista[i] = it;
      }
      if (igual) return lista;
    }
    const lista = [...itens.values()].sort(
      (a, b) =>
        (a.tipo === 'moldura' ? 0 : 1) - (b.tipo === 'moldura' ? 0 : 1) ||
        a.z - b.z ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
    ordemRef.current = { ids: lista.map((i) => i.id), z: lista.map((i) => i.z) };
    return lista;
  }, [itens]);

  const visiveis = useMemo(() => {
    const caixa = caixaVisivel(camera, tamanhoTela);
    const margem = 120 / Math.max(0.02, camera.zoom);
    return itensVisiveis(itensOrdenados, caixa, margem);
  }, [camera, tamanhoTela, itensOrdenados]);

  const selecionados = useMemo(() => {
    const lista: ItemModelo[] = [];
    for (const id of selecao) {
      const it = itens.get(id);
      if (it) lista.push(it);
    }
    return lista;
  }, [selecao, itens]);

  const lodSimples = camera.zoom < 0.25;
  const usarCanvasLod = lodSimples && visiveis.length > 200;
  const canvasLodRef = useRef<HTMLCanvasElement | null>(null);

  const [, setImagensProntas] = useState(0);
  useEffect(() => () => esquecerImagensLod(), []);

  useEffect(() => {
    if (!usarCanvasLod) return;
    const canvas = canvasLodRef.current;
    if (!canvas) return;
    desenharLod(canvas, {
      camera,
      tamanho: tamanhoTela,
      itens: visiveis,
      todos: itens,
      pular: (it) => it.tipo === 'moldura' || selecao.has(it.id) || editandoId === it.id,
      paleta: paletaDaCampanha.value,
      tiposFiltro,
      esconderSegredos,
      aoCarregarImagem: () => setImagensProntas((n) => n + 1),
    });
  });

  const itensDom = usarCanvasLod
    ? visiveis.filter(
        (it) => it.tipo === 'moldura' || selecao.has(it.id) || editandoId === it.id,
      )
    : visiveis;

  return (
    <>
      {usarCanvasLod ? (
        <canvas
          ref={canvasLodRef}
          data-testid="canvas-lod"
          style={{
            position: 'absolute',
            left: '0px',
            top: '0px',
            width: `${tamanhoTela.largura}px`,
            height: `${tamanhoTela.altura}px`,
            pointerEvents: 'none',
          }}
        />
      ) : null}
      <div
        class="mundo-quadro"
        data-testid="mundo-quadro"
        style={{
          transform: `translate(${-camera.x * camera.zoom}px, ${-camera.y * camera.zoom}px) scale(${camera.zoom})`,
          transformOrigin: '0 0',
        }}
      >
        {itensDom.map((item) => {
          if (esconderSegredos && itemEhSecreto(item)) return null;
          const esmaecido = tiposFiltro && tiposFiltro.size > 0 && !itemPassaNoFiltro(item, tiposFiltro);
          const el = (
            <Item
              key={item.id}
              item={item}
              todosItens={itens}
              zoom={camera.zoom}
              lodSimples={lodSimples}
              editando={editandoId === item.id}
              onSairEdicao={(novoDoc, novaAltura) => onSairEdicao(item.id, novoDoc, novaAltura)}
              onSairRotulo={(novoRotulo) => onSairRotulo(item.id, novoRotulo)}
              onSairTitulo={(novoTitulo) => onSairTitulo(item.id, novoTitulo)}
              onEditorPronto={onEditorPronto}
            />
          );
          if (!esmaecido) return el;
          return (
            <div key={item.id} class="item-filtrado-fora">
              {el}
            </div>
          );
        })}
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
    </>
  );
}

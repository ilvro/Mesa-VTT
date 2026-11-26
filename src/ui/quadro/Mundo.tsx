import type { Editor } from '@tiptap/core';
import { useEffect, useMemo, useRef } from 'preact/hooks';
import {
  caixaVisivel,
  ZOOM_MIN,
  type Caixa,
  type Camera,
  type Tamanho,
} from '../../dominio/camera.ts';
import type { LinhaGuia } from '../../dominio/alinhamento.ts';
import type { Alca } from '../../dominio/geometria.ts';
import { itemEhSecreto, itemPassaNoFiltro } from '../../dominio/busca-quadro.ts';
import { condicoesDoItem } from '../../dominio/estado-do-mundo.ts';
import {
  textoPuro,
  type DocRico,
  type Item as ItemModelo,
  type TipoSemantico,
} from '../../dominio/quadro.ts';
import { ligacoes } from '../../app/campanha.ts';
import { estadoDoMundo, paletaDaCampanha, quadroAberto } from '../../app/quadros.ts';
import { ancorasDoItem } from '../../app/foco-do-quadro.ts';
import type { LadoResolvido } from '../../dominio/setas.ts';
import type { PontoTraco } from '../../dominio/tracos.ts';
import { Item } from './Item.tsx';
import { Selecao } from './Selecao.tsx';
import type { ConfigFundoGrade } from './pixi/grade-pixi.ts';
import { ViewportQuadro } from './pixi/viewport-quadro.ts';

export interface TracoPreview {
  ferramenta: 'caneta' | 'marca-texto';
  pontos: PontoTraco[];
  cor: string;
  espessura: number;
  opacidade: number;
}

const FUNDO_PADRAO: ConfigFundoGrade = { cor: '#181a18', grade: 'pontos', passo: 40 };

function docTemLink(doc: DocRico): boolean {
  for (const bloco of doc.content ?? []) {
    for (const no of bloco.content ?? []) {
      if (no.marks?.some((m) => m.type === 'link')) return true;
    }
  }
  return false;
}

function itemPrecisaOverlayInterativo(item: ItemModelo): boolean {
  if (item.tipo === 'ref') return true;
  if (item.tipo === 'texto' || item.tipo === 'forma') {
    if (condicoesDoItem(item).length > 0) return true;
    if (docTemLink(item.doc)) return true;
    if (/\[\[[^[\]]+\]\]/.test(textoPuro(item.doc))) return true;
  }
  return false;
}

interface MundoProps {
  camera: Camera;
  tamanhoTela: Tamanho;
  fundo?: ConfigFundoGrade;
  itens: ReadonlyMap<string, ItemModelo>;
  selecao: ReadonlySet<string>;
  editandoId: string | null;
  retanguloSelecao: Caixa | null;
  tracoEmDesenho?: TracoPreview | null;
  linhasGuia?: readonly LinhaGuia[];
  tiposFiltro?: ReadonlySet<TipoSemantico>;
  esconderSegredos?: boolean;
  onViewportPronto?: (vp: ViewportQuadro | null) => void;
  onSairEdicao: (id: string, novoDoc?: DocRico, novaAltura?: number) => void;
  onSairRotulo: (id: string, novoRotulo: string) => void;
  onSairTitulo: (id: string, novoTitulo: string) => void;
  onEditorPronto?: (editor: Editor | null) => void;
  onIniciarRedimensionar: (alca: Alca, e: PointerEvent) => void;
  onIniciarGirar: (e: PointerEvent) => void;
  onIniciarConector: (itemId: string, lado: LadoResolvido, e: PointerEvent) => void;
  onIniciarPontaSeta: (setaId: string, ponta: 'de' | 'para', e: PointerEvent) => void;
  onIniciarCurvaSeta?: (setaId: string, e: PointerEvent) => void;
  onResetarCurvaSeta?: (setaId: string) => void;
}

export function Mundo({
  camera,
  tamanhoTela,
  fundo = FUNDO_PADRAO,
  itens,
  selecao,
  editandoId,
  retanguloSelecao,
  tracoEmDesenho,
  linhasGuia,
  tiposFiltro,
  esconderSegredos = false,
  onViewportPronto,
  onSairEdicao,
  onSairRotulo,
  onSairTitulo,
  onEditorPronto,
  onIniciarRedimensionar,
  onIniciarGirar,
  onIniciarConector,
  onIniciarPontaSeta,
  onIniciarCurvaSeta,
  onResetarCurvaSeta,
}: MundoProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const vpRef = useRef<ViewportQuadro | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const vp = new ViewportQuadro({
      canvas,
      tamanho: tamanhoTela,
      camera,
      fundo,
    });
    vpRef.current = vp;
    onViewportPronto?.(vp);
    void vp.iniciar();

    return () => {
      onViewportPronto?.(null);
      vpRef.current = null;
      vp.destruir();
    };
  }, []);

  useEffect(() => {
    vpRef.current?.definirTamanho(tamanhoTela);
  }, [tamanhoTela.largura, tamanhoTela.altura]);

  useEffect(() => {
    vpRef.current?.definirFundo(fundo);
  }, [fundo.cor, fundo.grade, fundo.passo]);

  const paleta = paletaDaCampanha.value;
  const estadoMundo = estadoDoMundo.value;

  useEffect(() => {
    vpRef.current?.sincronizarCena(
      {
        itens,
        camera,
        tamanho: tamanhoTela,
        paleta,
        estadoDoMundo: estadoMundo,
        tiposFiltro,
        esconderSegredos,
        pular: (it) =>
          it.id === editandoId ||
          it.tipo === 'ref' ||
          (selecao.size === 1 && selecao.has(it.id) && itemPrecisaOverlayInterativo(it)),
      },
      {
        zoom: camera.zoom,
        retanguloSelecao,
        linhasGuia,
        tracoEmDesenho,
      },
    );
  }, [
    itens,
    camera,
    tamanhoTela,
    paleta,
    estadoMundo,
    tiposFiltro,
    esconderSegredos,
    editandoId,
    selecao,
    retanguloSelecao,
    linhasGuia,
    tracoEmDesenho,
  ]);

  const selecionados = useMemo(() => {
    const lista: ItemModelo[] = [];
    for (const id of selecao) {
      const it = itens.get(id);
      if (it) lista.push(it);
    }
    return lista;
  }, [selecao, itens]);

  const listaLigacoes = ligacoes.value;
  // Só monta nós DOM para: o item em edição, cartões `ref`/ancorados visíveis ou item único selecionado com links/condições.
  const itensOverlay = useMemo(() => {
    void listaLigacoes;
    const vis = caixaVisivel(camera, tamanhoTela);
    const margem = 120 / Math.max(ZOOM_MIN, camera.zoom);
    const vx1 = vis.x - margem;
    const vy1 = vis.y - margem;
    const vx2 = vis.x + vis.largura + margem;
    const vy2 = vis.y + vis.altura + margem;

    const lista: ItemModelo[] = [];
    const vistos = new Set<string>();
    const adicionar = (it: ItemModelo | undefined) => {
      if (!it || vistos.has(it.id)) return;
      if (esconderSegredos && itemEhSecreto(it)) return;
      vistos.add(it.id);
      lista.push(it);
    };

    if (editandoId) adicionar(itens.get(editandoId));
    if (selecao.size === 1) {
      const unicoId = selecao.values().next().value;
      const unico = unicoId ? itens.get(unicoId) : undefined;
      if (unico && itemPrecisaOverlayInterativo(unico)) adicionar(unico);
    }
    const quadroId = quadroAberto.value?.id ?? null;
    for (const it of itens.values()) {
      const temAncora = quadroId !== null && ancorasDoItem(quadroId, it.id).length > 0;
      if (it.tipo !== 'ref' && !temAncora) continue;
      if (
        it.x + it.largura >= vx1 &&
        it.x <= vx2 &&
        it.y + it.altura >= vy1 &&
        it.y <= vy2
      ) {
        adicionar(it);
      }
    }
    return lista;
  }, [itens, editandoId, selecao, camera, tamanhoTela, esconderSegredos, listaLigacoes]);

  return (
    <>
      <canvas
        ref={canvasRef}
        data-testid="canvas-quadro"
        style={{
          position: 'absolute',
          inset: '0px',
          width: '100%',
          height: '100%',
          display: 'block',
        }}
      />
      <div
        class="mundo-quadro"
        data-testid="mundo-quadro"
        style={{
          transform: `translate(${-camera.x * camera.zoom}px, ${-camera.y * camera.zoom}px) scale(${camera.zoom})`,
          transformOrigin: '0 0',
        }}
      >
        {itensOverlay.map((item) => {
          const esmaecido =
            tiposFiltro && tiposFiltro.size > 0 && !itemPassaNoFiltro(item, tiposFiltro);
          const el = (
            <Item
              key={item.id}
              item={item}
              todosItens={itens}
              zoom={camera.zoom}
              lodSimples={false}
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
        <Selecao
          selecionados={selecionados}
          todosItens={itens}
          zoom={camera.zoom}
          retanguloSelecao={null}
          onIniciarRedimensionar={onIniciarRedimensionar}
          onIniciarGirar={onIniciarGirar}
          onIniciarConector={onIniciarConector}
          onIniciarPontaSeta={onIniciarPontaSeta}
          onIniciarCurvaSeta={onIniciarCurvaSeta}
          onResetarCurvaSeta={onResetarCurvaSeta}
        />
      </div>
    </>
  );
}

import type { Editor } from '@tiptap/core';
import { lerRef } from '#mesa';
import { useSignal } from '@preact/signals';
import { useEffect, useMemo, useRef } from 'preact/hooks';
import {
  caixaEnvolventeDeItem,
  caixaEnvolventeTotal,
  caixaVisivel,
  enquadrar,
  pinca,
  telaParaMundo,
  zoomEm,
  type Caixa,
  type Camera,
  type Ponto,
  type Tamanho,
} from '../../dominio/camera.ts';
import {
  type LinhaGuia,
} from '../../dominio/alinhamento.ts';
import {
  colar as colarArea,
  copiar as copiarArea,
} from '../../dominio/area-de-transferencia.ts';
import {
  caixaDe,
  encaixarNaGrade,
  itensNoRetangulo,
  type Alca,
} from '../../dominio/geometria.ts';
import {
  docDeTexto,
  novaForma,
  novaImagem,
  novaMoldura,
  novaNotaAdesiva,
  novaRef,
  novaSeta,
  novoTexto,
  novoTraco,
  TIPOS_SEMANTICOS,
  type DocRico,
  type Forma,
  type Item,
  type Ponta,
  type Quadro as QuadroModelo,
  type TipoSemantico,
} from '../../dominio/quadro.ts';
import { buscarNoQuadro } from '../../dominio/busca-quadro.ts';
import { NOMES_SEMANTICOS } from '../../dominio/paleta.ts';
import { refDaEntidade, sugerirEntidades } from '../../dominio/notas.ts';
import { ROTULO_DO_TIPO } from '../../dominio/entidades.ts';
import { entidades } from '../../app/campanha.ts';
import {
  comConteudo,
  filhos,
  itensDeTopo,
  ordemDeLeitura,
  type ItemMoldura,
} from '../../dominio/molduras.ts';
import {
  caixaDaSeta,
  type LadoResolvido,
} from '../../dominio/setas.ts';
import {
  normalizarTraco,
  simplificar,
  tracoToca,
  type PontoTraco,
} from '../../dominio/tracos.ts';
import { duplicarSelecao, removerSelecao } from '../../app/quadro-acoes.ts';
import { atualizarQuadroDoMiro } from '../../app/importar-miro.ts';
import { pararProjecao, projetando } from '../../app/projecao.ts';
import { mensagemDe, avisar } from '../../app/toasts.ts';
import { FORMATOS_IMAGEM_ACEITOS, importarArquivoImagem } from '../../app/imagens-quadro.ts';
import {
  agruparSelecao,
  alternarFato,
  atualizarCorDaPaleta,
  definirFato,
  desagruparSelecao,
  desfazer,
  estadoDoMundo,
  executar,
  fecharQuadro,
  historico,
  itemPendente,
  itens,
  marcarFeito,
  moverItemPatch,
  mudarFundo,
  paletaDaCampanha,
  quadroAberto,
  refazer,
  renomearQuadro,
  restaurarPaletaPadrao,
  selecao,
} from '../../app/quadros.ts';
import {
  aoFocarMoldura,
  espiarAtivo,
  modoMoldurasAgem,
  pedidoFocarItem,
  usuarioInteragindoNoQuadro,
  type ModoMoldurasAgem,
} from '../../app/foco-do-quadro.ts';
import { navegarParaQuadro, tela } from '../../app/rotas.ts';
import { cx } from '../cx.ts';
import {
  alteracoesDoArrasto,
  alteracoesDoRedimensionar,
  caixasParaGuias,
  deslocamentoDoArrasto,
  rotacaoDoGiro,
} from '../../dominio/gestos.ts';
import {
  BarraDeFerramentas,
  type FerramentaQuadro,
} from './BarraDeFerramentas.tsx';
import { BarraDeFormatacao } from './BarraDeFormatacao.tsx';
import { BuscaNoQuadro } from './BuscaNoQuadro.tsx';
import { FilaDeRevisao } from './FilaDeRevisao.tsx';
import { LinhaDoTempo } from './LinhaDoTempo.tsx';
import { Mundo, type TracoPreview } from './Mundo.tsx';
import { MenuDoItem } from './MenuDoItem.tsx';
import { PainelDeModelos } from './PainelDeModelos.tsx';
import { carimbarModeloNoQuadro, modeloEscolhidoId } from '../../app/modelos.ts';
import { Minimapa } from './Minimapa.tsx';
import { Navegador } from './Navegador.tsx';
import { PainelDaPaleta } from './PainelDaPaleta.tsx';
import { LeituraDoQuadro } from './LeituraDoQuadro.tsx';
import { PainelDeSegredos } from './PainelDeSegredos.tsx';
import { PainelDoEstado } from './PainelDoEstado.tsx';
import { PainelDoFundo, type ModoRoda } from './PainelDoFundo.tsx';
import { PainelEspiar } from './PainelEspiar.tsx';
import {
  CAMERA_PADRAO,
  emCampoDeTexto,
  estiloGrade,
  gravarCamera,
  gravarConfigTracos,
  gravarModoRoda,
  itemNoPonto,
  lerCameraSalva,
  lerConfigTracos,
  lerModoRoda,
  novoIdItem,
  type ConfigTracos,
} from './quadro-helpers.ts';

type Gesto =
  | { tipo: 'pan'; x: number; y: number; camX: number; camY: number }
  | { tipo: 'marque'; inicio: Ponto }
  | { tipo: 'criar-forma'; inicio: Ponto; id: string }
  | { tipo: 'criar-moldura'; inicio: Ponto; id: string }
  | { tipo: 'criar-seta'; id: string; chave: string; origemItemId?: string }
  | { tipo: 'ponta-seta'; id: string; chave: string; ponta: 'de' | 'para' }
  | {
      tipo: 'desenhar';
      ferramenta: 'caneta' | 'marca-texto';
      cor: string;
      espessura: number;
      opacidade: number;
      pontos: PontoTraco[];
    }
  | { tipo: 'borracha'; chave: string }
  | {
      tipo: 'mover';
      chave: string;
      inicioMundo: Ponto;
      originais: Map<string, { x: number; y: number }>;
      outros: Caixa[];
    }
  | {
      tipo: 'redimensionar';
      chave: string;
      alca: Alca;
      inicioMundo: Ponto;
      caixaInicial: Caixa;
      originais: Map<
        string,
        { x: number; y: number; largura: number; altura: number; pontos?: PontoTraco[] }
      >;
    }
  | {
      tipo: 'girar';
      chave: string;
      id: string;
      centro: Ponto;
      anguloInicial: number;
      rotacaoInicial: number;
    };

export function Quadro() {
  const q = quadroAberto.value;
  return q ? <QuadroAberto key={q.id} q={q} /> : null;
}

function QuadroAberto({ q }: { q: QuadroModelo }) {

  const areaRef = useRef<HTMLDivElement>(null);
  const camera = useSignal<Camera>(lerCameraSalva(q.id));
  const tamanhoTela = useSignal<Tamanho>({ largura: 1280, altura: 720 });
  const painelFundoAberto = useSignal(false);
  const painelPaletaAberto = useSignal(false);
  const painelEstadoAberto = useSignal(false);
  const painelSegredosAberto = useSignal(false);
  const painelLinhaDoTempoAberto = useSignal(false);
  const painelRevisaoAberto = useSignal(
    [...itens.value.values()].some((i) => Boolean(i.revisao)),
  );
  const buscaAberta = useSignal(false);
  const termoBusca = useSignal('');
  const indiceBusca = useSignal(0);
  const tiposFiltro = useSignal<ReadonlySet<TipoSemantico>>(new Set());
  const esconderSegredos = useSignal(false);
  const modoQuadro = useSignal<'quadro' | 'ler'>('quadro');
  const seletorEntidade = useSignal<{ ponto: Ponto; busca: string } | null>(null);
  const navegadorAberto = useSignal(false);
  const indiceMoldura = useSignal(0);
  const ferramenta = useSignal<FerramentaQuadro>('selecionar');
  const formaAtiva = useSignal<Forma>('retangulo');
  const configTracos = useSignal<ConfigTracos>(lerConfigTracos());
  const tracoEmDesenho = useSignal<TracoPreview | null>(null);
  const linhasGuia = useSignal<LinhaGuia[]>([]);
  const grupoAberto = useSignal<string | null>(null);
  const menuContexto = useSignal<{ x: number; y: number; pontoMundo: Ponto } | null>(null);
  const ultimoTextoCopiadoRef = useRef<string | null>(null);
  const espacoPressionado = useSignal(false);
  // No modo sessão o quadro divide a tela com outros painéis: os atalhos e a colagem só valem com ele ativo
  // (o último clique ou foco foi dentro dele). Fora do modo sessão, ele nasce ativo.
  const quadroAtivo = useSignal(tela.value !== 'sessao');
  const secaoRef = useRef<HTMLElement | null>(null);
  const modoRoda = useSignal<ModoRoda>(lerModoRoda());
  const editandoId = useSignal<string | null>(null);
  const editorAtivo = useSignal<Editor | null>(null);
  const tickEditor = useSignal(0);
  const retanguloSelecao = useSignal<Caixa | null>(null);
  const gestoRef = useRef<Gesto | null>(null);
  // Toque: dedos ativos (pointerId -> posição na tela), pinça em andamento e toque longo.
  const toquesRef = useRef(new Map<number, Ponto>());
  const pincaRef = useRef<{ ids: [number, number]; camera: Camera; a: [Ponto, Ponto] } | null>(null);
  const toqueLongoRef = useRef<{
    timer: ReturnType<typeof setTimeout>;
    x: number;
    y: number;
    alvo: HTMLElement | null;
  } | null>(null);
  const inputImagemRef = useRef<HTMLInputElement | null>(null);
  const inputMiroRef = useRef<HTMLInputElement | null>(null);

  async function atualizarDoMiro(arquivo: File): Promise<void> {
    try {
      const r = await atualizarQuadroDoMiro(arquivo);
      const total = r.novos + r.atualizados + r.removidos + r.paraRevisar;
      avisar(
        total === 0
          ? 'Nada mudou no Miro.'
          : `Atualizado do Miro: ${r.novos} novos, ${r.atualizados} atualizados, ${r.removidos} removidos, ${r.paraRevisar} para revisar.`,
      );
      if (r.paraRevisar > 0) painelRevisaoAberto.value = true;
    } catch (erro) {
      avisar(mensagemDe(erro), true);
    }
  }
  const rafMoverRef = useRef<number | null>(null);
  const moverPendenteRef = useRef<{
    clientX: number;
    clientY: number;
    shiftKey: boolean;
    altKey: boolean;
    pressure: number;
  } | null>(null);

  const copiarSelecao = () => {
    const sel = comConteudo(selecao.value, itens.value);
    if (sel.length === 0) return;
    const texto = copiarArea(sel);
    ultimoTextoCopiadoRef.current = texto;
    try {
      void navigator.clipboard?.writeText(texto);
    } catch {
      /* ignora */
    }
  };

  const colarTextoNoQuadro = (texto: string, pontoMundo?: Ponto) => {
    const limpo = texto.trim();
    if (!limpo) return;
    const centro =
      pontoMundo ??
      telaParaMundo(camera.value, {
        x: tamanhoTela.value.largura / 2,
        y: tamanhoTela.value.altura / 2,
      });
    const maxZ = Math.max(0, ...[...itens.value.values()].map((i) => i.z));
    const colados = colarArea(
      limpo,
      novoIdItem,
      { quadroId: q.id, centro, deslocamento: 24, zBase: maxZ },
      Date.now(),
    );
    if (colados && colados.length > 0) {
      executar({ rotulo: 'Colar', ops: [{ criar: colados }] });
      selecao.value = new Set(itensDeTopo(colados).map((i) => i.id));
      return;
    }
    const refColada = lerRef(limpo);
    if (refColada) {
      const novo = novaRef(
        {
          quadroId: q.id,
          x: centro.x - 110,
          y: centro.y - 36,
          ref: refColada,
          z: maxZ + 1,
        },
        Date.now(),
        novoIdItem(),
      );
      executar({ rotulo: 'Colar referência', ops: [{ criar: [novo] }] });
      selecao.value = new Set([novo.id]);
      return;
    }
    const novo = novoTexto(
      {
        quadroId: q.id,
        x: centro.x - 100,
        y: centro.y - 24,
        doc: docDeTexto(limpo),
        z: maxZ + 1,
      },
      Date.now(),
      novoIdItem(),
    );
    executar({ rotulo: 'Colar texto', ops: [{ criar: [novo] }] });
    selecao.value = new Set([novo.id]);
  };

  useEffect(() => {
    const marcar = (e: Event) => {
      const alvo = e.target;
      const dentro = alvo instanceof Node && (
        !!secaoRef.current?.contains(alvo) ||
        (alvo instanceof Element ? alvo : alvo.parentElement)?.closest('[data-quadro-ui]') != null
      );
      quadroAtivo.value = dentro;
    };
    document.addEventListener('pointerdown', marcar, true);
    document.addEventListener('focusin', marcar, true);
    return () => {
      document.removeEventListener('pointerdown', marcar, true);
      document.removeEventListener('focusin', marcar, true);
    };
  }, []);

  useEffect(() => {
    const aoColar = (e: ClipboardEvent) => {
      if (!quadroAtivo.value) return;
      if (editandoId.value) return;
      const alvo = e.target as HTMLElement | null;
      if (alvo && (alvo.tagName === 'INPUT' || alvo.tagName === 'TEXTAREA' || alvo.isContentEditable)) {
        return;
      }
      const arquivos: Blob[] = [];
      const itensColados = e.clipboardData?.items;
      if (itensColados) {
        for (let i = 0; i < itensColados.length; i++) {
          const item = itensColados[i];
          if (item && item.kind === 'file' && FORMATOS_IMAGEM_ACEITOS.has(item.type)) {
            const arq = item.getAsFile();
            if (arq) arquivos.push(arq);
          }
        }
      }
      if (arquivos.length === 0 && e.clipboardData?.files) {
        for (let i = 0; i < e.clipboardData.files.length; i++) {
          const arq = e.clipboardData.files[i];
          if (arq && FORMATOS_IMAGEM_ACEITOS.has(arq.type)) {
            arquivos.push(arq);
          }
        }
      }
      if (arquivos.length > 0) {
        e.preventDefault();
        void inserirImagens(arquivos);
        return;
      }
      const texto = e.clipboardData?.getData('text/plain') || ultimoTextoCopiadoRef.current;
      if (texto) {
        e.preventDefault();
        colarTextoNoQuadro(texto);
      }
    };
    window.addEventListener('paste', aoColar);
    return () => window.removeEventListener('paste', aoColar);
  }, [q.id]);

  const selecionados = useMemo(() => {
    const lista: Item[] = [];
    for (const id of selecao.value) {
      const it = itens.value.get(id);
      if (it) lista.push(it);
    }
    return lista;
  }, [selecao.value, itens.value]);

  useEffect(() => {
    const ed = editorAtivo.value;
    if (!ed) return;
    const atualizar = () => {
      tickEditor.value++;
    };
    ed.on('selectionUpdate', atualizar);
    ed.on('transaction', atualizar);
    return () => {
      ed.off('selectionUpdate', atualizar);
      ed.off('transaction', atualizar);
    };
  }, [editorAtivo.value]);

  useEffect(() => {
    camera.value = lerCameraSalva(q.id);
    editandoId.value = null;
  }, [q.id]);

  useEffect(() => {
    usuarioInteragindoNoQuadro.value = editandoId.value !== null || gestoRef.current !== null;
    return () => {
      usuarioInteragindoNoQuadro.value = false;
    };
  }, [editandoId.value]);

  useEffect(() => {
    const t = window.setTimeout(() => gravarCamera(q.id, camera.value), 300);
    return () => clearTimeout(t);
  }, [q.id, camera.value]);

  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const atualizarTamanho = () => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        tamanhoTela.value = { largura: r.width, altura: r.height };
      }
    };
    atualizarTamanho();
    const obs = new ResizeObserver(atualizarTamanho);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    const pendenteId = itemPendente.value;
    if (!pendenteId) return;
    const alvo = itens.value.get(pendenteId);
    if (!alvo) return;
    camera.value = enquadrar(caixaEnvolventeDeItem(alvo), tamanhoTela.value, 80);
    selecao.value = new Set([alvo.id]);
    itemPendente.value = null;
  }, [itemPendente.value, itens.value, tamanhoTela.value]);

  useEffect(() => {
    const pedido = pedidoFocarItem.value;
    if (!pedido || pedido.quadroId !== q.id) return;
    const alvo = itens.value.get(pedido.itemId);
    if (!alvo) return;
    camera.value = enquadrar(caixaEnvolventeDeItem(alvo), tamanhoTela.value, 80);
    selecao.value = new Set([alvo.id]);
    pedidoFocarItem.value = null;
  }, [pedidoFocarItem.value, q.id, itens.value, tamanhoTela.value]);

  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const cam = camera.value;
      if (e.ctrlKey || e.metaKey || modoRoda.value === 'zoom') {
        const rect = el.getBoundingClientRect();
        const ponto = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        const fator = Math.exp(-e.deltaY * 0.002);
        camera.value = zoomEm(cam, ponto, fator);
      } else {
        camera.value = {
          ...cam,
          x: cam.x + e.deltaX / cam.zoom,
          y: cam.y + e.deltaY / cam.zoom,
        };
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const pontoMundoDe = (e: { clientX: number; clientY: number }): Ponto => {
    const rect = areaRef.current!.getBoundingClientRect();
    return telaParaMundo(camera.value, {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  // Atalhos de teclado
  useEffect(() => {
    const verTudo = () => {
      const caixa = caixaEnvolventeTotal(itens.value.values());
      camera.value = caixa ? enquadrar(caixa, tamanhoTela.value, 64) : CAMERA_PADRAO;
    };

    const zoomNoCentro = (novoFatorOuZoom: { fator?: number; zoomExato?: number }) => {
      const cam = camera.value;
      const centro = {
        x: tamanhoTela.value.largura / 2,
        y: tamanhoTela.value.altura / 2,
      };
      const fator =
        novoFatorOuZoom.zoomExato !== undefined
          ? novoFatorOuZoom.zoomExato / cam.zoom
          : (novoFatorOuZoom.fator ?? 1);
      camera.value = zoomEm(cam, centro, fator);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (!quadroAtivo.value) return;
      if (modoQuadro.value === 'ler') return;
      if (emCampoDeTexto(e.target)) return;

      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        espacoPressionado.value = true;
        return;
      }

      const mod = e.ctrlKey || e.metaKey;
      if (mod) {
        const k = e.key.toLowerCase();
        if (k === '0') {
          e.preventDefault();
          zoomNoCentro({ zoomExato: 1 });
        } else if (e.key === '=' || e.key === '+') {
          e.preventDefault();
          zoomNoCentro({ fator: 1.25 });
        } else if (e.key === '-') {
          e.preventDefault();
          zoomNoCentro({ fator: 1 / 1.25 });
        } else if (k === 'z' && !e.shiftKey) {
          e.preventDefault();
          desfazer();
        } else if ((k === 'z' && e.shiftKey) || k === 'y') {
          e.preventDefault();
          refazer();
        } else if (k === 'a') {
          e.preventDefault();
          selecao.value = new Set(itens.value.keys());
        } else if (k === 'g' && !e.shiftKey) {
          e.preventDefault();
          agruparSelecao(novoIdItem());
        } else if (k === 'g' && e.shiftKey) {
          e.preventDefault();
          desagruparSelecao();
        } else if (k === 'f') {
          e.preventDefault();
          buscaAberta.value = true;
        } else if (k === 'c') {
          e.preventDefault();
          copiarSelecao();
        } else if (k === 'x') {
          e.preventDefault();
          copiarSelecao();
          const remover = comConteudo(selecao.value, itens.value).filter((i) => !i.travado);
          if (remover.length > 0) {
            executar({ rotulo: 'Recortar', ops: [{ remover }] });
            selecao.value = new Set();
          }
        } else if (k === 'd') {
          e.preventDefault();
          duplicarSelecao(novoIdItem);
        }
        return;
      }

      if (e.key === 'Enter' && selecao.value.size === 1 && !editandoId.value) {
        const id = [...selecao.value][0]!;
        const alvo = itens.value.get(id);
        if (alvo && (alvo.tipo === 'texto' || alvo.tipo === 'forma') && !alvo.travado) {
          e.preventDefault();
          editandoId.value = id;
        }
        return;
      }

      if (e.key === 'Escape') {
        if (editandoId.value) {
          editandoId.value = null;
        } else if (selecao.value.size > 0) {
          selecao.value = new Set();
        } else {
          ferramenta.value = 'selecionar';
        }
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selecao.value.size === 0) return;
        e.preventDefault();
        removerSelecao('Remover');
        return;
      }

      if (
        e.key === 'ArrowUp' ||
        e.key === 'ArrowDown' ||
        e.key === 'ArrowLeft' ||
        e.key === 'ArrowRight'
      ) {
        const moviveis = [...selecao.value]
          .map((id) => itens.value.get(id))
          .filter((i): i is Item => Boolean(i))
          .filter((i) => !i.travado);
        if (moviveis.length === 0) return;
        e.preventDefault();
        const passo = e.shiftKey ? 10 : 1;
        const dx = e.key === 'ArrowLeft' ? -passo : e.key === 'ArrowRight' ? passo : 0;
        const dy = e.key === 'ArrowUp' ? -passo : e.key === 'ArrowDown' ? passo : 0;
        const agora = Date.now();
        executar({
          rotulo: 'Mover',
          ops: [
            {
              alterar: moviveis.map((it) => moverItemPatch(it, it.x + dx, it.y + dy, agora)),
            },
          ],
        });
        return;
      }

      if (e.shiftKey && (e.code === 'Digit1' || e.key === '!')) {
        e.preventDefault();
        verTudo();
        return;
      }

      if (!e.shiftKey && !e.altKey) {
        const k = e.key.toLowerCase();
        if (k === 'v') ferramenta.value = 'selecionar';
        else if (k === 'h') ferramenta.value = ferramenta.value === 'mao' ? 'selecionar' : 'mao';
        else if (k === 'x' && selecao.value.size > 0) {
          e.preventDefault();
          marcarFeito([...selecao.value]);
        }
        else if (k === 't') ferramenta.value = 'texto';
        else if (k === 'n') ferramenta.value = 'nota';
        else if (k === 's') ferramenta.value = 'forma';
        else if (k === 'l') ferramenta.value = 'seta';
        else if (k === 'p') ferramenta.value = 'caneta';
        else if (k === 'e') ferramenta.value = 'borracha';
        else if (k === 'f') ferramenta.value = 'moldura';
      }
      if ((e.key === 'PageDown' || e.key === 'PageUp') && !editandoId.value) {
        const todas: ItemMoldura[] = [];
        for (const it of itens.value.values()) {
          if (it.tipo === 'moldura') todas.push(it);
        }
        const ordenadas = ordemDeLeitura(todas);
        if (ordenadas.length > 0) {
          e.preventDefault();
          const delta = e.key === 'PageDown' ? 1 : -1;
          const proxIdx =
            (indiceMoldura.value + delta + ordenadas.length) % ordenadas.length;
          indiceMoldura.value = proxIdx;
          const m = ordenadas[proxIdx]!;
          camera.value = enquadrar(m, tamanhoTela.value, 60);
          selecao.value = new Set([m.id]);
          aoFocarMoldura(m, todas);
        }
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        espacoPressionado.value = false;
      }
    };
    const aoDesativar = () => { espacoPressionado.value = false; };
    window.addEventListener('blur', aoDesativar);

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', aoDesativar);
    };
  }, []);

  const modoPanAtivo = ferramenta.value === 'mao' || espacoPressionado.value;

  const iniciarRedimensionar = (alca: Alca, e: PointerEvent) => {
    const moviveis = [...selecao.value]
      .map((id) => itens.value.get(id))
      .filter((i): i is Item => Boolean(i))
      .filter((i) => !i.travado);
    if (moviveis.length === 0) return;

    const el = areaRef.current;
    if (!el) return;
    el.setPointerCapture(e.pointerId);

    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    const originais = new Map<
      string,
      { x: number; y: number; largura: number; altura: number; pontos?: PontoTraco[] }
    >();
    for (const it of moviveis) {
      originais.set(it.id, {
        x: it.x,
        y: it.y,
        largura: it.largura,
        altura: it.altura,
        pontos: it.tipo === 'traco' ? it.pontos : undefined,
      });
      const c = moviveis.length === 1 ? it : caixaDe(it);
      if (c.x < minX) minX = c.x;
      if (c.y < minY) minY = c.y;
      if (c.x + c.largura > maxX) maxX = c.x + c.largura;
      if (c.y + c.altura > maxY) maxY = c.y + c.altura;
    }

    const chave = `redim-${Date.now()}-${Math.random()}`;
    historico.agrupar(chave);
    gestoRef.current = {
      tipo: 'redimensionar',
      chave,
      alca,
      inicioMundo: pontoMundoDe(e),
      caixaInicial: { x: minX, y: minY, largura: maxX - minX, altura: maxY - minY },
      originais,
    };
  };

  const iniciarGirar = (e: PointerEvent) => {
    if (selecao.value.size !== 1) return;
    const id = [...selecao.value][0]!;
    const item = itens.value.get(id);
    if (!item || item.travado) return;

    const el = areaRef.current;
    if (!el) return;
    el.setPointerCapture(e.pointerId);

    const centro = { x: item.x + item.largura / 2, y: item.y + item.altura / 2 };
    const p = pontoMundoDe(e);
    const anguloInicial = (Math.atan2(p.y - centro.y, p.x - centro.x) * 180) / Math.PI;
    const chave = `girar-${Date.now()}-${Math.random()}`;
    historico.agrupar(chave);
    gestoRef.current = {
      tipo: 'girar',
      chave,
      id,
      centro,
      anguloInicial,
      rotacaoInicial: item.rotacao,
    };
  };

  const iniciarConector = (itemId: string, lado: LadoResolvido, e: PointerEvent) => {
    const el = areaRef.current;
    if (!el) return;
    el.setPointerCapture(e.pointerId);
    const p = pontoMundoDe(e);
    const agora = Date.now();
    const maxZ = Math.max(0, ...[...itens.value.values()].map((i) => i.z));
    const id = novoIdItem();
    const base = novaSeta(
      {
        quadroId: q.id,
        de: { itemId, lado },
        para: { ponto: [p.x, p.y] },
        z: maxZ + 1,
      },
      agora,
      id,
    );
    const caixa = caixaDaSeta(base, itens.value);
    const nova = { ...base, ...caixa };
    const chave = `criar-seta-${id}`;
    historico.agrupar(chave);
    executar({ rotulo: 'Criar seta', ops: [{ criar: [nova] }] }, chave);
    selecao.value = new Set([id]);
    gestoRef.current = { tipo: 'criar-seta', id, chave, origemItemId: itemId };
  };

  const iniciarPontaSeta = (setaId: string, ponta: 'de' | 'para', e: PointerEvent) => {
    const el = areaRef.current;
    if (!el) return;
    el.setPointerCapture(e.pointerId);
    const chave = `ponta-seta-${setaId}-${Date.now()}`;
    historico.agrupar(chave);
    gestoRef.current = { tipo: 'ponta-seta', id: setaId, chave, ponta };
  };

  const aoPressionar = (e: PointerEvent) => {
    const ehBotaoMeio = e.button === 1;
    const ehPanEsquerdo = e.button === 0 && modoPanAtivo;
    if (ehBotaoMeio || ehPanEsquerdo) {
      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      gestoRef.current = {
        tipo: 'pan',
        x: e.clientX,
        y: e.clientY,
        camX: camera.value.x,
        camY: camera.value.y,
      };
      return;
    }

    if (e.button !== 0) return;

    // Se estava editando, o blur do textarea já salva; garante saída
    if (editandoId.value) {
      editandoId.value = null;
    }

    const p = pontoMundoDe(e);
    const encaixar = q.fundo.encaixar;
    const passoGrade = q.fundo.passo;

    if (ferramenta.value === 'entidade') {
      const x = encaixar ? encaixarNaGrade(p.x, passoGrade) : Math.round(p.x);
      const y = encaixar ? encaixarNaGrade(p.y, passoGrade) : Math.round(p.y);
      seletorEntidade.value = { ponto: { x, y }, busca: '' };
      return;
    }

    if (ferramenta.value === 'modelo') {
      // Fica na ferramenta para carimbar de novo; o painel diz qual modelo está escolhido.
      if (modeloEscolhidoId.value) {
        carimbarModeloNoQuadro(modeloEscolhidoId.value, p, novoIdItem);
      }
      return;
    }

    if (ferramenta.value === 'texto' || ferramenta.value === 'nota') {
      const agora = Date.now();
      const maxZ = Math.max(0, ...[...itens.value.values()].map((i) => i.z));
      const x = encaixar ? encaixarNaGrade(p.x, passoGrade) : Math.round(p.x);
      const y = encaixar ? encaixarNaGrade(p.y, passoGrade) : Math.round(p.y);
      const novo =
        ferramenta.value === 'nota'
          ? novaNotaAdesiva({ quadroId: q.id, x, y, z: maxZ + 1 }, agora, novoIdItem())
          : novoTexto({ quadroId: q.id, x, y, z: maxZ + 1 }, agora, novoIdItem());
      executar({ rotulo: 'Criar item', ops: [{ criar: [novo] }] });
      selecao.value = new Set([novo.id]);
      ferramenta.value = 'selecionar';
      editandoId.value = novo.id;
      return;
    }

    if (ferramenta.value === 'forma') {
      const agora = Date.now();
      const maxZ = Math.max(0, ...[...itens.value.values()].map((i) => i.z));
      const x = encaixar ? encaixarNaGrade(p.x, passoGrade) : Math.round(p.x);
      const y = encaixar ? encaixarNaGrade(p.y, passoGrade) : Math.round(p.y);
      const novo = novaForma(
        {
          quadroId: q.id,
          x,
          y,
          forma: formaAtiva.value,
          largura: 160,
          altura: 100,
          z: maxZ + 1,
        },
        agora,
        novoIdItem(),
      );
      const chave = `criar-forma-${novo.id}`;
      historico.agrupar(chave);
      executar({ rotulo: 'Criar forma', ops: [{ criar: [novo] }] }, chave);
      selecao.value = new Set([novo.id]);
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      gestoRef.current = { tipo: 'criar-forma', inicio: { x, y }, id: novo.id };
      return;
    }

    const apagarTracosNoPonto = (pt: Ponto, chave: string) => {
      const raio = 12 / Math.max(0.05, camera.value.zoom);
      const removidos: Item[] = [];
      for (const it of itens.value.values()) {
        if (it.tipo === 'traco' && !it.travado && tracoToca(it, pt, raio)) {
          removidos.push(it);
        }
      }
      if (removidos.length > 0) {
        executar({ rotulo: 'Apagar traço', ops: [{ remover: removidos }] }, chave);
      }
    };

    if (ferramenta.value === 'moldura') {
      const agora = Date.now();
      const x = encaixar ? encaixarNaGrade(p.x, passoGrade) : Math.round(p.x);
      const y = encaixar ? encaixarNaGrade(p.y, passoGrade) : Math.round(p.y);
      const novo = novaMoldura(
        {
          quadroId: q.id,
          x,
          y,
          largura: 640,
          altura: 420,
          z: 0,
        },
        agora,
        novoIdItem(),
      );
      const chave = `criar-moldura-${novo.id}`;
      historico.agrupar(chave);
      executar({ rotulo: 'Criar moldura', ops: [{ criar: [novo] }] }, chave);
      selecao.value = new Set([novo.id]);
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      gestoRef.current = { tipo: 'criar-moldura', inicio: { x, y }, id: novo.id };
      return;
    }

    if (ferramenta.value === 'caneta' || ferramenta.value === 'marca-texto') {
      const tipo = ferramenta.value;
      const cfg = configTracos.value[tipo];
      const opacidade = tipo === 'marca-texto' ? 0.35 : 1;
      const pressao = e.pressure > 0 ? e.pressure : 0.5;
      const pontos: PontoTraco[] = [[p.x, p.y, pressao]];
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      gestoRef.current = {
        tipo: 'desenhar',
        ferramenta: tipo,
        cor: cfg.cor,
        espessura: cfg.espessura,
        opacidade,
        pontos,
      };
      tracoEmDesenho.value = {
        ferramenta: tipo,
        pontos: [...pontos],
        cor: cfg.cor,
        espessura: cfg.espessura,
        opacidade,
      };
      return;
    }

    if (ferramenta.value === 'borracha') {
      const chave = `borracha-${Date.now()}-${Math.random()}`;
      historico.agrupar(chave);
      apagarTracosNoPonto(p, chave);
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      gestoRef.current = { tipo: 'borracha', chave };
      return;
    }

    if (ferramenta.value === 'seta') {
      const agora = Date.now();
      const maxZ = Math.max(0, ...[...itens.value.values()].map((i) => i.z));
      const origem = itemNoPonto(itens.value, p, true);
      const de: Ponta = origem
        ? { itemId: origem.id, lado: 'auto' }
        : { ponto: [p.x, p.y] };
      const id = novoIdItem();
      const base = novaSeta(
        {
          quadroId: q.id,
          de,
          para: { ponto: [p.x, p.y] },
          z: maxZ + 1,
        },
        agora,
        id,
      );
      const caixa = caixaDaSeta(base, itens.value);
      const nova = { ...base, ...caixa };
      const chave = `criar-seta-${id}`;
      historico.agrupar(chave);
      executar({ rotulo: 'Criar seta', ops: [{ criar: [nova] }] }, chave);
      selecao.value = new Set([id]);
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      gestoRef.current = { tipo: 'criar-seta', id, chave, origemItemId: origem?.id };
      return;
    }

    if (ferramenta.value === 'selecionar') {
      const idAlvoDom = (e.target as HTMLElement | null)
        ?.closest?.('[data-item-id]')
        ?.getAttribute('data-item-id');
      const alvoDom = idAlvoDom ? (itens.value.get(idAlvoDom) ?? null) : null;
      const alvo = alvoDom ?? itemNoPonto(itens.value, p, true);
      if (alvo) {
        if (e.shiftKey) {
          const prox = new Set(selecao.value);
          if (prox.has(alvo.id)) prox.delete(alvo.id);
          else prox.add(alvo.id);
          selecao.value = prox;
          return;
        }
        if (!selecao.value.has(alvo.id)) {
          if (alvo.grupoId && grupoAberto.value !== alvo.grupoId) {
            const idsGrupo = [...itens.value.values()]
              .filter((i) => i.grupoId === alvo.grupoId)
              .map((i) => i.id);
            selecao.value = new Set(idsGrupo);
          } else {
            selecao.value = new Set([alvo.id]);
          }
        }
        const moviveis = [...selecao.value]
          .map((id) => itens.value.get(id))
          .filter((i): i is Item => Boolean(i))
          .filter((i) => !i.travado);
        if (moviveis.length === 0) return;

        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        const originais = new Map<string, { x: number; y: number }>();
        const adicionarComFilhos = (item: Item) => {
          if (originais.has(item.id) || item.travado) return;
          originais.set(item.id, { x: item.x, y: item.y });
          if (item.tipo === 'moldura') {
            for (const f of filhos(item.id, itens.value)) {
              adicionarComFilhos(f);
            }
          }
        };
        for (const it of moviveis) {
          adicionarComFilhos(it);
        }
        const chave = `mover-${Date.now()}-${Math.random()}`;
        historico.agrupar(chave);
        gestoRef.current = {
          tipo: 'mover',
          chave,
          inicioMundo: p,
          originais,
          outros: caixasParaGuias(
            itens.value.values(),
            new Set(originais.keys()),
            caixaVisivel(camera.value, tamanhoTela.value),
          ),
        };
      } else {
        grupoAberto.value = null;
        if (!e.shiftKey) {
          selecao.value = new Set();
        }
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        if (e.pointerType === 'touch') {
          // Um dedo no vazio move a câmera (o marque fica para o mouse).
          gestoRef.current = {
            tipo: 'pan',
            x: e.clientX,
            y: e.clientY,
            camX: camera.value.x,
            camY: camera.value.y,
          };
          return;
        }
        gestoRef.current = { tipo: 'marque', inicio: p };
        retanguloSelecao.value = { x: p.x, y: p.y, largura: 0, altura: 0 };
      }
    }
  };

  const processarMover = (e: {
    clientX: number;
    clientY: number;
    shiftKey: boolean;
    altKey: boolean;
    pressure: number;
  }) => {
    const g = gestoRef.current;
    if (!g) return;
    const cam = camera.value;

    if (g.tipo === 'pan') {
      camera.value = {
        ...cam,
        x: g.camX - (e.clientX - g.x) / cam.zoom,
        y: g.camY - (e.clientY - g.y) / cam.zoom,
      };
      return;
    }

    const p = pontoMundoDe(e);

    if (g.tipo === 'criar-forma' || g.tipo === 'criar-moldura') {
      const nx = Math.min(g.inicio.x, p.x);
      const ny = Math.min(g.inicio.y, p.y);
      const nl = Math.max(24, Math.abs(p.x - g.inicio.x));
      const na = Math.max(24, Math.abs(p.y - g.inicio.y));
      const atual = itens.value.get(g.id);
      if (atual && (Math.abs(p.x - g.inicio.x) > 8 || Math.abs(p.y - g.inicio.y) > 8)) {
        executar(
          {
            rotulo: g.tipo === 'criar-moldura' ? 'Criar moldura' : 'Criar forma',
            ops: [
              {
                alterar: [
                  {
                    id: g.id,
                    antes: {
                      x: atual.x,
                      y: atual.y,
                      largura: atual.largura,
                      altura: atual.altura,
                      atualizadoEm: atual.atualizadoEm,
                    },
                    depois: {
                      x: q.fundo.encaixar ? encaixarNaGrade(nx, q.fundo.passo) : nx,
                      y: q.fundo.encaixar ? encaixarNaGrade(ny, q.fundo.passo) : ny,
                      largura: nl,
                      altura: na,
                      atualizadoEm: Date.now(),
                    },
                  },
                ],
              },
            ],
          },
          `${g.tipo}-${g.id}`,
        );
      }
      return;
    }

    if (g.tipo === 'desenhar') {
      const pressao = e.pressure > 0 ? e.pressure : 0.5;
      g.pontos.push([p.x, p.y, pressao]);
      tracoEmDesenho.value = {
        ferramenta: g.ferramenta,
        pontos: [...g.pontos],
        cor: g.cor,
        espessura: g.espessura,
        opacidade: g.opacidade,
      };
      return;
    }

    if (g.tipo === 'borracha') {
      const raio = 12 / Math.max(0.05, camera.value.zoom);
      const removidos: Item[] = [];
      for (const it of itens.value.values()) {
        if (it.tipo === 'traco' && !it.travado && tracoToca(it, p, raio)) {
          removidos.push(it);
        }
      }
      if (removidos.length > 0) {
        executar({ rotulo: 'Apagar traço', ops: [{ remover: removidos }] }, g.chave);
      }
      return;
    }

    if (g.tipo === 'marque') {
      const ret: Caixa = {
        x: g.inicio.x,
        y: g.inicio.y,
        largura: p.x - g.inicio.x,
        altura: p.y - g.inicio.y,
      };
      retanguloSelecao.value = ret;
      const achados = itensNoRetangulo(
        itens.value.values(),
        ret,
        e.altKey ? 'conter' : 'tocar',
      );
      selecao.value = new Set(achados.map((i) => i.id));
      return;
    }

    if (g.tipo === 'mover') {
      const { dx, dy, linhas } = deslocamentoDoArrasto(
        g,
        itens.value,
        { dx: p.x - g.inicioMundo.x, dy: p.y - g.inicioMundo.y },
        { shift: e.shiftKey, alt: e.altKey },
        q.fundo,
        6 / Math.max(0.05, camera.value.zoom),
      );
      linhasGuia.value = linhas;
      const alterar = alteracoesDoArrasto(g.originais, itens.value, dx, dy, Date.now());
      if (alterar.length > 0) {
        executar({ rotulo: 'Mover', ops: [{ alterar }] }, g.chave);
      }
      return;
    }

    if (g.tipo === 'redimensionar') {
      const alterar = alteracoesDoRedimensionar(
        g,
        itens.value,
        { x: p.x - g.inicioMundo.x, y: p.y - g.inicioMundo.y },
        { shift: e.shiftKey, alt: e.altKey },
        q.fundo,
        Date.now(),
      );
      if (alterar.length > 0) {
        executar({ rotulo: 'Redimensionar', ops: [{ alterar }] }, g.chave);
      }
      return;
    }

    if (g.tipo === 'girar') {
      const atual = itens.value.get(g.id);
      if (!atual) return;
      const novaRotacao = rotacaoDoGiro(atual, g, p, e.shiftKey);
      if (novaRotacao !== atual.rotacao) {
        executar(
          {
            rotulo: 'Girar',
            ops: [
              {
                alterar: [
                  {
                    id: g.id,
                    antes: { rotacao: atual.rotacao, atualizadoEm: atual.atualizadoEm },
                    depois: { rotacao: novaRotacao, atualizadoEm: Date.now() },
                  },
                ],
              },
            ],
          },
          g.chave,
        );
      }
      return;
    }

    if (g.tipo === 'criar-seta' || g.tipo === 'ponta-seta') {
      const atual = itens.value.get(g.id);
      if (!atual || atual.tipo !== 'seta') return;
      const campo = g.tipo === 'criar-seta' ? 'para' : g.ponta;
      const sob = itemNoPonto(itens.value, p, true);
      const novaPonta: Ponta =
        sob && (g.tipo !== 'criar-seta' || sob.id !== g.origemItemId)
          ? { itemId: sob.id, lado: 'auto' }
          : { ponto: [p.x, p.y] };
      const setaAtualizada = { ...atual, [campo]: novaPonta };
      const novaCaixa = caixaDaSeta(setaAtualizada, itens.value);
      executar(
        {
          rotulo: g.tipo === 'criar-seta' ? 'Criar seta' : 'Religar seta',
          ops: [
            {
              alterar: [
                {
                  id: atual.id,
                  antes: {
                    [campo]: atual[campo],
                    x: atual.x,
                    y: atual.y,
                    largura: atual.largura,
                    altura: atual.altura,
                    atualizadoEm: atual.atualizadoEm,
                  },
                  depois: {
                    [campo]: novaPonta,
                    ...novaCaixa,
                    atualizadoEm: Date.now(),
                  },
                },
              ],
            },
          ],
        },
        g.chave,
      );
    }
  };

  const cancelarToqueLongo = () => {
    if (toqueLongoRef.current) {
      clearTimeout(toqueLongoRef.current.timer);
      toqueLongoRef.current = null;
    }
  };

  // Cancela o gesto de um dedo em andamento sem criar item nem deixar passo aberto no histórico.
  const cancelarGestoAtual = () => {
    if (rafMoverRef.current !== null) {
      cancelAnimationFrame(rafMoverRef.current);
      rafMoverRef.current = null;
    }
    moverPendenteRef.current = null;
    if (gestoRef.current) {
      gestoRef.current = null;
      tracoEmDesenho.value = null;
      retanguloSelecao.value = null;
      linhasGuia.value = [];
      historico.agrupar(null);
      usuarioInteragindoNoQuadro.value = editandoId.value !== null;
    }
  };

  const pontoNaArea = (e: { clientX: number; clientY: number }): Ponto => {
    const rect = areaRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const abrirMenuNoPonto = (clientX: number, clientY: number, alvoEl: HTMLElement | null) => {
    const el = areaRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const p = pontoMundoDe({ clientX, clientY });
    const idAlvoDom = alvoEl?.closest?.('[data-item-id]')?.getAttribute('data-item-id');
    const alvoDom = idAlvoDom ? (itens.value.get(idAlvoDom) ?? null) : null;
    const alvo = alvoDom ?? itemNoPonto(itens.value, p, true);
    if (alvo && !selecao.value.has(alvo.id)) {
      selecao.value = new Set([alvo.id]);
    }
    menuContexto.value = { x: clientX - rect.left, y: clientY - rect.top, pontoMundo: p };
  };

  const aoPressionarArea = (e: PointerEvent) => {
    menuContexto.value = null;
    if (e.pointerType !== 'touch') {
      aoPressionar(e);
      return;
    }
    const toques = toquesRef.current;
    toques.set(e.pointerId, pontoNaArea(e));
    if (toques.size === 1) {
      aoPressionar(e);
      if (ferramenta.value === 'selecionar') {
        const alvoEl = e.target as HTMLElement | null;
        const x = e.clientX;
        const y = e.clientY;
        toqueLongoRef.current = {
          x,
          y,
          alvo: alvoEl,
          timer: setTimeout(() => {
            toqueLongoRef.current = null;
            if (toquesRef.current.size !== 1 || pincaRef.current) return;
            cancelarGestoAtual();
            abrirMenuNoPonto(x, y, alvoEl);
          }, 500),
        };
      }
      return;
    }
    cancelarToqueLongo();
    cancelarGestoAtual();
    if (toques.size === 2 && !pincaRef.current) {
      const [id1, id2] = [...toques.keys()] as [number, number];
      try {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } catch {
        /* ignora */
      }
      pincaRef.current = {
        ids: [id1, id2],
        camera: camera.value,
        a: [toques.get(id1)!, toques.get(id2)!],
      };
    }
  };

  const aoMoverArea = (e: PointerEvent) => {
    if (e.pointerType !== 'touch') {
      aoMover(e);
      return;
    }
    const toques = toquesRef.current;
    if (!toques.has(e.pointerId)) return;
    toques.set(e.pointerId, pontoNaArea(e));
    const longo = toqueLongoRef.current;
    if (longo && Math.hypot(e.clientX - longo.x, e.clientY - longo.y) > 8) cancelarToqueLongo();
    const pi = pincaRef.current;
    if (pi) {
      const b1 = toques.get(pi.ids[0]);
      const b2 = toques.get(pi.ids[1]);
      if (b1 && b2) {
        usuarioInteragindoNoQuadro.value = true;
        camera.value = pinca(pi.camera, pi.a[0], pi.a[1], b1, b2);
      }
      return;
    }
    aoMover(e);
  };

  const aoSoltarArea = (e: PointerEvent) => {
    if (e.pointerType !== 'touch') {
      aoSoltar(e);
      return;
    }
    const toques = toquesRef.current;
    toques.delete(e.pointerId);
    cancelarToqueLongo();
    if (pincaRef.current) {
      // Acabou a pinça: o dedo que sobra não começa gesto novo (o gesto único já foi cancelado).
      if (toques.size < 2) {
        pincaRef.current = null;
        usuarioInteragindoNoQuadro.value = editandoId.value !== null;
      }
      return;
    }
    aoSoltar(e);
  };

  const aoMover = (e: PointerEvent) => {
    if (!gestoRef.current) return;
    usuarioInteragindoNoQuadro.value = true;
    moverPendenteRef.current = {
      clientX: e.clientX,
      clientY: e.clientY,
      shiftKey: e.shiftKey,
      altKey: e.altKey,
      pressure: e.pressure,
    };
    if (rafMoverRef.current !== null) return;
    rafMoverRef.current = requestAnimationFrame(() => {
      rafMoverRef.current = null;
      const pendente = moverPendenteRef.current;
      moverPendenteRef.current = null;
      if (pendente) processarMover(pendente);
    });
  };

  const inserirImagens = async (arquivos: readonly Blob[], pontoMundo?: Ponto) => {
    const centro =
      pontoMundo ??
      telaParaMundo(camera.value, {
        x: tamanhoTela.value.largura / 2,
        y: tamanhoTela.value.altura / 2,
      });
    const criar: Item[] = [];
    const agora = Date.now();
    let z = [...itens.value.values()].reduce((m, i) => Math.max(m, i.z), 0) + 1;
    let deslocamento = 0;

    for (const arq of arquivos) {
      if (!FORMATOS_IMAGEM_ACEITOS.has(arq.type)) continue;
      const importada = await importarArquivoImagem(arq);
      if (!importada) continue;
      const x = centro.x - importada.largura / 2 + deslocamento;
      const y = centro.y - importada.altura / 2 + deslocamento;
      criar.push(
        novaImagem(
          {
            quadroId: q.id,
            x: q.fundo.encaixar ? encaixarNaGrade(x, q.fundo.passo) : x,
            y: q.fundo.encaixar ? encaixarNaGrade(y, q.fundo.passo) : y,
            imagemId: importada.imagemId,
            larguraOriginal: importada.larguraOriginal,
            alturaOriginal: importada.alturaOriginal,
            largura: importada.largura,
            altura: importada.altura,
            z: z++,
          },
          agora,
          novoIdItem(),
        ),
      );
      deslocamento += 24;
    }

    if (criar.length === 0) return;
    executar({ rotulo: criar.length === 1 ? 'Inserir imagem' : 'Inserir imagens', ops: [{ criar }] });
    selecao.value = new Set(criar.map((i) => i.id));
    ferramenta.value = 'selecionar';
  };

  const aoSoltar = (e: PointerEvent) => {
    if (rafMoverRef.current !== null) {
      cancelAnimationFrame(rafMoverRef.current);
      rafMoverRef.current = null;
    }
    if (moverPendenteRef.current) {
      const pendente = moverPendenteRef.current;
      moverPendenteRef.current = null;
      processarMover(pendente);
    }
    linhasGuia.value = [];
    const g = gestoRef.current;
    if (!g) return;
    gestoRef.current = null;
    usuarioInteragindoNoQuadro.value = editandoId.value !== null;
    if (g.tipo === 'desenhar') {
      tracoEmDesenho.value = null;
      const simplificados = simplificar(g.pontos, 1.2);
      const norm = normalizarTraco(simplificados);
      const maxZ = Math.max(0, ...[...itens.value.values()].map((i) => i.z));
      const novo = novoTraco(
        {
          quadroId: q.id,
          x: norm.x,
          y: norm.y,
          largura: norm.largura,
          altura: norm.altura,
          pontos: norm.pontos,
          ferramenta: g.ferramenta,
          cor: g.cor,
          espessura: g.espessura,
          opacidade: g.opacidade,
          z: maxZ + 1,
        },
        Date.now(),
        novoIdItem(),
      );
      executar({ rotulo: 'Desenhar traço', ops: [{ criar: [novo] }] });
    } else if (g.tipo === 'marque') {
      retanguloSelecao.value = null;
    } else if (g.tipo === 'criar-forma' || g.tipo === 'criar-seta' || g.tipo === 'criar-moldura') {
      historico.agrupar(null);
      ferramenta.value = 'selecionar';
    } else if (
      g.tipo === 'mover' ||
      g.tipo === 'redimensionar' ||
      g.tipo === 'girar' ||
      g.tipo === 'ponta-seta' ||
      g.tipo === 'borracha'
    ) {
      historico.agrupar(null);
    }
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignora */
    }
  };

  const aoDuploClique = (e: MouseEvent) => {
    if (ferramenta.value !== 'selecionar') return;
    const p = pontoMundoDe(e);
    const idAlvoDom = (e.target as HTMLElement | null)
      ?.closest?.('[data-item-id]')
      ?.getAttribute('data-item-id');
    const alvoDom = idAlvoDom ? (itens.value.get(idAlvoDom) ?? null) : null;
    const alvo = alvoDom ?? itemNoPonto(itens.value, p, true);
    if (alvo && alvo.grupoId && grupoAberto.value !== alvo.grupoId) {
      grupoAberto.value = alvo.grupoId;
      selecao.value = new Set([alvo.id]);
      return;
    }
    if (
      alvo &&
      (alvo.tipo === 'texto' ||
        alvo.tipo === 'forma' ||
        alvo.tipo === 'seta' ||
        alvo.tipo === 'moldura') &&
      !alvo.travado
    ) {
      selecao.value = new Set([alvo.id]);
      editandoId.value = alvo.id;
    }
  };

  const aoSairTitulo = (id: string, novoTitulo: string) => {
    if (editandoId.value === id) {
      editandoId.value = null;
    }
    const atual = itens.value.get(id);
    if (!atual || atual.tipo !== 'moldura') return;
    if (atual.titulo === novoTitulo) return;
    executar({
      rotulo: 'Renomear moldura',
      ops: [
        {
          alterar: [
            {
              id,
              antes: { titulo: atual.titulo, atualizadoEm: atual.atualizadoEm },
              depois: { titulo: novoTitulo, atualizadoEm: Date.now() },
            },
          ],
        },
      ],
    });
  };

  const aoSairRotulo = (id: string, novoRotulo: string) => {
    if (editandoId.value === id) {
      editandoId.value = null;
    }
    const atual = itens.value.get(id);
    if (!atual || atual.tipo !== 'seta') return;
    if (atual.rotulo === novoRotulo) return;
    executar({
      rotulo: 'Editar rótulo da seta',
      ops: [
        {
          alterar: [
            {
              id,
              antes: { rotulo: atual.rotulo, atualizadoEm: atual.atualizadoEm },
              depois: { rotulo: novoRotulo, atualizadoEm: Date.now() },
            },
          ],
        },
      ],
    });
  };

  const aoSairEdicao = (id: string, novoDoc?: DocRico, novaAltura?: number) => {
    if (editandoId.value === id) {
      editandoId.value = null;
    }
    if (!novoDoc) return;
    const atual = itens.value.get(id);
    if (!atual || (atual.tipo !== 'texto' && atual.tipo !== 'forma')) return;
    const docMudou = JSON.stringify(atual.doc) !== JSON.stringify(novoDoc);
    const alturaMudou =
      atual.tipo === 'texto' &&
      atual.alturaAuto &&
      novaAltura !== undefined &&
      novaAltura !== atual.altura;
    if (!docMudou && !alturaMudou) return;

    const antes: Partial<Item> = { atualizadoEm: atual.atualizadoEm };
    const depois: Partial<Item> = { atualizadoEm: Date.now() };
    if (docMudou) {
      (antes as Partial<Extract<Item, { tipo: 'texto' }>>).doc = atual.doc;
      (depois as Partial<Extract<Item, { tipo: 'texto' }>>).doc = novoDoc;
    }
    if (alturaMudou && novaAltura !== undefined) {
      antes.altura = atual.altura;
      depois.altura = novaAltura;
    }
    executar({
      rotulo: 'Editar texto',
      ops: [{ alterar: [{ id, antes, depois }] }],
    });
  };

  return (
    <section
      ref={secaoRef}
      class={cx('tela-quadro', tela.value === 'sessao' && (quadroAtivo.value ? 'quadro-ativo' : 'quadro-inativo'))}
      data-testid="tela-quadro"
      data-ativo={quadroAtivo.value ? 'true' : 'false'}
    >
      <div class="barra-quadro" data-testid="barra-quadro">
        <button
          type="button"
          class="botao-pilula"
          data-testid="voltar-quadros"
          onClick={() => {
            void fecharQuadro().then(() => navegarParaQuadro(null));
          }}
        >
          ← Quadros
        </button>
        <input
          type="text"
          class="quadro-nome-input"
          aria-label="Nome do quadro"
          data-testid="quadro-nome"
          value={q.nome}
          onBlur={(e) => {
            const v = e.currentTarget.value.trim();
            if (v && v !== q.nome) {
              void renomearQuadro(q.id, v);
            } else {
              e.currentTarget.value = q.nome;
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
        />
        <span class="espaco" />
        {projetando.value ? (
          <span class="selo-projecao" data-testid="selo-projecao">
            Projetando: {projetando.value.titulo || 'Moldura'}
            <button type="button" class="botao-pilula" data-testid="parar-projecao" onClick={pararProjecao}>
              Parar
            </button>
          </span>
        ) : null}
        <div class="chave-modo" role="group" aria-label="Modo do quadro">
          <button
            type="button"
            class="botao-pilula"
            aria-pressed={modoQuadro.value === 'quadro'}
            data-testid="modo-quadro"
            onClick={() => {
              modoQuadro.value = 'quadro';
            }}
          >
            Quadro
          </button>
          <button
            type="button"
            class="botao-pilula"
            aria-pressed={modoQuadro.value === 'ler'}
            data-testid="modo-ler"
            title="Ler o quadro como página, moldura por moldura"
            onClick={() => {
              editandoId.value = null;
              modoQuadro.value = 'ler';
            }}
          >
            Ler
          </button>
        </div>
        <button
          type="button"
          class="botao-pilula"
          aria-pressed={navegadorAberto.value}
          data-testid="botao-navegador"
          onClick={() => {
            navegadorAberto.value = !navegadorAberto.value;
          }}
        >
          Molduras
        </button>
        <button
          type="button"
          class="botao-pilula"
          aria-pressed={buscaAberta.value}
          data-testid="botao-buscar-quadro"
          title="Buscar no quadro (Ctrl+F)"
          onClick={() => {
            buscaAberta.value = !buscaAberta.value;
          }}
        >
          Buscar
        </button>
        <button
          type="button"
          class="botao-pilula"
          aria-pressed={esconderSegredos.value}
          data-testid="botao-esconder-segredos"
          title="Esconder segredos e itens só do mestre"
          onClick={() => {
            esconderSegredos.value = !esconderSegredos.value;
          }}
        >
          {esconderSegredos.value ? 'Segredos ocultos' : 'Esconder segredos'}
        </button>
        <button
          type="button"
          class="botao-pilula"
          aria-pressed={painelRevisaoAberto.value}
          data-testid="botao-fila-revisao"
          onClick={() => {
            painelRevisaoAberto.value = !painelRevisaoAberto.value;
            if (painelRevisaoAberto.value) {
              painelSegredosAberto.value = false;
              painelLinhaDoTempoAberto.value = false;
              painelEstadoAberto.value = false;
              painelPaletaAberto.value = false;
              painelFundoAberto.value = false;
            }
          }}
        >
          Revisão ({[...itens.value.values()].filter((i) => Boolean(i.revisao)).length})
        </button>
        <details class="menu-paineis-quadro" data-testid="menu-paineis-quadro">
          <summary class="botao-pilula" data-testid="botao-paineis-quadro">Painéis</summary>
          <div
            class="menu-paineis-lista"
            onClick={(e) => {
              // Escolher um painel fecha o menu; o seletor "Molduras agem" não.
              if ((e.target as HTMLElement).closest('button')) {
                (e.currentTarget.parentElement as HTMLDetailsElement).open = false;
              }
            }}
          >
            <button
              type="button"
              class="botao-pilula"
              aria-pressed={painelSegredosAberto.value}
              data-testid="botao-segredos"
              onClick={() => {
                painelSegredosAberto.value = !painelSegredosAberto.value;
                if (painelSegredosAberto.value) {
                  painelEstadoAberto.value = false;
                  painelPaletaAberto.value = false;
                  painelFundoAberto.value = false;
                }
              }}
            >
              Segredos
            </button>
            <button
              type="button"
              class="botao-pilula"
              aria-pressed={painelLinhaDoTempoAberto.value}
              data-testid="botao-linha-do-tempo"
              onClick={() => {
                painelLinhaDoTempoAberto.value = !painelLinhaDoTempoAberto.value;
                if (painelLinhaDoTempoAberto.value) {
                  painelSegredosAberto.value = false;
                  painelEstadoAberto.value = false;
                  painelPaletaAberto.value = false;
                  painelFundoAberto.value = false;
                  painelRevisaoAberto.value = false;
                }
              }}
            >
              Linha do tempo
            </button>
            {q.origem ? (
              <button
                type="button"
                class="botao-pilula"
                data-testid="botao-atualizar-miro"
                title="Atualizar este quadro com um novo pacote .miro.zip"
                onClick={() => inputMiroRef.current?.click()}
              >
                Atualizar do Miro…
              </button>
            ) : null}
            <label class="molduras-agem-wrap" title="Comportamento ao focar uma moldura na sessão">
              <span>Molduras agem</span>
              <select
                class="campo molduras-agem-select"
                data-testid="select-molduras-agem"
                value={modoMoldurasAgem.value}
                onChange={(e) => {
                  modoMoldurasAgem.value = e.currentTarget.value as ModoMoldurasAgem;
                }}
              >
                <option value="sim">sim</option>
                <option value="perguntar">perguntar</option>
                <option value="nao">não</option>
              </select>
            </label>
            <button
              type="button"
              class="botao-pilula"
              aria-pressed={painelEstadoAberto.value}
              data-testid="botao-estado"
              onClick={() => {
                painelEstadoAberto.value = !painelEstadoAberto.value;
                if (painelEstadoAberto.value) {
                  painelPaletaAberto.value = false;
                  painelFundoAberto.value = false;
                }
              }}
            >
              Estado
            </button>
            <button
              type="button"
              class="botao-pilula"
              aria-pressed={painelPaletaAberto.value}
              data-testid="botao-paleta"
              onClick={() => {
                painelPaletaAberto.value = !painelPaletaAberto.value;
                if (painelPaletaAberto.value) painelFundoAberto.value = false;
              }}
            >
              Paleta
            </button>
            <button
              type="button"
              class="botao-pilula"
              aria-pressed={painelFundoAberto.value}
              data-testid="botao-fundo"
              onClick={() => {
                painelFundoAberto.value = !painelFundoAberto.value;
                if (painelFundoAberto.value) painelPaletaAberto.value = false;
              }}
            >
              Fundo e grade
            </button>
          </div>
        </details>
        <button
          type="button"
          class="selo"
          title="Clique para voltar a 100% (Ctrl+0)"
          data-testid="quadro-zoom"
          onClick={() => {
            const cam = camera.value;
            const centro = {
              x: tamanhoTela.value.largura / 2,
              y: tamanhoTela.value.altura / 2,
            };
            camera.value = zoomEm(cam, centro, 1 / cam.zoom);
          }}
        >
          {Math.round(camera.value.zoom * 100)}%
        </button>
      </div>

      <div class="barra-filtros-quadro" data-testid="barra-filtros-quadro">
        {TIPOS_SEMANTICOS.map((tipo) => {
          const ativo = tiposFiltro.value.has(tipo);
          return (
            <button
              key={tipo}
              type="button"
              class={`chip-filtro ${ativo ? 'ativa' : ''}`}
              aria-pressed={ativo}
              data-testid={`filtro-tipo-${tipo}`}
              style={{
                borderColor: paletaDaCampanha.value[tipo],
                backgroundColor: ativo ? paletaDaCampanha.value[tipo] : undefined,
                color: ativo ? '#111111' : undefined,
              }}
              onClick={() => {
                const prox = new Set(tiposFiltro.value);
                if (prox.has(tipo)) prox.delete(tipo);
                else prox.add(tipo);
                tiposFiltro.value = prox;
              }}
            >
              {NOMES_SEMANTICOS[tipo]}
            </button>
          );
        })}
        {tiposFiltro.value.size > 0 ? (
          <button
            type="button"
            class="chip-filtro"
            data-testid="limpar-filtros-quadro"
            onClick={() => {
              tiposFiltro.value = new Set();
            }}
          >
            Limpar
          </button>
        ) : null}
      </div>

      <div
        ref={areaRef}
        class={cx(
          'area-quadro',
          modoPanAtivo && 'modo-mao',
          (ferramenta.value === 'texto' || ferramenta.value === 'nota') && 'modo-criar',
        )}
        data-testid="area-quadro"
        style={{
          ...estiloGrade(q.fundo, camera.value),
          display: modoQuadro.value === 'ler' ? 'none' : undefined,
        }}
        onPointerDown={aoPressionarArea}
        onPointerMove={aoMoverArea}
        onPointerUp={aoSoltarArea}
        onPointerCancel={aoSoltarArea}
        onDblClick={aoDuploClique}
        onContextMenu={(e) => {
          e.preventDefault();
          abrirMenuNoPonto(e.clientX, e.clientY, e.target as HTMLElement | null);
        }}
        onDragOver={(e) => {
          if (e.dataTransfer?.types.includes('Files')) {
            e.preventDefault();
          }
        }}
        onDrop={(e) => {
          const files = e.dataTransfer?.files;
          if (!files || files.length === 0) return;
          const imagens: File[] = [];
          for (let i = 0; i < files.length; i++) {
            const f = files[i];
            if (f && FORMATOS_IMAGEM_ACEITOS.has(f.type)) imagens.push(f);
          }
          if (imagens.length === 0) return;
          e.preventDefault();
          const el = areaRef.current;
          const rect = el?.getBoundingClientRect();
          const ponto = rect
            ? telaParaMundo(camera.value, {
                x: e.clientX - rect.left,
                y: e.clientY - rect.top,
              })
            : undefined;
          void inserirImagens(imagens, ponto);
        }}
      >
        {modoQuadro.value === 'quadro' ? (
        <Mundo
          camera={camera.value}
          tamanhoTela={tamanhoTela.value}
          itens={itens.value}
          selecao={selecao.value}
          editandoId={editandoId.value}
          retanguloSelecao={retanguloSelecao.value}
          tracoEmDesenho={tracoEmDesenho.value}
          linhasGuia={linhasGuia.value}
          tiposFiltro={tiposFiltro.value}
          esconderSegredos={esconderSegredos.value}
          onSairEdicao={aoSairEdicao}
          onSairRotulo={aoSairRotulo}
          onSairTitulo={aoSairTitulo}
          onEditorPronto={(ed) => {
            editorAtivo.value = ed;
          }}
          onIniciarRedimensionar={iniciarRedimensionar}
          onIniciarGirar={iniciarGirar}
          onIniciarConector={iniciarConector}
          onIniciarPontaSeta={iniciarPontaSeta}
        />
        ) : null}

        {(() => {
          void tickEditor.value;
          return (
            <BarraDeFormatacao
              selecionados={selecionados}
              camera={camera.value}
              tamanhoTela={tamanhoTela.value}
              editorAtivo={editorAtivo.value}
              novoId={novoIdItem}
            />
          );
        })()}

        <input
          ref={inputMiroRef}
          type="file"
          accept=".zip"
          style={{ display: 'none' }}
          data-testid="input-atualizar-miro"
          onChange={(e) => {
            const f = e.currentTarget.files?.[0];
            e.currentTarget.value = '';
            if (f) void atualizarDoMiro(f);
          }}
        />
        <input
          ref={inputImagemRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          multiple
          style={{ display: 'none' }}
          data-testid="input-imagem"
          onChange={(e) => {
            const files = e.currentTarget.files;
            if (files && files.length > 0) {
              void inserirImagens(Array.from(files));
            }
            e.currentTarget.value = '';
          }}
        />

        <div
          onPointerDown={(e) => e.stopPropagation()}
          onDblClick={(e) => e.stopPropagation()}
        >
          <BarraDeFerramentas
            ativa={ferramenta.value}
            formaAtiva={formaAtiva.value}
            configCaneta={configTracos.value.caneta}
            configMarcaTexto={configTracos.value['marca-texto']}
            onEscolher={(f) => {
              if (f === 'imagem') {
                inputImagemRef.current?.click();
                return;
              }
              ferramenta.value = f;
            }}
            onEscolherForma={(forma) => {
              formaAtiva.value = forma;
            }}
            onMudarConfigTraco={(tipo, cfg) => {
              const prox = { ...configTracos.value, [tipo]: cfg };
              configTracos.value = prox;
              gravarConfigTracos(prox);
            }}
          />
        </div>

        <Minimapa
          itens={itens.value}
          camera={camera.value}
          tamanhoTela={tamanhoTela.value}
          onMoverCamera={(c) => {
            camera.value = c;
          }}
        />

        {menuContexto.value ? (
          <MenuDoItem
            x={menuContexto.value.x}
            y={menuContexto.value.y}
            quadroId={q.id}
            selecionados={selecionados}
            novoId={novoIdItem}
            onCopiar={copiarSelecao}
            onColar={() => {
              const pm = menuContexto.value?.pontoMundo;
              void (async () => {
                let texto = ultimoTextoCopiadoRef.current ?? '';
                try {
                  const clip = await navigator.clipboard?.readText();
                  if (clip) texto = clip;
                } catch {
                  /* ignora */
                }
                if (texto) colarTextoNoQuadro(texto, pm);
              })();
            }}
            onFechar={() => {
              menuContexto.value = null;
            }}
          />
        ) : null}

        {navegadorAberto.value ? (
          <div
            onPointerDown={(e) => e.stopPropagation()}
            onDblClick={(e) => e.stopPropagation()}
          >
            <Navegador
              quadroId={q.id}
              itens={itens.value}
              onFocarMoldura={(m) => {
                camera.value = enquadrar(m, tamanhoTela.value, 60);
                selecao.value = new Set([m.id]);
                const todas = [...itens.value.values()].filter(
                  (it): it is ItemMoldura => it.tipo === 'moldura',
                );
                aoFocarMoldura(m, todas);
              }}
              onFechar={() => {
                navegadorAberto.value = false;
              }}
            />
          </div>
        ) : null}

        {buscaAberta.value ? (
          <BuscaNoQuadro
            termo={termoBusca.value}
            resultados={buscarNoQuadro(itens.value.values(), termoBusca.value, {
              esconderSegredos: esconderSegredos.value,
            })}
            indiceAtivo={indiceBusca.value}
            onMudarTermo={(novoTermo) => {
              termoBusca.value = novoTermo;
              indiceBusca.value = 0;
            }}
            onIrPara={(idx, alvo) => {
              indiceBusca.value = idx;
              selecao.value = new Set([alvo.id]);
              camera.value = enquadrar(caixaDe(alvo), tamanhoTela.value, 80);
            }}
            onFechar={() => {
              buscaAberta.value = false;
            }}
          />
        ) : null}

        {ferramenta.value === 'modelo' ? <PainelDeModelos /> : null}

        {seletorEntidade.value ? (
          <aside
            class="painel-fundo painel-entidade-seletor"
            data-testid="seletor-entidade"
            onPointerDown={(e) => e.stopPropagation()}
            onDblClick={(e) => e.stopPropagation()}
          >
            <div class="painel-fundo-topo">
              <span class="faixa pequena">Colocar entidade</span>
              <button
                type="button"
                class="botao-pilula"
                onClick={() => {
                  seletorEntidade.value = null;
                }}
              >
                Fechar
              </button>
            </div>
            <input
              type="search"
              data-testid="seletor-entidade-busca"
              placeholder="Buscar entidade..."
              value={seletorEntidade.value.busca}
              onInput={(e) => {
                if (!seletorEntidade.value) return;
                seletorEntidade.value = {
                  ...seletorEntidade.value,
                  busca: e.currentTarget.value,
                };
              }}
            />
            <ul class="seletor-entidade-lista">
              {sugerirEntidades(entidades.value, seletorEntidade.value.busca, 12).map((ent) => (
                <li key={ent.id}>
                  <button
                    type="button"
                    class="seletor-entidade-opcao"
                    data-testid={`colocar-entidade-${ent.id}`}
                    onClick={() => {
                      const sel = seletorEntidade.value;
                      if (!sel) return;
                      const maxZ = Math.max(0, ...[...itens.value.values()].map((i) => i.z));
                      const novo = novaRef(
                        {
                          quadroId: q.id,
                          ref: refDaEntidade(ent.id),
                          x: sel.ponto.x,
                          y: sel.ponto.y,
                          z: maxZ + 1,
                        },
                        Date.now(),
                        novoIdItem(),
                      );
                      executar({ rotulo: 'Colocar entidade', ops: [{ criar: [novo] }] });
                      selecao.value = new Set([novo.id]);
                      seletorEntidade.value = null;
                      ferramenta.value = 'selecionar';
                    }}
                  >
                    <span>{ent.nome}</span>
                    <span class="meta">{ROTULO_DO_TIPO[ent.tipo].singular}</span>
                  </button>
                </li>
              ))}
            </ul>
          </aside>
        ) : null}

        {painelSegredosAberto.value ? (
          <PainelDeSegredos
            itens={itens.value}
            onIrPara={(alvo) => {
              selecao.value = new Set([alvo.id]);
              camera.value = enquadrar(caixaDe(alvo), tamanhoTela.value, 80);
            }}
            onAlternarFeito={(alvo) => marcarFeito([alvo.id])}
            onFechar={() => {
              painelSegredosAberto.value = false;
            }}
          />
        ) : null}

        {painelLinhaDoTempoAberto.value ? (
          <LinhaDoTempo
            onAbrirItem={(quadroId, itemId) => {
              if (quadroId === q.id) {
                const alvo = itens.value.get(itemId);
                if (alvo) {
                  selecao.value = new Set([alvo.id]);
                  camera.value = enquadrar(caixaDe(alvo), tamanhoTela.value, 80);
                }
              } else {
                navegarParaQuadro(quadroId);
              }
              painelLinhaDoTempoAberto.value = false;
            }}
            onFechar={() => {
              painelLinhaDoTempoAberto.value = false;
            }}
          />
        ) : null}

        {painelRevisaoAberto.value ? (
          <FilaDeRevisao
            itens={itens.value}
            onFocarItem={(alvo) => {
              selecao.value = new Set([alvo.id]);
              camera.value = enquadrar(caixaDe(alvo), tamanhoTela.value, 80);
            }}
            onFechar={() => {
              painelRevisaoAberto.value = false;
            }}
          />
        ) : null}

        {espiarAtivo.value ? <PainelEspiar /> : null}

        {painelEstadoAberto.value ? (
          <PainelDoEstado
            estado={estadoDoMundo.value}
            onDefinirFato={(k, v) => {
              void definirFato(k, v);
            }}
            onAlternarFato={(k) => {
              void alternarFato(k);
            }}
            onFechar={() => {
              painelEstadoAberto.value = false;
            }}
          />
        ) : null}

        {painelPaletaAberto.value ? (
          <div
            onPointerDown={(e) => e.stopPropagation()}
            onDblClick={(e) => e.stopPropagation()}
          >
            <PainelDaPaleta
              paleta={paletaDaCampanha.value}
              onMudarCor={(tipo, cor) => {
                void atualizarCorDaPaleta(tipo, cor);
              }}
              onRestaurar={() => {
                void restaurarPaletaPadrao();
              }}
              onFechar={() => {
                painelPaletaAberto.value = false;
              }}
            />
          </div>
        ) : null}

        {painelFundoAberto.value ? (
          <div
            onPointerDown={(e) => e.stopPropagation()}
            onDblClick={(e) => e.stopPropagation()}
          >
            <PainelDoFundo
              fundo={q.fundo}
              roda={modoRoda.value}
              onMudarFundo={(parcial) => {
                void mudarFundo(parcial);
              }}
              onMudarRoda={(modo) => {
                modoRoda.value = modo;
                gravarModoRoda(modo);
              }}
              onFechar={() => {
                painelFundoAberto.value = false;
              }}
            />
          </div>
        ) : null}
      </div>
      {modoQuadro.value === 'ler' ? (
        <LeituraDoQuadro
          itens={itens.value}
          esconderSegredos={esconderSegredos.value}
          aoVerNoQuadro={(alvo) => {
            modoQuadro.value = 'quadro';
            camera.value = enquadrar(caixaEnvolventeDeItem(alvo), tamanhoTela.value, 80);
            selecao.value = new Set([alvo.id]);
          }}
        />
      ) : null}
    </section>
  );
}

import { computed, effect, signal } from '@preact/signals';
import {
  novoQuadro,
  type Item,
  type Quadro,
} from '../dominio/quadro.ts';
import {
  aplicar,
  Historico,
  type Operacao,
  type Passo,
} from '../dominio/quadro-operacoes.ts';
import {
  caixaDaSeta,
  pontoDaPonta,
  setasLigadasA,
} from '../dominio/setas.ts';
import { molduraQueContem, type ItemMoldura } from '../dominio/molduras.ts';
import {
  alinhar,
  distribuir,
  type ModoAlinhamento,
} from '../dominio/alinhamento.ts';
import { campanhaAtiva } from './campanha.ts';
import { revogarImagensDoQuadro } from './imagens-quadro.ts';
import {
  gravarItens,
  listarItens,
  listarQuadros,
  obterQuadro,
  removerQuadro,
  salvarQuadro,
} from './banco-quadros.ts';
import { avisar, mensagemDe } from './toasts.ts';

export const quadros = signal<Quadro[]>([]);
export const quadroAberto = signal<Quadro | null>(null);
export const itens = signal<ReadonlyMap<string, Item>>(new Map());
export const selecao = signal<ReadonlySet<string>>(new Set());
export const itemPendente = signal<string | null>(null);
export const historico = new Historico();

const versaoHistorico = signal(0);
export const podeDesfazer = computed(() => {
  void versaoHistorico.value;
  return historico.podeDesfazer;
});
export const podeRefazer = computed(() => {
  void versaoHistorico.value;
  return historico.podeRefazer;
});

const ATRASO_GRAVACAO_MS = 400;
const sujosSalvar = new Set<string>();
const sujosRemover = new Set<string>();
let timerGravacao: ReturnType<typeof setTimeout> | null = null;
let gravando: Promise<void> | null = null;

function novoIdQuadro(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `q-${crypto.randomUUID()}`;
  }
  return `q-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function marcarSujosDoPasso(passo: Passo, mapaAtual: ReadonlyMap<string, Item>): void {
  for (const op of passo.ops) {
    if ('criar' in op) {
      for (const item of op.criar) {
        sujosRemover.delete(item.id);
        sujosSalvar.add(item.id);
      }
    } else if ('alterar' in op) {
      for (const alt of op.alterar) {
        if (mapaAtual.has(alt.id)) {
          sujosRemover.delete(alt.id);
          sujosSalvar.add(alt.id);
        }
      }
    } else if ('remover' in op) {
      for (const item of op.remover) {
        sujosSalvar.delete(item.id);
        sujosRemover.add(item.id);
      }
    }
  }
}

function agendarGravacao(): void {
  if (timerGravacao !== null) {
    clearTimeout(timerGravacao);
  }
  timerGravacao = setTimeout(() => {
    timerGravacao = null;
    void descarregarPendentes();
  }, ATRASO_GRAVACAO_MS);
}

export async function descarregarPendentes(): Promise<void> {
  if (timerGravacao !== null) {
    clearTimeout(timerGravacao);
    timerGravacao = null;
  }
  if (gravando) {
    await gravando;
  }
  if (sujosSalvar.size === 0 && sujosRemover.size === 0) return;

  const salvar: Item[] = [];
  for (const id of sujosSalvar) {
    const item = itens.value.get(id);
    if (item) salvar.push(item);
  }
  const remover = [...sujosRemover];
  sujosSalvar.clear();
  sujosRemover.clear();

  const p = gravarItens(salvar, remover).catch((erro) => {
    console.warn('Mesa: erro ao gravar itens do quadro', erro);
    for (const item of salvar) sujosSalvar.add(item.id);
    for (const id of remover) sujosRemover.add(id);
  });
  gravando = p;
  await p;
  gravando = null;
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    void descarregarPendentes();
  });
}
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      void descarregarPendentes();
    }
  });
}

export async function carregarQuadros(): Promise<void> {
  const c = campanhaAtiva.value;
  if (!c) {
    quadros.value = [];
    return;
  }
  try {
    quadros.value = await listarQuadros(c.id);
  } catch (erro) {
    console.warn('Mesa: erro ao listar quadros', erro);
    quadros.value = [];
  }
}

export async function fecharQuadro(): Promise<void> {
  await descarregarPendentes();
  revogarImagensDoQuadro();
  quadroAberto.value = null;
  itens.value = new Map();
  selecao.value = new Set();
  itemPendente.value = null;
  historico.limpar();
  versaoHistorico.value++;
}

export async function abrirQuadro(id: string): Promise<Quadro | null> {
  await descarregarPendentes();
  const q = await obterQuadro(id);
  if (!q) {
    await fecharQuadro();
    return null;
  }
  const lista = await listarItens(q.id);
  quadroAberto.value = q;
  itens.value = new Map(lista.map((i) => [i.id, i]));
  selecao.value = new Set();
  historico.limpar();
  versaoHistorico.value++;
  return q;
}

export async function criarQuadro(nome: string): Promise<Quadro | null> {
  const c = campanhaAtiva.value;
  if (!c) {
    avisar('Escolha uma campanha antes de criar um quadro.', true);
    return null;
  }
  const limpo = nome.trim();
  if (!limpo) {
    avisar('O nome do quadro não pode ser vazio.', true);
    return null;
  }
  try {
    const agora = Date.now();
    const q = novoQuadro(c.id, limpo, agora, novoIdQuadro());
    await salvarQuadro(q);
    await carregarQuadros();
    return q;
  } catch (erro) {
    avisar(mensagemDe(erro), true);
    return null;
  }
}

export async function renomearQuadro(id: string, nome: string): Promise<boolean> {
  const limpo = nome.trim();
  if (!limpo) return false;
  try {
    const alvo =
      quadroAberto.value?.id === id
        ? quadroAberto.value
        : (quadros.value.find((q) => q.id === id) ?? (await obterQuadro(id)));
    if (!alvo) return false;
    const atualizado: Quadro = {
      ...alvo,
      nome: limpo,
      atualizadoEm: Math.max(Date.now(), alvo.atualizadoEm + 1),
    };
    await salvarQuadro(atualizado);
    if (quadroAberto.value?.id === id) {
      quadroAberto.value = atualizado;
    }
    await carregarQuadros();
    return true;
  } catch (erro) {
    avisar(mensagemDe(erro), true);
    return false;
  }
}

export async function excluirQuadro(id: string): Promise<void> {
  try {
    if (quadroAberto.value?.id === id) {
      sujosSalvar.clear();
      sujosRemover.clear();
      if (timerGravacao !== null) {
        clearTimeout(timerGravacao);
        timerGravacao = null;
      }
      quadroAberto.value = null;
      itens.value = new Map();
      selecao.value = new Set();
      historico.limpar();
      versaoHistorico.value++;
    }
    await removerQuadro(id);
    await carregarQuadros();
  } catch (erro) {
    avisar(mensagemDe(erro), true);
  }
}

export async function mudarFundo(parcial: Partial<Quadro['fundo']>): Promise<void> {
  const q = quadroAberto.value;
  if (!q) return;
  const atualizado: Quadro = {
    ...q,
    fundo: { ...q.fundo, ...parcial },
    atualizadoEm: Math.max(Date.now(), q.atualizadoEm + 1),
  };
  quadroAberto.value = atualizado;
  quadros.value = quadros.value.map((x) => (x.id === atualizado.id ? atualizado : x));
  try {
    await salvarQuadro(atualizado);
  } catch (erro) {
    avisar(mensagemDe(erro), true);
  }
}

function enriquecerPassoComSetas(
  itensAntes: ReadonlyMap<string, Item>,
  passo: Passo,
  itensDepois: Map<string, Item>,
): { passo: Passo; proximo: Map<string, Item> } {
  const removidos = new Set<string>();
  const alterados = new Set<string>();
  const jaTratados = new Set<string>();

  for (const op of passo.ops) {
    if ('remover' in op) {
      for (const it of op.remover) removidos.add(it.id);
    } else if ('alterar' in op) {
      for (const a of op.alterar) {
        const item = itensDepois.get(a.id);
        if (item?.tipo === 'seta') {
          jaTratados.add(a.id);
        } else {
          alterados.add(a.id);
        }
      }
    }
  }

  if (removidos.size === 0 && alterados.size === 0) {
    return { passo, proximo: itensDepois };
  }

  const tocados = new Set<string>([...removidos, ...alterados]);
  const setas = setasLigadasA(tocados, itensDepois);
  if (setas.length === 0) {
    return { passo, proximo: itensDepois };
  }

  const alterarSetas: Extract<Operacao, { alterar: unknown }>['alterar'] = [];

  for (const seta of setas) {
    if (jaTratados.has(seta.id)) continue;

    let novoDe = seta.de;
    let novoPara = seta.para;
    let mudouPonta = false;

    if ('itemId' in seta.de && removidos.has(seta.de.itemId)) {
      const { ponto } = pontoDaPonta(seta.de, itensAntes, seta.para);
      novoDe = { ponto: [ponto.x, ponto.y] };
      mudouPonta = true;
    }
    if ('itemId' in seta.para && removidos.has(seta.para.itemId)) {
      const { ponto } = pontoDaPonta(seta.para, itensAntes, seta.de);
      novoPara = { ponto: [ponto.x, ponto.y] };
      mudouPonta = true;
    }

    const setaAtualizada = mudouPonta
      ? { ...seta, de: novoDe, para: novoPara }
      : seta;
    const novaCaixa = caixaDaSeta(setaAtualizada, itensDepois);

    const mudouCaixa =
      Math.abs(novaCaixa.x - seta.x) > 0.01 ||
      Math.abs(novaCaixa.y - seta.y) > 0.01 ||
      Math.abs(novaCaixa.largura - seta.largura) > 0.01 ||
      Math.abs(novaCaixa.altura - seta.altura) > 0.01;

    if (!mudouPonta && !mudouCaixa) continue;

    const antes: Partial<Item> = {
      x: seta.x,
      y: seta.y,
      largura: seta.largura,
      altura: seta.altura,
      ...(mudouPonta ? { de: seta.de, para: seta.para } : {}),
    };
    const depois: Partial<Item> = {
      x: novaCaixa.x,
      y: novaCaixa.y,
      largura: novaCaixa.largura,
      altura: novaCaixa.altura,
      ...(mudouPonta ? { de: novoDe, para: novoPara } : {}),
    };
    alterarSetas.push({ id: seta.id, antes, depois });
  }

  if (alterarSetas.length === 0) {
    return { passo, proximo: itensDepois };
  }

  const passoComSetas: Passo = {
    ...passo,
    ops: [...passo.ops, { alterar: alterarSetas }],
  };
  const proximoFinal = aplicar(itensDepois, { rotulo: passo.rotulo, ops: [{ alterar: alterarSetas }] });
  return { passo: passoComSetas, proximo: proximoFinal };
}

export function executar(passo: Passo, chaveAgrupamento?: string): void {
  if (passo.ops.length === 0) return;
  const antes = itens.value;
  const proximoInicial = aplicar(antes, passo);
  const { passo: passoFinal, proximo } = enriquecerPassoComSetas(antes, passo, proximoInicial);
  itens.value = proximo;
  historico.registrar(passoFinal, chaveAgrupamento);
  versaoHistorico.value++;
  marcarSujosDoPasso(passoFinal, proximo);
  agendarGravacao();
}

export function atualizarMolduras(idsAlvo?: ReadonlySet<string>): void {
  const mapa = itens.value;
  const molduras: ItemMoldura[] = [];
  for (const it of mapa.values()) {
    if (it.tipo === 'moldura') molduras.push(it);
  }
  const alterar: Extract<Operacao, { alterar: unknown }>['alterar'] = [];
  const agora = Date.now();
  for (const it of mapa.values()) {
    if (it.tipo === 'moldura' || it.tipo === 'seta') continue;
    if (idsAlvo && !idsAlvo.has(it.id)) continue;
    const nova = molduraQueContem(it, molduras)?.id ?? null;
    if (nova !== it.molduraId) {
      alterar.push({
        id: it.id,
        antes: { molduraId: it.molduraId, atualizadoEm: it.atualizadoEm },
        depois: { molduraId: nova, atualizadoEm: agora },
      });
    }
  }
  if (alterar.length > 0) {
    executar({ rotulo: 'Atualizar moldura', ops: [{ alterar }] });
  }
}

export function agruparSelecao(grupoId: string): void {
  const lista = [...selecao.value]
    .map((id) => itens.value.get(id))
    .filter((i): i is Item => Boolean(i))
    .filter((i) => !i.travado);
  if (lista.length < 2) return;
  const agora = Date.now();
  executar({
    rotulo: 'Agrupar',
    ops: [
      {
        alterar: lista.map((it) => ({
          id: it.id,
          antes: { grupoId: it.grupoId, atualizadoEm: it.atualizadoEm },
          depois: { grupoId, atualizadoEm: agora },
        })),
      },
    ],
  });
}

export function desagruparSelecao(): void {
  const lista = [...selecao.value]
    .map((id) => itens.value.get(id))
    .filter((i): i is Item => Boolean(i))
    .filter((i) => !i.travado && i.grupoId !== null);
  if (lista.length === 0) return;
  const agora = Date.now();
  executar({
    rotulo: 'Desagrupar',
    ops: [
      {
        alterar: lista.map((it) => ({
          id: it.id,
          antes: { grupoId: it.grupoId, atualizadoEm: it.atualizadoEm },
          depois: { grupoId: null, atualizadoEm: agora },
        })),
      },
    ],
  });
}

export function alinharSelecao(modo: ModoAlinhamento): void {
  const lista = [...selecao.value]
    .map((id) => itens.value.get(id))
    .filter((i): i is Item => Boolean(i))
    .filter((i) => !i.travado);
  const posicoes = alinhar(lista, modo);
  if (posicoes.size === 0) return;
  const agora = Date.now();
  const alterar: Extract<Operacao, { alterar: unknown }>['alterar'] = [];
  for (const it of lista) {
    const pos = posicoes.get(it.id);
    if (!pos || (pos.x === it.x && pos.y === it.y)) continue;
    alterar.push({
      id: it.id,
      antes: { x: it.x, y: it.y, atualizadoEm: it.atualizadoEm },
      depois: { x: pos.x, y: pos.y, atualizadoEm: agora },
    });
  }
  if (alterar.length > 0) {
    executar({ rotulo: 'Alinhar', ops: [{ alterar }] });
  }
}

export function distribuirSelecao(eixo: 'h' | 'v'): void {
  const lista = [...selecao.value]
    .map((id) => itens.value.get(id))
    .filter((i): i is Item => Boolean(i))
    .filter((i) => !i.travado);
  const posicoes = distribuir(lista, eixo);
  if (posicoes.size === 0) return;
  const agora = Date.now();
  const alterar: Extract<Operacao, { alterar: unknown }>['alterar'] = [];
  for (const it of lista) {
    const pos = posicoes.get(it.id);
    if (!pos || (pos.x === it.x && pos.y === it.y)) continue;
    alterar.push({
      id: it.id,
      antes: { x: it.x, y: it.y, atualizadoEm: it.atualizadoEm },
      depois: { x: pos.x, y: pos.y, atualizadoEm: agora },
    });
  }
  if (alterar.length > 0) {
    executar({ rotulo: 'Distribuir', ops: [{ alterar }] });
  }
}

export function desfazer(): Passo | null {
  const passo = historico.desfazer();
  if (!passo) return null;
  const proximo = aplicar(itens.value, passo);
  itens.value = proximo;
  versaoHistorico.value++;
  marcarSujosDoPasso(passo, proximo);
  agendarGravacao();
  return passo;
}

export function refazer(): Passo | null {
  const passo = historico.refazer();
  if (!passo) return null;
  const proximo = aplicar(itens.value, passo);
  itens.value = proximo;
  versaoHistorico.value++;
  marcarSujosDoPasso(passo, proximo);
  agendarGravacao();
  return passo;
}

let ultimaCampanhaId: string | null | undefined;
effect(() => {
  const id = campanhaAtiva.value?.id ?? null;
  if (id === ultimaCampanhaId) return;
  ultimaCampanhaId = id;
  if (quadroAberto.value && quadroAberto.value.campanhaId !== id) {
    void fecharQuadro();
  }
  void carregarQuadros();
});

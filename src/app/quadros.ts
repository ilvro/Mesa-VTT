import { computed, effect, signal } from '@preact/signals';
import {
  novoQuadro,
  textoPuro,
  type Item,
  type Quadro,
  type TipoSemantico,
} from '../dominio/quadro.ts';
import { formatarLinhaDoQuadro } from '../dominio/registro.ts';
import {
  ESTADO_VAZIO,
  normalizarEstadoDoMundo,
  type EstadoDoMundo,
} from '../dominio/estado-do-mundo.ts';
import {
  PALETA_PADRAO,
  resolverPaleta,
  type PaletaDaCampanha,
} from '../dominio/paleta.ts';
import { registrarDoQuadro, sessaoAtiva } from './registro.ts';
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
  lerAjustesQuadro,
  listarItens,
  listarQuadros,
  obterQuadro,
  removerQuadro,
  salvarAjustesQuadro,
  salvarQuadro,
} from './banco-quadros.ts';
import {
  removerLigacoesDoItem,
  removerLigacoesDoQuadro,
  sincronizarLigacoesDoItem,
} from './ligacoes-quadro.ts';
import { avisar, mensagemDe } from './toasts.ts';

export const quadros = signal<Quadro[]>([]);
export const quadroAberto = signal<Quadro | null>(null);
export const itens = signal<ReadonlyMap<string, Item>>(new Map());
export const selecao = signal<ReadonlySet<string>>(new Set());
export const itemPendente = signal<string | null>(null);
export const paletaDaCampanha = signal<PaletaDaCampanha>({ ...PALETA_PADRAO });
export const estadoDoMundo = signal<EstadoDoMundo>({ ...ESTADO_VAZIO });
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

function itemPodeTerLigacoes(item: Item): boolean {
  return (
    item.tipo === 'texto' ||
    item.tipo === 'forma' ||
    item.tipo === 'moldura' ||
    item.tipo === 'seta' ||
    item.tipo === 'ref'
  );
}

function marcarSujosDoPasso(passo: Passo, mapaAtual: ReadonlyMap<string, Item>): void {
  for (const op of passo.ops) {
    if ('criar' in op) {
      for (const item of op.criar) {
        sujosRemover.delete(item.id);
        sujosSalvar.add(item.id);
        if (itemPodeTerLigacoes(item)) {
          void sincronizarLigacoesDoItem(item);
        }
      }
    } else if ('alterar' in op) {
      for (const alt of op.alterar) {
        const atual = mapaAtual.get(alt.id);
        if (atual) {
          sujosRemover.delete(alt.id);
          sujosSalvar.add(alt.id);
          if (
            'doc' in alt.depois ||
            'titulo' in alt.depois ||
            'rotulo' in alt.depois ||
            'ref' in alt.depois
          ) {
            void sincronizarLigacoesDoItem(atual);
          }
        }
      }
    } else if ('remover' in op) {
      for (const item of op.remover) {
        sujosSalvar.delete(item.id);
        sujosRemover.add(item.id);
        void removerLigacoesDoItem(item.quadroId, item.id);
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

  const p = gravarItens(salvar, remover).catch(async (erro) => {
    console.warn('Mesa: erro ao gravar itens do quadro', erro);
    avisar(`Erro ao gravar quadro: ${mensagemDe(erro)}`, true);
    if (salvar.length > 1 || (salvar.length > 0 && remover.length > 0)) {
      if (remover.length > 0) {
        await gravarItens([], remover).catch(() => {
          for (const id of remover) sujosRemover.add(id);
        });
      }
      for (const item of salvar) {
        await gravarItens([item], []).catch(() => {
          sujosSalvar.add(item.id);
        });
      }
    } else {
      for (const item of salvar) sujosSalvar.add(item.id);
      for (const id of remover) sujosRemover.add(id);
    }
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
    paletaDaCampanha.value = { ...PALETA_PADRAO };
    estadoDoMundo.value = { ...ESTADO_VAZIO };
    return;
  }
  try {
    const [lista, ajustes] = await Promise.all([
      listarQuadros(c.id),
      lerAjustesQuadro(c.id),
    ]);
    quadros.value = lista;
    paletaDaCampanha.value = resolverPaleta(ajustes?.paleta);
    estadoDoMundo.value = normalizarEstadoDoMundo(ajustes?.estado);
  } catch (erro) {
    console.warn('Mesa: erro ao listar quadros', erro);
    quadros.value = [];
    paletaDaCampanha.value = { ...PALETA_PADRAO };
    estadoDoMundo.value = { ...ESTADO_VAZIO };
  }
}

let filaAjustes: Promise<void> = Promise.resolve();

function enfileirarAjustes(
  campanhaId: string,
  patch: Partial<{ paleta: PaletaDaCampanha; estado: EstadoDoMundo }>,
): Promise<void> {
  const proxima = filaAjustes.then(async () => {
    const existente = await lerAjustesQuadro(campanhaId);
    await salvarAjustesQuadro({
      ...(existente ?? { campanhaId }),
      campanhaId,
      ...patch,
    });
  });
  filaAjustes = proxima.catch(() => {});
  return proxima;
}

export async function definirFato(
  chave: string,
  valor: string | boolean | undefined,
): Promise<void> {
  const limpa = chave.trim();
  if (!limpa) return;
  const atual = estadoDoMundo.value;
  const de = atual.fatos[limpa];
  if (de === valor) return;

  const fatos = { ...atual.fatos };
  if (valor === undefined) {
    delete fatos[limpa];
  } else {
    fatos[limpa] = valor;
  }

  const proximo: EstadoDoMundo = {
    fatos,
    historico: [
      ...atual.historico,
      {
        chave: limpa,
        de,
        para: valor,
        em: Date.now(),
        sessaoId: sessaoAtiva.value?.id ?? null,
      },
    ],
  };
  estadoDoMundo.value = proximo;

  const c = campanhaAtiva.value;
  if (!c) return;
  try {
    await enfileirarAjustes(c.id, { estado: proximo });
  } catch (erro) {
    avisar(mensagemDe(erro), true);
  }
}

export async function alternarFato(chave: string): Promise<void> {
  const atual = estadoDoMundo.value.fatos[chave.trim()];
  if (typeof atual === 'string') return;
  const proximo = typeof atual === 'boolean' ? !atual : true;
  await definirFato(chave, proximo);
}

export async function atualizarCorDaPaleta(tipo: TipoSemantico, cor: string): Promise<void> {
  const proxima = resolverPaleta({ ...paletaDaCampanha.value, [tipo]: cor });
  paletaDaCampanha.value = proxima;
  const c = campanhaAtiva.value;
  if (!c) return;
  try {
    await enfileirarAjustes(c.id, { paleta: proxima });
  } catch (erro) {
    avisar(mensagemDe(erro), true);
  }
}

export async function restaurarPaletaPadrao(): Promise<void> {
  const padrao = { ...PALETA_PADRAO };
  paletaDaCampanha.value = padrao;
  const c = campanhaAtiva.value;
  if (!c) return;
  try {
    await enfileirarAjustes(c.id, { paleta: padrao });
  } catch (erro) {
    avisar(mensagemDe(erro), true);
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
    void removerLigacoesDoQuadro(id);
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

  let opsFinal: Operacao[];
  if (passo.ops.length === 1 && 'alterar' in passo.ops[0]!) {
    const baseAlterar = [...passo.ops[0]!.alterar];
    const porId = new Map(baseAlterar.map((a, idx) => [a.id, idx]));
    for (const altSeta of alterarSetas) {
      const idx = porId.get(altSeta.id);
      if (idx !== undefined) {
        const prev = baseAlterar[idx]!;
        baseAlterar[idx] = {
          id: altSeta.id,
          antes: { ...prev.antes, ...altSeta.antes } as Partial<Item>,
          depois: { ...prev.depois, ...altSeta.depois } as Partial<Item>,
        };
      } else {
        baseAlterar.push(altSeta);
      }
    }
    opsFinal = [{ alterar: baseAlterar }];
  } else {
    opsFinal = [...passo.ops, { alterar: alterarSetas }];
  }

  const passoComSetas: Passo = {
    ...passo,
    ops: opsFinal,
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

export function moverItemPatch(
  it: Item,
  nx: number,
  ny: number,
  agora: number,
): { id: string; antes: Partial<Item>; depois: Partial<Item> } {
  const dx = nx - it.x;
  const dy = ny - it.y;
  if (it.tipo === 'seta') {
    const mudouDe = 'ponto' in it.de;
    const mudouPara = 'ponto' in it.para;
    return {
      id: it.id,
      antes: {
        x: it.x,
        y: it.y,
        ...(mudouDe ? { de: it.de } : {}),
        ...(mudouPara ? { para: it.para } : {}),
        atualizadoEm: it.atualizadoEm,
      },
      depois: {
        x: nx,
        y: ny,
        ...(mudouDe && 'ponto' in it.de
          ? { de: { ponto: [it.de.ponto[0] + dx, it.de.ponto[1] + dy] } }
          : {}),
        ...(mudouPara && 'ponto' in it.para
          ? { para: { ponto: [it.para.ponto[0] + dx, it.para.ponto[1] + dy] } }
          : {}),
        atualizadoEm: agora,
      },
    };
  }
  return {
    id: it.id,
    antes: { x: it.x, y: it.y, atualizadoEm: it.atualizadoEm },
    depois: { x: nx, y: ny, atualizadoEm: agora },
  };
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
    alterar.push(moverItemPatch(it, pos.x, pos.y, agora));
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
    alterar.push(moverItemPatch(it, pos.x, pos.y, agora));
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

export function marcarFeito(ids: readonly string[], forcar?: boolean): void {
  const alvos = ids
    .map((id) => itens.value.get(id))
    .filter((i): i is Item => Boolean(i));
  if (alvos.length === 0) return;
  const novoEstado = forcar ?? !alvos.every((i) => i.feito);
  const agora = Date.now();

  executar({
    rotulo: novoEstado ? 'Marcar feito' : 'Desmarcar feito',
    ops: [
      {
        alterar: alvos.map((it) => ({
          id: it.id,
          antes: { feito: it.feito, atualizadoEm: it.atualizadoEm },
          depois: {
            feito: novoEstado
              ? { em: agora, sessaoId: sessaoAtiva.value?.id ?? null }
              : undefined,
            atualizadoEm: agora,
          },
        })),
      },
    ],
  });

  if (!novoEstado) return;
  const molduras = [...itens.value.values()].filter(
    (i): i is ItemMoldura => i.tipo === 'moldura',
  );
  for (const it of alvos) {
    if (it.feito) continue;
    const texto =
      it.tipo === 'texto' || it.tipo === 'forma'
        ? textoPuro(it.doc)
        : it.tipo === 'moldura'
          ? it.titulo
          : it.tipo === 'seta'
            ? it.rotulo
            : '';
    const semantica = 'semantica' in it ? it.semantica : null;
    const moldura = it.tipo === 'moldura' ? null : molduraQueContem(it, molduras);
    const linha = formatarLinhaDoQuadro(texto, semantica, moldura?.titulo);
    if (linha) registrarDoQuadro(linha, agora);
  }
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

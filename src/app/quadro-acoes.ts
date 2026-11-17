import {
  duplicar,
  levarParaTras,
  trazerParaFrente,
} from '../dominio/quadro-operacoes.ts';
import type {
  AoFocar,
  EstiloDeCaixa,
  Item,
} from '../dominio/quadro.ts';
import { executar, itens, selecao } from './quadros.ts';

type ItemTextual = Extract<Item, { tipo: 'texto' | 'forma' }>;
type ItemComCaixa = Extract<Item, { tipo: 'texto' | 'forma' | 'imagem' | 'moldura' }>;
type ItemSeta = Extract<Item, { tipo: 'seta' }>;
type ItemTraco = Extract<Item, { tipo: 'traco' }>;

export function obterSelecionados(): Item[] {
  return [...selecao.value]
    .map((id) => itens.value.get(id))
    .filter((i): i is Item => Boolean(i));
}

export function duplicarSelecao(
  novoId: () => string,
  deslocamento: { dx: number; dy: number } = { dx: 24, dy: 24 },
): Item[] {
  const selecionados = obterSelecionados();
  if (selecionados.length === 0) return [];
  const maxZ = Math.max(0, ...[...itens.value.values()].map((i) => i.z));
  const passo = duplicar(selecionados, novoId, deslocamento, {
    agora: Date.now(),
    zBase: maxZ + 1,
  });
  executar(passo);
  const criados = passo.ops.flatMap((op) => ('criar' in op ? op.criar : []));
  selecao.value = new Set(criados.map((i) => i.id));
  return criados;
}

export function removerSelecao(rotulo = 'Remover'): Item[] {
  const removiveis = obterSelecionados().filter((i) => !i.travado);
  if (removiveis.length === 0) return [];
  executar({ rotulo, ops: [{ remover: removiveis }] });
  selecao.value = new Set();
  return removiveis;
}

export function trazerSelecaoParaFrente(): void {
  if (selecao.value.size === 0) return;
  executar(trazerParaFrente(itens.value, selecao.value));
}

export function levarSelecaoParaTras(): void {
  if (selecao.value.size === 0) return;
  executar(levarParaTras(itens.value, selecao.value));
}

export function alternarTravadoSelecao(): void {
  const selecionados = obterSelecionados();
  if (selecionados.length === 0) return;
  const travar = !selecionados.every((i) => i.travado);
  const agora = Date.now();
  executar({
    rotulo: travar ? 'Travar' : 'Destravar',
    ops: [
      {
        alterar: selecionados.map((it) => ({
          id: it.id,
          antes: { travado: it.travado, atualizadoEm: it.atualizadoEm },
          depois: { travado: travar, atualizadoEm: agora },
        })),
      },
    ],
  });
}

export function alternarSoMestreSelecao(rotuloAlternado = true): void {
  const selecionados = obterSelecionados();
  if (selecionados.length === 0) return;
  const todosSoMestre = selecionados.every((i) => i.soMestre);
  const agora = Date.now();
  executar({
    rotulo: rotuloAlternado
      ? todosSoMestre
        ? 'Visível a todos'
        : 'Só mestre'
      : 'Visibilidade',
    ops: [
      {
        alterar: selecionados.map((it) => ({
          id: it.id,
          antes: { soMestre: it.soMestre, atualizadoEm: it.atualizadoEm },
          depois: { soMestre: !todosSoMestre, atualizadoEm: agora },
        })),
      },
    ],
  });
}

export function alterarTextuaisSelecao(
  rotulo: string,
  fn: (it: ItemTextual) => Partial<ItemTextual>,
): void {
  const textuais = obterSelecionados().filter(
    (i): i is ItemTextual => i.tipo === 'texto' || i.tipo === 'forma',
  );
  if (textuais.length === 0) return;
  const agora = Date.now();
  executar({
    rotulo,
    ops: [
      {
        alterar: textuais.map((it) => {
          const mud = fn(it);
          const antes: Partial<ItemTextual> = { atualizadoEm: it.atualizadoEm };
          if ('texto' in mud) antes.texto = it.texto;
          if ('doc' in mud) antes.doc = it.doc;
          if ('semantica' in mud) antes.semantica = it.semantica;
          if ('caixa' in mud) antes.caixa = it.caixa;
          return {
            id: it.id,
            antes,
            depois: { ...mud, atualizadoEm: agora },
          };
        }),
      },
    ],
  });
}

export function alterarCaixasSelecao(
  rotulo: string,
  fn: (c: EstiloDeCaixa) => EstiloDeCaixa,
): void {
  const comCaixa = obterSelecionados().filter(
    (i): i is ItemComCaixa => 'caixa' in i,
  );
  if (comCaixa.length === 0) return;
  const agora = Date.now();
  executar({
    rotulo,
    ops: [
      {
        alterar: comCaixa.map((it) => ({
          id: it.id,
          antes: { caixa: it.caixa, atualizadoEm: it.atualizadoEm },
          depois: { caixa: fn(it.caixa), atualizadoEm: agora },
        })),
      },
    ],
  });
}

export function alterarSetasSelecao(
  rotulo: string,
  fn: (s: ItemSeta) => Partial<ItemSeta>,
): void {
  const setas = obterSelecionados().filter(
    (i): i is ItemSeta => i.tipo === 'seta',
  );
  if (setas.length === 0) return;
  const agora = Date.now();
  executar({
    rotulo,
    ops: [
      {
        alterar: setas.map((s) => ({
          id: s.id,
          antes: {
            cor: s.cor,
            espessura: s.espessura,
            tracejado: s.tracejado,
            rota: s.rota,
            inicio: s.inicio,
            fim: s.fim,
            de: s.de,
            para: s.para,
            atualizadoEm: s.atualizadoEm,
          },
          depois: { ...fn(s), atualizadoEm: agora },
        })),
      },
    ],
  });
}

export function alterarTracosSelecao(
  rotulo: string,
  fn: (t: ItemTraco) => Partial<ItemTraco>,
): void {
  const tracos = obterSelecionados().filter(
    (i): i is ItemTraco => i.tipo === 'traco',
  );
  if (tracos.length === 0) return;
  const agora = Date.now();
  executar({
    rotulo,
    ops: [
      {
        alterar: tracos.map((t) => ({
          id: t.id,
          antes: {
            cor: t.cor,
            espessura: t.espessura,
            atualizadoEm: t.atualizadoEm,
          },
          depois: { ...fn(t), atualizadoEm: agora },
        })),
      },
    ],
  });
}

export function atualizarAoFocarMoldura(id: string, novo: AoFocar): void {
  const it = itens.value.get(id);
  if (!it || it.tipo !== 'moldura') return;
  const vazio = novo.cena === null && Object.keys(novo.fatos).length === 0;
  executar({
    rotulo: 'Ao entrar na moldura',
    ops: [
      {
        alterar: [
          {
            id: it.id,
            antes: {
              aoFocar: it.aoFocar,
              atualizadoEm: it.atualizadoEm,
            },
            depois: {
              aoFocar: vazio ? undefined : novo,
              atualizadoEm: Date.now(),
            },
          },
        ],
      },
    ],
  });
}

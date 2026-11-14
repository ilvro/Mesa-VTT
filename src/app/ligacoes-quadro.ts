import { mesmaRef, type Entidade, type Ligacao } from '#mesa';

const APP_DA_MESA = 'mesa';
import {
  diferencaDeLigacoes,
  parsearRefDeItemDeQuadro,
  refDoItemDeQuadro,
  refsDoItem,
} from '../dominio/ligacoes-quadro.ts';
import { molduraQueContem, type ItemMoldura } from '../dominio/molduras.ts';
import { refDaEntidade } from '../dominio/notas.ts';
import type { Item } from '../dominio/quadro.ts';
import { listarItens, obterQuadro } from './banco-quadros.ts';
import {
  atualizar,
  campanhaAtiva,
  entidades,
  obterRepositorio,
} from './campanha.ts';

let fila: Promise<void> = Promise.resolve();

export function sincronizarLigacoesDoItem(item: Item): Promise<void> {
  fila = fila
    .then(async () => {
      const c = campanhaAtiva.value;
      if (!c) return;
      const r = obterRepositorio();
      const de = refDoItemDeQuadro(item.quadroId, item.id);
      const depois = refsDoItem(item, entidades.value);
      const atuais = (await r.listarLigacoes(c.id, de)).filter(
        (l) =>
          l.tipo === 'menciona' &&
          l.criadaPor === APP_DA_MESA &&
          mesmaRef(l.de, de),
      );

      const { adicionar, remover } = diferencaDeLigacoes(
        atuais.map((l) => l.para),
        depois,
      );
      if (adicionar.length === 0 && remover.length === 0) return;

      for (const para of adicionar) {
        await r.ligar({ campanhaId: c.id, de, para, tipo: 'menciona' });
      }
      for (const para of remover) {
        const lig = atuais.find((l) => mesmaRef(l.para, para));
        if (lig) await r.removerLigacao(lig.id);
      }
      await atualizar();
    })
    .catch((erro) => {
      console.warn('Mesa: erro ao sincronizar ligações do item', erro);
    });
  return fila;
}

export function removerLigacoesDoItem(
  quadroId: string,
  itemId: string,
): Promise<void> {
  fila = fila
    .then(async () => {
      const c = campanhaAtiva.value;
      if (!c) return;
      const r = obterRepositorio();
      const de = refDoItemDeQuadro(quadroId, itemId);
      const atuais = (await r.listarLigacoes(c.id, de)).filter(
        (l) =>
          l.tipo === 'menciona' &&
          l.criadaPor === APP_DA_MESA &&
          mesmaRef(l.de, de),
      );
      if (atuais.length === 0) return;
      for (const l of atuais) {
        await r.removerLigacao(l.id);
      }
      await atualizar();
    })
    .catch((erro) => {
      console.warn('Mesa: erro ao remover ligações do item', erro);
    });
  return fila;
}

export function removerLigacoesDoQuadro(quadroId: string): Promise<void> {
  fila = fila
    .then(async () => {
      const c = campanhaAtiva.value;
      if (!c) return;
      const r = obterRepositorio();
      const todas = await r.listarLigacoes(c.id);
      const alvo = todas.filter((l) => {
        if (l.tipo !== 'menciona' || l.criadaPor !== APP_DA_MESA) return false;
        const parsed = parsearRefDeItemDeQuadro(l.de);
        return parsed?.quadroId === quadroId;
      });
      if (alvo.length === 0) return;
      for (const l of alvo) {
        await r.removerLigacao(l.id);
      }
      await atualizar();
    })
    .catch((erro) => {
      console.warn('Mesa: erro ao remover ligações do quadro', erro);
    });
  return fila;
}

export interface LigacaoNoQuadro {
  quadroId: string;
  quadroNome: string;
  itemId: string;
  molduraNome: string | null;
}

export async function linksNosQuadrosDaEntidade(
  entidade: Entidade,
  todasLigacoes: readonly Ligacao[],
): Promise<LigacaoNoQuadro[]> {
  const refMesa = refDaEntidade(entidade.id);
  const refsAlvo = [refMesa, ...entidade.refs];

  const vistos = new Set<string>();
  const pares: Array<{ quadroId: string; itemId: string }> = [];

  for (const l of todasLigacoes) {
    if (l.tipo !== 'menciona') continue;
    if (!refsAlvo.some((r) => mesmaRef(l.para, r))) continue;
    const refItem = parsearRefDeItemDeQuadro(l.de);
    if (!refItem) continue;
    const chave = `${refItem.quadroId}/${refItem.itemId}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    pares.push(refItem);
  }

  if (pares.length === 0) return [];

  const quadrosCache = new Map<string, { nome: string; itens: Map<string, Item>; molduras: ItemMoldura[] }>();
  const resultado: LigacaoNoQuadro[] = [];

  for (const { quadroId, itemId } of pares) {
    let entry = quadrosCache.get(quadroId);
    if (!entry) {
      const q = await obterQuadro(quadroId);
      if (!q) continue;
      const lista = await listarItens(quadroId);
      entry = {
        nome: q.nome,
        itens: new Map(lista.map((i) => [i.id, i])),
        molduras: lista.filter((i): i is ItemMoldura => i.tipo === 'moldura'),
      };
      quadrosCache.set(quadroId, entry);
    }

    const item = entry.itens.get(itemId);
    if (!item) continue;
    const moldura =
      item.tipo === 'moldura' ? item : molduraQueContem(item, entry.molduras);
    resultado.push({
      quadroId,
      quadroNome: entry.nome,
      itemId,
      molduraNome: moldura?.titulo ?? null,
    });
  }

  return resultado;
}

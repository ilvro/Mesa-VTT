import { mesmaRef, type Entidade, type Ligacao } from '#mesa';

const APP_DA_MESA = 'mesa';
import { effect } from '@preact/signals';
import {
  chavesDeNomes,
  diferencaDeLigacoes,
  itensQueCitam,
  nomesNovos,
  ligacoesDoQuadro,
  ligacoesOrfasDoQuadro,
  parsearRefDeItemDeQuadro,
  refDoItemDeQuadro,
  refsDoItem,
} from '../dominio/ligacoes-quadro.ts';
import { molduraQueContem, type ItemMoldura } from '../dominio/molduras.ts';
import { refDaEntidade } from '../dominio/notas.ts';
import type { Item } from '../dominio/quadro.ts';
import { listarItens, listarQuadros, obterQuadro } from './banco-quadros.ts';
import {
  atualizar,
  campanhaAtiva,
  entidades,
  obterRepositorio,
} from './campanha.ts';

let fila: Promise<void> = Promise.resolve();

const nomesPorCampanha = new Map<string, Set<string>>();

/**
 * Observa as entidades: quando nascem nomes novos na campanha ativa, religa em
 * segundo plano os itens de todos os quadros que os citam. Iniciar uma vez.
 * A primeira leitura de cada campanha só guarda os nomes (não há "novos").
 */
/** O quadro aberto agora, com os itens da memória (podem ter mudanças ainda não gravadas). */
export type LerQuadroAberto = () => { id: string; itens: Iterable<Item> } | null;

export function iniciarReligacaoDeNomes(lerAberto: LerQuadroAberto): () => void {
  return effect(() => {
    const c = campanhaAtiva.value;
    if (!c) return;
    // Logo depois de trocar de campanha, `entidades` ainda pode trazer as da anterior.
    const lista = entidades.value.filter((e) => e.campanhaId === c.id);
    const antes = nomesPorCampanha.get(c.id);
    // Primeira leitura com entidades: só guarda. Uma lista vazia é tratada como
    // "ainda carregando", para não tomar todos os nomes por novos ao abrir o app.
    if (!antes || antes.size === 0) {
      nomesPorCampanha.set(c.id, chavesDeNomes(lista));
      return;
    }
    nomesPorCampanha.set(c.id, chavesDeNomes(lista));
    const novos = nomesNovos(antes, lista);
    if (novos.length === 0) return;
    void religarItensQueCitam(c.id, novos, lerAberto);
  });
}

function religarItensQueCitam(
  campanhaId: string,
  nomes: readonly string[],
  lerAberto: LerQuadroAberto,
): Promise<void> {
  fila = fila
    .then(async () => {
      if (campanhaAtiva.value?.id !== campanhaId) return;
      const r = obterRepositorio();
      const todos = await listarQuadros(campanhaId);
      for (const q of todos) {
        const aberto = lerAberto();
        const lista =
          aberto && aberto.id === q.id ? [...aberto.itens] : await listarItens(q.id);
        for (const item of itensQueCitam(nomes, lista)) {
          const de = refDoItemDeQuadro(item.quadroId, item.id);
          const atuais = (await r.listarLigacoes(campanhaId, de)).filter(
            (l) => l.tipo === 'menciona' && l.criadaPor === APP_DA_MESA && mesmaRef(l.de, de),
          );
          const { adicionar } = diferencaDeLigacoes(
            atuais.map((l) => l.para),
            refsDoItem(item, entidades.value),
          );
          for (const para of adicionar) {
            await r.ligar({ campanhaId, de, para, tipo: 'menciona' });
          }
        }
      }
      await atualizar();
    })
    .catch((erro) => {
      console.warn('Mesa: erro ao religar nomes novos nos quadros', erro);
    });
  return fila;
}

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

/**
 * Cria as ligações `menciona` de itens recém-criados de uma vez (importação):
 * eles não têm ligações antigas para comparar, e a campanha é recarregada uma vez só.
 */
export function ligarItensNovos(lista: readonly Item[]): Promise<void> {
  fila = fila
    .then(async () => {
      const c = campanhaAtiva.value;
      if (!c) return;
      const r = obterRepositorio();
      let criadas = 0;
      for (const item of lista) {
        const de = refDoItemDeQuadro(item.quadroId, item.id);
        for (const para of refsDoItem(item, entidades.value)) {
          await r.ligar({ campanhaId: c.id, de, para, tipo: 'menciona' });
          criadas++;
        }
      }
      if (criadas > 0) await atualizar();
    })
    .catch((erro) => {
      console.warn('Mesa: erro ao ligar itens importados', erro);
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
      const alvo = ligacoesDoQuadro(todas, quadroId);
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

/**
 * Remove ligações da Mesa de itens apagados do quadro (âncoras `esta-em`
 * incluídas). Roda na fila, em segundo plano. `idsAtuais` é lido na hora da
 * execução, para não confundir item criado depois com órfão.
 */
export function removerLigacoesOrfasDoQuadro(
  quadroId: string,
  idsAtuais: () => ReadonlySet<string>,
): Promise<void> {
  fila = fila
    .then(async () => {
      const c = campanhaAtiva.value;
      if (!c) return;
      const r = obterRepositorio();
      const todas = await r.listarLigacoes(c.id);
      const alvo = ligacoesOrfasDoQuadro(todas, quadroId, idsAtuais());
      if (alvo.length === 0) return;
      for (const l of alvo) {
        await r.removerLigacao(l.id);
      }
      await atualizar();
    })
    .catch((erro) => {
      console.warn('Mesa: erro ao limpar ligações órfãs do quadro', erro);
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

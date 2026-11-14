import type { Entidade } from '#mesa';
import type { PacoteDeCena } from './cenas.ts';
import { analisarMarcadores } from './marcadores.ts';
import { molduraQueContem, type ItemMoldura } from './molduras.ts';
import { entidadePorNome, resolver } from './notas.ts';
import { textoPuro, type Item } from './quadro.ts';

export type Pendencia =
  | { tipo: 'sem-mapa'; cenaId: string }
  | { tipo: 'momento-sem-mapa'; cenaId: string }
  | { tipo: 'trilha-incompleta'; cenaId: string; faltando: number; total: number }
  | { tipo: 'trilha-desconhecida'; cenaId: string }          // a Jukebox não respondeu
  | { tipo: 'documento-nao-entregue'; cenaId: string; entidadeId: string; nome: string }
  | { tipo: 'fora-do-elenco'; cenaId: string; entidadeId: string; nome: string };

export interface FatosDaCampanha {
  documentosEntregues: ReadonlySet<string>;          // ids do banco mesa-handouts-v1
  trilhas: ReadonlyMap<string, { total: number; faltando: number } | null>;   // por id da cena sonora; null = sem resposta
  elenco: readonly string[] | undefined;             // Campanha.elenco (undefined = elenco não definido)
}

/**
 * Avalia as pendências de preparação para uma cena.
 * - 'fora-do-elenco' vale só para participantes personagens quando elenco !== undefined.
 * - Ameaças nunca geram pendência.
 */
export function pendenciasDaCena(pacote: PacoteDeCena, fatos: FatosDaCampanha): Pendencia[] {
  const pendencias: Pendencia[] = [];

  // Mapa e Momento
  if (!pacote.mapa) {
    if (pacote.momento) {
      pendencias.push({ tipo: 'momento-sem-mapa', cenaId: pacote.cenaId });
    } else {
      pendencias.push({ tipo: 'sem-mapa', cenaId: pacote.cenaId });
    }
  }

  // Trilha sonora
  if (pacote.trilha) {
    const infoTrilha = fatos.trilhas.get(pacote.trilha.ref.id);
    if (infoTrilha === null || infoTrilha === undefined) {
      pendencias.push({ tipo: 'trilha-desconhecida', cenaId: pacote.cenaId });
    } else if (infoTrilha.faltando > 0) {
      pendencias.push({
        tipo: 'trilha-incompleta',
        cenaId: pacote.cenaId,
        faltando: infoTrilha.faltando,
        total: infoTrilha.total,
      });
    }
  }

  // Documentos / Pistas
  for (const pista of pacote.pistas) {
    const docId = pista.ref.id;
    if (!fatos.documentosEntregues.has(docId)) {
      pendencias.push({
        tipo: 'documento-nao-entregue',
        cenaId: pacote.cenaId,
        entidadeId: pista.entidade?.id ?? pista.ref.id,
        nome: pista.entidade?.nome ?? pista.ref.id,
      });
    }
  }

  // Participantes / Elenco
  if (fatos.elenco !== undefined) {
    const noElenco = new Set(fatos.elenco);
    for (const participante of pacote.participantes) {
      if (participante.ehAmeaca) continue; // ameaças nunca geram pendência
      const entidadeId = participante.entidade?.id ?? (participante.ref.app === 'mesa' ? participante.ref.id : undefined);
      if (entidadeId && !noElenco.has(entidadeId)) {
        pendencias.push({
          tipo: 'fora-do-elenco',
          cenaId: pacote.cenaId,
          entidadeId,
          nome: participante.entidade?.nome ?? participante.ref.id,
        });
      }
    }
  }

  return pendencias;
}

/**
 * Avalia as pendências de preparação de todas as cenas da sessão.
 */
export function pendenciasDaSessao(pacotes: PacoteDeCena[], fatos: FatosDaCampanha): Pendencia[] {
  const todas: Pendencia[] = [];
  for (const pacote of pacotes) {
    todas.push(...pendenciasDaCena(pacote, fatos));
  }
  return todas;
}

export type PendenciaDoQuadro =
  | { tipo: 'rever-em-aberto'; quadroId: string; itemId: string; trecho: string }
  | { tipo: 'item-em-revisao'; quadroId: string; itemId: string; trecho: string }
  | { tipo: 'ligacao-sem-destino'; quadroId: string; itemId: string; destino: string }
  | { tipo: 'fala-sem-entidade'; quadroId: string; itemId: string; nome: string }
  | { tipo: 'loot-sem-atelie'; quadroId: string; itemId: string; trecho: string };

function textoDoItemDoQuadro(item: Item): string {
  if (item.tipo === 'texto' || item.tipo === 'forma') return textoPuro(item.doc);
  if (item.tipo === 'moldura') return item.titulo;
  if (item.tipo === 'seta') return item.rotulo;
  return '';
}

export function pendenciasDoQuadro(
  itens: readonly Item[],
  entidades: readonly Entidade[],
  opts?: { molduraId?: string | null },
): PendenciaDoQuadro[] {
  const pendencias: PendenciaDoQuadro[] = [];
  const molduras = itens.filter((i): i is ItemMoldura => i.tipo === 'moldura');
  const filtroMoldura = opts?.molduraId ?? null;

  const molduraDoItem = (it: Item): string | null => {
    if (it.tipo === 'moldura') return it.id;
    return it.molduraId ?? molduraQueContem(it, molduras)?.id ?? null;
  };

  for (const item of itens) {
    const mId = molduraDoItem(item);
    if (filtroMoldura && item.id !== filtroMoldura && mId !== filtroMoldura) {
      continue;
    }

    const texto = textoDoItemDoQuadro(item);
    const trecho = texto.replace(/\s+/g, ' ').trim().slice(0, 80) || item.id;
    const trechos = texto ? analisarMarcadores(texto) : [];

    if (item.revisao !== undefined) {
      pendencias.push({
        tipo: 'item-em-revisao',
        quadroId: item.quadroId,
        itemId: item.id,
        trecho,
      });
    }

    let temRever = false;
    let temFalaMarcador = false;
    let temLootMarcador = false;

    for (const t of trechos) {
      if (t.tipo === 'ligacao') {
        const dest = resolver(t.alvo, entidades);
        if (dest.tipo === 'sem-destino') {
          pendencias.push({
            tipo: 'ligacao-sem-destino',
            quadroId: item.quadroId,
            itemId: item.id,
            destino: dest.nome,
          });
        }
      } else if (t.tipo === 'marcador') {
        if (t.marcador.tipo === 'rever') temRever = true;
        if (t.marcador.tipo === 'loot') temLootMarcador = true;
        if (t.marcador.tipo === 'fala') {
          temFalaMarcador = true;
          if (!entidadePorNome(entidades, t.marcador.quem)) {
            pendencias.push({
              tipo: 'fala-sem-entidade',
              quadroId: item.quadroId,
              itemId: item.id,
              nome: t.marcador.quem,
            });
          }
          if (t.marcador.para && !entidadePorNome(entidades, t.marcador.para)) {
            pendencias.push({
              tipo: 'fala-sem-entidade',
              quadroId: item.quadroId,
              itemId: item.id,
              nome: t.marcador.para,
            });
          }
        }
      }
    }

    if (temRever && !item.feito) {
      pendencias.push({
        tipo: 'rever-em-aberto',
        quadroId: item.quadroId,
        itemId: item.id,
        trecho,
      });
    }

    const semantica = 'semantica' in item ? item.semantica : null;
    if (semantica === 'fala' && !temFalaMarcador) {
      const mFala = /^([^:\n]{1,50}):/.exec(texto.trim());
      const nome = mFala?.[1]?.trim() ?? '';
      if (nome && !entidadePorNome(entidades, nome)) {
        pendencias.push({
          tipo: 'fala-sem-entidade',
          quadroId: item.quadroId,
          itemId: item.id,
          nome,
        });
      }
    }

    if ((semantica === 'loot' || temLootMarcador) && /\bHANDOUT\b/i.test(texto)) {
      const temAtelie = itens.some(
        (outro) =>
          outro.tipo === 'ref' &&
          outro.ref.app === 'atelie' &&
          molduraDoItem(outro) === mId,
      );
      if (!temAtelie) {
        pendencias.push({
          tipo: 'loot-sem-atelie',
          quadroId: item.quadroId,
          itemId: item.id,
          trecho,
        });
      }
    }
  }

  return pendencias;
}

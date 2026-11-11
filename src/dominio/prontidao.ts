import type { PacoteDeCena } from './cenas.ts';

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

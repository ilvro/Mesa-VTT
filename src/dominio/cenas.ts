import { mesmaRef, type Entidade, type Ligacao, type Ref } from '#mesa';
import { refDaEntidade } from './notas.ts';
import { semAcento } from './entidades.ts';

export interface ItemVinculado {
  ref: Ref;
  entidade?: Entidade;
  ligacaoId: string;
}

export interface ParticipanteCena extends ItemVinculado {
  ehAmeaca: boolean;
}

export interface PacoteDeCena {
  cenaId: string;
  mapa: ItemVinculado | null;
  trilha: ItemVinculado | null;
  participantes: ParticipanteCena[];
  pistas: ItemVinculado[];
}

/** Localiza qual entidade da campanha uma referência representa. */
export function entidadePorRef(ref: Ref, entidades: readonly Entidade[]): Entidade | undefined {
  if (ref.app === 'mesa' && ref.tipo === 'entidade') {
    const achada = entidades.find(e => e.id === ref.id);
    if (achada) return achada;
  }
  return entidades.find(e => e.refs.some(r => mesmaRef(r, ref)));
}

/** Retorna a referência canônica para ligação (prioriza a referência do aplicativo dono; fallback para Ref da Mesa). */
export function refParaLigacao(e: Entidade): Ref {
  const externa = e.refs.find(r => r.app !== 'mesa');
  if (externa) return externa;
  return refDaEntidade(e.id);
}

export const casaCena = (refAlvo: Ref, cena: Entidade, refCena: Ref): boolean =>
  mesmaRef(refAlvo, refCena) || cena.refs.some(r => mesmaRef(r, refAlvo));

/**
 * Lê e organiza todas as ligações de uma cena a partir do banco da campanha:
 * - Mapa/Cômodo: ligação `esta-em` da cena para o mapa do Atlas.
 * - Trilha Sonora: ligação `toca-em` da cena para a cena sonora do Jukebox.
 * - Participantes (Ameaças & Personagens): ligações `aparece-em` da ficha para a cena.
 * - Pistas: ligações `revela` da cena para o documento do Ateliê.
 */
export function extrairPacoteDeCena(
  cena: Entidade,
  entidades: readonly Entidade[],
  ligacoes: readonly Ligacao[],
): PacoteDeCena {
  const refCena = refDaEntidade(cena.id);

  let mapa: ItemVinculado | null = null;
  let trilha: ItemVinculado | null = null;
  const participantes: ParticipanteCena[] = [];
  const pistas: ItemVinculado[] = [];

  for (const l of ligacoes) {
    if (l.tipo === 'esta-em' && casaCena(l.de, cena, refCena)) {
      const entidade = entidadePorRef(l.para, entidades);
      mapa = { ref: l.para, entidade, ligacaoId: l.id };
    } else if (l.tipo === 'toca-em' && casaCena(l.de, cena, refCena)) {
      const entidade = entidadePorRef(l.para, entidades);
      trilha = { ref: l.para, entidade, ligacaoId: l.id };
    } else if (l.tipo === 'aparece-em' && casaCena(l.para, cena, refCena)) {
      const entidade = entidadePorRef(l.de, entidades);
      const ehAmeaca = entidade?.tipo === 'ameaca' || semAcento(l.de.id).includes('ameaca');
      participantes.push({ ref: l.de, entidade, ehAmeaca, ligacaoId: l.id });
    } else if (l.tipo === 'revela' && casaCena(l.de, cena, refCena)) {
      const entidade = entidadePorRef(l.para, entidades);
      pistas.push({ ref: l.para, entidade, ligacaoId: l.id });
    }
  }

  // Ordena participantes: personagens primeiro, depois ameaças, e por nome
  participantes.sort((a, b) => {
    if (a.ehAmeaca !== b.ehAmeaca) return a.ehAmeaca ? 1 : -1;
    const nomeA = a.entidade?.nome ?? a.ref.id;
    const nomeB = b.entidade?.nome ?? b.ref.id;
    return semAcento(nomeA).localeCompare(semAcento(nomeB), 'pt-BR');
  });

  return { cenaId: cena.id, mapa, trilha, participantes, pistas };
}

/** Lugares disponíveis para vincular como mapa da cena. */
export function candidatosDeMapa(entidades: readonly Entidade[]): Entidade[] {
  return entidades
    .filter(e => e.tipo === 'lugar')
    .sort((a, b) => semAcento(a.nome).localeCompare(semAcento(b.nome), 'pt-BR'));
}

/** Cenas sonoras ou efeitos do Jukebox para vincular como trilha da cena. */
export function candidatosDeTrilha(entidades: readonly Entidade[]): Entidade[] {
  return entidades
    .filter(e => e.refs.some(r => r.app === 'jukebox') || (e.tipo === 'cena' && e.criadaPor === 'jukebox') || e.tipo === 'efeito')
    .sort((a, b) => semAcento(a.nome).localeCompare(semAcento(b.nome), 'pt-BR'));
}

/** Personagens e Ameaças para vincular como participantes do encontro. */
export function candidatosDeParticipantes(
  entidades: readonly Entidade[],
  participantesAtuais: readonly ParticipanteCena[] = [],
): Entidade[] {
  const ligados = new Set(participantesAtuais.map(p => p.entidade?.id).filter((id): id is string => Boolean(id)));
  return entidades
    .filter(e => (e.tipo === 'personagem' || e.tipo === 'ameaca') && !ligados.has(e.id))
    .sort((a, b) => {
      if (a.tipo !== b.tipo) return a.tipo === 'personagem' ? -1 : 1;
      return semAcento(a.nome).localeCompare(semAcento(b.nome), 'pt-BR');
    });
}

/** Pistas para vincular como reveladas na cena. */
export function candidatosDePistas(
  entidades: readonly Entidade[],
  pistasAtuais: readonly ItemVinculado[] = [],
): Entidade[] {
  const ligadas = new Set(pistasAtuais.map(p => p.entidade?.id).filter((id): id is string => Boolean(id)));
  return entidades
    .filter(e => (e.tipo === 'pista' || e.refs.some(r => r.app === 'atelie')) && !ligadas.has(e.id))
    .sort((a, b) => semAcento(a.nome).localeCompare(semAcento(b.nome), 'pt-BR'));
}

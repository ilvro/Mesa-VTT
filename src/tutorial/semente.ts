import type { TipoEntidade } from '#mesa';
import type { TipoSemantico } from '../dominio/quadro.ts';

/**
 * O que a campanha de treino leva para a lição começar com o que ela precisa (puro: quem planta é `app/tutoriais.ts`).
 * Posições de itens que trazem `molduraDe` são relativas ao canto da moldura; as outras são do quadro.
 */
export interface ItemDaSemente {
  tipo: 'moldura' | 'nota' | 'texto' | 'ref';
  x: number;
  y: number;
  largura?: number;
  altura?: number;
  /** Moldura: o título. */
  titulo?: string;
  /** Nota e texto: o conteúdo (com marcadores, se a lição os usa). */
  texto?: string;
  /** Ref: o nome de uma entidade da própria semente. */
  entidade?: string;
  /** Como chegou do Miro, com revisão pendente. */
  revisao?: { tipoSugerido: TipoSemantico | null; motivos: string[]; origem: 'miro' };
  /** O título da moldura da semente que contém este item. */
  molduraDe?: string;
}

export interface Semente {
  entidades?: { tipo: TipoEntidade; nome: string; notas?: string }[];
  quadro?: { nome: string; itens?: ItemDaSemente[] };
  /** A tela em que a lição começa (padrão: Campanha). */
  tela?: string;
  /** Deixa o quadro da semente aberto (só aparece quando a pessoa vai à aba Quadros). */
  abrirQuadro?: boolean;
}

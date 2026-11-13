import type { IdFonte } from './quadro.ts';

export type CategoriaFonte =
  | 'sem-serifa'
  | 'serifa'
  | 'decorativa'
  | 'manuscrita'
  | 'mono';

export interface InfoFonte {
  nome: string;
  familia: string;
  categoria: CategoriaFonte;
}

const RESERVA: Record<CategoriaFonte, string> = {
  'sem-serifa': 'sans-serif',
  serifa: 'Georgia, serif',
  decorativa: 'Georgia, serif',
  manuscrita: 'cursive',
  mono: 'monospace',
};

export const FONTES: Record<IdFonte, InfoFonte> = {
  'open-sans': {
    nome: 'Open Sans',
    familia: "'Open Sans'",
    categoria: 'sem-serifa',
  },
  'pt-serif': {
    nome: 'PT Serif',
    familia: "'PT Serif'",
    categoria: 'serifa',
  },
  hanken: {
    nome: 'Hanken Grotesk',
    familia: "'Hanken Grotesk Variable', 'Hanken Grotesk'",
    categoria: 'sem-serifa',
  },
  cinzel: {
    nome: 'Cinzel',
    familia: "'Cinzel'",
    categoria: 'decorativa',
  },
  caveat: {
    nome: 'Caveat',
    familia: "'Caveat'",
    categoria: 'manuscrita',
  },
  'jetbrains-mono': {
    nome: 'JetBrains Mono',
    familia: "'JetBrains Mono'",
    categoria: 'mono',
  },
};

export function familiaCss(id: IdFonte): string {
  const info = FONTES[id];
  return `${info.familia}, ${RESERVA[info.categoria]}`;
}

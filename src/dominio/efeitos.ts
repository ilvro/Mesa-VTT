import type { Campanha, Entidade, Sessao } from '#mesa';

export type Efeito =
  | { tipo: 'criou-entidade'; id: string }
  | { tipo: 'alterou-entidade'; antes: Entidade } // a versão anterior inteira
  | { tipo: 'criou-ligacao'; id: string }
  | { tipo: 'criou-sessao'; id: string }
  | { tipo: 'alterou-sessao'; antes: Sessao }
  | { tipo: 'alterou-campanha'; antes: Campanha }; // p.ex. o elenco

export interface Chamada {
  id: string;
  ferramenta: string;
  quando: number;
  resumo: string;
  efeitos: Efeito[];
  desfeita: boolean;
}

export interface RelatorioDesfazer {
  ok: boolean;
  chamadaId: string;
  desfeitos: string[];
  conflitos: string[];
}

export function entidadesAfetadas(c: Chamada): string[] {
  const ids: string[] = [];
  for (const e of c.efeitos) {
    if (e.tipo === 'criou-entidade') ids.push(e.id);
    else if (e.tipo === 'alterou-entidade') ids.push(e.antes.id);
  }
  return [...new Set(ids)];
}


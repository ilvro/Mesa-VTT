import type { ResumoParaOMapa } from './mapa-do-quadro.ts';
import type { Item } from './quadro.ts';
import { assinaturaDaSecao, type Secao } from './secoes-do-quadro.ts';

/**
 * Resumos de seção e descrições de imagem guardados com a assinatura do conteúdo na hora
 * em que foram escritos. Puro: o banco e a ponte ficam em `src/app`.
 */

export const MAX_RESUMO_DA_SECAO = 400;
export const MAX_DESCRICAO_DA_IMAGEM = 600;

export type AutorDoResumo = 'assistente' | 'mestre';

export interface ResumoGuardado {
  /** Id da seção (moldura, `ilha:<id>`, `soltos:<cx>,<cy>`) ou `item:<id>` (descrição de imagem). */
  alvo: string;
  texto: string;
  assinatura: string;
  autor: AutorDoResumo;
  /** Quando foi gravado (ms). */
  em: number;
}

export interface RegistroResumo extends ResumoGuardado {
  quadroId: string;
}

export const alvoDaImagem = (itemId: string): string => `item:${itemId}`;

/** Assinatura de uma descrição de imagem: o próprio `imagemId` (a descrição vale para aquela imagem). */
export function assinaturaDaImagem(item: Extract<Item, { tipo: 'imagem' }>): string {
  return item.imagemId;
}

/** A assinatura atual de um alvo, ou null se ele não existe mais. */
export function assinaturaDoAlvo(alvo: string, secoes: readonly Secao[], itens: readonly Item[]): string | null {
  if (alvo.startsWith('item:')) {
    const id = alvo.slice(5);
    const it = itens.find((i) => i.id === id);
    return it && it.tipo === 'imagem' ? assinaturaDaImagem(it) : null;
  }
  const s = secoes.find((x) => x.id === alvo);
  return s ? assinaturaDaSecao(s, itens) : null;
}

/** Resumos para o `mapaDoQuadro` (marcando os desatualizados) e descrições de imagem por id de item. */
export function resumosParaOMapa(
  registros: readonly ResumoGuardado[],
  secoes: readonly Secao[],
  itens: readonly Item[],
): { resumos: Map<string, ResumoParaOMapa>; descricoes: Map<string, string> } {
  const resumos = new Map<string, ResumoParaOMapa>();
  const descricoes = new Map<string, string>();
  for (const r of registros) {
    const atual = assinaturaDoAlvo(r.alvo, secoes, itens);
    if (atual === null) continue; // alvo que não existe mais
    resumos.set(r.alvo, { texto: r.texto, desatualizado: atual !== r.assinatura, autor: r.autor });
    if (r.alvo.startsWith('item:')) descricoes.set(r.alvo.slice(5), r.texto);
  }
  return { resumos, descricoes };
}

/** Lê o campo `resumos` de um pacote; ignora com cuidado o que não tem o formato (pacote de outra versão). */
export function lerResumosDoPacote(bruto: unknown): ResumoGuardado[] {
  if (!Array.isArray(bruto)) return [];
  const saida: ResumoGuardado[] = [];
  for (const r of bruto) {
    if (!r || typeof r !== 'object') continue;
    const o = r as Record<string, unknown>;
    if (typeof o.alvo !== 'string' || typeof o.texto !== 'string' || typeof o.assinatura !== 'string') continue;
    if (o.autor !== 'assistente' && o.autor !== 'mestre') continue;
    const limite = o.alvo.startsWith('item:') ? MAX_DESCRICAO_DA_IMAGEM : MAX_RESUMO_DA_SECAO;
    saida.push({
      alvo: o.alvo,
      texto: o.texto.slice(0, limite),
      assinatura: o.assinatura,
      autor: o.autor,
      em: typeof o.em === 'number' && Number.isFinite(o.em) ? o.em : 0,
    });
  }
  return saida;
}

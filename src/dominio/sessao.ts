import type { Entidade, Ref } from '#mesa';

/** Um mapa do Atlas que a campanha conhece: o “lugar” (entidade) e o id do mapa (do Ref `mesa:atlas/mapa/<id>`). */
export interface MapaDaCampanha { entidadeId: string; nome: string; mapaId: string }
/** Uma personagem da campanha que tem ficha na Ficha. */
export interface PersonagemComFicha { entidadeId: string; nome: string; fichaId: string; ref: Ref }

const porNome = <T extends { nome: string }>(a: T, b: T) => a.nome.localeCompare(b.nome, 'pt-BR');

/** Os mapas do Atlas da campanha, em ordem alfabética. Um lugar com dois mapas aparece duas vezes. */
export function mapasDaCampanha(entidades: readonly Entidade[]): MapaDaCampanha[] {
  return entidades.flatMap(e => e.tipo === 'lugar' ? e.refs.filter(r => r.app === 'atlas' && r.tipo === 'mapa').map(r => ({ entidadeId: e.id, nome: e.nome, mapaId: r.id })) : []).sort(porNome);
}

/** As personagens que têm ficha (Ref `mesa:ficha/ficha/<id>`), em ordem alfabética. */
export function personagensComFicha(entidades: readonly Entidade[]): PersonagemComFicha[] {
  return entidades.flatMap(e => {
    if (e.tipo !== 'personagem') return [];
    const ref = e.refs.find(r => r.app === 'ficha' && r.tipo === 'ficha');
    return ref ? [{ entidadeId: e.id, nome: e.nome, fichaId: ref.id, ref }] : [];
  }).sort(porNome);
}

/**
 * As fichas que ficam em abas: as escolhidas (por id de ficha) que ainda existem, na ordem da lista; `null` (nada escolhido ainda) é “todas”.
 */
export function fichasDaSessao(personagens: readonly PersonagemComFicha[], escolhidas: readonly string[] | null): PersonagemComFicha[] {
  return escolhidas === null ? [...personagens] : personagens.filter(p => escolhidas.includes(p.fichaId));
}

/** A aba ativa: a pedida, se ainda existe; senão a primeira. */
export const fichaAtiva = (fichas: readonly PersonagemComFicha[], pedida: string | null): PersonagemComFicha | null => fichas.find(f => f.fichaId === pedida) ?? fichas[0] ?? null;

/** Endereços dos painéis. `base` é o endereço do aplicativo (termina em `/`). */
export const enderecoDoAtlas = (base: string, mapaId: string | null): string => `${base}?embutido=1${mapaId ? `#/mapa/${encodeURIComponent(mapaId)}` : ''}`;
export const enderecoDaFicha = (base: string, fichaId: string): string => `${base}?ficha=${encodeURIComponent(fichaId)}`;

/** O que a sessão lembra por campanha (no navegador): o mapa, as fichas em abas e a aba ativa. */
export interface EscolhasDaSessao { mapaId: string | null; fichas: string[] | null; ativa: string | null }
export const ESCOLHAS_VAZIAS: EscolhasDaSessao = { mapaId: null, fichas: null, ativa: null };

export function lerEscolhas(bruto: unknown): EscolhasDaSessao {
  if (!bruto || typeof bruto !== 'object') return ESCOLHAS_VAZIAS;
  const o = bruto as Record<string, unknown>, texto = (v: unknown) => (typeof v === 'string' && v.length > 0 ? v : null);
  return {
    mapaId: texto(o.mapaId),
    fichas: Array.isArray(o.fichas) ? o.fichas.filter((x): x is string => typeof x === 'string' && x.length > 0) : null,
    ativa: texto(o.ativa),
  };
}

/** O mapa escolhido, se ainda existe na campanha; senão o primeiro; senão nenhum. */
export const mapaEscolhido = (mapas: readonly MapaDaCampanha[], escolhido: string | null): MapaDaCampanha | null => mapas.find(m => m.mapaId === escolhido) ?? mapas[0] ?? null;


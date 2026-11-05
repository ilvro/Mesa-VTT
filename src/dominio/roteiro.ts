import { chaveDaRef, mesmaRef, type AppId, type Entidade, type Ref } from '#mesa';
import { NOME_DO_APP, NOME_DO_TIPO_DE_REF } from './entidades.ts';

/** O roteiro da sessão: uma lista ordenada de Refs (mapas, cenas sonoras, documentos, fichas). */
export const MAXIMO_DO_ROTEIRO = 64;

/** Os tipos de Ref que o roteiro sabe abrir em cada aplicativo. */
const ABRIVEIS: Readonly<Partial<Record<AppId, readonly string[]>>> = { atlas: ['mapa', 'comodo'], ficha: ['ficha'], atelie: ['documento'], jukebox: ['cena-sonora', 'efeito'] };
export const ehAbrivel = (r: Ref): boolean => ABRIVEIS[r.app]?.includes(r.tipo) ?? false;

export interface Candidato { nome: string; ref: Ref }

/** O que dá para pôr no roteiro: cada Ref abrível das entidades da campanha, com o nome da entidade. Em ordem alfabética. */
export function candidatos(entidades: readonly Entidade[]): Candidato[] {
  return entidades.flatMap(e => e.refs.filter(ehAbrivel).map(ref => ({ nome: e.nome, ref }))).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR') || chaveDaRef(a.ref).localeCompare(chaveDaRef(b.ref)));
}

export const adicionar = (roteiro: readonly Ref[], r: Ref): Ref[] => (roteiro.length >= MAXIMO_DO_ROTEIRO || roteiro.some(x => mesmaRef(x, r)) ? [...roteiro] : [...roteiro, r]);
export const removerItem = (roteiro: readonly Ref[], i: number): Ref[] => roteiro.filter((_, n) => n !== i);
export function mover(roteiro: readonly Ref[], i: number, delta: -1 | 1): Ref[] {
  const j = i + delta, copia = [...roteiro];
  if (i < 0 || i >= copia.length || j < 0 || j >= copia.length) return copia;
  [copia[i], copia[j]] = [copia[j]!, copia[i]!];
  return copia;
}

/** O nome de um Ref para mostrar: o da entidade que o tem, ou “Atlas · mapa” se a campanha não o conhece. */
export function nomeDoRef(entidades: readonly Entidade[], r: Ref): string {
  return entidades.find(e => e.refs.some(x => mesmaRef(x, r)))?.nome ?? `${NOME_DO_APP[r.app]} · ${NOME_DO_TIPO_DE_REF[r.tipo] ?? r.tipo}`;
}
export const ondeEstaORef = (r: Ref): string => `${NOME_DO_APP[r.app]} · ${NOME_DO_TIPO_DE_REF[r.tipo] ?? r.tipo}`;

/** As notas por item guardam-se por chave do Ref; item que saiu do roteiro leva a nota junto. */
export function podarNotas(notas: Readonly<Record<string, string>>, roteiro: readonly Ref[]): Record<string, string> {
  const vivas = new Set(roteiro.map(chaveDaRef));
  return Object.fromEntries(Object.entries(notas).filter(([k, v]) => vivas.has(k) && v.trim()));
}

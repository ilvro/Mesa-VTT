import { signal } from '@preact/signals';
import { selecionadaId } from './campanha.ts';

export type Tela = 'entidades' | 'campanhas' | 'aplicativos' | 'sessao';
export const tela = signal<Tela>('entidades');

/** `#/entidade/<id>` é o link profundo do manifesto (`mesa.json`). */
const ENTIDADE = /^#\/entidade\/(.+)$/;

export function lerHash(): void {
  const m = ENTIDADE.exec(decodeURIComponent(location.hash));
  if (m) { selecionadaId.value = m[1]!; tela.value = 'entidades'; }
}

export function abrirEntidade(id: string | null): void {
  selecionadaId.value = id;
  const alvo = id ? `#/entidade/${encodeURIComponent(id)}` : location.pathname + location.search;
  try { if (id) history.replaceState(null, '', alvo); else history.replaceState(null, '', alvo); } catch { /* ignora */ }
}

export function iniciarRotas(): () => void {
  lerHash();
  window.addEventListener('hashchange', lerHash);
  return () => window.removeEventListener('hashchange', lerHash);
}

import { signal } from '@preact/signals';
import { registrarSelecaoNoHistorico, selecionadaId } from './campanha.ts';

export type Tela = 'entidades' | 'campanhas' | 'aplicativos' | 'sessao';
export const tela = signal<Tela>('entidades');

/** `#/entidade/<id>` é o link profundo do manifesto (`mesa.json`). */
const ENTIDADE = /^#\/entidade\/(.+)$/;

export function lerHash(): void {
  const hash = decodeURIComponent(location.hash);
  if (hash === '#/campanhas') {
    tela.value = 'campanhas';
    return;
  }
  const m = ENTIDADE.exec(hash);
  if (m) {
    selecionadaId.value = m[1]!;
    registrarSelecaoNoHistorico(m[1]!);
    tela.value = 'entidades';
  }
}

export function abrirEntidade(id: string | null): void {
  selecionadaId.value = id;
  registrarSelecaoNoHistorico(id);
  const alvo = id ? `#/entidade/${encodeURIComponent(id)}` : location.pathname + location.search;
  try { if (id) history.replaceState(null, '', alvo); else history.replaceState(null, '', alvo); } catch { /* ignora */ }
}

export function iniciarRotas(): () => void {
  lerHash();
  window.addEventListener('hashchange', lerHash);
  return () => window.removeEventListener('hashchange', lerHash);
}

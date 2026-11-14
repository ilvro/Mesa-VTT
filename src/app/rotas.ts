import { signal } from '@preact/signals';
import { registrarSelecaoNoHistorico, selecionadaId } from './campanha.ts';
import { abrirQuadro, fecharQuadro, itemPendente } from './quadros.ts';

export type Tela = 'entidades' | 'campanhas' | 'aplicativos' | 'sessao' | 'quadros';
export const tela = signal<Tela>('entidades');

/** `#/entidade/<id>` é o link profundo do manifesto (`mesa.json`). */
const ENTIDADE = /^#\/entidade\/(.+)$/;
const QUADRO_ITEM = /^#\/quadro\/([^/]+)\/item\/(.+)$/;
const QUADRO = /^#\/quadro\/(.+)$/;

export function lerHash(): void {
  const hash = location.hash;
  if (hash === '#/campanhas') {
    tela.value = 'campanhas';
    return;
  }
  if (hash === '#/quadros') {
    tela.value = 'quadros';
    void fecharQuadro();
    return;
  }
  const qi = QUADRO_ITEM.exec(hash);
  if (qi) {
    const quadroId = decodeURIComponent(qi[1]!);
    const itemId = decodeURIComponent(qi[2]!);
    itemPendente.value = itemId;
    tela.value = 'quadros';
    void abrirQuadro(quadroId);
    return;
  }
  const q = QUADRO.exec(hash);
  if (q) {
    const quadroId = decodeURIComponent(q[1]!);
    itemPendente.value = null;
    tela.value = 'quadros';
    void abrirQuadro(quadroId);
    return;
  }
  const m = ENTIDADE.exec(decodeURIComponent(hash));
  if (m) {
    selecionadaId.value = m[1]!;
    registrarSelecaoNoHistorico(m[1]!);
    tela.value = 'entidades';
  }
}

export function abrirEntidade(id: string | null): void {
  selecionadaId.value = id;
  registrarSelecaoNoHistorico(id);
  if (id) tela.value = 'entidades';
  const alvo = id ? `#/entidade/${encodeURIComponent(id)}` : location.pathname + location.search;
  try { history.replaceState(null, '', alvo); } catch { /* ignora */ }
}

export function navegarParaQuadro(id: string | null): void {
  tela.value = 'quadros';
  const alvo = id ? `#/quadro/${encodeURIComponent(id)}` : '#/quadros';
  try { history.replaceState(null, '', alvo); } catch { /* ignora */ }
}

export function navegarParaItemNoQuadro(quadroId: string, itemId: string): void {
  itemPendente.value = itemId;
  tela.value = 'quadros';
  void abrirQuadro(quadroId);
  const alvo = `#/quadro/${encodeURIComponent(quadroId)}/item/${encodeURIComponent(itemId)}`;
  try { history.replaceState(null, '', alvo); } catch { /* ignora */ }
}

export function iniciarRotas(): () => void {
  lerHash();
  window.addEventListener('hashchange', lerHash);
  return () => window.removeEventListener('hashchange', lerHash);
}

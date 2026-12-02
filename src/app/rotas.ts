import { signal } from '@preact/signals';
import { registrarSelecaoNoHistorico, selecionadaId } from './campanha.ts';
import { abrirQuadro, fecharQuadro, itemPendente, quadroAberto } from './quadros.ts';

export type Tela = 'entidades' | 'campanhas' | 'aplicativos' | 'sessao' | 'quadros' | 'online' | 'aprender';
export const tela = signal<Tela>('entidades');
/** `#/projecao/<quadroId>`: esta janela é a projeção para os jogadores (sem cabeçalho, só a moldura enviada). */
export const projecaoQuadroId = signal<string | null>(null);
const PROJECAO = /^#\/projecao\/([^/]+)$/;
/** `#/jogar/<salaId>`: a casca do jogador (tela cheia, sem a navegação da Mesa). */
export const jogarSalaId = signal<string | null>(null);
const JOGAR = /^#\/jogar\/([A-Za-z0-9_-]{1,64})$/;
/** `#/telao` ou `#/telao?mapa=<id>` ou `#/telao/<id>`: telão local presencial (TV / 2º monitor). */
export const telaoLocal = signal<{ ativo: boolean; mapaId: string | null }>({ ativo: false, mapaId: null });
const TELAO = /^#\/telao(?:\/([^/?#]+))?(?:\?([^#]*))?$/;

/** `#/entidade/<id>` é o link profundo do manifesto (`mesa.json`). */
const ENTIDADE = /^#\/entidade\/(.+)$/;
const QUADRO_ITEM = /^#\/quadro\/([^/]+)\/item\/(.+)$/;
const QUADRO = /^#\/quadro\/(.+)$/;

export function lerHash(): void {
  const hash = location.hash;
  const jg = JOGAR.exec(hash);
  jogarSalaId.value = jg ? jg[1]! : null;
  if (jg) {
    telaoLocal.value = { ativo: false, mapaId: null };
    projecaoQuadroId.value = null;
    return;
  }
  const tl = TELAO.exec(hash);
  if (tl) {
    const params = tl[2] ? new URLSearchParams(tl[2]) : null;
    const mapaParam = params?.get('mapa')?.trim() || null;
    const mapaSeg = tl[1] ? decodeURIComponent(tl[1]) : null;
    telaoLocal.value = { ativo: true, mapaId: mapaParam ?? mapaSeg };
    projecaoQuadroId.value = null;
    return;
  }
  telaoLocal.value = { ativo: false, mapaId: null };
  const pj = PROJECAO.exec(hash);
  projecaoQuadroId.value = pj ? decodeURIComponent(pj[1]!) : null;
  if (pj) return;
  if (hash === '#/online') {
    tela.value = 'online';
    return;
  }
  if (hash === '#/aprender') {
    tela.value = 'aprender';
    return;
  }
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
    if (quadroAberto.value?.id !== quadroId) void abrirQuadro(quadroId, itemId);
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
  if (quadroAberto.value?.id !== quadroId) void abrirQuadro(quadroId, itemId);
  const alvo = `#/quadro/${encodeURIComponent(quadroId)}/item/${encodeURIComponent(itemId)}`;
  try { history.replaceState(null, '', alvo); } catch { /* ignora */ }
}

export function iniciarRotas(): () => void {
  lerHash();
  window.addEventListener('hashchange', lerHash);
  return () => window.removeEventListener('hashchange', lerHash);
}

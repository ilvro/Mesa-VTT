/**
 * Lógica pura do feed de rolagens da casca do jogador (R9): lê o envelope `ficha.rolagem`, guarda as 5 mais novas e as faz sumir depois de
 * 8 s. Sem DOM nem relógio próprio: o relógio e o agendamento entram por parâmetro.
 */
import type { Envelope, Eu } from './protocolo.ts';
import { urlDoAvatarDiscord } from './saguao.ts';

export const MAX_NO_FEED = 5;
export const VIDA_NO_FEED_MS = 8000;

/** Destaque só de cor, igual ao do Atlas (`tomDaRolagem`): o dado sem o modificador, 19 ou mais é alto, 2 ou menos é baixo. */
export type TomDaRolagem = 'alto' | 'baixo' | 'normal';
export function tomDaRolagem(total: number, modificador = 0): TomDaRolagem {
  const bruto = total - modificador;
  return bruto >= 19 ? 'alto' : bruto <= 2 ? 'baixo' : 'normal';
}

export interface RolagemDoFeed {
  id: string;
  em: number;
  /** Nome de quem rolou (o `autor` carimbado pela sala); vazio se o envelope não traz. */
  autor: string;
  /** `discordId` de quem rolou (o `autor` carimbado pela sala), quando disponível. */
  autorId?: string;
  /** Hash ou URL do avatar do Discord de quem rolou, quando disponível. */
  autorAvatar?: string | null;
  /** Id da ficha (o Ref `dados.ficha`), para achar o retrato. */
  fichaId: string;
  titulo: string;
  total: number;
  modificador?: number;
  tom: TomDaRolagem;
}

const ehObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Um envelope `ficha.rolagem` vira a rolagem do feed; qualquer outra coisa, `null`. */
export function lerRolagem(envelope: unknown): RolagemDoFeed | null {
  if (!ehObj(envelope) || envelope.tipo !== 'ficha.rolagem' || typeof envelope.id !== 'string') return null;
  const d = envelope.dados;
  if (!ehObj(d) || typeof d.titulo !== 'string' || typeof d.total !== 'number' || !Number.isFinite(d.total)) return null;
  const ref = ehObj(d.ficha) ? d.ficha : null;
  const mod = typeof d.modificador === 'number' && Number.isFinite(d.modificador) ? d.modificador : undefined;
  const autorObj = ehObj(envelope.autor) ? envelope.autor : null;
  const autor = autorObj && typeof autorObj.nome === 'string' ? autorObj.nome : '';
  const autorId = autorObj && typeof autorObj.discordId === 'string' && autorObj.discordId ? autorObj.discordId : undefined;
  const autorAvatar = autorObj && (typeof autorObj.avatar === 'string' || autorObj.avatar === null) ? autorObj.avatar : undefined;
  return {
    id: envelope.id,
    em: typeof envelope.em === 'number' && Number.isFinite(envelope.em) ? envelope.em : 0,
    autor,
    ...(autorId !== undefined ? { autorId } : {}),
    ...(autorAvatar !== undefined ? { autorAvatar } : {}),
    fichaId: ref && typeof ref.id === 'string' ? ref.id : '',
    titulo: d.titulo,
    total: d.total,
    ...(mod !== undefined ? { modificador: mod } : {}),
    tom: tomDaRolagem(d.total, mod ?? 0),
  };
}

/** Mapa `discordId -> URL do avatar do Discord` a partir dos membros da sala e de `eu`. */
export function mapaDeAvatares(
  membros: readonly Pick<Eu, 'discordId' | 'avatar'>[],
  eu?: Pick<Eu, 'discordId' | 'avatar'> | null,
  baseAvatar?: string,
  tamanho = 64,
): Record<string, string> {
  const mapa: Record<string, string> = {};
  if (eu) {
    const url = urlDoAvatarDiscord(eu.discordId, eu.avatar, tamanho, baseAvatar);
    if (url) mapa[eu.discordId] = url;
  }
  for (const m of membros) {
    const url = urlDoAvatarDiscord(m.discordId, m.avatar, tamanho, baseAvatar);
    if (url) mapa[m.discordId] = url;
  }
  return mapa;
}

/** Resolve a URL do avatar do Discord para uma rolagem (priorizando o membro atual e caindo para o `autorAvatar` carimbado). */
export function avatarDaRolagem(
  r: Pick<RolagemDoFeed, 'autorId' | 'autorAvatar'>,
  avataresPorId: Readonly<Record<string, string | null | undefined>>,
  baseAvatar?: string,
  tamanho = 64,
): string | null {
  if (!r.autorId) return null;
  const doMembro = avataresPorId[r.autorId];
  if (doMembro) return doMembro;
  return urlDoAvatarDiscord(r.autorId, r.autorAvatar, tamanho, baseAvatar);
}

/** Lê uma lista de envelopes (histórico), da mais nova para a mais antiga. Ignora o que não for rolagem. */
export function lerHistorico(envelopes: readonly Envelope[]): RolagemDoFeed[] {
  return envelopes.map(lerRolagem).filter((r): r is RolagemDoFeed => r !== null).sort((a, b) => b.em - a.em);
}

/** As iniciais para o retrato que falta: até duas letras, em maiúsculas. */
export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '?';
  const letras = partes.length === 1 ? [...partes[0]!].slice(0, 2) : [[...partes[0]!][0]!, [...partes[partes.length - 1]!][0]!];
  return letras.join('').toLocaleUpperCase('pt-BR');
}

export interface OpcoesDoFeed {
  /** Relógio em ms (padrão: `Date.now`). */
  agora?: () => number;
  /** Agenda uma espera e devolve o cancelamento (padrão: `setTimeout`). */
  agendar?: (f: () => void, ms: number) => () => void;
  /** Chamado quando a lista visível muda. */
  aoMudar?: (itens: RolagemDoFeed[]) => void;
}

export interface Feed {
  /** Uma rolagem nova. Repetida (mesmo `id`) é ignorada; devolve se entrou. */
  receber(r: RolagemDoFeed): boolean;
  /** As visíveis agora, da mais antiga à mais nova (por `em`), no máximo 5. */
  itens(): RolagemDoFeed[];
  fechar(): void;
}

export function criarFeed(o: OpcoesDoFeed = {}): Feed {
  const agora = o.agora ?? (() => Date.now());
  const agendar = o.agendar ?? ((f, ms) => { const t = setTimeout(f, ms); return () => clearTimeout(t); });
  let lista: Array<{ r: RolagemDoFeed; vence: number }> = [];
  const vistos = new Set<string>();
  let cancelar: (() => void) | null = null;
  let fechado = false;

  const publicar = () => o.aoMudar?.(lista.map(x => x.r));
  function expirar(): void {
    cancelar = null;
    const t = agora();
    const antes = lista.length;
    lista = lista.filter(x => x.vence > t);
    if (lista.length !== antes) publicar();
    programar();
  }
  function programar(): void {
    cancelar?.(); cancelar = null;
    if (fechado || lista.length === 0) return;
    const proximo = Math.min(...lista.map(x => x.vence));
    cancelar = agendar(expirar, Math.max(0, proximo - agora()));
  }

  return {
    receber(r) {
      if (fechado || vistos.has(r.id)) return false;
      vistos.add(r.id);
      const t = agora();
      lista = [...lista.filter(x => x.vence > t), { r, vence: t + VIDA_NO_FEED_MS }].sort((a, b) => a.r.em - b.r.em).slice(-MAX_NO_FEED);
      publicar();
      programar();
      return true;
    },
    itens() { const t = agora(); return lista.filter(x => x.vence > t).map(x => x.r); },
    fechar() { fechado = true; cancelar?.(); cancelar = null; lista = []; },
  };
}

/** Sessão assinada da sala: sem tipos do Workers, só Web Crypto (Node 22 e Workers). */

import type { Papel } from '../src/online/protocolo.ts';
export type { Papel };

export interface Sessao {
  discordId: string;
  nome: string;
  avatar: string | null;
  papel: Papel;
  /** Instante de vencimento, em ms desde a época. */
  exp: number;
}

/** A sessão vale 12 horas. */
export const SESSAO_DURACAO_MS = 12 * 60 * 60 * 1000;

const enc = new TextEncoder();
const dec = new TextDecoder();

function paraBase64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function deBase64url(texto: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]*$/.test(texto)) return null;
  try {
    const b64 = texto.replace(/-/g, '+').replace(/_/g, '/');
    const s = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

function chave(segredo: string, usos: Array<'sign' | 'verify'>): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', enc.encode(segredo), { name: 'HMAC', hash: 'SHA-256' }, false, usos);
}

/** Vencimento de uma sessão emitida em `agora` (ms). */
export function venceEm(agora: number): number {
  return agora + SESSAO_DURACAO_MS;
}

/** `base64url(json).base64url(hmacSha256)`. */
export async function assinarSessao(dados: Sessao, segredo: string): Promise<string> {
  const corpo = paraBase64url(enc.encode(JSON.stringify(dados)));
  const assinatura = await crypto.subtle.sign('HMAC', await chave(segredo, ['sign']), enc.encode(corpo));
  return `${corpo}.${paraBase64url(new Uint8Array(assinatura))}`;
}

/** Devolve a sessão se a assinatura confere (em tempo constante) e ela não venceu; senão, null. */
export async function verificarSessao(token: unknown, segredo: string, agora: number): Promise<Sessao | null> {
  if (typeof token !== 'string' || !segredo) return null;
  const partes = token.split('.');
  if (partes.length !== 2) return null;
  const [corpo, assinatura] = partes as [string, string];
  const bytesAssinatura = deBase64url(assinatura);
  const bytesCorpo = deBase64url(corpo);
  if (!bytesAssinatura || !bytesCorpo) return null;
  const ok = await crypto.subtle.verify('HMAC', await chave(segredo, ['verify']), bytesAssinatura, enc.encode(corpo));
  if (!ok) return null;
  let dados: unknown;
  try {
    dados = JSON.parse(dec.decode(bytesCorpo));
  } catch {
    return null;
  }
  if (typeof dados !== 'object' || dados === null) return null;
  const d = dados as Record<string, unknown>;
  if (
    typeof d.discordId !== 'string' ||
    typeof d.nome !== 'string' ||
    !(d.avatar === null || typeof d.avatar === 'string') ||
    (d.papel !== 'mestre' && d.papel !== 'jogador') ||
    typeof d.exp !== 'number' ||
    !(d.exp > agora)
  ) {
    return null;
  }
  return { discordId: d.discordId, nome: d.nome, avatar: d.avatar, papel: d.papel, exp: d.exp };
}

/** `mestre` só para o id configurado. */
export function papelDe(discordId: string, mestreId: string | undefined): Papel {
  return mestreId && discordId === mestreId ? 'mestre' : 'jogador';
}

/** Lógica pura do saguão da mesa online (R12b): sem DOM, sem Preact. */
import type { FichaDaSala, Membro, Papel } from './protocolo.ts';

export interface MembroNoSaguao {
  discordId: string;
  nome: string;
  papel: Papel;
  avatarUrl: string | null;
  personagemId: string | null;
  personagemNome: string | null;
  personagemRetrato: string | null;
  escolheu: boolean;
}

export interface EstadoDoSaguao {
  membros: MembroNoSaguao[];
  /** Jogadores que ainda não escolheram personagem (o mestre não escolhe). */
  faltamEscolher: MembroNoSaguao[];
  mestrePresente: boolean;
  mesaAberta: boolean;
}

export const BASE_CDN_DISCORD = 'https://cdn.discordapp.com';

/** URL do avatar do Discord a partir do hash guardado na sessão, ou `null` se não houver. */
export function urlDoAvatarDiscord(
  discordId: string,
  avatar: string | null | undefined,
  tamanho = 128,
  baseAvatar = BASE_CDN_DISCORD,
): string | null {
  if (!avatar) return null;
  if (avatar.startsWith('http://') || avatar.startsWith('https://') || avatar.startsWith('data:')) return avatar;
  const base = baseAvatar.replace(/\/+$/, '');
  return `${base}/avatars/${encodeURIComponent(discordId)}/${encodeURIComponent(avatar)}.png?size=${tamanho}`;
}

export function nomeDaFicha(ficha: FichaDaSala): string {
  return typeof ficha.name === 'string' && ficha.name.trim() ? ficha.name.trim() : 'Sem nome';
}

export function retratoDaFicha(ficha: FichaDaSala, baseDossie?: string): string | null {
  if (typeof ficha.tokenImage !== 'string' || !ficha.tokenImage) return null;
  const img = ficha.tokenImage;
  if (/^(data:|blob:|https?:\/\/|\/)/i.test(img) || !baseDossie) return img;
  try { return new URL(img, baseDossie).href; } catch { return img; }
}

/**
 * Resume o estado do saguão a partir dos membros conectados, das fichas conhecidas e de `temMapa`.
 * Na casca do jogador, `fichas` contém as fichas do próprio jogador; na Mesa do mestre, contém todas.
 */
export function estadoDoSaguao(
  membros: readonly Membro[],
  fichas: readonly FichaDaSala[],
  temMapa: boolean,
  baseDossie?: string,
  baseAvatar?: string,
): EstadoDoSaguao {
  const porId = new Map<string, FichaDaSala>();
  for (const f of fichas) porId.set(f.id, f);

  const lista: MembroNoSaguao[] = membros.map(m => {
    const f = m.personagem ? porId.get(m.personagem) : undefined;
    return {
      discordId: m.discordId,
      nome: m.nome,
      papel: m.papel,
      avatarUrl: urlDoAvatarDiscord(m.discordId, m.avatar, 128, baseAvatar),
      personagemId: m.personagem,
      personagemNome: f ? nomeDaFicha(f) : null,
      personagemRetrato: f ? retratoDaFicha(f, baseDossie) : null,
      escolheu: m.personagem !== null,
    };
  });

  return {
    membros: lista,
    faltamEscolher: lista.filter(m => m.papel === 'jogador' && !m.escolheu),
    mestrePresente: lista.some(m => m.papel === 'mestre'),
    mesaAberta: temMapa,
  };
}

/** A casca abre no saguão enquanto não houver mapa ou enquanto o jogador ainda não escolheu personagem. */
export function deveMostrarSaguao(o: { temMapa: boolean; papel: Papel; personagem: string | null }): boolean {
  if (!o.temMapa) return true;
  return o.papel === 'jogador' && o.personagem === null;
}

/** Prepara uma ou mais fichas vindas de um arquivo JSON importado no saguão, garantindo um id novo para cada uma. */
export function prepararFichasImportadas(parsed: unknown, gerarId: () => string): FichaDaSala[] {
  const itens = Array.isArray(parsed) ? parsed : [parsed];
  if (itens.length === 0) throw new Error('Arquivo vazio.');
  const saida: FichaDaSala[] = [];
  for (const item of itens) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('Formato inválido.');
    saida.push({ ...(item as Record<string, unknown>), id: gerarId() });
  }
  return saida;
}

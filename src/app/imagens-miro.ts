import { signal } from '@preact/signals';
import type { MetadadosImagemImportada } from '../dominio/miro.ts';
import { prepararImagemParaGuardar } from './imagens-quadro.ts';
import { guardarImagem } from './banco-quadros.ts';

/**
 * Imagens coladas do Miro: baixa o arquivo com o token da conta do mestre.
 * O token vive só no `localStorage` deste aparelho: nunca vai ao banco da campanha,
 * a exportações, à sala online nem a logs.
 */

const CHAVE_TOKEN = 'mesa.miro.token';
const API_MIRO = 'https://api.miro.com/v2';
const LADO_MAXIMO = 2048;
const QUALIDADE_WEBP = 0.85;

/** Abre/fecha o diálogo do token (montado em Quadros e no Quadro aberto). */
export const dialogoTokenMiroAberto = signal(false);

export function lerTokenMiro(): string | null {
  try {
    const t = localStorage.getItem(CHAVE_TOKEN)?.trim();
    return t ? t : null;
  } catch {
    return null;
  }
}

/** Grava o token; `null` ou vazio apaga. */
export function gravarTokenMiro(token: string | null): void {
  try {
    const limpo = token?.trim();
    if (limpo) localStorage.setItem(CHAVE_TOKEN, limpo);
    else localStorage.removeItem(CHAVE_TOKEN);
  } catch {
    /* sem armazenamento: o token não persiste */
  }
}

/** Erro de HTTP do Miro; 401/403 = token inválido ou sem acesso ao quadro. */
export class ErroMiro extends Error {
  readonly status: number;
  constructor(status: number, mensagem?: string) {
    super(mensagem ?? (status === 401 || status === 403
      ? 'Token do Miro inválido ou sem acesso ao quadro.'
      : `Erro HTTP ${status} ao baixar do Miro.`));
    this.name = 'ErroMiro';
    this.status = status;
  }
  get tokenInvalido(): boolean {
    return this.status === 401 || this.status === 403;
  }
}

export function urlDaImagemNoFormato(url: string, formato: string): string {
  try {
    const u = new URL(url);
    u.searchParams.set('format', formato);
    return u.toString();
  } catch {
    return url;
  }
}

type FetchFn = typeof fetch;

async function baixarBinario(url: string, token: string, fetchFn: FetchFn): Promise<Blob> {
  const resp = await fetchFn(url, { headers: { Authorization: `Bearer ${token}`, Accept: '*/*' } });
  if (!resp.ok) throw new ErroMiro(resp.status);
  const tipo = resp.headers.get('content-type') ?? '';
  if (tipo.includes('application/json')) {
    const meta = (await resp.json()) as { url?: string; imageUrl?: string; data?: { imageUrl?: string } };
    const real = meta.url ?? meta.imageUrl ?? meta.data?.imageUrl;
    if (!real) throw new ErroMiro(502, 'O Miro não devolveu o endereço da imagem.');
    // O endereço final já é assinado: sem o token.
    const bin = await fetchFn(real);
    if (!bin.ok) throw new ErroMiro(bin.status);
    return bin.blob();
  }
  return resp.blob();
}

/** Baixa o arquivo de uma imagem do Miro (`original`, ou `preview` se falhar). */
export async function baixarImagemDoMiro(
  boardId: string,
  itemId: string,
  token: string,
  fetchFn: FetchFn = fetch,
): Promise<Blob> {
  const resp = await fetchFn(`${API_MIRO}/boards/${encodeURIComponent(boardId)}/images/${encodeURIComponent(itemId)}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  if (!resp.ok) throw new ErroMiro(resp.status);
  const corpo = (await resp.json()) as { data?: { imageUrl?: string } };
  const imageUrl = corpo.data?.imageUrl;
  if (!imageUrl) throw new ErroMiro(502, 'O Miro não devolveu o endereço da imagem.');
  try {
    return await baixarBinario(urlDaImagemNoFormato(imageUrl, 'original'), token, fetchFn);
  } catch (erro) {
    if (erro instanceof ErroMiro && erro.tokenInvalido) throw erro;
    return baixarBinario(urlDaImagemNoFormato(imageUrl, 'preview'), token, fetchFn);
  }
}

/** Já baixadas nesta sessão: `boardId|itemId` → imagem guardada. */
const baixadas = new Map<string, MetadadosImagemImportada>();

export interface ResultadoDownloadMiro {
  baixadas: Map<string, MetadadosImagemImportada>;
  falhas: number;
  tokenInvalido: boolean;
  semRede: boolean;
}

/** Baixa e guarda as imagens (até 4 em paralelo); o que falhar não derruba as demais. */
export async function baixarImagensDoMiro(
  boardId: string,
  itemIds: string[],
  token: string,
  fetchFn: FetchFn = fetch,
): Promise<ResultadoDownloadMiro> {
  const resultado: ResultadoDownloadMiro = { baixadas: new Map(), falhas: 0, tokenInvalido: false, semRede: false };
  const fila = [...new Set(itemIds)];
  const trabalhar = async () => {
    for (let id = fila.shift(); id !== undefined; id = fila.shift()) {
      const chave = `${boardId}|${id}`;
      const ja = baixadas.get(chave);
      if (ja) {
        resultado.baixadas.set(id, ja);
        continue;
      }
      try {
        const bruto = await baixarImagemDoMiro(boardId, id, token, fetchFn);
        const blob = await prepararImagemParaGuardar(bruto, {
          ladoMaximo: LADO_MAXIMO,
          converterParaWebp: true,
          qualidade: QUALIDADE_WEBP,
        });
        const salvo = await guardarImagem(blob);
        const meta = {
          imagemId: salvo.id,
          larguraOriginal: salvo.largura || 320,
          alturaOriginal: salvo.altura || 240,
        };
        baixadas.set(chave, meta);
        resultado.baixadas.set(id, meta);
      } catch (erro) {
        resultado.falhas++;
        if (erro instanceof ErroMiro) {
          if (erro.tokenInvalido) resultado.tokenInvalido = true;
        } else {
          resultado.semRede = true;
        }
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, fila.length) }, trabalhar));
  return resultado;
}

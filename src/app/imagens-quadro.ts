import { guardarImagem, lerImagem } from './banco-quadros.ts';

export const FORMATOS_IMAGEM_ACEITOS = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
]);

const LADO_MAXIMO_IMAGEM = 4096;
const LARGURA_INICIAL_MAXIMA = 600;

const cacheUrls = new Map<string, string>();
const carregandoUrls = new Map<string, Promise<string | null>>();

export function obterUrlImagemSincrona(imagemId: string): string | null {
  return cacheUrls.get(imagemId) ?? null;
}

export async function urlDaImagem(imagemId: string): Promise<string | null> {
  const emCache = cacheUrls.get(imagemId);
  if (emCache) return emCache;

  const pendente = carregandoUrls.get(imagemId);
  if (pendente) return pendente;

  const tarefa = (async () => {
    try {
      const registro = await lerImagem(imagemId);
      if (!registro) return null;
      const jaCriada = cacheUrls.get(imagemId);
      if (jaCriada) return jaCriada;
      const url = URL.createObjectURL(registro.blob);
      cacheUrls.set(imagemId, url);
      return url;
    } finally {
      carregandoUrls.delete(imagemId);
    }
  })();

  carregandoUrls.set(imagemId, tarefa);
  return tarefa;
}

export function revogarImagensDoQuadro(): void {
  for (const url of cacheUrls.values()) {
    URL.revokeObjectURL(url);
  }
  cacheUrls.clear();
  carregandoUrls.clear();
}

export interface OpcoesPreparoImagem {
  ladoMaximo?: number;
  converterParaWebp?: boolean;
  qualidade?: number;
}

export async function prepararImagemParaGuardar(
  arquivo: Blob,
  opcoes: OpcoesPreparoImagem = {},
): Promise<Blob> {
  const converterParaWebp = opcoes.converterParaWebp ?? false;
  if (!converterParaWebp && !FORMATOS_IMAGEM_ACEITOS.has(arquivo.type)) {
    throw new Error(`Formato de imagem não suportado: ${arquivo.type || 'desconhecido'}`);
  }
  if (arquivo.type === 'image/gif' || arquivo.type === 'image/svg+xml') return arquivo;
  if (typeof createImageBitmap !== 'function' || typeof OffscreenCanvas !== 'function') {
    return arquivo;
  }

  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(arquivo);
  } catch {
    return arquivo;
  }
  try {
    const ladoMaximo = opcoes.ladoMaximo ?? LADO_MAXIMO_IMAGEM;
    const maiorLado = Math.max(bmp.width, bmp.height);
    const precisaRedimensionar = maiorLado > ladoMaximo;
    const precisaWebp = converterParaWebp && arquivo.type !== 'image/webp';
    if (!precisaRedimensionar && !precisaWebp) {
      return arquivo;
    }
    const escala = precisaRedimensionar ? ladoMaximo / maiorLado : 1;
    const w = Math.max(1, Math.round(bmp.width * escala));
    const h = Math.max(1, Math.round(bmp.height * escala));
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext('2d');
    if (!ctx) return arquivo;
    ctx.drawImage(bmp, 0, 0, w, h);
    return await canvas.convertToBlob({ type: 'image/webp', quality: opcoes.qualidade ?? 0.9 });
  } finally {
    bmp.close();
  }
}

export interface ImagemImportada {
  imagemId: string;
  larguraOriginal: number;
  alturaOriginal: number;
  largura: number;
  altura: number;
}

export async function importarArquivoImagem(arquivo: Blob): Promise<ImagemImportada | null> {
  if (!FORMATOS_IMAGEM_ACEITOS.has(arquivo.type)) return null;
  const blob = await prepararImagemParaGuardar(arquivo);
  const { id, largura: wOrig, altura: hOrig } = await guardarImagem(blob);

  if (!cacheUrls.has(id)) {
    cacheUrls.set(id, URL.createObjectURL(blob));
  }

  const larguraOriginal = wOrig > 0 ? wOrig : 320;
  const alturaOriginal = hOrig > 0 ? hOrig : 240;
  const largura = Math.min(LARGURA_INICIAL_MAXIMA, larguraOriginal);
  const altura = Math.max(20, Math.round((largura * alturaOriginal) / larguraOriginal));

  return {
    imagemId: id,
    larguraOriginal,
    alturaOriginal,
    largura,
    altura,
  };
}

/** A imagem guardada, reduzida (lado maior ≤ `lado`) e em JPEG 0,8, como data URL para o assistente; null se não há arquivo. */
export async function imagemReduzidaParaAssistente(imagemId: string, lado: number): Promise<string | null> {
  const registro = await lerImagem(imagemId);
  if (!registro) return null;
  let blob: Blob = registro.blob;
  if (typeof createImageBitmap === 'function' && typeof OffscreenCanvas === 'function') {
    const bmp = await createImageBitmap(registro.blob);
    try {
      const escala = Math.min(1, lado / Math.max(bmp.width, bmp.height));
      const w = Math.max(1, Math.round(bmp.width * escala));
      const h = Math.max(1, Math.round(bmp.height * escala));
      const canvas = new OffscreenCanvas(w, h);
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(bmp, 0, 0, w, h);
        blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.8 });
      }
    } finally {
      bmp.close();
    }
  }
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binario = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binario += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${blob.type || 'image/jpeg'};base64,${btoa(binario)}`;
}

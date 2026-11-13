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

export async function prepararImagemParaGuardar(arquivo: Blob): Promise<Blob> {
  if (!FORMATOS_IMAGEM_ACEITOS.has(arquivo.type)) {
    throw new Error(`Formato de imagem não suportado: ${arquivo.type || 'desconhecido'}`);
  }
  if (arquivo.type === 'image/gif') return arquivo;
  if (typeof createImageBitmap !== 'function' || typeof OffscreenCanvas !== 'function') {
    return arquivo;
  }

  const bmp = await createImageBitmap(arquivo);
  try {
    const maiorLado = Math.max(bmp.width, bmp.height);
    if (maiorLado <= LADO_MAXIMO_IMAGEM) {
      return arquivo;
    }
    const escala = LADO_MAXIMO_IMAGEM / maiorLado;
    const w = Math.max(1, Math.round(bmp.width * escala));
    const h = Math.max(1, Math.round(bmp.height * escala));
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext('2d');
    if (!ctx) return arquivo;
    ctx.drawImage(bmp, 0, 0, w, h);
    return await canvas.convertToBlob({ type: 'image/webp', quality: 0.9 });
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

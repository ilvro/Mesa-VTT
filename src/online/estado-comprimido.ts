/**
 * `estado` grande do projetor: acima de `LIMITE_ESTADO_BYTES` vai em gzip como blob `estado:<mapa>:<versao>`, e o `canal` leva só
 * `{ tipo: 'estado', blobId, versao, comprimido: true }`. Puro (só `Blob`, `CompressionStream` e `DecompressionStream`, que o Node 22 e o navegador têm).
 */

/** Acima disto o JSON do `estado` é comprimido e vai como blob. */
export const LIMITE_ESTADO_BYTES = 256 * 1024;
export const TIPO_ESTADO_COMPRIMIDO = 'application/gzip';

export const blobIdDoEstado = (mapa: string, versao: number): string => `estado:${mapa}:${versao}`;

/** A mensagem que segue no `canal` no lugar do `estado` comprimido. */
export interface EstadoComprimidoRef { tipo: 'estado'; blobId: string; versao: number; comprimido: true }

async function passar(blob: Blob, ts: CompressionStream | DecompressionStream): Promise<ArrayBuffer> {
  return new Response(blob.stream().pipeThrough(ts as unknown as ReadableWritablePair<Uint8Array, Uint8Array>)).arrayBuffer();
}

/** JSON do objeto em gzip, como `Blob`. */
export async function comprimirEstado(obj: unknown): Promise<Blob> {
  const bruto = new Blob([JSON.stringify(obj)]);
  return new Blob([await passar(bruto, new CompressionStream('gzip'))], { type: TIPO_ESTADO_COMPRIMIDO });
}

/** Inverso de `comprimirEstado`: o objeto do `estado` (para a casca do jogador usar). */
export async function descomprimirEstado(blob: Blob): Promise<unknown> {
  return JSON.parse(new TextDecoder().decode(await passar(blob, new DecompressionStream('gzip'))));
}

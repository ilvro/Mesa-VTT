/**
 * Formato e funções puras para transferência completa de dados do aparelho (.mesa).
 *
 * O arquivo .mesa é um arquivo zip contendo:
 * - manifesto.json (versão, metadados, esquema dos bancos e localStorage)
 * - bancos/<n>/<loja>.json (registros com chaves primárias e valores serializados)
 * - blobs/<id> (conteúdo binário bruto de Blobs, ArrayBuffers e TypedArrays)
 *
 * `serializar` é assíncrono para consumir `Blob.arrayBuffer()` diretamente e de forma segura.
 * `desserializar` é síncrono recebendo os bytes dos binários já lidos do pacote zip.
 */

export interface DescricaoDoIndice {
  nome: string;
  keyPath: string | string[];
  unique: boolean;
  multiEntry: boolean;
}

export interface DescricaoDaLoja {
  nome: string;
  keyPath: string | string[] | null;
  autoIncrement: boolean;
  indices: DescricaoDoIndice[];
}

export interface DescricaoDoBanco {
  nome: string;
  versao: number;
  lojas: DescricaoDaLoja[];
}

export interface ManifestoTransferencia {
  versao: 1;
  exportadoEm: number;
  origem: string;
  bancos: DescricaoDoBanco[];
  localStorage: Record<string, string>;
}

export interface RegistroSerializado {
  chave: unknown;
  valor: unknown;
}

/** Chave de uso interno da ponte que nunca deve ser exportada nem sobrescrita. */
export const CHAVE_ARMAZENAMENTO_PONTE = 'mesa:ponte-armazenamento';

/** Lista de bancos internos ignorados na exportação (começa vazia). */
const BANCOS_IGNORADOS: readonly string[] = [];

/** Filtra os nomes de bancos para exportar, ignorando internos se houver. */
export function bancosParaExportar(nomes: string[]): string[] {
  const ignorar = new Set(BANCOS_IGNORADOS);
  return nomes.filter(nome => !ignorar.has(nome));
}

/** Filtra as chaves de localStorage para exportação, excluindo a chave de ponte. */
export function chavesDoLocalStorage(chaves: string[]): string[] {
  return chaves.filter(k => k !== CHAVE_ARMAZENAMENTO_PONTE);
}

/** Valida o manifesto lido do zip. Lança erro legível se inválido ou versão desconhecida. */
export function validarManifesto(dado: unknown): ManifestoTransferencia {
  if (!dado || typeof dado !== 'object') {
    throw new Error('Manifesto inválido: conteúdo não é um objeto.');
  }
  const obj = dado as Record<string, unknown>;
  if (obj.versao !== 1) {
    throw new Error(`Versão do manifesto não suportada: ${String(obj.versao)}. Versão esperada: 1.`);
  }
  if (typeof obj.exportadoEm !== 'number' || Number.isNaN(obj.exportadoEm)) {
    throw new Error('Manifesto inválido: campo "exportadoEm" deve ser um timestamp numérico.');
  }
  if (typeof obj.origem !== 'string') {
    throw new Error('Manifesto inválido: campo "origem" deve ser uma string.');
  }
  if (!Array.isArray(obj.bancos)) {
    throw new Error('Manifesto inválido: campo "bancos" deve ser uma lista.');
  }
  if (!obj.localStorage || typeof obj.localStorage !== 'object' || Array.isArray(obj.localStorage)) {
    throw new Error('Manifesto inválido: campo "localStorage" deve ser um objeto.');
  }
  return obj as unknown as ManifestoTransferencia;
}

type GuardarBinario = (bytes: Uint8Array, tipo: string) => string | Promise<string>;
type LerBinario = (id: string) => Uint8Array;

function ehBlob(v: unknown): v is Blob {
  if (typeof Blob !== 'undefined' && v instanceof Blob) return true;
  return Boolean(v && typeof (v as Blob).arrayBuffer === 'function' && typeof (v as Blob).type === 'string');
}

/**
 * Percorre recursivamente o valor e transforma tipos especiais (Blob, ArrayBuffer,
 * TypedArray, Date, Map, Set) em representações JSON seguras com ponteiros para binários.
 */
export async function serializar(valor: unknown, guardarBinario: GuardarBinario): Promise<unknown> {
  if (valor === null || valor === undefined) return valor;

  // Blob
  if (ehBlob(valor)) {
    const buffer = await valor.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const tipo = valor.type || 'application/octet-stream';
    const id = await guardarBinario(bytes, tipo);
    return { $binario: id, $tipo: tipo, $classe: 'Blob' };
  }

  // ArrayBuffer
  if (valor instanceof ArrayBuffer) {
    const bytes = new Uint8Array(valor);
    const id = await guardarBinario(bytes, 'application/octet-stream');
    return { $binario: id, $tipo: 'application/octet-stream', $classe: 'ArrayBuffer' };
  }

  // TypedArray
  if (ArrayBuffer.isView(valor) && !(valor instanceof DataView)) {
    const bytes = new Uint8Array(valor.buffer, valor.byteOffset, valor.byteLength);
    const classe = valor.constructor.name;
    const id = await guardarBinario(bytes, 'application/octet-stream');
    return { $binario: id, $tipo: 'application/octet-stream', $classe: classe };
  }

  // Date
  if (valor instanceof Date) {
    return { $data: valor.toISOString() };
  }

  // Map
  if (valor instanceof Map) {
    const entradas: [unknown, unknown][] = [];
    for (const [k, v] of valor.entries()) {
      const chaveSer = await serializar(k, guardarBinario);
      const valSer = await serializar(v, guardarBinario);
      entradas.push([chaveSer, valSer]);
    }
    return { $map: entradas };
  }

  // Set
  if (valor instanceof Set) {
    const itens: unknown[] = [];
    for (const item of valor.values()) {
      itens.push(await serializar(item, guardarBinario));
    }
    return { $set: itens };
  }

  // Array
  if (Array.isArray(valor)) {
    const arr: unknown[] = [];
    for (const item of valor) {
      arr.push(await serializar(item, guardarBinario));
    }
    return arr;
  }

  // Objeto simples
  if (typeof valor === 'object') {
    const obj: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(valor)) {
      obj[k] = await serializar(v, guardarBinario);
    }
    return obj;
  }

  return valor;
}

const CONSTRUTORES_TYPED_ARRAY: Record<string, { new (buffer: ArrayBuffer): unknown }> = {
  Uint8Array,
  Uint8ClampedArray,
  Int8Array,
  Uint16Array,
  Int16Array,
  Uint32Array,
  Int32Array,
  Float32Array,
  Float64Array,
};

/**
 * Reconstrói o valor a partir da representação serializada e dos bytes dos binários.
 */
export function desserializar(valor: unknown, lerBinario: LerBinario): unknown {
  if (valor === null || valor === undefined) return valor;

  if (Array.isArray(valor)) {
    return valor.map(item => desserializar(item, lerBinario));
  }

  if (typeof valor === 'object') {
    const obj = valor as Record<string, unknown>;

    // Binário ($binario, $tipo, $classe)
    if (typeof obj.$binario === 'string' && typeof obj.$classe === 'string') {
      const bytes = lerBinario(obj.$binario);
      const tipo = (obj.$tipo as string) || 'application/octet-stream';
      const classe = obj.$classe;

      const copiaBuffer = new ArrayBuffer(bytes.byteLength);
      new Uint8Array(copiaBuffer).set(bytes);

      if (classe === 'Blob') {
        return new Blob([copiaBuffer], { type: tipo });
      }

      if (classe === 'ArrayBuffer') {
        return copiaBuffer;
      }

      const Construtor = CONSTRUTORES_TYPED_ARRAY[classe];
      if (Construtor) {
        return new Construtor(copiaBuffer);
      }

      return bytes;
    }

    // Date
    if (typeof obj.$data === 'string' && Object.keys(obj).length === 1) {
      return new Date(obj.$data);
    }

    // Map
    if (Array.isArray(obj.$map) && Object.keys(obj).length === 1) {
      const mapa = new Map<unknown, unknown>();
      for (const item of obj.$map) {
        if (Array.isArray(item) && item.length === 2) {
          mapa.set(desserializar(item[0], lerBinario), desserializar(item[1], lerBinario));
        }
      }
      return mapa;
    }

    // Set
    if (Array.isArray(obj.$set) && Object.keys(obj).length === 1) {
      const conjunto = new Set<unknown>();
      for (const item of obj.$set) {
        conjunto.add(desserializar(item, lerBinario));
      }
      return conjunto;
    }

    // Objeto comum
    const resultado: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      resultado[k] = desserializar(v, lerBinario);
    }
    return resultado;
  }

  return valor;
}

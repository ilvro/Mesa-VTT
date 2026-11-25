import { inflateSync, strFromU8, Unzip, UnzipInflate } from 'fflate';

export const TAMANHO_PEDACO_ZIP = 2 * 1024 * 1024;

interface EntradaIndiceZip {
  nome: string;
  compression: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
}

function juntarPedacos(pedacos: Uint8Array[]): Uint8Array {
  if (pedacos.length === 0) return new Uint8Array(0);
  if (pedacos.length === 1) return pedacos[0]!;
  let total = 0;
  for (const p of pedacos) total += p.length;
  const saida = new Uint8Array(total);
  let offset = 0;
  for (const p of pedacos) {
    saida.set(p, offset);
    offset += p.length;
  }
  return saida;
}

async function lerTrecho(
  arquivo: File | Blob | Uint8Array,
  inicio: number,
  fim: number,
): Promise<Uint8Array> {
  if (arquivo instanceof Uint8Array) {
    return arquivo.subarray(inicio, fim);
  }
  return new Uint8Array(await arquivo.slice(inicio, fim).arrayBuffer());
}

/**
 * Tenta ler o Central Directory no fim do `.zip` para acessar entradas por offset
 * sem precisar ler nem descomprimir o arquivo inteiro. Retorna `null` se não for
 * um zip padrão (ex.: Zip64 ou arquivo corrompido).
 */
async function lerIndiceZip(
  arquivo: File | Blob | Uint8Array,
): Promise<Map<string, EntradaIndiceZip> | null> {
  const tamanho = arquivo instanceof Uint8Array ? arquivo.length : arquivo.size;
  if (tamanho < 22) return null;

  const tamanhoCauda = Math.min(tamanho, 65557);
  const inicioCauda = tamanho - tamanhoCauda;
  const cauda = await lerTrecho(arquivo, inicioCauda, tamanho);
  const viewCauda = new DataView(cauda.buffer, cauda.byteOffset, cauda.byteLength);

  let posEocd = -1;
  for (let i = cauda.length - 22; i >= 0; i--) {
    if (
      cauda[i] === 0x50 &&
      cauda[i + 1] === 0x4b &&
      cauda[i + 2] === 0x05 &&
      cauda[i + 3] === 0x06
    ) {
      const commentLen = viewCauda.getUint16(i + 20, true);
      if (i + 22 + commentLen === cauda.length) {
        posEocd = i;
        break;
      }
    }
  }
  if (posEocd < 0) return null;

  const cdSize = viewCauda.getUint32(posEocd + 12, true);
  const cdOffset = viewCauda.getUint32(posEocd + 16, true);
  if (
    cdSize === 0xffffffff ||
    cdOffset === 0xffffffff ||
    cdOffset + cdSize > tamanho
  ) {
    return null;
  }

  const cd = await lerTrecho(arquivo, cdOffset, cdOffset + cdSize);
  const viewCd = new DataView(cd.buffer, cd.byteOffset, cd.byteLength);
  const indice = new Map<string, EntradaIndiceZip>();

  let pos = 0;
  while (pos + 46 <= cd.length) {
    if (viewCd.getUint32(pos, true) !== 0x02014b50) return null;
    const flags = viewCd.getUint16(pos + 8, true);
    const compression = viewCd.getUint16(pos + 10, true);
    const compressedSize = viewCd.getUint32(pos + 20, true);
    const uncompressedSize = viewCd.getUint32(pos + 24, true);
    const nameLen = viewCd.getUint16(pos + 28, true);
    const extraLen = viewCd.getUint16(pos + 30, true);
    const commentLen = viewCd.getUint16(pos + 32, true);
    const localHeaderOffset = viewCd.getUint32(pos + 42, true);

    if (
      compressedSize === 0xffffffff ||
      uncompressedSize === 0xffffffff ||
      localHeaderOffset === 0xffffffff ||
      pos + 46 + nameLen > cd.length
    ) {
      return null;
    }

    const utf8 = (flags & 2048) !== 0;
    const nome = strFromU8(cd.subarray(pos + 46, pos + 46 + nameLen), !utf8);
    indice.set(nome, {
      nome,
      compression,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
    });
    pos += 46 + nameLen + extraLen + commentLen;
  }

  return indice;
}

async function extrairEntradaPorIndice(
  arquivo: File | Blob | Uint8Array,
  entrada: EntradaIndiceZip,
): Promise<Uint8Array> {
  const cabecalho = await lerTrecho(
    arquivo,
    entrada.localHeaderOffset,
    entrada.localHeaderOffset + 30,
  );
  const view = new DataView(cabecalho.buffer, cabecalho.byteOffset, cabecalho.byteLength);
  if (view.getUint32(0, true) !== 0x04034b50) {
    throw new Error(`Cabeçalho local inválido no zip para ${entrada.nome}`);
  }
  const nameLen = view.getUint16(26, true);
  const extraLen = view.getUint16(28, true);
  const inicioDados = entrada.localHeaderOffset + 30 + nameLen + extraLen;
  const comprimido = await lerTrecho(
    arquivo,
    inicioDados,
    inicioDados + entrada.compressedSize,
  );

  if (entrada.compression === 0) return comprimido;
  if (entrada.compression === 8) {
    return inflateSync(comprimido, { out: new Uint8Array(entrada.uncompressedSize) });
  }
  throw new Error(`Método de compressão não suportado (${entrada.compression}) em ${entrada.nome}`);
}

export interface OpcoesPercorrerZip {
  /** Decide se o conteúdo desta entrada deve ser decodificado e entregue a `aoLer`. */
  decidir?: (nome: string) => boolean;
  /** Chamado com o conteúdo completo de cada entrada aceita. Retornar `false` interrompe a leitura do zip. */
  aoLer: (nome: string, dados: Uint8Array) => Promise<boolean | void> | boolean | void;
  /** Tamanho do pedaço lido por vez no modo sequencial (padrão: 2 MB). */
  tamanhoPedaco?: number;
}

/**
 * Lê um arquivo `.zip` em pedaços, sem carregar o arquivo inteiro nem todas as
 * entradas descomprimidas na memória de uma vez. Quando o `.zip` possui índice
 * central padrão, lê diretamente apenas as entradas aceitas por `decidir`.
 */
export async function percorrerZipEmPedacos(
  arquivo: File | Blob | Uint8Array,
  opcoes: OpcoesPercorrerZip,
): Promise<void> {
  const decidir = opcoes.decidir ?? (() => true);

  const indice = await lerIndiceZip(arquivo);
  if (indice) {
    for (const entrada of indice.values()) {
      if (!decidir(entrada.nome)) continue;
      if (entrada.compression !== 0 && entrada.compression !== 8) continue;
      const dados = await extrairEntradaPorIndice(arquivo, entrada);
      const continuar = await opcoes.aoLer(entrada.nome, dados);
      if (continuar === false) break;
    }
    return;
  }

  const tamanhoPedaco = Math.max(1024, opcoes.tamanhoPedaco ?? TAMANHO_PEDACO_ZIP);
  let erro: unknown = null;
  let interromper = false;
  let fila: Promise<void> = Promise.resolve();

  const uz = new Unzip((file) => {
    if (interromper || erro) {
      file.ondata = () => {};
      file.start();
      return;
    }

    if (!decidir(file.name)) {
      file.ondata = () => {};
      file.start();
      return;
    }

    const pedacos: Uint8Array[] = [];
    file.ondata = (err, data, final) => {
      if (err) {
        erro = err;
        pedacos.length = 0;
        return;
      }
      if (data.length > 0) pedacos.push(data);
      if (final) {
        const completo = juntarPedacos(pedacos);
        pedacos.length = 0;
        const nome = file.name;
        fila = fila.then(async () => {
          if (interromper || erro) return;
          const continuar = await opcoes.aoLer(nome, completo);
          if (continuar === false) interromper = true;
        });
      }
    };
    file.start();
  });
  uz.register(UnzipInflate);

  if (arquivo instanceof Uint8Array) {
    if (arquivo.length === 0) {
      uz.push(arquivo, true);
    } else {
      for (let offset = 0; offset < arquivo.length && !interromper; offset += tamanhoPedaco) {
        const fim = Math.min(offset + tamanhoPedaco, arquivo.length);
        uz.push(arquivo.subarray(offset, fim), fim === arquivo.length);
        await fila;
        if (erro) throw erro;
      }
    }
  } else {
    const total = arquivo.size;
    if (total === 0) {
      uz.push(new Uint8Array(0), true);
    } else {
      for (let offset = 0; offset < total && !interromper; offset += tamanhoPedaco) {
        const fim = Math.min(offset + tamanhoPedaco, total);
        const buf = await arquivo.slice(offset, fim).arrayBuffer();
        uz.push(new Uint8Array(buf), fim === total);
        await fila;
        if (erro) throw erro;
      }
    }
  }

  await fila;
  if (erro) throw erro;
}

/** Lê apenas uma entrada específica do zip, parando assim que ela termina. */
export async function lerEntradaDoZip(
  arquivo: File | Blob | Uint8Array,
  nomeAlvo: string,
  tamanhoPedaco?: number,
): Promise<Uint8Array | null> {
  const indice = await lerIndiceZip(arquivo);
  if (indice) {
    const entrada = indice.get(nomeAlvo);
    if (!entrada) return null;
    if (entrada.compression === 0 || entrada.compression === 8) {
      return await extrairEntradaPorIndice(arquivo, entrada);
    }
  }

  let encontrado: Uint8Array | null = null;
  await percorrerZipEmPedacos(arquivo, {
    tamanhoPedaco,
    decidir: (nome) => nome === nomeAlvo,
    aoLer: (_nome, dados) => {
      encontrado = dados;
      return false;
    },
  });
  return encontrado;
}

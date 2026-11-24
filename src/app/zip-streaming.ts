import { Unzip, UnzipInflate } from 'fflate';

export const TAMANHO_PEDACO_ZIP = 2 * 1024 * 1024;

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

export interface OpcoesPercorrerZip {
  /** Decide se o conteúdo desta entrada deve ser decodificado e entregue a `aoLer`. */
  decidir?: (nome: string) => boolean;
  /** Chamado com o conteúdo completo de cada entrada aceita. Retornar `false` interrompe a leitura do zip. */
  aoLer: (nome: string, dados: Uint8Array) => Promise<boolean | void> | boolean | void;
  /** Tamanho do pedaço lido por vez (padrão: 2 MB). */
  tamanhoPedaco?: number;
}

/**
 * Lê um arquivo `.zip` em pedaços usando `fflate.Unzip`, sem carregar o arquivo inteiro
 * nem todas as entradas descomprimidas na memória de uma vez.
 */
export async function percorrerZipEmPedacos(
  arquivo: File | Blob | Uint8Array,
  opcoes: OpcoesPercorrerZip,
): Promise<void> {
  const tamanhoPedaco = Math.max(1024, opcoes.tamanhoPedaco ?? TAMANHO_PEDACO_ZIP);
  const decidir = opcoes.decidir ?? (() => true);

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
      // Inicia com handler vazio para o fflate não acumular os bytes comprimidos em `this.k`.
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

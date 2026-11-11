import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
import {
  bancosParaExportar,
  CHAVE_ARMAZENAMENTO_PONTE,
  chavesDoLocalStorage,
  desserializar,
  serializar,
  validarManifesto,
  type DescricaoDaLoja,
  type DescricaoDoBanco,
  type DescricaoDoIndice,
  type ManifestoTransferencia,
} from '../dominio/transferencia.ts';

export interface RelatorioDeImportacao {
  bancos: { nome: string; registros: number }[];
  chaves: number;
  avisos: string[];
}

export interface OpcoesDeImportacao {
  substituir: boolean;
}

/**
 * Exporta todos os bancos IndexedDB e o localStorage do aparelho atual
 * para um arquivo zip (.mesa).
 */
export async function exportarAparelho(): Promise<Blob> {
  const arquivosZip: Zippable = {};
  const bancosDescritos: DescricaoDoBanco[] = [];
  let contadorBlob = 1;

  const guardarBinario = (bytes: Uint8Array, _tipo: string): string => {
    const id = `b${contadorBlob++}`;
    arquivosZip[`blobs/${id}`] = [bytes, { level: 0 }];
    return id;
  };

  if (typeof indexedDB !== 'undefined' && typeof indexedDB.databases === 'function') {
    const infos = await indexedDB.databases();
    const todosNomes = infos.map(i => i.name).filter((n): n is string => typeof n === 'string' && n.length > 0);
    const nomes = bancosParaExportar(todosNomes);

    for (let indiceBanco = 0; indiceBanco < nomes.length; indiceBanco++) {
      const nomeBanco = nomes[indiceBanco];
      if (!nomeBanco) continue;
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open(nomeBanco);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });

      try {
        const versao = db.version;
        const nomesLojas = Array.from(db.objectStoreNames);
        const lojasDescritas: DescricaoDaLoja[] = [];

        for (const nomeLoja of nomesLojas) {
          const tx = db.transaction(nomeLoja, 'readonly');
          const store = tx.objectStore(nomeLoja);

          const indices: DescricaoDoIndice[] = Array.from(store.indexNames).map(idxNome => {
            const idx = store.index(idxNome);
            return {
              nome: idx.name,
              keyPath: idx.keyPath as string | string[],
              unique: idx.unique,
              multiEntry: idx.multiEntry,
            };
          });

          lojasDescritas.push({
            nome: nomeLoja,
            keyPath: store.keyPath as string | string[] | null,
            autoIncrement: store.autoIncrement,
            indices,
          });

          // Coleta os registros de forma síncrona dentro da transação para evitar fechamento prematuro
          const registrosBrutos: { chave: unknown; valor: unknown }[] = [];
          await new Promise<void>((resolve, reject) => {
            const reqCursor = store.openCursor();
            reqCursor.onsuccess = () => {
              const cursor = reqCursor.result;
              if (cursor) {
                registrosBrutos.push({ chave: cursor.key, valor: cursor.value });
                cursor.continue();
              } else {
                resolve();
              }
            };
            reqCursor.onerror = () => reject(reqCursor.error);
          });

          // Serializa valores fora da transação
          const registros: { chave: unknown; valor: unknown }[] = [];
          for (const reg of registrosBrutos) {
            const valorSerializado = await serializar(reg.valor, guardarBinario);
            registros.push({ chave: reg.chave, valor: valorSerializado });
          }

          arquivosZip[`bancos/${indiceBanco}/${nomeLoja}.json`] = [
            strToU8(JSON.stringify(registros)),
            { level: 6 },
          ];
        }

        bancosDescritos.push({
          nome: nomeBanco,
          versao,
          lojas: lojasDescritas,
        });
      } finally {
        db.close();
      }
    }
  }

  // localStorage
  const dadosLocalStorage: Record<string, string> = {};
  if (typeof localStorage !== 'undefined') {
    const chaves: string[] = [];
    for (let k = 0; k < localStorage.length; k++) {
      const c = localStorage.key(k);
      if (c !== null) chaves.push(c);
    }
    const permitidas = chavesDoLocalStorage(chaves);
    for (const c of permitidas) {
      const v = localStorage.getItem(c);
      if (v !== null) dadosLocalStorage[c] = v;
    }
  }

  const manifesto: ManifestoTransferencia = {
    versao: 1,
    exportadoEm: Date.now(),
    origem: typeof location !== 'undefined' ? location.origin : 'http://127.0.0.1:5100',
    bancos: bancosDescritos,
    localStorage: dadosLocalStorage,
  };

  arquivosZip['manifesto.json'] = [
    strToU8(JSON.stringify(manifesto, null, 2)),
    { level: 6 },
  ];

  const zipBytes = zipSync(arquivosZip);
  return new Blob([zipBytes], { type: 'application/x-mesa' });
}

/**
 * Dispara o download no navegador do arquivo mesa-<AAAA-MM-DD>.mesa.
 */
export async function baixarExportacaoAparelho(): Promise<void> {
  const blob = await exportarAparelho();
  if (typeof document === 'undefined') return;
  const hoje = new Date().toISOString().slice(0, 10);
  const nome = `mesa-${hoje}.mesa`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => {
    try {
      URL.revokeObjectURL(url);
    } catch {
      // ignora
    }
  }, 1000);
}

function criarLojasEIndices(db: IDBDatabase, lojas: DescricaoDaLoja[]): void {
  for (const loja of lojas) {
    let store: IDBObjectStore;
    if (!db.objectStoreNames.contains(loja.nome)) {
      const params: IDBObjectStoreParameters = {
        autoIncrement: loja.autoIncrement,
      };
      if (loja.keyPath !== null) params.keyPath = loja.keyPath;
      store = db.createObjectStore(loja.nome, params);
    } else {
      store = (db as any).transaction.objectStore(loja.nome);
    }

    for (const idx of loja.indices) {
      if (!store.indexNames.contains(idx.nome)) {
        store.createIndex(idx.nome, idx.keyPath, {
          unique: idx.unique,
          multiEntry: idx.multiEntry,
        });
      }
    }
  }
}

async function abrirParaImportacao(
  banco: DescricaoDoBanco,
  substituir: boolean
): Promise<IDBDatabase> {
  if (substituir) {
    // Apaga antes
    await new Promise<void>((resolve, reject) => {
      const delReq = indexedDB.deleteDatabase(banco.nome);
      delReq.onsuccess = () => resolve();
      delReq.onerror = () => reject(delReq.error);
      delReq.onblocked = () => {
        reject(new Error('Feche os outros apps (Atlas, Dossiê, Ateliê, Jukebox) e tente de novo'));
      };
    });

    return new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(banco.nome, banco.versao);
      req.onupgradeneeded = () => {
        criarLojasEIndices(req.result, banco.lojas);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  // Modo mesclar: verifica se banco existe e se faltam lojas
  let versaoAtual = 0;
  let lojasExistentes: string[] = [];
  try {
    const dbExistente = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(banco.nome);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    versaoAtual = dbExistente.version;
    lojasExistentes = Array.from(dbExistente.objectStoreNames);
    dbExistente.close();
  } catch {
    versaoAtual = 0;
  }

  const faltamLojas = banco.lojas.some(l => !lojasExistentes.includes(l.nome));
  let versaoDestino = Math.max(versaoAtual, banco.versao);
  if (faltamLojas && versaoAtual > 0) {
    versaoDestino = versaoAtual + 1;
  }
  if (versaoDestino === 0) {
    versaoDestino = banco.versao || 1;
  }

  return new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(banco.nome, versaoDestino);
    req.onupgradeneeded = () => {
      criarLojasEIndices(req.result, banco.lojas);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Importa bancos IndexedDB e chaves de localStorage a partir de um pacote .mesa.
 */
export async function importarAparelho(
  arquivo: Blob,
  opcoes: OpcoesDeImportacao
): Promise<RelatorioDeImportacao> {
  const arrayBuffer = await arquivo.arrayBuffer();
  const descompactado = unzipSync(new Uint8Array(arrayBuffer));

  const manifestoBytes = descompactado['manifesto.json'];
  if (!manifestoBytes) {
    throw new Error('Arquivo de transferência inválido: manifesto.json não encontrado.');
  }

  const manifesto = validarManifesto(JSON.parse(strFromU8(manifestoBytes)));

  const lerBinario = (id: string): Uint8Array => {
    const bytes = descompactado[`blobs/${id}`];
    if (!bytes) {
      throw new Error(`Binário não encontrado no pacote: blobs/${id}`);
    }
    return bytes;
  };

  const relatorioBancos: { nome: string; registros: number }[] = [];

  for (let indiceBanco = 0; indiceBanco < manifesto.bancos.length; indiceBanco++) {
    const bancoDesc = manifesto.bancos[indiceBanco];
    if (!bancoDesc) continue;
    const db = await abrirParaImportacao(bancoDesc, opcoes.substituir);

    let totalRegistrosBanco = 0;

    try {
      for (const loja of bancoDesc.lojas) {
        const arqLoja = descompactado[`bancos/${indiceBanco}/${loja.nome}.json`];
        if (!arqLoja) continue;

        const lista = JSON.parse(strFromU8(arqLoja)) as { chave: unknown; valor: unknown }[];
        if (lista.length === 0) continue;

        const tx = db.transaction(loja.nome, 'readwrite');
        const store = tx.objectStore(loja.nome);

        for (const item of lista) {
          const valorReal = desserializar(item.valor, lerBinario);
          if (loja.keyPath !== null) {
            store.put(valorReal);
          } else {
            store.put(valorReal, item.chave as IDBValidKey);
          }
        }

        await new Promise<void>((resolve, reject) => {
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error);
        });

        totalRegistrosBanco += lista.length;
      }
    } finally {
      db.close();
    }

    relatorioBancos.push({
      nome: bancoDesc.nome,
      registros: totalRegistrosBanco,
    });
  }

  // localStorage
  let totalChavesImportadas = 0;
  if (typeof localStorage !== 'undefined') {
    if (opcoes.substituir) {
      // Limpa todas as chaves do localStorage exceto a ponte
      const chavesParaRemover: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const c = localStorage.key(i);
        if (c !== null && c !== CHAVE_ARMAZENAMENTO_PONTE) {
          chavesParaRemover.push(c);
        }
      }
      for (const c of chavesParaRemover) {
        localStorage.removeItem(c);
      }
    }

    for (const [k, v] of Object.entries(manifesto.localStorage)) {
      if (k !== CHAVE_ARMAZENAMENTO_PONTE) {
        localStorage.setItem(k, v);
        totalChavesImportadas++;
      }
    }
  }

  return {
    bancos: relatorioBancos,
    chaves: totalChavesImportadas,
    avisos: [],
  };
}

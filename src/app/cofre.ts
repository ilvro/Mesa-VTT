import { signal } from '@preact/signals';
import {
  validarCampanha,
  validarLigacao,
  validarSessao,
  type Campanha,
  type Entidade,
  type Ligacao,
  type RepositorioCampanha,
  type Sessao,
} from '#mesa';
import {
  criarSlug,
  entidadeParaMarkdown,
  manifestoDoCofre,
  markdownParaEntidade,
} from '../dominio/cofre.ts';
import { avisar } from './toasts.ts';
import { campanhaAtiva, escolherCampanha, ligacoes, entidades, obterRepositorio } from './campanha.ts';

export interface DriverDePasta {
  lerTexto(caminho: string): Promise<string | null>;
  gravarTexto(caminho: string, conteudo: string): Promise<void>;
  gravarBinario(caminho: string, dados: Blob | Uint8Array): Promise<void>;
  remover(caminho: string): Promise<void>;
  listarArquivos(): Promise<string[]>;
}

export interface ResultadoSincronizacao {
  campanhaId: string;
  arquivosGravados: string[];
  arquivosRemovidos: string[];
}

export interface PacoteCofreCompleto {
  versao: 1;
  exportadoEm: number;
  campanha: Campanha;
  entidades: {
    caminho: string;
    markdown: string;
  }[];
  ligacoes: Ligacao[];
  sessoes: Sessao[];
}

/** Driver em memória para testes unitários ou ambientes sem sistema de arquivos real. */
export function criarDriverEmMemoria(
  iniciais: Record<string, string | Uint8Array | Blob> = {},
): DriverDePasta & { arquivos: Map<string, string | Uint8Array | Blob> } {
  const arquivos = new Map<string, string | Uint8Array | Blob>();
  for (const [k, v] of Object.entries(iniciais)) {
    arquivos.set(k.replace(/^\/+/, ''), v);
  }

  const normalizar = (p: string) => p.replace(/^\/+/, '');

  return {
    arquivos,
    async lerTexto(caminho: string): Promise<string | null> {
      const val = arquivos.get(normalizar(caminho));
      if (val === undefined) return null;
      if (typeof val === 'string') return val;
      if (val instanceof Uint8Array) return new TextDecoder().decode(val);
      if (typeof Blob !== 'undefined' && val instanceof Blob) return await val.text();
      return String(val);
    },
    async gravarTexto(caminho: string, conteudo: string): Promise<void> {
      arquivos.set(normalizar(caminho), conteudo);
    },
    async gravarBinario(caminho: string, dados: Blob | Uint8Array): Promise<void> {
      arquivos.set(normalizar(caminho), dados);
    },
    async remover(caminho: string): Promise<void> {
      arquivos.delete(normalizar(caminho));
    },
    async listarArquivos(): Promise<string[]> {
      return Array.from(arquivos.keys());
    },
  };
}

/** Driver que conecta a File System Access API nativa do navegador (`showDirectoryPicker`). */
export function criarDriverFileSystemAccess(dirHandle: FileSystemDirectoryHandle): DriverDePasta {
  async function obterDiretorioRecursivo(partes: string[], criar: boolean): Promise<FileSystemDirectoryHandle | null> {
    let atual = dirHandle;
    for (const p of partes) {
      try {
        atual = await atual.getDirectoryHandle(p, { create: criar });
      } catch {
        return null;
      }
    }
    return atual;
  }

  return {
    async lerTexto(caminho: string): Promise<string | null> {
      const partes = caminho.split('/').filter(Boolean);
      const nomeArquivo = partes.pop();
      if (!nomeArquivo) return null;
      const dir = await obterDiretorioRecursivo(partes, false);
      if (!dir) return null;
      try {
        const fileHandle = await dir.getFileHandle(nomeArquivo);
        const file = await fileHandle.getFile();
        return await file.text();
      } catch {
        return null;
      }
    },

    async gravarTexto(caminho: string, conteudo: string): Promise<void> {
      const partes = caminho.split('/').filter(Boolean);
      const nomeArquivo = partes.pop();
      if (!nomeArquivo) return;
      const dir = await obterDiretorioRecursivo(partes, true);
      if (!dir) return;
      const fileHandle = await dir.getFileHandle(nomeArquivo, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(conteudo);
      await writable.close();
    },

    async gravarBinario(caminho: string, dados: Blob | Uint8Array): Promise<void> {
      const partes = caminho.split('/').filter(Boolean);
      const nomeArquivo = partes.pop();
      if (!nomeArquivo) return;
      const dir = await obterDiretorioRecursivo(partes, true);
      if (!dir) return;
      const fileHandle = await dir.getFileHandle(nomeArquivo, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(dados instanceof Blob ? dados : (dados as unknown as BufferSource));
      await writable.close();
    },

    async remover(caminho: string): Promise<void> {
      const partes = caminho.split('/').filter(Boolean);
      const nomeArquivo = partes.pop();
      if (!nomeArquivo) return;
      const dir = await obterDiretorioRecursivo(partes, false);
      if (!dir) return;
      try {
        await dir.removeEntry(nomeArquivo);
      } catch {
        // Ignora se não existir
      }
    },

    async listarArquivos(): Promise<string[]> {
      const arquivos: string[] = [];
      async function varrer(dir: FileSystemDirectoryHandle, prefixo: string): Promise<void> {
        for await (const [nome, entrada] of (dir as unknown as AsyncIterable<[string, FileSystemHandle]>)) {
          const caminhoRelativo = prefixo ? `${prefixo}/${nome}` : nome;
          if (entrada.kind === 'file') {
            arquivos.push(caminhoRelativo);
          } else if (entrada.kind === 'directory') {
            await varrer(entrada as FileSystemDirectoryHandle, caminhoRelativo);
          }
        }
      }
      try {
        await varrer(dirHandle, '');
      } catch {
        // Falha tolerante na varredura
      }
      return arquivos;
    },
  };
}

/**
 * Grava todos os dados da campanha no cofre via `driver`:
 * - `campanha.json`
 * - `entidades/<tipo>/<slug>-<idCurto>.md` para cada entidade
 * - `retratos/<id>.webp` para cada entidade com retrato
 * - Remove arquivos `.md` de entidades excluídas
 */
export async function sincronizarCampanhaComPasta(
  driver: DriverDePasta,
  campanha: Campanha,
  entidadesLista: readonly Entidade[],
  ligacoesLista: readonly Ligacao[] = [],
  sessoesLista: readonly Sessao[] = [],
): Promise<ResultadoSincronizacao> {
  const arquivosGravados: string[] = [];
  const arquivosRemovidos: string[] = [];
  const caminhosAtivos = new Set<string>();

  // 1. Grava campanha.json
  const jsonManifesto = manifestoDoCofre(campanha, ligacoesLista, sessoesLista);
  await driver.gravarTexto('campanha.json', jsonManifesto);
  arquivosGravados.push('campanha.json');

  // 2. Grava todas as entidades
  for (const e of entidadesLista) {
    const { caminho, conteudo } = entidadeParaMarkdown(e);
    caminhosAtivos.add(caminho);
    await driver.gravarTexto(caminho, conteudo);
    arquivosGravados.push(caminho);

    if (e.retrato) {
      const caminhoRetrato = `retratos/${e.id}.webp`;
      await driver.gravarBinario(caminhoRetrato, e.retrato);
      arquivosGravados.push(caminhoRetrato);
    }
  }

  // 3. Remove arquivos órfãos de entidades
  const todosArquivos = await driver.listarArquivos();
  for (const arq of todosArquivos) {
    if (arq.startsWith('entidades/') && arq.endsWith('.md') && !caminhosAtivos.has(arq)) {
      await driver.remover(arq);
      arquivosRemovidos.push(arq);
    }
  }

  return {
    campanhaId: campanha.id,
    arquivosGravados,
    arquivosRemovidos,
  };
}

/** Estado da pasta local atualmente conectada */
export const pastaVinculadaNome = signal<string | null>(null);
export const sincronizandoCofre = signal<boolean>(false);
export const ultimaSincronizacao = signal<number | null>(null);

let driverAtivo: DriverDePasta | null = null;
let timerDebounce: ReturnType<typeof setTimeout> | null = null;

export function obterDriverAtivo(): DriverDePasta | null {
  return driverAtivo;
}

export function definirDriverAtivo(driver: DriverDePasta | null, nome: string | null = null): void {
  driverAtivo = driver;
  pastaVinculadaNome.value = nome;
}

/** Dispara a sincronização imediata com a pasta conectada (se houver). */
export async function sincronizarAgora(): Promise<ResultadoSincronizacao | null> {
  const c = campanhaAtiva.value;
  if (!driverAtivo || !c) return null;
  sincronizandoCofre.value = true;
  try {
    const res = await sincronizarCampanhaComPasta(driverAtivo, c, entidades.value, ligacoes.value);
    ultimaSincronizacao.value = Date.now();
    return res;
  } catch (erro) {
    console.warn('Erro ao sincronizar cofre:', erro);
    return null;
  } finally {
    sincronizandoCofre.value = false;
  }
}

/** Agenda sincronização debounced de ~800ms após mudanças nas entidades ou campanha. */
export function agendarSincronizacaoCofre(
  campanha: Campanha | null,
  entidadesLista: readonly Entidade[],
  ligacoesLista: readonly Ligacao[] = [],
  sessoesLista: readonly Sessao[] = [],
): void {
  if (!driverAtivo || !campanha) return;
  if (timerDebounce) clearTimeout(timerDebounce);
  timerDebounce = setTimeout(() => {
    sincronizandoCofre.value = true;
    void sincronizarCampanhaComPasta(driverAtivo!, campanha, entidadesLista, ligacoesLista, sessoesLista)
      .then(res => {
        ultimaSincronizacao.value = Date.now();
        return res;
      })
      .catch(err => {
        console.warn('Erro na sincronização automática do cofre:', err);
      })
      .finally(() => {
        sincronizandoCofre.value = false;
      });
  }, 800);
}

/** Vincula uma pasta local no computador via File System Access API. */
export async function vincularPastaLocal(): Promise<boolean> {
  if (typeof window === 'undefined' || !('showDirectoryPicker' in window)) {
    avisar('Seu navegador não suporta vincular pastas locais. Use Exportar/Importar.', true);
    return false;
  }
  try {
    const handle = await (window as unknown as { showDirectoryPicker: () => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker();
    definirDriverAtivo(criarDriverFileSystemAccess(handle), handle.name);
    avisar(`Pasta “${handle.name}” vinculada ao cofre.`);
    await sincronizarAgora();
    return true;
  } catch (erro) {
    if ((erro as Error).name !== 'AbortError') {
      avisar('Não foi possível acessar a pasta selecionada.', true);
    }
    return false;
  }
}

export function desvincularPastaLocal(): void {
  definirDriverAtivo(null, null);
  avisar('Pasta local desvinculada.');
}

/** Gera o JSON consolidado do cofre completo para exportação e download. */
export function gerarPacoteCofre(
  campanha: Campanha,
  entidadesLista: readonly Entidade[],
  ligacoesLista: readonly Ligacao[] = [],
  sessoesLista: readonly Sessao[] = [],
): string {
  const manifesto: PacoteCofreCompleto = {
    versao: 1,
    exportadoEm: Date.now(),
    campanha,
    entidades: entidadesLista.map(e => {
      const { caminho, conteudo } = entidadeParaMarkdown(e);
      return { caminho, markdown: conteudo };
    }),
    ligacoes: [...ligacoesLista],
    sessoes: [...sessoesLista],
  };
  return JSON.stringify(manifesto, null, 2);
}

/** Faz o download de um arquivo no navegador. */
function baixarArquivo(nome: string, conteudo: string, tipo = 'application/json'): void {
  if (typeof document === 'undefined') return;
  const blob = new Blob([conteudo], { type: tipo });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Exporta o cofre da campanha ativa como um arquivo JSON para download. */
export function exportarCofreJson(
  campanha: Campanha,
  entidadesLista: readonly Entidade[],
  ligacoesLista: readonly Ligacao[] = [],
  sessoesLista: readonly Sessao[] = [],
): void {
  const json = gerarPacoteCofre(campanha, entidadesLista, ligacoesLista, sessoesLista);
  const nomeArquivo = `cofre-${criarSlug(campanha.nome)}.json`;
  baixarArquivo(nomeArquivo, json);
  avisar(`Cofre da campanha “${campanha.nome}” exportado.`);
}

/**
 * Importa um cofre a partir de um texto JSON (gerado por `exportarCofreJson` ou `manifestoDoCofre`).
 * Salva a campanha, suas entidades, ligações e sessões no repositório IndexedDB.
 */
export async function importarCofreDeTexto(
  jsonTexto: string,
  repo: RepositorioCampanha,
): Promise<Campanha | null> {
  try {
    const parsed = JSON.parse(jsonTexto) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return null;

    const dadosCampanha = (parsed.campanha && typeof parsed.campanha === 'object')
      ? (parsed.campanha as Campanha)
      : (parsed as unknown as Campanha);
    validarCampanha(dadosCampanha);

    // Salva a campanha
    await repo.salvarCampanha(dadosCampanha);

    // Salva entidades
    if (Array.isArray(parsed.entidades)) {
      for (const item of parsed.entidades) {
        if (typeof item?.markdown === 'string') {
          const entidade = markdownParaEntidade(item.markdown, dadosCampanha.id);
          if (entidade) {
            await repo.salvarEntidade(entidade);
          }
        }
      }
    }

    // Salva ligações
    if (Array.isArray(parsed.ligacoes)) {
      for (const l of parsed.ligacoes) {
        try {
          validarLigacao(l);
          await repo.ligar({
            campanhaId: dadosCampanha.id,
            de: l.de,
            para: l.para,
            tipo: l.tipo,
          });
        } catch {
          // ignora ligação inválida
        }
      }
    }

    // Salva sessões
    if (Array.isArray(parsed.sessoes)) {
      for (const s of parsed.sessoes) {
        try {
          validarSessao(s);
          await repo.salvarSessao(s);
        } catch {
          // ignora sessão inválida
        }
      }
    }

    return dadosCampanha;
  } catch (erro) {
    console.warn('Erro ao importar cofre:', erro);
    return null;
  }
}

/** Abre a caixa de diálogo de arquivo e importa o cofre selecionado para o app. */
export async function importarCofreParaApp(): Promise<boolean> {
  if (typeof document === 'undefined') return false;
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return resolve(false);
      try {
        const texto = await file.text();
        const r = obterRepositorio();
        const importada = await importarCofreDeTexto(texto, r);
        if (importada) {
          await escolherCampanha(importada.id);
          avisar(`Cofre “${importada.nome}” importado com sucesso.`);
          resolve(true);
        } else {
          avisar('Arquivo de cofre inválido ou corrompido.', true);
          resolve(false);
        }
      } catch (erro) {
        avisar('Não foi possível ler o arquivo selecionado.', true);
        resolve(false);
      }
    };
    input.click();
  });
}

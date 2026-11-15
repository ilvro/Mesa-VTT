import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { filtroCopiaJukebox } from './build-desktop.ts';

export const ARQUIVO_DO_CARIMBO = '.carimbo';

/**
 * Caminhos relativos à raiz de cada projeto que compõem a entrada do build desktop.
 * Tudo o que o próprio build escreve (ex.: `dist-desktop-app` e `src/default-sheets.js` no Dossiê)
 * fica fora do carimbo para evitar laços de reconstrução.
 */
export const ENTRADAS_DO_BUILD: Record<string, string[]> = {
  Mesa: ['src', 'public', 'index.html', 'package.json', 'vite.config.ts', 'vendor'],
  Atlas: ['src', 'public', 'index.html', 'package.json', 'vite.config.ts', 'mesa-core/src'],
  Atelie: ['src', 'public', 'index.html', 'package.json', 'vite.config.js', 'vendor', 'scripts/library/lib'],
  Dossie: [
    'src',
    'public',
    'index.html',
    'package.json',
    'vite.config.js',
    'vendor',
    'scripts/gen-default-sheets.js',
    'sheets.json',
  ],
  Jukebox: ['.'],
};

/**
 * Retorna a função de exclusão específica de um aplicativo, quando houver.
 */
export function ignorarDoApp(app: string): ((caminho: string) => boolean) | undefined {
  if (app === 'Jukebox') {
    return (caminho: string) => {
      const partes = caminho.split(/[\\/]/).filter(Boolean);
      return partes.some(parte => !filtroCopiaJukebox(parte));
    };
  }
  if (app === 'Dossie') {
    return (caminho: string) => caminho.split(path.sep).join('/') === 'src/default-sheets.js';
  }
  return undefined;
}

/**
 * Verifica se um caminho relativo à raiz do projeto deve ser ignorado no cálculo do carimbo
 * ou no observador de arquivos.
 */
export function deveIgnorarCaminho(
  caminhoRelativo: string,
  ignorar?: (caminho: string) => boolean
): boolean {
  const normalizado = caminhoRelativo.split(path.sep).join('/');
  if (!normalizado || normalizado === '.') return false;
  if (normalizado === 'src/default-sheets.js') return true;

  const partes = normalizado.split('/');
  for (const parte of partes) {
    if (
      parte === 'node_modules' ||
      parte === '.git' ||
      parte === 'dist' ||
      parte.startsWith('dist-') ||
      parte === 'test-results' ||
      parte === '.ponte' ||
      parte === ARQUIVO_DO_CARIMBO
    ) {
      return true;
    }
  }

  if (ignorar && ignorar(normalizado)) return true;
  return false;
}

/**
 * Calcula o carimbo (sha1 hex) de um projeto a partir de suas entradas relativas,
 * ordenando os caminhos e concatenando `caminho\ttamanho\tmtimeMs\n`.
 */
export function carimboDe(
  raizDoProjeto: string,
  entradas: string[],
  ignorar?: (caminho: string) => boolean
): string {
  const raizAbs = path.resolve(raizDoProjeto);
  const arquivos = new Map<string, { tamanho: number; mtimeMs: number }>();

  const visitar = (caminhoAbs: string): void => {
    const rel = path.relative(raizAbs, caminhoAbs).split(path.sep).join('/');
    if (rel && rel !== '.' && deveIgnorarCaminho(rel, ignorar)) return;

    let st: fs.Stats;
    try {
      st = fs.statSync(caminhoAbs);
    } catch {
      return;
    }

    if (st.isDirectory()) {
      let itens: string[];
      try {
        itens = fs.readdirSync(caminhoAbs);
      } catch {
        return;
      }
      for (const item of itens) {
        visitar(path.join(caminhoAbs, item));
      }
      return;
    }

    if (st.isFile() && rel && rel !== '.') {
      arquivos.set(rel, { tamanho: st.size, mtimeMs: st.mtimeMs });
    }
  };

  for (const entrada of entradas) {
    const caminhoEntrada = path.resolve(raizAbs, entrada);
    if (!fs.existsSync(caminhoEntrada)) continue;
    visitar(caminhoEntrada);
  }

  const caminhosOrdenados = Array.from(arquivos.keys()).sort();
  const hash = crypto.createHash('sha1');
  for (const rel of caminhosOrdenados) {
    const info = arquivos.get(rel)!;
    hash.update(`${rel}\t${info.tamanho}\t${info.mtimeMs}\n`);
  }
  return hash.digest('hex');
}

/**
 * Calcula o carimbo atual de um aplicativo registrado em `ENTRADAS_DO_BUILD`.
 */
export function carimboDoApp(raizProjetos: string, app: string): string {
  const entradas = ENTRADAS_DO_BUILD[app];
  if (!entradas) {
    throw new Error(`Aplicativo sem entradas de build configuradas: ${app}`);
  }
  return carimboDe(path.join(raizProjetos, app), entradas, ignorarDoApp(app));
}

/**
 * Lê o carimbo gravado em `dist-desktop/<App>/.carimbo`, ou `null` se não existir.
 */
export function lerCarimboMontado(pastaDoApp: string): string | null {
  const caminhoCarimbo = path.join(pastaDoApp, ARQUIVO_DO_CARIMBO);
  if (!fs.existsSync(caminhoCarimbo)) return null;
  try {
    const conteudo = fs.readFileSync(caminhoCarimbo, 'utf-8').trim();
    return conteudo.length > 0 ? conteudo : null;
  } catch {
    return null;
  }
}

/**
 * Devolve a lista de aplicativos cujo carimbo atual difere do montado em `distDesktop`
 * ou cuja pasta montada não possui `.carimbo`. O Tabletop fica de fora.
 */
export function appsVelhos(
  raizProjetos: string,
  distDesktop: string,
  apps: string[] = Object.keys(ENTRADAS_DO_BUILD)
): string[] {
  const velhos: string[] = [];
  for (const app of apps) {
    if (!(app in ENTRADAS_DO_BUILD)) continue;
    const pastaMontada = path.join(distDesktop, app);
    const montado = lerCarimboMontado(pastaMontada);
    if (montado === null) {
      velhos.push(app);
      continue;
    }
    const atual = carimboDoApp(raizProjetos, app);
    if (atual !== montado) {
      velhos.push(app);
    }
  }
  return velhos;
}

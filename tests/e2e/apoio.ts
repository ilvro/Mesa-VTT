import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser } from 'playwright';
import { createServer, type ViteDevServer } from 'vite';

const RAIZ_DA_MESA = fileURLToPath(new URL('../../', import.meta.url));
const RAIZ_DO_ATLAS = fileURLToPath(new URL('../../../Atlas/', import.meta.url));
const RAIZ_DO_JUKEBOX = fileURLToPath(new URL('../../../Jukebox/', import.meta.url));
const RAIZ_DA_FICHA = fileURLToPath(new URL('../../../Ficha teste - Ordem II/', import.meta.url));

export interface Ambiente { origem: string; navegador: Browser; encerrar(): Promise<void> }

const porta = (v: ViteDevServer) => (v.httpServer!.address() as { port: number }).port;

/**
 * Mesa e Atlas de verdade, numa origem só (como no GitHub Pages): cada um num Vite próprio, com `base` do projeto,
 * atrás do proxy `mesa-dev` do Atlas. O Jukebox de verdade entra como arquivos estáticos (como no Pages), e um “Tabletop” falso (só uma página,
 * sem `mesa.json`) faz o papel de um aplicativo que ainda não entrou no contrato. Ficha e Ateliê ficam de fora, para o inventário ter “fora do ar”.
 */
export async function iniciarAmbiente(opcoes: { /** Sobe também a Ficha de verdade (Vite sob `/Ficha/`), em vez de deixá-la fora do ar. */ comFicha?: boolean } = {}): Promise<Ambiente> {
  const { criarProxy, lerProjeto } = await import('../../../Atlas/scripts/mesa-dev.ts');
  const mesa = await createServer({ root: RAIZ_DA_MESA, configFile: `${RAIZ_DA_MESA}vite.config.ts`, base: '/Mesa/', logLevel: 'error', server: { port: 0, strictPort: false, host: '127.0.0.1' } });
  const atlas = await createServer({ root: RAIZ_DO_ATLAS, configFile: `${RAIZ_DO_ATLAS}vite.config.ts`, base: '/Atlas/', logLevel: 'error', server: { port: 0, strictPort: false, host: '127.0.0.1' } });
  await mesa.listen(); await atlas.listen();
  const ficha = opcoes.comFicha ? await createServer({ root: RAIZ_DA_FICHA, configFile: `${RAIZ_DA_FICHA}vite.config.js`, base: '/Ficha/', logLevel: 'error', server: { port: 0, strictPort: false, host: '127.0.0.1' } }) : null;
  await ficha?.listen();
  const tabletopFalso = mkdtempSync(path.join(tmpdir(), 'tabletop-falso-'));
  writeFileSync(path.join(tabletopFalso, 'index.html'), '<!doctype html><title>Tabletop falso</title><p>sem manifesto</p>');
  const proxy = criarProxy([lerProjeto(`Mesa=${porta(mesa)}`), lerProjeto(`Atlas=${porta(atlas)}`), lerProjeto(`Jukebox=estatico:${RAIZ_DO_JUKEBOX}`), lerProjeto(`Tabletop=estatico:${tabletopFalso}`), ...(ficha ? [lerProjeto(`Ficha=${porta(ficha)}`)] : [])]);
  await new Promise<void>(ok => proxy.listen(0, '127.0.0.1', ok));
  const navegador = await chromium.launch({ args: ['--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
  return {
    origem: `http://127.0.0.1:${(proxy.address() as { port: number }).port}`,
    navegador,
    async encerrar() { await navegador.close(); await new Promise<void>(ok => proxy.close(() => ok())); await mesa.close(); await atlas.close(); await ficha?.close(); rmSync(tabletopFalso, { recursive: true, force: true }); },
  };
}

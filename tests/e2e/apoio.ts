import { fileURLToPath } from 'node:url';
import { chromium, type Browser } from 'playwright';
import { createServer, type ViteDevServer } from 'vite';

const RAIZ_DA_MESA = fileURLToPath(new URL('../../', import.meta.url));
const RAIZ_DO_ATLAS = fileURLToPath(new URL('../../../Atlas/', import.meta.url));

export interface Ambiente { origem: string; navegador: Browser; encerrar(): Promise<void> }

const porta = (v: ViteDevServer) => (v.httpServer!.address() as { port: number }).port;

/**
 * Mesa e Atlas de verdade, numa origem só (como no GitHub Pages): cada um num Vite próprio, com `base` do projeto,
 * atrás do proxy `mesa-dev` do Atlas. Quem tiver outros aplicativos ao lado pode pedi-los em `extras` (pasta e arquivo de configuração).
 */
export async function iniciarAmbiente(): Promise<Ambiente> {
  const { criarProxy, lerProjeto } = await import('../../../Atlas/scripts/mesa-dev.ts');
  const mesa = await createServer({ root: RAIZ_DA_MESA, configFile: `${RAIZ_DA_MESA}vite.config.ts`, base: '/Mesa/', logLevel: 'error', server: { port: 0, strictPort: false, host: '127.0.0.1' } });
  const atlas = await createServer({ root: RAIZ_DO_ATLAS, configFile: `${RAIZ_DO_ATLAS}vite.config.ts`, base: '/Atlas/', logLevel: 'error', server: { port: 0, strictPort: false, host: '127.0.0.1' } });
  await mesa.listen(); await atlas.listen();
  const proxy = criarProxy([lerProjeto(`Mesa=${porta(mesa)}`), lerProjeto(`Atlas=${porta(atlas)}`)]);
  await new Promise<void>(ok => proxy.listen(0, '127.0.0.1', ok));
  const navegador = await chromium.launch({ args: ['--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
  return {
    origem: `http://127.0.0.1:${(proxy.address() as { port: number }).port}`,
    navegador,
    async encerrar() { await navegador.close(); await new Promise<void>(ok => proxy.close(() => ok())); await mesa.close(); await atlas.close(); },
  };
}

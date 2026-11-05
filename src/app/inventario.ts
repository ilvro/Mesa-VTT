import { signal } from '@preact/signals';
import { APPS, type AppId, type Manifesto } from '#mesa';
import { classificar, type EstadoDoApp, type Sondagem } from '../dominio/aplicativos.ts';
import { PASTA_DO_APP } from '../dominio/entidades.ts';
import { manifestos } from './aplicativos.ts';

export interface ItemDoInventario { app: AppId; estado: EstadoDoApp; manifesto?: Manifesto; detalhe?: string; /** Onde o aplicativo mora (termina em `/`). */ base: string }

export const inventario = signal<ItemDoInventario[]>([]);
export const sondando = signal(false);

/** A Mesa mora aqui mesmo (`./`); os outros, nas pastas irmãs na mesma origem (GitHub Pages e `mesa-dev`). */
export const baseDoApp = (app: AppId, aqui: string | URL = location.href): string => new URL(app === 'mesa' ? './' : `../${PASTA_DO_APP[app]}/`, aqui).href;

async function sondarUm(app: AppId, buscar: typeof fetch): Promise<ItemDoInventario> {
  const base = baseDoApp(app);
  const ver = async (url: string, ler: boolean): Promise<{ status: number | null; corpo?: unknown }> => {
    try {
      const r = await buscar(url, { cache: 'no-store' });
      if (!ler || !r.ok) return { status: r.status };
      try { return { status: r.status, corpo: await r.json() }; } catch { return { status: r.status }; }
    } catch { return { status: null }; }
  };
  const manifesto = await ver(new URL('mesa.json', base).href, true);
  const sondagem: Sondagem = { manifesto, ...(manifesto.status !== null && manifesto.status >= 400 && manifesto.status < 500 ? { pagina: await ver(base, false) } : {}) };
  const v = classificar(app, sondagem);
  return { app, estado: v.estado, base, ...(v.manifesto ? { manifesto: v.manifesto } : {}), ...(v.detalhe ? { detalhe: v.detalhe } : {}) };
}

/** Olha cada aplicativo (`mesa.json` e, se faltar, a página) e atualiza o inventário e os manifestos usados pelo “Abrir”. */
export async function sondarAplicativos(buscar: typeof fetch = fetch): Promise<void> {
  if (sondando.value) return;
  sondando.value = true;
  try {
    const itens = await Promise.all(APPS.map(a => sondarUm(a, buscar)));
    inventario.value = itens;
    manifestos.value = { ...manifestos.value, ...Object.fromEntries(itens.map(i => [i.app, i.manifesto ?? null])) };
  } finally { sondando.value = false; }
}

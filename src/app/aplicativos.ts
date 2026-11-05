import { signal } from '@preact/signals';
import { descobrir, enderecoDaRef, type AppId, type Manifesto, type Ref } from '#mesa';
import { PASTA_DO_APP } from '../dominio/entidades.ts';

/** Manifestos já descobertos (`null`: o aplicativo não está por perto ou não tem manifesto). */
export const manifestos = signal<Partial<Record<AppId, Manifesto | null>>>({});
const pedidos = new Map<AppId, Promise<void>>();

/** Descobre `../<App>/mesa.json` na mesma origem. A lista completa de aplicativos é da tarefa 9.1c; aqui só serve ao “Abrir”. */
export function descobrirApp(app: AppId, base: string | URL = location.href): Promise<void> {
  let p = pedidos.get(app);
  if (!p) {
    p = descobrir(new URL(`../${PASTA_DO_APP[app]}/`, base)).then(m => { manifestos.value = { ...manifestos.value, [app]: m }; });
    pedidos.set(app, p);
  }
  return p;
}

/** Endereço para abrir a ref no aplicativo dono, ou `null` (sem manifesto, ou sem rota para o tipo). Lê o sinal, então a tela se atualiza ao descobrir. */
export function enderecoDe(ref: Ref, base: string | URL = location.href): string | null {
  const m = manifestos.value[ref.app];
  return m ? enderecoDaRef(m, ref, new URL(`../${PASTA_DO_APP[ref.app]}/`, base)) : null;
}

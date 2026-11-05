import { validarManifesto, type AppId, type Manifesto } from '#mesa';

/** Em que pé está cada aplicativo ao lado da Mesa. */
export type EstadoDoApp = 'achado' | 'sem-manifesto' | 'fora-do-ar';

/** O que a sondagem viu: o código HTTP de `mesa.json` (`null`: nem respondeu) e o corpo lido, e o da página do aplicativo (só se preciso). */
export interface Sondagem { manifesto: { status: number | null; corpo?: unknown }; pagina?: { status: number | null } }

export interface Veredito { estado: EstadoDoApp; manifesto?: Manifesto; detalhe?: string }

/**
 * Decide o estado. Regras:
 *  - nem respondeu, ou erro do servidor/proxy (5xx): **fora do ar**;
 *  - `mesa.json` válido e do aplicativo esperado: **achado**;
 *  - `mesa.json` ausente (404), ilegível (um servidor de desenvolvimento devolve a página no lugar) ou inválido, com a página respondendo: **sem manifesto**;
 *  - `mesa.json` ausente e nem a página responde: **fora do ar**.
 */
export function classificar(esperado: AppId, s: Sondagem): Veredito {
  const { status, corpo } = s.manifesto;
  if (status === null || status >= 500) return { estado: 'fora-do-ar', detalhe: status === null ? 'Não respondeu.' : `Erro ${status}.` };
  if (status >= 200 && status < 300) {
    const v = validarManifesto(corpo);
    if (v.ok && v.manifesto.app === esperado) return { estado: 'achado', manifesto: v.manifesto };
    return { estado: 'sem-manifesto', detalhe: v.ok ? `O manifesto é de “${v.manifesto.app}”, não de “${esperado}”.` : corpo === undefined ? 'O mesa.json não é um JSON.' : v.erro };
  }
  const pagina = s.pagina?.status;
  return pagina !== undefined && pagina !== null && pagina >= 200 && pagina < 400
    ? { estado: 'sem-manifesto', detalhe: 'Está no ar, mas ainda não tem mesa.json.' }
    : { estado: 'fora-do-ar', detalhe: 'Não respondeu.' };
}

export const ROTULO_DO_ESTADO: Readonly<Record<EstadoDoApp, string>> = { achado: 'Achado', 'sem-manifesto': 'Sem manifesto', 'fora-do-ar': 'Fora do ar' };

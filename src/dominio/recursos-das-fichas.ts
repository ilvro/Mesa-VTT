import { chaveDaRef, ehRef, type Ref } from '#mesa';

/** Os recursos de uma ficha, como o Dossiê os publica em `ficha.recursos`. */
export interface Recursos { pv: number; pvMax: number; pd: number; pdMax: number }

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Lê os dados de um `ficha.recursos` (já validado pelo contrato, mas o barramento é de fora): o Ref da ficha e os recursos, ou `null`. */
export function lerRecursos(dados: unknown): { ficha: Ref; recursos: Recursos } | null {
  if (!dados || typeof dados !== 'object') return null;
  const d = dados as Record<string, unknown>;
  if (!ehRef(d.ficha) || !num(d.pv) || !num(d.pvMax) || !num(d.pd) || !num(d.pdMax)) return null;
  return { ficha: d.ficha, recursos: { pv: d.pv, pvMax: d.pvMax, pd: d.pd, pdMax: d.pdMax } };
}

/** Os recursos conhecidos da primeira ficha entre os `refs` de uma entidade (o mapa é por texto canônico do Ref). */
export function recursosDaEntidade(refs: readonly Ref[], porFicha: ReadonlyMap<string, Recursos>): Recursos | undefined {
  for (const r of refs) {
    if (r.app !== 'ficha' || r.tipo !== 'ficha') continue;
    const achado = porFicha.get(chaveDaRef(r));
    if (achado) return achado;
  }
  return undefined;
}

/** A fração de uma barra, limitada a 0..1 (máximo zero ou inválido dá 0). */
export function fracao(atual: number, max: number): number {
  if (!(max > 0) || !Number.isFinite(atual)) return 0;
  return Math.min(1, Math.max(0, atual / max));
}

/** O tom da barra de PV: perigo com um quarto ou menos, sucesso acima disso. */
export function tomDoPv(f: number): 'sucesso' | 'perigo' {
  return f > 0.25 ? 'sucesso' : 'perigo';
}

import { analisarMarcadores } from './marcadores.ts';
import { textoPuro, type Item } from './quadro.ts';

export interface MudancaDeEstado {
  chave: string;
  de: string | boolean | undefined;
  para: string | boolean | undefined;
  em: number;
  sessaoId: string | null;
}

export interface EstadoDoMundo {
  fatos: Record<string, string | boolean>;
  historico: MudancaDeEstado[];
}

export const ESTADO_VAZIO: EstadoDoMundo = {
  fatos: {},
  historico: [],
};

export function normalizarEstadoDoMundo(bruto: unknown): EstadoDoMundo {
  if (!bruto || typeof bruto !== 'object') {
    return { fatos: {}, historico: [] };
  }
  const obj = bruto as Record<string, unknown>;
  const fatos: Record<string, string | boolean> = {};
  if (obj.fatos && typeof obj.fatos === 'object') {
    for (const [k, v] of Object.entries(obj.fatos as Record<string, unknown>)) {
      if (typeof v === 'boolean' || typeof v === 'string') {
        fatos[k] = v;
      }
    }
  }
  const historico: MudancaDeEstado[] = Array.isArray(obj.historico)
    ? (obj.historico as MudancaDeEstado[]).filter(
        (h) => h && typeof h.chave === 'string' && typeof h.em === 'number',
      )
    : [];
  return { fatos, historico };
}

export function chaveDaCondicao(condicao: string): string {
  let limpa = condicao.trim();
  if (limpa.toLowerCase().startsWith('se:')) {
    limpa = limpa.slice(3).trim();
  }
  if (limpa.startsWith('!')) {
    limpa = limpa.slice(1).trim();
  }
  const eq = limpa.indexOf('=');
  if (eq >= 0) {
    limpa = limpa.slice(0, eq).trim();
  }
  return limpa;
}

export function avaliarCondicao(condicao: string, estado: EstadoDoMundo): boolean {
  let expr = condicao.trim();
  if (!expr) return true;
  if (expr.toLowerCase().startsWith('se:')) {
    expr = expr.slice(3).trim();
  }
  if (expr.startsWith('!')) {
    return !avaliarCondicao(expr.slice(1), estado);
  }
  const eq = expr.indexOf('=');
  if (eq >= 0) {
    const chave = expr.slice(0, eq).trim();
    const esperado = expr.slice(eq + 1).trim().toLowerCase();
    const valor = estado.fatos[chave];
    if (valor === undefined || valor === false) return false;
    if (valor === true) return esperado === 'true' || esperado === 'sim';
    return String(valor).trim().toLowerCase() === esperado;
  }
  const valor = estado.fatos[expr];
  return typeof valor === 'string' ? valor.trim().length > 0 : Boolean(valor);
}

export function condicoesDoItem(item: Item): string[] {
  let texto = '';
  if (item.tipo === 'texto' || item.tipo === 'forma') {
    texto = textoPuro(item.doc);
  } else if (item.tipo === 'moldura') {
    texto = item.titulo;
  } else if (item.tipo === 'seta') {
    texto = item.rotulo;
  }
  if (!texto) return [];

  const vistos = new Set<string>();
  const saida: string[] = [];
  for (const t of analisarMarcadores(texto)) {
    if (t.tipo !== 'marcador') continue;
    const cond = 'condicao' in t.marcador ? t.marcador.condicao : undefined;
    if (cond && !vistos.has(cond)) {
      vistos.add(cond);
      saida.push(cond);
    }
  }
  return saida;
}

export function itemAtendeCondicoes(item: Item, estado: EstadoDoMundo): boolean {
  const conds = condicoesDoItem(item);
  if (conds.length === 0) return true;
  return conds.every((c) => avaliarCondicao(c, estado));
}

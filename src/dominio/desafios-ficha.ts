export interface SugestoesDaFicha {
  nome: string;
  retrato?: string;
  acrobaciaDado: number;
  dadosEquilibrio: number;
  vigorDado: number;
  dadosFolego: number;
  crimeDado: number;
  tentativasCrime: number;
  furtividadeDado: number;
  atletismoDado: number;
}

const DADO_PADRAO = 4;

function normalizarNomePericia(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();
}

function lerDadoPericia(skills: unknown, alvoNormalizado: string): number {
  if (!Array.isArray(skills)) return DADO_PADRAO;
  for (const item of skills) {
    if (!item || typeof item !== 'object') continue;
    const reg = item as Record<string, unknown>;
    if (typeof reg.name !== 'string') continue;
    if (normalizarNomePericia(reg.name) !== alvoNormalizado) continue;
    const bruto = reg.skillDie;
    if (typeof bruto === 'number' && Number.isFinite(bruto) && bruto > 0) {
      return Math.floor(bruto);
    }
    return DADO_PADRAO;
  }
  return DADO_PADRAO;
}

function textoNaoVazio(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const limpo = v.trim();
  return limpo.length > 0 ? limpo : undefined;
}

export function extrairSugestoesDaFicha(
  ficha: Record<string, unknown> | null | undefined,
): SugestoesDaFicha {
  const nome =
    textoNaoVazio(ficha?.name) ??
    textoNaoVazio(ficha?.firstName) ??
    'Personagem';
  const retrato = textoNaoVazio(ficha?.tokenImage);
  const skills = ficha?.skills;

  const acrobaciaDado = lerDadoPericia(skills, 'ACROBACIA');
  const vigorDado = lerDadoPericia(skills, 'VIGOR');
  const crimeDado = lerDadoPericia(skills, 'CRIME');
  const furtividadeDado = lerDadoPericia(skills, 'FURTIVIDADE');
  const atletismoDado = lerDadoPericia(skills, 'ATLETISMO');

  const sugestoes: SugestoesDaFicha = {
    nome,
    acrobaciaDado,
    dadosEquilibrio: Math.max(1, Math.floor(acrobaciaDado / 2)),
    vigorDado,
    dadosFolego: Math.max(1, Math.floor(vigorDado / 2)),
    crimeDado,
    tentativasCrime: Math.max(1, Math.floor(crimeDado / 2)),
    furtividadeDado,
    atletismoDado,
  };
  if (retrato !== undefined) {
    sugestoes.retrato = retrato;
  }
  return sugestoes;
}

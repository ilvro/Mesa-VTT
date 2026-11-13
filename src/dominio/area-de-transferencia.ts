import type { Ponto } from './camera.ts';
import type { Item, Ponta } from './quadro.ts';

export const PREFIXO_CLIPBOARD = 'mesa-quadro:1:';

export function copiar(itens: readonly Item[]): string {
  return PREFIXO_CLIPBOARD + JSON.stringify({ itens });
}

export function colar(
  texto: string,
  novoId: () => string,
  destino: { quadroId: string; centro: Ponto; deslocamento?: number },
  agora = Date.now(),
): Item[] | null {
  if (!texto.startsWith(PREFIXO_CLIPBOARD)) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(texto.slice(PREFIXO_CLIPBOARD.length));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as { itens?: unknown }).itens)) {
    return null;
  }
  const originais = (parsed as { itens: Item[] }).itens;
  if (originais.length === 0) return [];

  const mapaIds = new Map<string, string>();
  const mapaGrupos = new Map<string, string>();
  for (const it of originais) {
    mapaIds.set(it.id, novoId());
    if (it.grupoId && !mapaGrupos.has(it.grupoId)) {
      mapaGrupos.set(it.grupoId, novoId());
    }
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const it of originais) {
    if (it.x < minX) minX = it.x;
    if (it.y < minY) minY = it.y;
    if (it.x + it.largura > maxX) maxX = it.x + it.largura;
    if (it.y + it.altura > maxY) maxY = it.y + it.altura;
  }

  const centroOrigX = (minX + maxX) / 2;
  const centroOrigY = (minY + maxY) / 2;
  const deslocamento = destino.deslocamento ?? 0;
  const dx = destino.centro.x - centroOrigX + deslocamento;
  const dy = destino.centro.y - centroOrigY + deslocamento;

  const religarPonta = (ponta: Ponta): Ponta => {
    if ('ponto' in ponta) {
      return { ponto: [ponta.ponto[0] + dx, ponta.ponto[1] + dy] };
    }
    const novoAlvo = mapaIds.get(ponta.itemId);
    if (novoAlvo) {
      return { itemId: novoAlvo, lado: ponta.lado };
    }
    return { ponto: [destino.centro.x + deslocamento, destino.centro.y + deslocamento] };
  };

  return originais.map((it): Item => {
    const base = {
      ...it,
      id: mapaIds.get(it.id)!,
      quadroId: destino.quadroId,
      x: it.x + dx,
      y: it.y + dy,
      molduraId: it.molduraId ? (mapaIds.get(it.molduraId) ?? null) : null,
      grupoId: it.grupoId ? (mapaGrupos.get(it.grupoId) ?? null) : null,
      criadoEm: agora,
      atualizadoEm: agora,
    };
    if (base.tipo === 'seta') {
      return {
        ...base,
        de: religarPonta(base.de),
        para: religarPonta(base.para),
      };
    }
    return base;
  });
}

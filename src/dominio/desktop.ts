/**
 * Tipos e regras puras para ambiente desktop e suporte a múltiplos monitores / projetor.
 */

export interface InfoMonitor {
  id: string;
  nome?: string;
  primario?: boolean;
  x?: number;
  y?: number;
  largura?: number;
  altura?: number;
}

/**
 * Escolhe o monitor alvo para projetar a visão dos jogadores.
 * Se houver múltiplos monitores, prefere um diferente do monitor atual do mestre (ou um não-primário).
 * Se só houver um monitor, recai no único disponível. Retorna null se lista vazia.
 */
export function escolherMonitorParaProjetor(
  monitores: readonly InfoMonitor[],
  monitorAtualId?: string | null
): InfoMonitor | null {
  if (!monitores || monitores.length === 0) return null;
  if (monitores.length === 1) return monitores[0] ?? null;

  // Se houver ID do monitor atual onde a Mesa está aberta, escolhe um diferente
  if (monitorAtualId) {
    const outro = monitores.find(m => m.id !== monitorAtualId);
    if (outro) return outro;
  }

  // Procura o monitor que não é o primário (tipicamente TV, tela estendida ou projetor)
  const secundario = monitores.find(m => !m.primario);
  if (secundario) return secundario;

  // Fallback: segundo monitor da lista
  return monitores[1] ?? monitores[0] ?? null;
}

/**
 * Constrói a URL do Projetor do Atlas a partir da base do Atlas e do mapa ativo.
 */
export function urlDoProjetor(baseAtlas: string, mapaId: string | null): string {
  const base = baseAtlas.endsWith('/') ? baseAtlas : `${baseAtlas}/`;
  return `${base}${mapaId ? `#/projetor/${encodeURIComponent(mapaId)}` : '#/projetor'}`;
}

/**
 * Monta a string de features para window.open posicionando a janela no monitor indicado.
 */
export function opcoesJanelaMonitor(monitor: InfoMonitor | null): string {
  if (!monitor || monitor.x === undefined || monitor.y === undefined) {
    return 'popup,width=1280,height=720';
  }
  const x = Math.round(monitor.x);
  const y = Math.round(monitor.y);
  const w = Math.round(monitor.largura ?? 1280);
  const h = Math.round(monitor.altura ?? 720);
  return `left=${x},top=${y},width=${w},height=${h},popup=yes`;
}

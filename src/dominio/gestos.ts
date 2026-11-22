import { guias, type LinhaGuia } from './alinhamento.ts';
import type { Caixa } from './camera.ts';
import { encaixarNaGrade, girar, redimensionar, type Alca } from './geometria.ts';
import type { Item } from './quadro.ts';
import { escalarPontosTraco, type PontoTraco } from './tracos.ts';

/*
 * As contas dos gestos do quadro (arrastar, redimensionar, girar), sem DOM.
 * A tela só junta o ponteiro e as teclas e chama `executar` com o resultado.
 */

export type Alteracao = { id: string; antes: Partial<Item>; depois: Partial<Item> };

export interface Grade {
  encaixar: boolean;
  passo: number;
}

/** Move um item para (nx, ny). Setas levam junto as pontas livres. */
export function moverItemPatch(it: Item, nx: number, ny: number, agora: number): Alteracao {
  const dx = nx - it.x;
  const dy = ny - it.y;
  if (it.tipo === 'seta') {
    const deLivre = 'ponto' in it.de;
    const paraLivre = 'ponto' in it.para;
    return {
      id: it.id,
      antes: {
        x: it.x,
        y: it.y,
        ...(deLivre ? { de: it.de } : {}),
        ...(paraLivre ? { para: it.para } : {}),
        atualizadoEm: it.atualizadoEm,
      },
      depois: {
        x: nx,
        y: ny,
        ...('ponto' in it.de ? { de: { ponto: [it.de.ponto[0] + dx, it.de.ponto[1] + dy] } } : {}),
        ...('ponto' in it.para
          ? { para: { ponto: [it.para.ponto[0] + dx, it.para.ponto[1] + dy] } }
          : {}),
        atualizadoEm: agora,
      },
    };
  }
  return {
    id: it.id,
    antes: { x: it.x, y: it.y, atualizadoEm: it.atualizadoEm },
    depois: { x: nx, y: ny, atualizadoEm: agora },
  };
}

/**
 * As caixas contra as quais as guias se alinham: o que não se move, sem setas,
 * só o que está perto da tela (guia para algo fora da vista não ajuda e custa
 * caro num quadro grande). Calculado uma vez, no início do arrasto.
 */
export function caixasParaGuias(
  itens: Iterable<Item>,
  movendo: ReadonlySet<string>,
  vista: Caixa,
): Caixa[] {
  const mx = vista.largura * 0.5;
  const my = vista.altura * 0.5;
  const x1 = vista.x - mx;
  const y1 = vista.y - my;
  const x2 = vista.x + vista.largura + mx;
  const y2 = vista.y + vista.altura + my;
  const saida: Caixa[] = [];
  for (const it of itens) {
    if (it.tipo === 'seta' || movendo.has(it.id)) continue;
    if (it.x > x2 || it.y > y2 || it.x + it.largura < x1 || it.y + it.altura < y1) continue;
    saida.push({ x: it.x, y: it.y, largura: it.largura, altura: it.altura });
  }
  return saida;
}

export interface Arrasto {
  originais: ReadonlyMap<string, { x: number; y: number }>;
  outros: readonly Caixa[];
}

/** O deslocamento final de um arrasto: eixo travado (Shift), guias (Alt desliga) e grade. */
export function deslocamentoDoArrasto(
  g: Arrasto,
  itens: ReadonlyMap<string, Item>,
  bruto: { dx: number; dy: number },
  mods: { shift: boolean; alt: boolean },
  grade: Grade,
  toleranciaGuias: number,
): { dx: number; dy: number; linhas: LinhaGuia[] } {
  let { dx, dy } = bruto;
  if (mods.shift) {
    if (Math.abs(dx) >= Math.abs(dy)) dy = 0;
    else dx = 0;
  }
  let linhas: LinhaGuia[] = [];
  if (!mods.alt && !grade.encaixar) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const [id, orig] of g.originais) {
      const it = itens.get(id);
      if (!it) continue;
      minX = Math.min(minX, orig.x + dx);
      minY = Math.min(minY, orig.y + dy);
      maxX = Math.max(maxX, orig.x + dx + it.largura);
      maxY = Math.max(maxY, orig.y + dy + it.altura);
    }
    if (Number.isFinite(minX)) {
      const res = guias(
        { x: minX, y: minY, largura: maxX - minX, altura: maxY - minY },
        g.outros,
        toleranciaGuias,
      );
      dx += res.dx;
      dy += res.dy;
      linhas = res.linhas;
    }
  }
  if (grade.encaixar && g.originais.size > 0) {
    const ancora = g.originais.values().next().value!;
    dx = encaixarNaGrade(ancora.x + dx, grade.passo) - ancora.x;
    dy = encaixarNaGrade(ancora.y + dy, grade.passo) - ancora.y;
  }
  return { dx, dy, linhas };
}

/** As alterações para levar cada item arrastado à posição original + (dx, dy). */
export function alteracoesDoArrasto(
  originais: ReadonlyMap<string, { x: number; y: number }>,
  itens: ReadonlyMap<string, Item>,
  dx: number,
  dy: number,
  agora: number,
): Alteracao[] {
  const alterar: Alteracao[] = [];
  for (const [id, orig] of originais) {
    const atual = itens.get(id);
    if (!atual) continue;
    const nx = orig.x + dx;
    const ny = orig.y + dy;
    if (nx !== atual.x || ny !== atual.y) alterar.push(moverItemPatch(atual, nx, ny, agora));
  }
  return alterar;
}

export interface Redimensionamento {
  alca: Alca;
  caixaInicial: Caixa;
  originais: ReadonlyMap<
    string,
    { x: number; y: number; largura: number; altura: number; pontos?: PontoTraco[] }
  >;
}

const MINIMO = 20;

/** Escala a seleção pela alça puxada. Imagem sozinha mantém a proporção, e Shift inverte. */
export function alteracoesDoRedimensionar(
  g: Redimensionamento,
  itens: ReadonlyMap<string, Item>,
  delta: { x: number; y: number },
  mods: { shift: boolean; alt: boolean },
  grade: Grade,
  agora: number,
): Alteracao[] {
  const unicoId = g.originais.size === 1 ? [...g.originais.keys()][0] : undefined;
  const unico = unicoId ? itens.get(unicoId) : undefined;
  const manterProporcao = unico?.tipo === 'imagem' ? !mods.shift : mods.shift;
  const nova = redimensionar(g.caixaInicial, g.alca, delta, {
    manterProporcao,
    doCentro: mods.alt,
    minTamanho: MINIMO,
  });
  if (grade.encaixar) {
    nova.x = encaixarNaGrade(nova.x, grade.passo);
    nova.y = encaixarNaGrade(nova.y, grade.passo);
    nova.largura = Math.max(MINIMO, encaixarNaGrade(nova.largura, grade.passo));
    nova.altura = Math.max(MINIMO, encaixarNaGrade(nova.altura, grade.passo));
  }

  const escalaX = nova.largura / Math.max(1, g.caixaInicial.largura);
  const escalaY = nova.altura / Math.max(1, g.caixaInicial.altura);
  const alterar: Alteracao[] = [];
  for (const [id, orig] of g.originais) {
    const atual = itens.get(id);
    if (!atual) continue;
    const nl = Math.max(MINIMO, orig.largura * escalaX);
    const na = Math.max(MINIMO, orig.altura * escalaY);
    const antes: Partial<Item> = {
      x: atual.x,
      y: atual.y,
      largura: atual.largura,
      altura: atual.altura,
      atualizadoEm: atual.atualizadoEm,
    };
    const depois: Partial<Item> = {
      x: nova.x + (orig.x - g.caixaInicial.x) * escalaX,
      y: nova.y + (orig.y - g.caixaInicial.y) * escalaY,
      largura: nl,
      altura: na,
      atualizadoEm: agora,
    };
    if (atual.tipo === 'traco' && orig.pontos) {
      (antes as Partial<Extract<Item, { tipo: 'traco' }>>).pontos = atual.pontos;
      (depois as Partial<Extract<Item, { tipo: 'traco' }>>).pontos = escalarPontosTraco(
        orig.pontos,
        nl / Math.max(1, orig.largura),
        na / Math.max(1, orig.altura),
      );
    }
    alterar.push({ id, antes, depois });
  }
  return alterar;
}

/** A rotação nova de um giro, a partir do ângulo do ponteiro em volta do centro (Shift: de 15 em 15°). */
export function rotacaoDoGiro(
  item: Item,
  g: { centro: { x: number; y: number }; anguloInicial: number; rotacaoInicial: number },
  p: { x: number; y: number },
  encaixe15: boolean,
): number {
  const angulo = (Math.atan2(p.y - g.centro.y, p.x - g.centro.x) * 180) / Math.PI;
  return girar(item, g.rotacaoInicial + (angulo - g.anguloInicial), encaixe15);
}

import type { Ponto } from '../../../dominio/camera.ts';
import { itemEhSecreto } from '../../../dominio/busca-quadro.ts';
import { contemPonto } from '../../../dominio/geometria.ts';
import { consultarPonto, type IndiceEspacial } from '../../../dominio/indice-espacial.ts';
import type { Item } from '../../../dominio/quadro.ts';
import { caminhoDaSeta, type ItemSeta } from '../../../dominio/setas.ts';
import { tracoToca } from '../../../dominio/tracos.ts';

function distPontoSegmento(p: Ponto, a: Ponto, b: Ponto): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq <= 1e-9) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function distPolilinha(p: Ponto, pts: readonly Ponto[]): number {
  let menor = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const d = distPontoSegmento(p, pts[i - 1]!, pts[i]!);
    if (d < menor) menor = d;
  }
  return menor;
}

/** Menor distância do ponto `p` até o trajeto real (reto, curvo ou cotovelo) da seta. */
export function distanciaPontoSeta(
  seta: ItemSeta,
  itens: ReadonlyMap<string, Item>,
  p: Ponto,
): number {
  const cam = caminhoDaSeta(seta, itens);
  if (seta.rota === 'curva' && seta.curva && cam.pontosControle.length >= 4) {
    const p0 = cam.inicio;
    const c = cam.pontosControle[1]!;
    const p1 = cam.fim;
    const amostras: Ponto[] = [];
    for (let i = 0; i <= 20; i++) {
      const t = i / 20;
      const u = 1 - t;
      amostras.push({
        x: u * u * p0.x + 2 * u * t * c.x + t * t * p1.x,
        y: u * u * p0.y + 2 * u * t * c.y + t * t * p1.y,
      });
    }
    return distPolilinha(p, amostras);
  }
  if (seta.rota === 'curva' && cam.pontosControle.length === 4) {
    const [p0, c1, c2, p1] = cam.pontosControle as [Ponto, Ponto, Ponto, Ponto];
    const amostras: Ponto[] = [];
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      const u = 1 - t;
      const u2 = u * u;
      const t2 = t * t;
      amostras.push({
        x: u2 * u * p0.x + 3 * u2 * t * c1.x + 3 * u * t2 * c2.x + t2 * t * p1.x,
        y: u2 * u * p0.y + 3 * u2 * t * c1.y + 3 * u * t2 * c2.y + t2 * t * p1.y,
      });
    }
    return distPolilinha(p, amostras);
  }
  return distPolilinha(p, cam.pontosControle);
}

export function itemAtingidoNoPonto(
  item: Item,
  itens: ReadonlyMap<string, Item>,
  ponto: Ponto,
  zoom: number,
): boolean {
  if (item.tipo === 'seta') {
    const tol = Math.max(8, item.espessura / 2 + 6) / Math.max(0.05, zoom);
    return distanciaPontoSeta(item, itens, ponto) <= Math.max(tol, item.espessura / 2 + 6);
  }
  if (item.tipo === 'traco') {
    const raio = Math.max(4, 6 / Math.max(0.05, zoom));
    return tracoToca(item, ponto, raio);
  }
  return contemPonto(item, ponto);
}

/**
 * Hit-test espacial em O(1) usando o `IndiceEspacial`: respeita ordem `z`,
 * prioridade de itens acima de molduras, rotação, traços e curvas de setas.
 */
export function itemNoPontoEspacial(
  indice: IndiceEspacial<Item>,
  itens: ReadonlyMap<string, Item>,
  ponto: Ponto,
  zoom: number,
  permitirMoldura = false,
  esconderSegredos = false,
): Item | null {
  const margem = Math.max(16, 16 / Math.max(0.05, zoom));
  const candidatos = consultarPonto(indice, ponto, margem);
  if (candidatos.length === 0) return null;

  const ordenados = [...candidatos].sort(
    (a, b) =>
      (a.tipo === 'moldura' ? 0 : 1) - (b.tipo === 'moldura' ? 0 : 1) ||
      a.z - b.z ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );

  for (let i = ordenados.length - 1; i >= 0; i--) {
    const it = ordenados[i]!;
    if (esconderSegredos && itemEhSecreto(it)) continue;
    if (it.tipo === 'moldura' && !permitirMoldura) continue;
    if (itemAtingidoNoPonto(it, itens, ponto, zoom)) return it;
  }
  return null;
}

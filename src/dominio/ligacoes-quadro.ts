import type { Entidade, Ref } from '#mesa';
import { entidadePorRef } from './cenas.ts';
import { analisarMarcadores } from './marcadores.ts';
import { entidadePorNome, refDaEntidade, refsMencionados } from './notas.ts';
import { textoPuro, type Item } from './quadro.ts';

function chave(r: Ref): string {
  return `${r.app}/${r.tipo}/${r.id}`;
}

export function refDoItemDeQuadro(quadroId: string, itemId: string): Ref {
  return { app: 'mesa', tipo: 'item', id: `${quadroId}/${itemId}` };
}

export function parsearRefDeItemDeQuadro(
  ref: Ref,
): { quadroId: string; itemId: string } | null {
  if (ref.app !== 'mesa' || ref.tipo !== 'item') return null;
  const idx = ref.id.indexOf('/');
  if (idx <= 0 || idx >= ref.id.length - 1) return null;
  return {
    quadroId: ref.id.slice(0, idx),
    itemId: ref.id.slice(idx + 1),
  };
}

export function diferencaDeLigacoes(
  antes: readonly Ref[],
  depois: readonly Ref[],
): { adicionar: Ref[]; remover: Ref[] } {
  const mapaAntes = new Map<string, Ref>();
  for (const r of antes) {
    mapaAntes.set(chave(r), r);
  }
  const mapaDepois = new Map<string, Ref>();
  for (const r of depois) {
    mapaDepois.set(chave(r), r);
  }

  const adicionar: Ref[] = [];
  for (const [k, r] of mapaDepois) {
    if (!mapaAntes.has(k)) adicionar.push(r);
  }

  const remover: Ref[] = [];
  for (const [k, r] of mapaAntes) {
    if (!mapaDepois.has(k)) remover.push(r);
  }

  return { adicionar, remover };
}

function coletarRefsDeTexto(
  texto: string,
  entidades: readonly Entidade[],
  de: Ref,
): Ref[] {
  const vistos = new Set<string>([chave(de)]);
  const saida: Ref[] = [];
  const adicionar = (ref: Ref) => {
    const k = chave(ref);
    if (!vistos.has(k)) {
      vistos.add(k);
      saida.push(ref);
    }
  };

  for (const ref of refsMencionados(texto, entidades, de)) {
    adicionar(ref);
  }

  for (const t of analisarMarcadores(texto)) {
    if (t.tipo !== 'marcador') continue;
    if (t.marcador.tipo === 'fala') {
      const eQuem = entidadePorNome(entidades, t.marcador.quem);
      if (eQuem) adicionar(refDaEntidade(eQuem.id));
      if (t.marcador.para) {
        const ePara = entidadePorNome(entidades, t.marcador.para);
        if (ePara) adicionar(refDaEntidade(ePara.id));
      }
    } else if (t.marcador.tipo === 'rotulo') {
      const e = entidadePorNome(entidades, t.marcador.texto);
      if (e) adicionar(refDaEntidade(e.id));
    }
  }

  return saida;
}

export function refsDoItem(item: Item, entidades: readonly Entidade[]): Ref[] {
  const de = refDoItemDeQuadro(item.quadroId, item.id);
  switch (item.tipo) {
    case 'ref': {
      const e = entidadePorRef(item.ref, entidades);
      if (e) {
        const refMesa = refDaEntidade(e.id);
        return chave(refMesa) === chave(item.ref) ? [item.ref] : [item.ref, refMesa];
      }
      return [item.ref];
    }
    case 'texto':
    case 'forma':
      return coletarRefsDeTexto(textoPuro(item.doc), entidades, de);
    case 'moldura':
      return coletarRefsDeTexto(item.titulo, entidades, de);
    case 'seta':
      return coletarRefsDeTexto(item.rotulo, entidades, de);
    default:
      return [];
  }
}

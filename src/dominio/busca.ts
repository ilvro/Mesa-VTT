import type { Ref } from '#mesa';
import { semAcento } from './entidades.ts';

export interface ItemBusca {
  id: string;
  nome: string;
  tipo: string;
  tags?: readonly string[];
  ref?: Ref;
  origem: 'entidade' | 'sessao';
}

function calcularPontuacao(termoNorm: string, item: ItemBusca): number {
  const nomeNorm = semAcento(item.nome);

  // 1. Começo do nome
  if (nomeNorm.startsWith(termoNorm)) {
    return 1000 - nomeNorm.length;
  }

  // 2. Começo de uma palavra dentro do nome
  const palavras = nomeNorm.split(/[\s_\-/]+/);
  if (palavras.some(p => p.startsWith(termoNorm))) {
    return 500 - nomeNorm.length;
  }

  // 3. Contém no nome
  if (nomeNorm.includes(termoNorm)) {
    return 200 - nomeNorm.length;
  }

  // 4. Tags (peso menor)
  if (item.tags && item.tags.length > 0) {
    let melhorTag = 0;
    for (const tag of item.tags) {
      const tagNorm = semAcento(tag.replace(/^#/, ''));
      if (tagNorm.startsWith(termoNorm)) {
        melhorTag = Math.max(melhorTag, 50);
      } else if (tagNorm.includes(termoNorm)) {
        melhorTag = Math.max(melhorTag, 20);
      }
    }
    if (melhorTag > 0) {
      return melhorTag;
    }
  }

  return 0;
}

export function buscar(
  termo: string,
  itens: readonly ItemBusca[],
  limite = 12
): ItemBusca[] {
  const limpo = semAcento(termo.trim());
  if (!limpo) return [];

  const pontuados: { item: ItemBusca; pontos: number }[] = [];

  for (const item of itens) {
    const pontos = calcularPontuacao(limpo, item);
    if (pontos > 0) {
      pontuados.push({ item, pontos });
    }
  }

  pontuados.sort((a, b) => {
    if (b.pontos !== a.pontos) {
      return b.pontos - a.pontos;
    }
    return a.item.nome.localeCompare(b.item.nome, 'pt-BR');
  });

  return pontuados.slice(0, limite).map(p => p.item);
}

import { computed, effect, signal } from '@preact/signals';
import type { Ponto } from '../dominio/camera.ts';
import { copiar } from '../dominio/area-de-transferencia.ts';
import { comConteudo, itensDeTopo } from '../dominio/molduras.ts';
import {
  carimbarModelo,
  modelosDaCampanha,
  nomeDeModeloValido,
  type ModeloDeCena,
} from '../dominio/modelos.ts';
import { listarModelos, removerModelo, salvarModelo } from './banco-quadros.ts';
import { campanhaAtiva } from './campanha.ts';
import { executar, itens, quadroAberto, selecao } from './quadros.ts';

/** Todos os modelos do banco (de todas as campanhas); a lista visível filtra pela campanha ativa. */
export const todosOsModelos = signal<ModeloDeCena[]>([]);
export const modelosVisiveis = computed(() =>
  modelosDaCampanha(todosOsModelos.value, campanhaAtiva.value?.id ?? null),
);
/** Modelo escolhido na ferramenta Modelo; o próximo clique no quadro o carimba. */
export const modeloEscolhidoId = signal<string | null>(null);

export async function carregarModelos(): Promise<void> {
  try {
    todosOsModelos.value = await listarModelos();
  } catch (erro) {
    console.warn('Mesa: erro ao ler os modelos de cena', erro);
    todosOsModelos.value = [];
  }
}

/** Guarda a seleção atual (com o conteúdo das molduras). Devolve o modelo ou `null` se não há o que guardar. */
export async function salvarSelecaoComoModelo(
  nome: string,
  escopo: 'campanha' | 'todas',
  agora = Date.now(),
): Promise<ModeloDeCena | null> {
  const limpo = nome.trim();
  if (!nomeDeModeloValido(limpo)) return null;
  const conteudoSelecionado = comConteudo(selecao.value, itens.value);
  if (conteudoSelecionado.length === 0) return null;
  const campanhaId = campanhaAtiva.value?.id ?? null;
  const modelo: ModeloDeCena = {
    id: crypto.randomUUID(),
    nome: limpo,
    campanhaId: escopo === 'todas' ? null : campanhaId,
    conteudo: copiar(conteudoSelecionado),
    criadoEm: agora,
  };
  await salvarModelo(modelo);
  todosOsModelos.value = [...todosOsModelos.value, modelo];
  return modelo;
}

export async function renomearModelo(id: string, nome: string): Promise<void> {
  const limpo = nome.trim();
  const atual = todosOsModelos.value.find((m) => m.id === id);
  if (!atual || !nomeDeModeloValido(limpo) || atual.nome === limpo) return;
  const novo = { ...atual, nome: limpo };
  await salvarModelo(novo);
  todosOsModelos.value = todosOsModelos.value.map((m) => (m.id === id ? novo : m));
}

export async function apagarModelo(id: string): Promise<void> {
  await removerModelo(id);
  todosOsModelos.value = todosOsModelos.value.filter((m) => m.id !== id);
  if (modeloEscolhidoId.value === id) modeloEscolhidoId.value = null;
}

/**
 * Carimba o modelo com o centro no ponto, num único passo do histórico (um Ctrl+Z desfaz tudo).
 * Imagens que sumiram do banco entram mesmo assim: o item de imagem mostra o estado vazio.
 */
export function carimbarModeloNoQuadro(id: string, centro: Ponto, novoId: () => string): number {
  const modelo = todosOsModelos.value.find((m) => m.id === id);
  const quadro = quadroAberto.value;
  if (!modelo || !quadro) return 0;
  const maxZ = Math.max(0, ...[...itens.value.values()].map((i) => i.z));
  const novos = carimbarModelo(
    modelo,
    novoId,
    { quadroId: quadro.id, centro, zBase: maxZ },
    Date.now(),
  );
  if (!novos || novos.length === 0) return 0;
  executar({ rotulo: 'Carimbar modelo', ops: [{ criar: novos }] });
  selecao.value = new Set(itensDeTopo(novos).map((i) => i.id));
  return novos.length;
}

let ultimaCampanha: string | null | undefined;
effect(() => {
  const id = campanhaAtiva.value?.id ?? null;
  if (id === ultimaCampanha) return;
  ultimaCampanha = id;
  void carregarModelos();
});

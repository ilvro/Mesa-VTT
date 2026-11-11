import { signal } from '@preact/signals';
import type { RepositorioCampanha } from '#mesa';
import type { Chamada, RelatorioDesfazer } from '../dominio/efeitos.ts';
import { atualizar, campanhaAtiva, obterRepositorio } from './campanha.ts';
import { carregarSessoes } from './registro.ts';

export const MAX_CHAMADAS = 100;

/**
 * Histórico em memória das últimas 100 chamadas de escrita do assistente.
 * Se perdem ao recarregar a página (comportamento intencional).
 */
export const atividadeDoAssistente = signal<readonly Chamada[]>([]);

let proximoId = 1;

export function registrarChamadaConcluida(c: Omit<Chamada, 'id'> & { id?: string }): Chamada {
  const item: Chamada = {
    ...c,
    id: c.id ?? `chamada-${proximoId++}`,
  };
  atividadeDoAssistente.value = [item, ...atividadeDoAssistente.value].slice(0, MAX_CHAMADAS);
  return item;
}

export function limparAtividade(): void {
  atividadeDoAssistente.value = [];
  proximoId = 1;
}

/**
 * Aplica o inverso dos efeitos de uma chamada do assistente em ordem reversa.
 * Respeita a regra de conflito (atualizadaEm > momento da chamada) e regra de dono.
 */
export async function desfazerChamada(
  id: string,
  repositorioInjetado?: RepositorioCampanha,
  campanhaIdInjetado?: string
): Promise<RelatorioDesfazer> {
  const chamada = atividadeDoAssistente.value.find(c => c.id === id);
  if (!chamada) {
    return {
      ok: false,
      chamadaId: id,
      desfeitos: [],
      conflitos: ['Chamada não encontrada no histórico.'],
    };
  }

  if (chamada.desfeita) {
    return {
      ok: false,
      chamadaId: id,
      desfeitos: [],
      conflitos: ['Esta chamada já foi desfeita.'],
    };
  }

  const repo = repositorioInjetado ?? obterRepositorio();
  const cId = campanhaIdInjetado ?? campanhaAtiva.value?.id;
  if (!cId) {
    return {
      ok: false,
      chamadaId: id,
      desfeitos: [],
      conflitos: ['Nenhuma campanha ativa para desfazer.'],
    };
  }

  const desfeitos: string[] = [];
  const conflitos: string[] = [];

  // Aplica o inverso dos efeitos em ordem reversa
  const efeitosInversos = [...chamada.efeitos].reverse();

  for (const efeito of efeitosInversos) {
    switch (efeito.tipo) {
      case 'criou-entidade': {
        const atual = await repo.obterEntidade(efeito.id);
        if (!atual) {
          desfeitos.push(`Entidade "${efeito.id}" já não existe`);
          break;
        }
        if (atual.atualizadaEm > chamada.quando) {
          conflitos.push(`não desfeito: ${atual.nome} mudou depois`);
          break;
        }
        if (atual.criadaPor === 'mesa') {
          await repo.removerEntidade(efeito.id);
          desfeitos.push(`removeu "${atual.nome}"`);
        }
        break;
      }

      case 'alterou-entidade': {
        const atual = await repo.obterEntidade(efeito.antes.id);
        if (!atual) {
          conflitos.push(`não desfeito: ${efeito.antes.nome} não existe mais`);
          break;
        }
        if (atual.atualizadaEm > chamada.quando) {
          conflitos.push(`não desfeito: ${atual.nome} mudou depois`);
          break;
        }
        await repo.salvarEntidade(efeito.antes);
        desfeitos.push(`restaurou "${efeito.antes.nome}"`);
        break;
      }

      case 'criou-ligacao': {
        await repo.removerLigacao(efeito.id);
        desfeitos.push(`removeu ligação ${efeito.id}`);
        break;
      }

      case 'criou-sessao': {
        const sessoes = await repo.listarSessoes(cId);
        const atual = sessoes.find(s => s.id === efeito.id);
        if (!atual) {
          desfeitos.push(`Sessão "${efeito.id}" já não existe`);
          break;
        }
        if (atual.atualizadaEm > chamada.quando) {
          conflitos.push(`não desfeito: ${atual.nome} mudou depois`);
          break;
        }
        await repo.removerSessao(efeito.id);
        desfeitos.push(`removeu sessão "${atual.nome}"`);
        break;
      }

      case 'alterou-sessao': {
        const sessoes = await repo.listarSessoes(cId);
        const atual = sessoes.find(s => s.id === efeito.antes.id);
        if (!atual) {
          conflitos.push(`não desfeito: ${efeito.antes.nome} não existe mais`);
          break;
        }
        if (atual.atualizadaEm > chamada.quando) {
          conflitos.push(`não desfeito: ${atual.nome} mudou depois`);
          break;
        }
        await repo.salvarSessao(efeito.antes);
        desfeitos.push(`restaurou sessão "${efeito.antes.nome}"`);
        break;
      }

      case 'alterou-campanha': {
        const atual = await repo.obterCampanha(cId);
        if (!atual) {
          conflitos.push('não desfeito: campanha não encontrada');
          break;
        }
        if (atual.atualizadaEm > chamada.quando) {
          conflitos.push(`não desfeito: ${atual.nome} mudou depois`);
          break;
        }
        await repo.salvarCampanha(efeito.antes);
        desfeitos.push(`restaurou campanha "${efeito.antes.nome}"`);
        break;
      }
    }
  }

  chamada.desfeita = desfeitos.length > 0;
  atividadeDoAssistente.value = [...atividadeDoAssistente.value];

  try {
    await atualizar();
    await carregarSessoes();
  } catch {
    // ignora em testes ou sem DOM
  }

  return {
    ok: conflitos.length === 0,
    chamadaId: id,
    desfeitos,
    conflitos,
  };
}

import { signal } from '@preact/signals';
import type { RegistroResumo } from '../dominio/resumos-do-quadro.ts';
import { listarResumos, removerResumo, salvarResumo } from './banco-quadros.ts';

/** Resumos do quadro mostrado no navegador de molduras, por alvo. */
export const resumosDoQuadro = signal<{ quadroId: string; porAlvo: ReadonlyMap<string, RegistroResumo> }>({
  quadroId: '',
  porAlvo: new Map(),
});

export async function carregarResumos(quadroId: string): Promise<void> {
  const lista = await listarResumos(quadroId);
  resumosDoQuadro.value = { quadroId, porAlvo: new Map(lista.map((r) => [r.alvo, r])) };
}

/** Grava e, se for o quadro mostrado, atualiza a tela (usado pela ponte e pelo mestre). */
export async function gravarResumo(resumo: RegistroResumo): Promise<void> {
  await salvarResumo(resumo);
  const atual = resumosDoQuadro.value;
  if (atual.quadroId === resumo.quadroId) {
    resumosDoQuadro.value = { quadroId: atual.quadroId, porAlvo: new Map(atual.porAlvo).set(resumo.alvo, resumo) };
  }
}

/** O mestre edita: vira `autor: 'mestre'`. Texto vazio apaga o resumo. */
export async function salvarResumoDoMestre(quadroId: string, alvo: string, texto: string, assinatura: string): Promise<void> {
  const limpo = texto.trim();
  if (!limpo) {
    await removerResumo(quadroId, alvo);
    const atual = resumosDoQuadro.value;
    if (atual.quadroId === quadroId) {
      const novo = new Map(atual.porAlvo);
      novo.delete(alvo);
      resumosDoQuadro.value = { quadroId, porAlvo: novo };
    }
    return;
  }
  await gravarResumo({ quadroId, alvo, texto: limpo, assinatura, autor: 'mestre', em: Date.now() });
}

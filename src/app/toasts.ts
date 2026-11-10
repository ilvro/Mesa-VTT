import { signal } from '@preact/signals';

export interface Aviso { id: number; texto: string; erro: boolean; acao?: { rotulo: string; aoClicar: () => void } }
export const avisos = signal<Aviso[]>([]);
let proximo = 1;

/** Aviso passageiro; com `acao`, ganha um botão e fica mais tempo (clicar o fecha). */
export function avisar(texto: string, erro = false, acao?: Aviso['acao']): void {
  const aviso: Aviso = { id: proximo++, texto, erro, ...(acao ? { acao } : {}) };
  avisos.value = [...avisos.value, aviso].slice(-4);
  setTimeout(() => { avisos.value = avisos.value.filter(a => a.id !== aviso.id); }, acao ? 30000 : erro ? 6000 : 3200);
}

export const mensagemDe = (erro: unknown): string => (erro instanceof Error ? erro.message : String(erro));

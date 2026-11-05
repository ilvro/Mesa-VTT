import { signal } from '@preact/signals';

export interface Aviso { id: number; texto: string; erro: boolean }
export const avisos = signal<Aviso[]>([]);
let proximo = 1;

export function avisar(texto: string, erro = false): void {
  const aviso = { id: proximo++, texto, erro };
  avisos.value = [...avisos.value, aviso].slice(-4);
  setTimeout(() => { avisos.value = avisos.value.filter(a => a.id !== aviso.id); }, erro ? 6000 : 3200);
}

export const mensagemDe = (erro: unknown): string => (erro instanceof Error ? erro.message : String(erro));

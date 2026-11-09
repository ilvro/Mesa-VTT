import { signal } from '@preact/signals';
import type { ComponentType } from 'preact';

/** O cabeçalho renderiza o que estiver aqui. Só o módulo de desenvolvimento da ponte preenche; no build de produção fica vazio. */
export const seloDoAssistente = signal<ComponentType | null>(null);

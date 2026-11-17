import { signal } from '@preact/signals';
import type { ComponentType } from 'preact';
import type { EstadoDaPonte } from '#mesa/ponte';

/** O cabeçalho renderiza o que estiver aqui. Só o módulo de desenvolvimento da ponte preenche; no build de produção fica vazio. */
export const seloDoAssistente = signal<ComponentType | null>(null);
export const estadoDaPonte = signal<EstadoDaPonte | null>(null);
export const entidadesDestacadas = signal<ReadonlySet<string>>(new Set());

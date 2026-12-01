import { signal } from '@preact/signals';
import type { ComponentType } from 'preact';
import type { EstadoDaPonte } from '#mesa/ponte';
import type { Caixa } from '../dominio/camera.ts';
import type { PaletaDaCampanha } from '../dominio/paleta.ts';
import type { Item } from '../dominio/quadro.ts';

/** O cabeçalho renderiza o que estiver aqui. Só o módulo de desenvolvimento da ponte preenche; no build de produção fica vazio. */
export const seloDoAssistente = signal<ComponentType | null>(null);
export const estadoDaPonte = signal<EstadoDaPonte | null>(null);
export const entidadesDestacadas = signal<ReadonlySet<string>>(new Set());

/** Captura de uma região do quadro (JPEG em data URL). A UI preenche (`main.tsx`), pois o app não importa a UI. */
export type CapturadorDoQuadro = (itens: ReadonlyMap<string, Item>, caixa: Caixa, opcoes: { lado: number; fundo: string; paleta: PaletaDaCampanha }) => Promise<string>;
export const capturadorDoQuadro = signal<CapturadorDoQuadro | null>(null);

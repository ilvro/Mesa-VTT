import { signal } from '@preact/signals';
import type { ComponentType } from 'preact';
import type { EstadoDaPonte } from '#mesa/ponte';
import type { Caixa } from '../dominio/camera.ts';
import type { PaletaDaCampanha } from '../dominio/paleta.ts';
import type { DocRico, Item } from '../dominio/quadro.ts';

/** O cabeçalho renderiza o que estiver aqui. Só o módulo de desenvolvimento da ponte preenche; no build de produção fica vazio. */
export const seloDoAssistente = signal<ComponentType | null>(null);
export const estadoDaPonte = signal<EstadoDaPonte | null>(null);
export const entidadesDestacadas = signal<ReadonlySet<string>>(new Set());

/** Captura de uma região do quadro (JPEG em data URL). A UI preenche (`main.tsx`), pois o app não importa a UI. */
export type CapturadorDoQuadro = (itens: ReadonlyMap<string, Item>, caixa: Caixa, opcoes: { lado: number; fundo: string; paleta: PaletaDaCampanha }) => Promise<string>;
export const capturadorDoQuadro = signal<CapturadorDoQuadro | null>(null);

/** Altura (px) que o texto precisa, com as regras do render do quadro; a UI preenche (`main.tsx`). `null` para texto vazio ou sem canvas. */
type EstiloTexto = Extract<Item, { tipo: 'texto' }>['texto'];
export type MedidorDeTexto = (pedido: { doc: DocRico; largura: number; padding: number; tamanhoFonte: number; fonte: EstiloTexto['fonte']; corPadrao: string; alinhamento: EstiloTexto['alinhamento'] }) => number | null;
export const medidorDeTexto = signal<MedidorDeTexto | null>(null);

/** Largura (px) que o texto precisa para caber numa linha, mais o padding dos dois lados (Q9n); a UI preenche (`main.tsx`). */
export type MedidorDeLargura = (pedido: { doc: DocRico; padding: number; tamanhoFonte: number; fonte: EstiloTexto['fonte']; corPadrao: string; alinhamento: EstiloTexto['alinhamento'] }) => number | null;
export const medidorDeLargura = signal<MedidorDeLargura | null>(null);

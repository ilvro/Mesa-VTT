import { signal } from '@preact/signals';

/** A busca rápida (Ctrl+K) está aberta. */
export const buscaRapidaAberta = signal(false);

export type AcaoMenuContexto = {
  id: string;
  rotulo: string;
  perigo?: boolean;
  confirmar?: boolean;
  executar: () => void | Promise<unknown>;
};

export interface EstadoMenuContexto {
  x: number;
  y: number;
  titulo?: string;
  acoes: readonly AcaoMenuContexto[];
}

/** O menu de botão direito aberto (ou `null`). */
export const menuContexto = signal<EstadoMenuContexto | null>(null);

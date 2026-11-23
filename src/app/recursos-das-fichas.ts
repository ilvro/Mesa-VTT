import { signal } from '@preact/signals';
import { chaveDaRef } from '#mesa';
import { lerRecursos, type Recursos } from '../dominio/recursos-das-fichas.ts';
import { barramentoDaMesa } from './barramento.ts';
import { campanhaAtiva } from './campanha.ts';

/** O último `ficha.recursos` de cada ficha (pelo texto canônico do Ref), só em memória, enquanto o app está aberto. */
export const recursosDasFichas = signal<ReadonlyMap<string, Recursos>>(new Map());

let parar: (() => void) | null = null;

/** Passa a ouvir `ficha.recursos` no barramento (fatos de outra campanha são ignorados). Devolve a função que para. */
export function iniciarRecursosDasFichas(): () => void {
  parar?.();
  const b = barramentoDaMesa();
  if (!b) return () => {};
  const desligar = b.ouvir('ficha.recursos', e => {
    if (e.campanhaId && e.campanhaId !== campanhaAtiva.value?.id) return;
    const lido = lerRecursos(e.dados);
    if (!lido) return;
    const novo = new Map(recursosDasFichas.value);
    novo.set(chaveDaRef(lido.ficha), lido.recursos);
    recursosDasFichas.value = novo;
  });
  parar = () => { desligar(); parar = null; };
  return parar;
}

import { signal } from '@preact/signals';
import {
  deveDisparar,
  type ItemMoldura,
  type ModoMoldurasAgem,
} from '../dominio/molduras.ts';
import { barramentoDaMesa, pedidoParaAbrir } from './barramento.ts';
import { entidades } from './campanha.ts';
import { definirFato, estadoDoMundo } from './quadros.ts';
import { sessaoAtiva } from './registro.ts';
import { ativarCena } from './sessao.ts';
import { avisar } from './toasts.ts';

export type { ModoMoldurasAgem };

export const modoMoldurasAgem = signal<ModoMoldurasAgem>('perguntar');
export const ultimaMolduraFocada = signal<string | null>(null);

function executarAcoesDaMoldura(moldura: ItemMoldura): void {
  const aoFocar = moldura.aoFocar;
  if (!aoFocar) return;

  if (aoFocar.cena) {
    if (aoFocar.cena.app === 'mesa' && aoFocar.cena.tipo === 'cena') {
      const ent = entidades.value.find((e) => e.id === aoFocar.cena!.id);
      if (ent) void ativarCena(ent);
    } else {
      const pedido = pedidoParaAbrir(aoFocar.cena);
      const b = barramentoDaMesa();
      if (pedido && b) {
        void b.pedir(pedido, { ref: aoFocar.cena }).catch(() => null);
      }
    }
  }

  const entradas = Object.entries(aoFocar.fatos);
  const anteriores: [string, string | boolean | undefined][] = entradas.map(
    ([chave]) => [chave, estadoDoMundo.value.fatos[chave]],
  );
  for (const [chave, valor] of entradas) {
    void definirFato(chave, valor);
  }

  const nome = moldura.titulo.trim() || 'Moldura';
  avisar(`Ao entrar em "${nome}": ações aplicadas.`, false, {
    rotulo: 'Desfazer',
    aoClicar: () => {
      for (const [chave, valorAnterior] of anteriores) {
        void definirFato(chave, valorAnterior);
      }
    },
  });
}

export function aoFocarMoldura(
  moldura: ItemMoldura,
  todasMolduras: readonly ItemMoldura[],
): void {
  const anteriorId = ultimaMolduraFocada.value;
  ultimaMolduraFocada.value = moldura.id;

  if (!sessaoAtiva.value) return;
  if (!deveDisparar(anteriorId, moldura, todasMolduras, modoMoldurasAgem.value)) {
    return;
  }

  if (modoMoldurasAgem.value === 'sim') {
    executarAcoesDaMoldura(moldura);
    return;
  }

  const nome = moldura.titulo.trim() || 'Moldura';
  avisar(`Entrou em "${nome}". Aplicar ações?`, false, {
    rotulo: 'Aplicar',
    aoClicar: () => executarAcoesDaMoldura(moldura),
  });
}

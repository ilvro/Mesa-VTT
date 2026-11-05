import { criarBarramento, type Barramento, type Ref } from '#mesa';
import { NOME_DO_APP } from '../dominio/entidades.ts';
import { descobrirApp, enderecoDe } from './aplicativos.ts';
import { campanhaAtiva } from './campanha.ts';
import { avisar } from './toasts.ts';

/** O pedido que cada aplicativo atende para “abrir” uma coisa sua (catálogo do `mesa-core`). No Jukebox, abrir uma cena é tocá-la. O Tabletop não tem. */
export function pedidoParaAbrir(ref: Ref): string | undefined {
  switch (ref.app) {
    case 'atlas': return 'atlas.focar';
    case 'ficha': return 'ficha.abrir';
    case 'atelie': return 'atelie.abrir';
    case 'jukebox': return ref.tipo === 'efeito' ? 'jukebox.efeito' : ref.tipo === 'cena-sonora' ? 'jukebox.tocar' : undefined;
    default: return undefined;
  }
}

let barramento: Barramento | null | undefined;

/** O barramento da mesa (`mesa:eventos`), aberto na primeira vez que alguém o usa; `null` onde não há `BroadcastChannel`. */
export function barramentoDaMesa(): Barramento | null {
  if (barramento !== undefined) return barramento;
  try { barramento = typeof BroadcastChannel === 'undefined' ? null : criarBarramento({ app: 'mesa', campanhaId: campanhaAtiva.value?.id ?? null }); }
  catch (erro) { console.warn('Mesa: sem barramento', erro); barramento = null; }
  return barramento;
}

/**
 * Abre uma coisa de outro aplicativo. Se o aplicativo está aberto, ele atende o pedido (o Atlas foca o mapa, a Ficha abre a ficha…);
 * sem resposta em 1,5 s, abre o endereço do manifesto numa aba. Sem nenhum dos dois, avisa.
 */
export async function abrirNoApp(ref: Ref): Promise<'atendido' | 'aba' | 'falhou'> {
  const pedido = pedidoParaAbrir(ref), b = barramentoDaMesa();
  if (pedido && b) {
    b.campanhaId = campanhaAtiva.value?.id ?? null;
    const r = await b.pedir(pedido, { ref }).catch(() => null);
    if (r?.ok) return 'atendido';
    if (r && !r.ok && r.motivo === 'recusado') { avisar(`${NOME_DO_APP[ref.app]} não abriu: ${r.detalhe ?? 'pedido recusado'}.`, true); return 'falhou'; }
  }
  await descobrirApp(ref.app);
  const endereco = enderecoDe(ref);
  if (endereco) { window.open(endereco, '_blank', 'noopener'); return 'aba'; }
  avisar(`Não achei o ${NOME_DO_APP[ref.app]} ao lado da Mesa para abrir isto.`, true);
  return 'falhou';
}

import { inventario, sondando, sondarAplicativos } from '../app/inventario.ts';
import { ROTULO_DO_ESTADO } from '../dominio/aplicativos.ts';
import { NOME_DO_APP } from '../dominio/entidades.ts';
import { cx } from './cx.ts';
import type { ItemDoInventario } from '../app/inventario.ts';

const ORDEM = ['atlas', 'ficha', 'atelie', 'jukebox', 'tabletop', 'mesa'] as const;
const ENDERECO_DO_ICONE = (i: ItemDoInventario): string | null => { try { return i.manifesto ? new URL(i.manifesto.icone, i.base).href : null; } catch { return null; } };

function Cartao({ i }: { i: ItemDoInventario }) {
  const m = i.manifesto, icone = ENDERECO_DO_ICONE(i), eu = i.app === 'mesa';
  return (
    <article class={cx('cartao', 'app', `estado-${i.estado}`)} data-testid={`app-${i.app}`} data-estado={i.estado}>
      <div class="cartao-corpo">
        <header class="app-topo">
          {icone ? <img class="app-icone" src={icone} alt="" width={36} height={36} /> : <span class="app-icone vazio-icone" aria-hidden="true">{NOME_DO_APP[i.app].slice(0, 1)}</span>}
          <h3>{m?.nome ?? NOME_DO_APP[i.app]}</h3>
          <span class={cx('selo', `selo-${i.estado}`)} data-testid="app-estado"><i class="ponto" />{eu ? 'Você está aqui' : ROTULO_DO_ESTADO[i.estado]}</span>
        </header>
        {m
          ? <dl class="app-listas">
              <dt>Oferece</dt><dd>{m.oferece.length ? m.oferece.map(o => <span key={o} class="chip pequeno">{o}</span>) : <span class="meta">nada ligável</span>}</dd>
              <dt>Atende</dt><dd>{m.atende.length ? m.atende.map(o => <span key={o} class="chip pequeno">{o}</span>) : <span class="meta">nenhum pedido</span>}</dd>
              <dt>Avisa</dt><dd>{m.emite.length ? m.emite.map(o => <span key={o} class="chip pequeno">{o}</span>) : <span class="meta">nenhum fato</span>}</dd>
            </dl>
          : <p class="dica" data-testid="app-detalhe">{i.detalhe ?? ''}{i.estado === 'fora-do-ar' ? ' Abra a Mesa pelo atalho do app de desktop, ou rode “npm run mesa-dev” na pasta do Atlas.' : ''}</p>}
        <div class="cartao-rodape">
          {i.estado === 'fora-do-ar' ? <span class="meta">sem endereço para abrir</span> : eu ? <span class="meta">este aplicativo</span> : <a class="botao-pilula" href={i.base} target="_blank" rel="noopener" data-testid="app-abrir">Abrir</a>}
        </div>
      </div>
    </article>
  );
}

export function Aplicativos() {
  const itens = [...inventario.value].sort((a, b) => ORDEM.indexOf(a.app) - ORDEM.indexOf(b.app));
  return (
    <section class="pagina" data-testid="tela-aplicativos">
      <div class="galeria-topo">
        <h2 class="faixa grande">Aplicativos</h2>
        <button type="button" class="botao-pilula" data-testid="atualizar-aplicativos" disabled={sondando.value} onClick={() => void sondarAplicativos()}>{sondando.value ? 'Procurando…' : 'Procurar de novo'}</button>
      </div>
      <p class="dica">Cada aplicativo da mesa se anuncia por um <code>mesa.json</code> ao lado dele. Os que estão por perto aparecem como achados, com o que oferecem e atendem.</p>
      {itens.length === 0 ? <div class="carregando">Procurando os aplicativos…</div> : <div class="cartoes">{itens.map(i => <Cartao key={i.app} i={i} />)}</div>}
    </section>
  );
}

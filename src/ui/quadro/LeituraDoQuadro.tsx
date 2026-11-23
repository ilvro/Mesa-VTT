import { useEffect, useMemo, useRef } from 'preact/hooks';
import { useSignal } from '@preact/signals';
import { abrirNoApp } from '../../app/barramento.ts';
import { entidades } from '../../app/campanha.ts';
import { aoFocarMoldura, modoFocoSessao, ultimaMolduraFocada } from '../../app/foco-do-quadro.ts';
import { obterUrlImagemSincrona, urlDaImagem } from '../../app/imagens-quadro.ts';
import { estadoDoMundo, marcarFeito, paletaDaCampanha } from '../../app/quadros.ts';
import { abrirEntidade, tela } from '../../app/rotas.ts';
import { entidadePorRef } from '../../dominio/cenas.ts';
import { itemEhSecreto } from '../../dominio/busca-quadro.ts';
import { NOME_DO_APP, NOME_DO_TIPO_DE_REF, ROTULO_DO_TIPO } from '../../dominio/entidades.ts';
import { condicoesDoItem, itemAtendeCondicoes } from '../../dominio/estado-do-mundo.ts';
import type { ItemMoldura } from '../../dominio/molduras.ts';
import { PALETA_PADRAO, corComOpacidade, corDoTexto, fundoEfetivo } from '../../dominio/paleta.ts';
import type { Item } from '../../dominio/quadro.ts';
import { roteiroDoQuadro } from '../../dominio/roteiro-do-quadro.ts';
import { ConteudoDecorado } from './TextoDecorado.tsx';

interface LeituraProps {
  itens: ReadonlyMap<string, Item>;
  esconderSegredos: boolean;
  aoVerNoQuadro: (item: Item) => void;
}

function ImagemDeLeitura({ item }: { item: Extract<Item, { tipo: 'imagem' }> }) {
  const url = useSignal<string | null>(obterUrlImagemSincrona(item.imagemId));
  useEffect(() => {
    let ativo = true;
    void urlDaImagem(item.imagemId).then((u) => {
      if (ativo) url.value = u;
    });
    return () => {
      ativo = false;
    };
  }, [item.imagemId]);
  return url.value ? (
    <img class="leitura-imagem" src={url.value} alt="" loading="lazy" decoding="async" />
  ) : (
    <span class="meta">Carregando imagem…</span>
  );
}

function CartaoDeRef({ item }: { item: Extract<Item, { tipo: 'ref' }> }) {
  const entidade = entidadePorRef(item.ref, entidades.value);
  if (!entidade) {
    return (
      <div class="leitura-ref">
        <span class="selo">{NOME_DO_APP[item.ref.app] ?? item.ref.app}</span>
        <strong>{item.ref.id}</strong>
        <span class="meta">{NOME_DO_TIPO_DE_REF[item.ref.tipo] ?? item.ref.tipo}</span>
        <button type="button" class="botao-pilula" onClick={() => void abrirNoApp(item.ref)}>
          Abrir no app ↗
        </button>
      </div>
    );
  }
  return (
    <div class="leitura-ref">
      <strong>{entidade.nome}</strong>
      <span class="meta">{ROTULO_DO_TIPO[entidade.tipo].singular}</span>
      <button type="button" class="botao-pilula" onClick={() => abrirEntidade(entidade.id)}>
        Abrir
      </button>
    </div>
  );
}

function ItemDeLeitura({ item, aoVerNoQuadro }: { item: Item; aoVerNoQuadro: (i: Item) => void }) {
  let corpo = null;
  let estiloCaixa: Record<string, string> = {};
  let ehTexto = false;
  let selo = null;
  if (item.tipo === 'texto' || item.tipo === 'forma') {
    ehTexto = true;
    const paleta = item.semantica && !item.caixa.fundo ? paletaDaCampanha.value : PALETA_PADRAO;
    const fundo = fundoEfetivo(item, paleta);
    const conds = condicoesDoItem(item);
    const estado = conds.length > 0 ? estadoDoMundo.value : undefined;
    const condOk = estado ? itemAtendeCondicoes(item, estado) : true;
    if (fundo) {
      estiloCaixa = {
        backgroundColor: corComOpacidade(fundo, item.caixa.opacidade),
        color: corDoTexto(fundo),
      };
    }
    if (!condOk) estiloCaixa.opacity = '0.45';
    if (!condOk) {
      selo = (
        <span class="selo-condicao" data-testid={`leitura-condicao-${item.id}`}>
          se: {conds.join(', ')}
        </span>
      );
    }
    corpo = <ConteudoDecorado doc={item.doc} estado={estado} className="doc-rico-html leitura-texto" />;
  } else if (item.tipo === 'imagem') {
    corpo = <ImagemDeLeitura item={item} />;
  } else if (item.tipo === 'ref') {
    corpo = <CartaoDeRef item={item} />;
  }
  return (
    <div
      class={`leitura-item ${ehTexto ? 'leitura-item-texto' : ''} ${item.feito ? 'feito' : ''}`}
      data-testid={`leitura-item-${item.id}`}
      data-item-id={item.id}
      style={estiloCaixa}
    >
      {selo}
      {ehTexto ? (
        <button
          type="button"
          class={`item-feito-btn ${item.feito ? 'ativo' : ''}`}
          title={item.feito ? 'Desmarcar feito' : 'Marcar feito'}
          data-testid={`leitura-feito-${item.id}`}
          onClick={() => marcarFeito([item.id])}
        >
          ✓
        </button>
      ) : null}
      {corpo}
      <button
        type="button"
        class="leitura-ver-no-quadro"
        data-testid={`ver-no-quadro-${item.id}`}
        onClick={() => aoVerNoQuadro(item)}
      >
        ver no quadro
      </button>
    </div>
  );
}

export function LeituraDoQuadro({ itens, esconderSegredos, aoVerNoQuadro }: LeituraProps) {
  const secoes = useMemo(() => {
    const visiveis = [...itens.values()].filter((i) => !(esconderSegredos && itemEhSecreto(i)));
    return roteiroDoQuadro(visiveis);
  }, [itens, esconderSegredos]);
  const todasMolduras = useMemo(
    () => [...itens.values()].filter((i): i is ItemMoldura => i.tipo === 'moldura'),
    [itens],
  );
  const molduraAtiva = useSignal<string | null>(null);
  const rolagemRef = useRef<HTMLDivElement>(null);
  const interagiu = useRef(false);
  const ultimaDisparada = useRef<string | null>(null);
  const noTopo = useRef<string | null>(null);
  const refsAtuais = useRef({ todasMolduras });
  refsAtuais.current = { todasMolduras };

  const secaoEl = (id: string): HTMLElement | null =>
    rolagemRef.current?.querySelector<HTMLElement>(`[data-secao-id="${id}"]`) ?? null;

  const rolarPara = (id: string) => {
    const el = secaoEl(id);
    const cont = rolagemRef.current;
    if (!el || !cont) return;
    interagiu.current = true;
    cont.scrollTop += el.getBoundingClientRect().top - cont.getBoundingClientRect().top;
  };

  // A moldura no topo da leitura vira a moldura focada, uma vez por mudança.
  useEffect(() => {
    const cont = rolagemRef.current;
    if (!cont || typeof IntersectionObserver === 'undefined') return;
    const dentro = new Set<string>();
    const ordem = secoes.flatMap((s) => (s.moldura ? [s.moldura.id] : []));
    const obs = new IntersectionObserver(
      (entradas) => {
        for (const e of entradas) {
          const id = (e.target as HTMLElement).dataset.secaoId;
          if (!id) continue;
          if (e.isIntersecting) dentro.add(id);
          else dentro.delete(id);
        }
        const topo = ordem.find((id) => dentro.has(id));
        if (!topo) return;
        molduraAtiva.value = topo;
        noTopo.current = topo;
        if (!interagiu.current || ultimaDisparada.current === topo) return;
        ultimaDisparada.current = topo;
        const m = refsAtuais.current.todasMolduras.find((x) => x.id === topo);
        if (m) aoFocarMoldura(m, refsAtuais.current.todasMolduras);
      },
      { root: cont, rootMargin: '0px 0px -80% 0px', threshold: 0 },
    );
    for (const id of ordem) {
      const el = secaoEl(id);
      if (el) obs.observe(el);
    }
    return () => obs.disconnect();
  }, [secoes]);

  // No modo Seguir da sessão, rola até a moldura focada (sem brigar com a rolagem do usuário).
  const focada = ultimaMolduraFocada.value;
  const seguir = tela.value === 'sessao' && modoFocoSessao.value === 'seguir';
  useEffect(() => {
    if (!seguir || !focada || focada === noTopo.current) return;
    rolarPara(focada);
    ultimaDisparada.current = focada;
  }, [seguir, focada]);

  const molduras = secoes.filter((s) => s.moldura);
  if (secoes.length === 0) {
    return (
      <div class="leitura-quadro" data-testid="leitura-quadro">
        <p class="meta leitura-vazio">Nada para ler neste quadro ainda.</p>
      </div>
    );
  }

  return (
    <div class="leitura-quadro" data-testid="leitura-quadro">
      <nav class="leitura-indice" aria-label="Molduras" data-testid="leitura-indice">
        {molduras.map((s) => {
          const m = s.moldura!;
          return (
            <button
              key={m.id}
              type="button"
              class={`leitura-indice-item ${molduraAtiva.value === m.id ? 'ativo' : ''}`}
              style={{ paddingLeft: `${10 + s.nivel * 14}px` }}
              data-testid={`leitura-indice-${m.id}`}
              onClick={() => rolarPara(m.id)}
            >
              {m.titulo.trim() || 'Moldura sem título'}
            </button>
          );
        })}
      </nav>
      <div
        class="leitura-rolagem"
        ref={rolagemRef}
        data-testid="leitura-rolagem"
        onScroll={() => {
          interagiu.current = true;
        }}
        onWheel={() => {
          interagiu.current = true;
        }}
      >
        <div class="leitura-coluna">
          {secoes.map((s) => (
            <section
              key={s.moldura?.id ?? 'soltos'}
              class="leitura-secao"
              data-secao-id={s.moldura?.id}
              data-testid={`leitura-secao-${s.moldura?.id ?? 'soltos'}`}
            >
              {s.moldura ? (
                <h2 class={`leitura-titulo nivel-${Math.min(s.nivel, 2)}`}>
                  {s.moldura.titulo.trim() || 'Moldura sem título'}
                </h2>
              ) : (
                <h2 class="leitura-titulo nivel-0 soltos">Soltos</h2>
              )}
              {s.itens.map((it) => (
                <ItemDeLeitura key={it.id} item={it} aoVerNoQuadro={aoVerNoQuadro} />
              ))}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

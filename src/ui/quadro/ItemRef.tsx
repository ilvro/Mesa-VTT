import { useEffect, useState } from 'preact/hooks';
import { abrirNoApp } from '../../app/barramento.ts';
import { entidades } from '../../app/campanha.ts';
import { abrirEntidade } from '../../app/rotas.ts';
import { entidadePorRef } from '../../dominio/cenas.ts';
import {
  NOME_DO_APP,
  NOME_DO_TIPO_DE_REF,
  ROTULO_DO_TIPO,
} from '../../dominio/entidades.ts';
import { ehRefDeEntidadeDaMesa } from '../../dominio/notas.ts';
import { decorarMarcadores } from '../../dominio/paleta.ts';
import type { Item } from '../../dominio/quadro.ts';

interface ItemRefProps {
  item: Extract<Item, { tipo: 'ref' }>;
}

function Retrato({ nome, blob }: { nome: string; blob?: Blob }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) {
      setUrl(null);
      return;
    }
    const objUrl = URL.createObjectURL(blob);
    setUrl(objUrl);
    return () => URL.revokeObjectURL(objUrl);
  }, [blob]);

  if (url) {
    return <img src={url} alt={nome} class="elenco-retrato" loading="lazy" />;
  }
  return (
    <span class="elenco-retrato elenco-retrato-vazio" aria-hidden="true">
      {nome.slice(0, 1).toUpperCase()}
    </span>
  );
}

export function ItemRef({ item }: ItemRefProps) {
  const listaEntidades = entidades.value;
  const entidade = entidadePorRef(item.ref, listaEntidades);

  const aoClicarConteudo = (e: MouseEvent) => {
    const alvo = e.target as HTMLElement | null;
    if (!alvo) return;
    const elEnt = alvo.closest<HTMLElement>('[data-entidade-id]');
    if (elEnt) {
      e.preventDefault();
      e.stopPropagation();
      const id = elEnt.dataset.entidadeId;
      if (id) abrirEntidade(id);
      return;
    }
    const elRef = alvo.closest<HTMLElement>('[data-ref-app]');
    if (elRef) {
      e.preventDefault();
      e.stopPropagation();
      const app = elRef.dataset.refApp;
      const tipo = elRef.dataset.refTipo;
      const id = elRef.dataset.refId;
      if (app && tipo && id) {
        void abrirNoApp({ app: app as typeof item.ref.app, tipo, id });
      }
    }
  };

  if (!entidade) {
    const nomeApp = NOME_DO_APP[item.ref.app] ?? item.ref.app;
    const nomeTipo = NOME_DO_TIPO_DE_REF[item.ref.tipo] ?? item.ref.tipo;
    return (
      <div
        class="item-quadro item-ref"
        data-testid={`item-${item.id}`}
        data-item-id={item.id}
        style={{
          left: `${item.x}px`,
          top: `${item.y}px`,
          width: `${item.largura}px`,
          height: `${item.altura}px`,
          zIndex: item.z,
          transform: item.rotacao ? `rotate(${item.rotacao}deg)` : undefined,
        }}
      >
        <div class="item-ref-topo">
          <span class="selo">{nomeApp}</span>
          <span class="meta">{nomeTipo}</span>
        </div>
        <div class="item-ref-nome">{item.ref.id}</div>
        <div class="item-ref-acoes" onPointerDown={(e) => e.stopPropagation()}>
          <button
            type="button"
            class="botao-pilula"
            data-testid={`ref-abrir-app-${item.id}`}
            onClick={(e) => {
              e.stopPropagation();
              void abrirNoApp(item.ref);
            }}
          >
            Abrir no app ↗
          </button>
        </div>
      </div>
    );
  }

  const refExterno = entidade.refs.find((r) => !ehRefDeEntidadeDaMesa(r));
  const resumoBruto = entidade.notas.trim();
  const resumo =
    resumoBruto.length > 220 ? `${resumoBruto.slice(0, 220)}…` : resumoBruto;

  return (
    <div
      class="item-quadro item-ref"
      data-testid={`item-${item.id}`}
      data-item-id={item.id}
      style={{
        left: `${item.x}px`,
        top: `${item.y}px`,
        width: `${item.largura}px`,
        height: `${item.altura}px`,
        zIndex: item.z,
        transform: item.rotacao ? `rotate(${item.rotacao}deg)` : undefined,
      }}
    >
      <div class="item-ref-topo">
        <Retrato nome={entidade.nome} blob={entidade.retrato} />
        <div class="item-ref-titulos">
          <div class="item-ref-nome">{entidade.nome}</div>
          <div class="meta">{ROTULO_DO_TIPO[entidade.tipo].singular}</div>
        </div>
      </div>

      {entidade.tags.length > 0 ? (
        <div class="item-ref-tags">
          {entidade.tags.slice(0, 4).map((t) => (
            <span key={t} class="selo">
              {t}
            </span>
          ))}
        </div>
      ) : null}

      {resumo ? (
        <div
          class="item-ref-notas"
          onClick={aoClicarConteudo}
          onPointerDown={(e) => {
            if ((e.target as HTMLElement | null)?.closest('[data-entidade-id],[data-ref-app]')) {
              e.stopPropagation();
            }
          }}
          dangerouslySetInnerHTML={{
            __html: decorarMarcadores(resumo, listaEntidades),
          }}
        />
      ) : null}

      <div class="item-ref-acoes" onPointerDown={(e) => e.stopPropagation()}>
        <button
          type="button"
          class="botao-pilula"
          data-testid={`ref-abrir-${item.id}`}
          onClick={(e) => {
            e.stopPropagation();
            abrirEntidade(entidade.id);
          }}
        >
          Abrir
        </button>
        {refExterno ? (
          <button
            type="button"
            class="botao-pilula"
            data-testid={`ref-abrir-app-${item.id}`}
            onClick={(e) => {
              e.stopPropagation();
              void abrirNoApp(refExterno);
            }}
          >
            Abrir no app ↗
          </button>
        ) : null}
      </div>
    </div>
  );
}

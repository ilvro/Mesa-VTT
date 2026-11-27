import { useEffect, useState } from 'preact/hooks';
import type { Entidade, Ref } from '#mesa';
import { abrirNoApp } from '../../app/barramento.ts';
import { entidades } from '../../app/campanha.ts';
import { idDaPistaDoAtelie, miniaturaDaPista } from '../../app/pistas-atelie.ts';
import { recursosDasFichas } from '../../app/recursos-das-fichas.ts';
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
import { fracao, recursosDaEntidade, tomDoPv } from '../../dominio/recursos-das-fichas.ts';
import { abrirInspecaoNaMesa } from '../InspecaoDePista.tsx';
import '../fase-8.css';

interface ItemRefProps {
  item: Extract<Item, { tipo: 'ref' }>;
}

function criarUrlDeBlob(blob: Blob): string | null {
  try {
    if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
      return URL.createObjectURL(blob);
    }
  } catch {
    // ambiente sem suporte a createObjectURL
  }
  return null;
}

function revogarUrlDeBlob(url: string | null): void {
  if (!url) return;
  try {
    URL.revokeObjectURL(url);
  } catch {
    // ignora
  }
}

export function useMiniaturaDoRef(
  entidade: Entidade | undefined,
  ref: Ref,
): { url: string | null; ehPista: boolean } {
  const [url, setUrl] = useState<string | null>(null);

  const docIdDaRef = idDaPistaDoAtelie(ref);
  const ehPista = entidade ? entidade.tipo === 'pista' : docIdDaRef !== null;
  const suportaMiniatura = entidade
    ? entidade.tipo === 'lugar' || entidade.tipo === 'pista'
    : docIdDaRef !== null;

  const docIdAtelie = ehPista
    ? (docIdDaRef ??
        entidade?.refs.map(idDaPistaDoAtelie).find((id): id is string => id !== null) ??
        null)
    : null;

  const retrato = suportaMiniatura ? entidade?.retrato : undefined;

  useEffect(() => {
    if (!suportaMiniatura) {
      setUrl(null);
      return;
    }

    if (retrato) {
      const objUrl = criarUrlDeBlob(retrato);
      setUrl(objUrl);
      return () => revogarUrlDeBlob(objUrl);
    }

    if (!docIdAtelie) {
      setUrl(null);
      return;
    }

    let ativo = true;
    let objUrl: string | null = null;
    void miniaturaDaPista(docIdAtelie).then((blob) => {
      if (!ativo) return;
      if (!blob) {
        setUrl(null);
        return;
      }
      objUrl = criarUrlDeBlob(blob);
      setUrl(objUrl);
    });

    return () => {
      ativo = false;
      revogarUrlDeBlob(objUrl);
    };
  }, [suportaMiniatura, retrato, docIdAtelie]);

  return { url, ehPista };
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
  const { url: urlMiniatura, ehPista } = useMiniaturaDoRef(entidade, item.ref);

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
    const docIdAtelie = idDaPistaDoAtelie(item.ref);
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
        {urlMiniatura ? (
          <div
            class={
              ehPista
                ? `item-ref-miniatura item-ref-miniatura-pista${docIdAtelie ? ' clicavel' : ''}`
                : 'item-ref-miniatura item-ref-miniatura-mapa'
            }
            data-testid={`miniatura-${item.id}`}
            title={docIdAtelie ? 'Inspecionar pista (Luz UV)' : undefined}
            onClick={
              docIdAtelie
                ? (e) => {
                    e.stopPropagation();
                    void abrirInspecaoNaMesa(docIdAtelie);
                  }
                : undefined
            }
          >
            <img src={urlMiniatura} alt="Prévia" loading="lazy" />
          </div>
        ) : null}
        <div class="item-ref-acoes" onPointerDown={(e) => e.stopPropagation()}>
          {docIdAtelie ? (
            <button
              type="button"
              class="botao-pilula destaque"
              data-testid={`ref-inspecionar-${item.id}`}
              onClick={(e) => {
                e.stopPropagation();
                void abrirInspecaoNaMesa(docIdAtelie);
              }}
            >
              🔬 Inspecionar
            </button>
          ) : null}
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
  const docIdAtelie =
    idDaPistaDoAtelie(item.ref) ??
    entidade.refs.map(idDaPistaDoAtelie).find((id): id is string => id !== null) ??
    null;
  const recursos = item.aparencia === 'cartao' ? recursosDaEntidade(entidade.refs, recursosDasFichas.value) : undefined;
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
        {!urlMiniatura ? <Retrato nome={entidade.nome} blob={entidade.retrato} /> : null}
        <div class="item-ref-titulos">
          <div class="item-ref-nome">{entidade.nome}</div>
          <div class="meta">{ROTULO_DO_TIPO[entidade.tipo].singular}</div>
        </div>
      </div>

      {urlMiniatura ? (
        <div
          class={
            ehPista
              ? `item-ref-miniatura item-ref-miniatura-pista${docIdAtelie ? ' clicavel' : ''}`
              : 'item-ref-miniatura item-ref-miniatura-mapa'
          }
          data-testid={`miniatura-${item.id}`}
          title={docIdAtelie ? 'Inspecionar pista (Luz UV)' : undefined}
          onClick={
            docIdAtelie
              ? (e) => {
                  e.stopPropagation();
                  void abrirInspecaoNaMesa(docIdAtelie);
                }
              : undefined
          }
        >
          <img src={urlMiniatura} alt={entidade.nome} loading="lazy" />
        </div>
      ) : null}

      {recursos ? (
        <div class="item-ref-recursos" data-testid={`recursos-${item.id}`}>
          <div class="recurso" data-testid={`recurso-pv-${item.id}`}>
            <span class="recurso-rotulo">PV</span>
            <span class="recurso-barra">
              <span
                class={`recurso-cheio tom-${tomDoPv(fracao(recursos.pv, recursos.pvMax))}`}
                style={{ width: `${fracao(recursos.pv, recursos.pvMax) * 100}%` }}
              />
            </span>
            <span class="recurso-numeros">{recursos.pv}/{recursos.pvMax}</span>
          </div>
          <div class="recurso" data-testid={`recurso-pd-${item.id}`}>
            <span class="recurso-rotulo">PD</span>
            <span class="recurso-barra">
              <span
                class="recurso-cheio tom-acento"
                style={{ width: `${fracao(recursos.pd, recursos.pdMax) * 100}%` }}
              />
            </span>
            <span class="recurso-numeros">{recursos.pd}/{recursos.pdMax}</span>
          </div>
        </div>
      ) : null}

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
        {docIdAtelie ? (
          <button
            type="button"
            class="botao-pilula destaque"
            data-testid={`ref-inspecionar-${item.id}`}
            onClick={(e) => {
              e.stopPropagation();
              void abrirInspecaoNaMesa(docIdAtelie);
            }}
          >
            🔬 Inspecionar
          </button>
        ) : null}
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

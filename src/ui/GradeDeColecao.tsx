import { signal } from '@preact/signals';
import { useEffect, useState } from 'preact/hooks';
import type { Entidade, TipoEntidade } from '#mesa';
import { filtroTipo, selecionadaId } from '../app/campanha.ts';
import { abrirEntidade } from '../app/rotas.ts';
import { abrirNoApp } from '../app/barramento.ts';
import { ehRefDeEntidadeDaMesa } from '../dominio/notas.ts';
import {
  agruparPorCategoria,
  alternarSecaoColapsada,
  ehEncontro,
  NOME_DO_APP,
  ROTULO_DO_TIPO,
  type ModoExibicaoColecao,
} from '../dominio/entidades.ts';
import { cx } from './cx.ts';

export const modoExibicao = signal<ModoExibicaoColecao>('grade');
export const secoesColapsadas = signal<Set<string>>(new Set());

export function alternarSecao(chave: string): void {
  secoesColapsadas.value = alternarSecaoColapsada(secoesColapsadas.value, chave);
}

export function ArteDoTipo({ tipo, encontro }: { tipo: TipoEntidade; encontro?: boolean }) {
  if (encontro) {
    return (
      <svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M50 16 L78 28 C78 58 50 82 50 82 C50 82 22 58 22 28 Z" opacity="0.2" fill="var(--perigo, #ff7b72)" />
        <path d="M50 16 L78 28 C78 58 50 82 50 82 C50 82 22 58 22 28 Z" stroke="var(--perigo, #ff7b72)" />
        <line x1="30" y1="32" x2="70" y2="72" stroke="var(--perigo, #ff7b72)" stroke-width="2.6" />
        <line x1="70" y1="32" x2="30" y2="72" stroke="var(--perigo, #ff7b72)" stroke-width="2.6" />
        <line x1="26" y1="40" x2="36" y2="30" stroke="var(--perigo, #ff7b72)" />
        <line x1="64" y1="30" x2="74" y2="40" stroke="var(--perigo, #ff7b72)" />
      </svg>
    );
  }

  switch (tipo) {
    case 'lugar':
      return (
        <svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="50" cy="50" r="38" opacity="0.25" stroke-dasharray="4 3" />
          <path d="M22 66 L38 42 L52 54 L68 34 L78 50" opacity="0.8" />
          <path d="M50 20 L55 35 L70 50 L55 65 L50 80 L45 65 L30 50 L45 35 Z" opacity="0.35" fill="currentColor" />
          <circle cx="68" cy="34" r="3.5" fill="var(--acento)" stroke="none" />
          <circle cx="38" cy="42" r="3.5" fill="var(--acento)" stroke="none" />
        </svg>
      );
    case 'cena':
      return (
        <svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <rect x="20" y="32" width="60" height="46" rx="4" opacity="0.25" fill="currentColor" />
          <rect x="20" y="32" width="60" height="46" rx="4" />
          <path d="M20 44 L80 44" />
          <path d="M22 22 L78 22 L74 32 L18 32 Z" opacity="0.45" fill="currentColor" />
          <path d="M34 22 L28 32 M48 22 L42 32 M62 22 L56 32" stroke="var(--acento)" stroke-width="2.5" />
          <circle cx="50" cy="58" r="8" opacity="0.6" stroke="var(--acento)" />
          <polygon points="48,54 55,58 48,62" fill="var(--acento)" stroke="none" />
        </svg>
      );
    case 'personagem':
      return (
        <svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="50" cy="36" r="16" opacity="0.35" fill="currentColor" />
          <circle cx="50" cy="36" r="16" />
          <path d="M25 78 C25 60 36 54 50 54 C64 54 75 60 75 78" opacity="0.35" fill="currentColor" />
          <path d="M25 78 C25 60 36 54 50 54 C64 54 75 60 75 78 Z" />
        </svg>
      );
    case 'ameaca':
      return (
        <svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M50 18 L86 80 L14 80 Z" opacity="0.18" fill="var(--perigo, #ff7b72)" />
          <path d="M50 18 L86 80 L14 80 Z" stroke="var(--perigo, #ff7b72)" stroke-width="2.4" />
          <line x1="50" y1="38" x2="50" y2="58" stroke="var(--perigo, #ff7b72)" stroke-width="3.5" />
          <circle cx="50" cy="69" r="2.8" fill="var(--perigo, #ff7b72)" stroke="none" />
        </svg>
      );
    case 'pista':
      return (
        <svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <rect x="26" y="20" width="48" height="62" rx="3" opacity="0.25" fill="currentColor" />
          <rect x="26" y="20" width="48" height="62" rx="3" />
          <line x1="36" y1="34" x2="64" y2="34" opacity="0.6" />
          <line x1="36" y1="44" x2="64" y2="44" opacity="0.6" />
          <line x1="36" y1="54" x2="52" y2="54" opacity="0.6" />
          <circle cx="64" cy="66" r="10" stroke="var(--acento)" stroke-width="2" opacity="0.8" fill="var(--superficie)" />
          <line x1="71" y1="73" x2="80" y2="82" stroke="var(--acento)" stroke-width="2.5" />
        </svg>
      );
    case 'faccao':
      return (
        <svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M28 20 L72 20 L72 68 L50 82 L28 68 Z" opacity="0.25" fill="currentColor" />
          <path d="M28 20 L72 20 L72 68 L50 82 L28 68 Z" />
          <path d="M50 20 L50 82" opacity="0.4" stroke-dasharray="3 3" />
          <circle cx="50" cy="44" r="10" stroke="var(--acento)" opacity="0.8" />
        </svg>
      );
    case 'nota':
      return (
        <svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <rect x="24" y="18" width="52" height="64" rx="4" opacity="0.25" fill="currentColor" />
          <rect x="24" y="18" width="52" height="64" rx="4" />
          <line x1="34" y1="30" x2="66" y2="30" opacity="0.5" />
          <line x1="34" y1="40" x2="66" y2="40" opacity="0.5" />
          <line x1="34" y1="50" x2="66" y2="50" opacity="0.5" />
          <line x1="34" y1="60" x2="54" y2="60" opacity="0.5" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="50" cy="50" r="32" opacity="0.25" fill="currentColor" />
          <circle cx="50" cy="50" r="32" />
          <path d="M35 50 L45 38 L55 62 L65 50" stroke="var(--acento)" stroke-width="2.5" />
        </svg>
      );
  }
}

function Miniatura({ e }: { e: Entidade }) {
  const [url, setUrl] = useState<string | null>(null);
  const encontro = ehEncontro(e);

  useEffect(() => {
    if (!e.retrato) {
      setUrl(null);
      return;
    }
    try {
      if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
        const u = URL.createObjectURL(e.retrato);
        setUrl(u);
        return () => {
          try { URL.revokeObjectURL(u); } catch { /* ignora */ }
        };
      }
    } catch {
      setUrl(null);
    }
  }, [e.retrato]);

  if (url) {
    return (
      <div class="cartao-miniatura">
        <img src={url} alt={e.nome} class="cartao-foto" loading="lazy" />
      </div>
    );
  }

  return (
    <div class={cx('cartao-miniatura', 'miniatura-svg', `tipo-${e.tipo}`, encontro && 'tipo-encontro')}>
      <ArteDoTipo tipo={e.tipo} encontro={encontro} />
    </div>
  );
}

export function CartaoColecao({ e }: { e: Entidade }) {
  const encontro = ehEncontro(e);
  const selecionado = selecionadaId.value === e.id;
  const fora = e.refs.filter(r => !ehRefDeEntidadeDaMesa(r));
  const principalRef = fora[0];

  return (
    <div
      role="button"
      tabIndex={0}
      class={cx('cartao-colecao', selecionado && 'ativa', encontro && 'cartao-encontro')}
      data-testid={`entidade-${e.id}`}
      data-tipo={e.tipo}
      onClick={() => abrirEntidade(e.id)}
      onKeyDown={ev => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          abrirEntidade(e.id);
        }
      }}
    >
      <div class="cartao-topo-relativo">
        <Miniatura e={e} />
        <span class={cx('cartao-tipo-selo', encontro && 'selo-encontro')}>
          {encontro ? 'Encontro' : ROTULO_DO_TIPO[e.tipo].singular}
        </span>
        {principalRef && (
          <button
            type="button"
            class="cartao-abrir-atalho"
            title={`Abrir no ${NOME_DO_APP[principalRef.app]}`}
            onClick={ev => {
              ev.stopPropagation();
              void abrirNoApp(principalRef);
            }}
          >
            Abrir ↗
          </button>
        )}
      </div>

      <div class="cartao-corpo-colecao">
        <h4 class="cartao-nome" title={e.nome}>{e.nome}</h4>
        {e.tags.length > 0 && (
          <div class="cartao-tags">
            {e.tags.slice(0, 3).map(t => (
              <span key={t} class="cartao-tag">#{t.replace(/^#/, '')}</span>
            ))}
            {e.tags.length > 3 && <span class="cartao-tag meta">+{e.tags.length - 3}</span>}
          </div>
        )}
        {fora.length > 0 && (
          <span class="cartao-apps">
            {[...new Set(fora.map(r => NOME_DO_APP[r.app]))].join(' · ')}
          </span>
        )}
      </div>
    </div>
  );
}

function ItemListaColecao({ e }: { e: Entidade }) {
  const encontro = ehEncontro(e);
  const fora = e.refs.filter(r => !ehRefDeEntidadeDaMesa(r));

  return (
    <button
      type="button"
      class={cx('item', selecionadaId.value === e.id && 'ativa')}
      data-testid={`entidade-${e.id}`}
      data-tipo={e.tipo}
      onClick={() => abrirEntidade(e.id)}
    >
      <span class={cx('item-tipo', encontro && 'item-tipo-encontro')}>
        {encontro ? 'Encontro' : ROTULO_DO_TIPO[e.tipo].singular}
      </span>
      <span class="item-nome">{e.nome}</span>
      {fora.length > 0 && (
        <span class="item-apps">
          {[...new Set(fora.map(r => NOME_DO_APP[r.app]))].join(' · ')}
        </span>
      )}
    </button>
  );
}

export function GradeDeColecao({ lista }: { lista: readonly Entidade[] }) {
  const modo = modoExibicao.value;

  if (modo === 'lista') {
    return (
      <ul class="lista" data-testid="lista-entidades">
        {lista.map(e => (
          <li key={e.id}>
            <ItemListaColecao e={e} />
          </li>
        ))}
      </ul>
    );
  }

  const secoes = filtroTipo.value === null ? agruparPorCategoria(lista) : null;

  return (
    <div class="grade-colecao" data-testid="lista-entidades">
      {secoes ? (
        <div class="secoes-colecao">
          {secoes.map(s => {
            const colapsada = secoesColapsadas.value.has(s.id);
            return (
              <section key={s.id} class="secao-colecao">
                <button
                  type="button"
                  class="secao-cabecalho"
                  aria-expanded={!colapsada}
                  onClick={() => alternarSecao(s.id)}
                >
                  <span class="secao-seta">{colapsada ? '▸' : '▾'}</span>
                  <h3 class="secao-titulo">{s.rotulo}</h3>
                  <span class="secao-contador">{s.entidades.length}</span>
                </button>
                {!colapsada && (
                  <div class="grade-cartoes">
                    {s.entidades.map(e => (
                      <CartaoColecao key={e.id} e={e} />
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      ) : (
        <div class="grade-cartoes">
          {lista.map(e => (
            <CartaoColecao key={e.id} e={e} />
          ))}
        </div>
      )}
    </div>
  );
}

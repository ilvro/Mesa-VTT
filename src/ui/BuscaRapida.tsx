import { signal } from '@preact/signals';
import { useEffect, useRef, useState } from 'preact/hooks';
import { buscar, type ItemBusca } from '../dominio/busca.ts';
import { campanhaAtiva, obterRepositorio } from '../app/campanha.ts';
import { abrirNoApp } from '../app/barramento.ts';
import { abrirEntidade, tela } from '../app/rotas.ts';
import { continuarSessao } from '../app/registro.ts';
import { NOME_DO_APP, ROTULO_DO_TIPO } from '../dominio/entidades.ts';
import { cx } from './cx.ts';

export const buscaRapidaAberta = signal(false);

export function fecharBuscaRapida(): void {
  buscaRapidaAberta.value = false;
}

export function abrirBuscaRapida(): void {
  buscaRapidaAberta.value = true;
}

export function BuscaRapida() {
  if (!buscaRapidaAberta.value) return null;

  const [termo, setTermo] = useState('');
  const [itens, setItens] = useState<readonly ItemBusca[]>([]);
  const [selecionado, setSelecionado] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const elementoAnterior = useRef<HTMLElement | null>(null);

  // Carrega itens do repositório ao abrir
  useEffect(() => {
    elementoAnterior.current = document.activeElement as HTMLElement | null;
    let ativo = true;

    async function carregar() {
      const c = campanhaAtiva.value;
      if (!c) return;
      try {
        const repo = obterRepositorio();
        const [entidades, sessoes] = await Promise.all([
          repo.listarEntidades(c.id),
          repo.listarSessoes(c.id),
        ]);
        if (!ativo) return;

        const itensEntidade: ItemBusca[] = entidades.map(e => {
          const fora = e.refs.find(r => r.app !== 'mesa');
          return {
            id: e.id,
            nome: e.nome,
            tipo: e.tipo,
            tags: e.tags,
            ref: fora,
            origem: 'entidade',
          };
        });

        const itensSessao: ItemBusca[] = sessoes.map(s => ({
          id: s.id,
          nome: s.nome,
          tipo: 'sessao',
          origem: 'sessao',
        }));

        setItens([...itensEntidade, ...itensSessao]);
      } catch {
        // ignora erro ao carregar
      }
    }

    void carregar();

    // Foca o campo
    setTimeout(() => {
      inputRef.current?.focus();
    }, 10);

    return () => {
      ativo = false;
      elementoAnterior.current?.focus();
    };
  }, []);

  const resultados = termo.trim() ? buscar(termo, itens, 12) : itens.slice(0, 8);

  const executarItem = (item: ItemBusca, shiftKey: boolean) => {
    fecharBuscaRapida();
    if (item.origem === 'sessao') {
      continuarSessao(item.id);
      tela.value = 'sessao';
    } else {
      if (item.ref && !shiftKey) {
        void abrirNoApp(item.ref);
      } else {
        abrirEntidade(item.id);
        tela.value = 'entidades';
      }
    }
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      fecharBuscaRapida();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelecionado(prev => (resultados.length > 0 ? (prev + 1) % resultados.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelecionado(prev => (resultados.length > 0 ? (prev - 1 + resultados.length) % resultados.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = resultados[selecionado];
      if (item) {
        executarItem(item, e.shiftKey);
      }
    }
  };

  return (
    <div
      class="busca-rapida-fundo"
      data-testid="dialogo-busca-rapida"
      onClick={e => {
        if (e.target === e.currentTarget) fecharBuscaRapida();
      }}
    >
      <div
        class="busca-rapida-dialogo"
        role="dialog"
        aria-modal="true"
        aria-label="Busca rápida"
      >
        <div class="busca-rapida-campo-container">
          <span class="busca-rapida-icone" aria-hidden="true">🔍</span>
          <input
            ref={inputRef}
            type="search"
            class="busca-rapida-campo"
            placeholder="Buscar entidades, mapas, sessões… (↑/↓ navega, Enter abre)"
            value={termo}
            onInput={e => {
              setTermo(e.currentTarget.value);
              setSelecionado(0);
            }}
            onKeyDown={onKeyDown}
            data-testid="campo-busca-rapida"
          />
          <kbd class="busca-rapida-atalho-dica">Esc fecha</kbd>
        </div>

        {resultados.length === 0 ? (
          <div class="busca-rapida-vazio" data-testid="busca-rapida-vazia">
            Nenhum resultado encontrado.
          </div>
        ) : (
          <ul class="busca-rapida-lista" data-testid="resultados-busca-rapida" role="listbox">
            {resultados.map((item, i) => {
              const rotuloTipo = item.origem === 'sessao'
                ? 'Sessão'
                : ROTULO_DO_TIPO[item.tipo as keyof typeof ROTULO_DO_TIPO]?.singular ?? item.tipo;
              const appExterno = item.ref ? NOME_DO_APP[item.ref.app] : null;

              return (
                <li
                  key={`${item.origem}-${item.id}`}
                  role="option"
                  aria-selected={i === selecionado}
                  class={cx('busca-rapida-item', i === selecionado && 'selecionado')}
                  data-testid={`resultado-busca-${item.id}`}
                  onClick={e => executarItem(item, e.shiftKey)}
                  onMouseEnter={() => setSelecionado(i)}
                >
                  <span class="busca-rapida-item-tipo">{rotuloTipo}</span>
                  <span class="busca-rapida-item-nome">{item.nome}</span>
                  {item.tags && item.tags.length > 0 && (
                    <span class="busca-rapida-item-tag">
                      #{item.tags[0]?.replace(/^#/, '')}
                    </span>
                  )}
                  {appExterno && (
                    <span class="busca-rapida-item-app">
                      {appExterno} ↗
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <div class="busca-rapida-rodape">
          <span><strong>Enter:</strong> abrir</span>
          <span><strong>Shift+Enter:</strong> abrir na Mesa</span>
          <span><strong>↑/↓:</strong> navegar</span>
        </div>
      </div>
    </div>
  );
}

import { useSignal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { carregarResumos, resumosDoQuadro, salvarResumoDoMestre } from '../../app/resumos-quadro.ts';
import { MAX_RESUMO_DA_SECAO } from '../../dominio/resumos-do-quadro.ts';
import { assinaturaDaSecao, secoesDoQuadro } from '../../dominio/secoes-do-quadro.ts';
import { linkDaMoldura, ordemDeLeitura, type ItemMoldura } from '../../dominio/molduras.ts';
import type { Item } from '../../dominio/quadro.ts';

interface NavegadorProps {
  quadroId: string;
  itens: ReadonlyMap<string, Item>;
  onFocarMoldura: (moldura: ItemMoldura) => void;
  onFechar: () => void;
}

export function Navegador({
  quadroId,
  itens,
  onFocarMoldura,
  onFechar,
}: NavegadorProps) {
  const busca = useSignal('');
  const copiadoId = useSignal<string | null>(null);
  const editando = useSignal<string | null>(null);
  const rascunho = useSignal('');

  useEffect(() => {
    void carregarResumos(quadroId);
  }, [quadroId]);

  const resumos = resumosDoQuadro.value.quadroId === quadroId ? resumosDoQuadro.value.porAlvo : new Map();
  const secoes = secoesDoQuadro([...itens.values()]);
  const secaoDe = new Map(secoes.map((s) => [s.id, s]));
  const todosItens = [...itens.values()];

  const todasMolduras: ItemMoldura[] = [];
  for (const it of itens.values()) {
    if (it.tipo === 'moldura') todasMolduras.push(it);
  }
  const ordenadas = ordemDeLeitura(todasMolduras);
  const termo = busca.value.trim().toLowerCase();
  const filtradas = termo
    ? ordenadas.filter((m) => m.titulo.toLowerCase().includes(termo))
    : ordenadas;

  const copiarLink = async (m: ItemMoldura) => {
    const link = linkDaMoldura(quadroId, m.id);
    try {
      await navigator.clipboard?.writeText(link);
    } catch {
      /* ignora */
    }
    copiadoId.value = m.id;
    setTimeout(() => {
      if (copiadoId.value === m.id) copiadoId.value = null;
    }, 1500);
  };

  const salvarEdicao = async (m: ItemMoldura) => {
    const secao = secaoDe.get(m.id);
    editando.value = null;
    if (!secao) return;
    const atual = resumos.get(m.id);
    const texto = rascunho.value.trim().slice(0, MAX_RESUMO_DA_SECAO);
    if (texto === (atual?.texto ?? '')) return;
    await salvarResumoDoMestre(quadroId, m.id, texto, assinaturaDaSecao(secao, todosItens));
  };

  return (
    <aside class="navegador-molduras" data-testid="navegador-molduras">
      <div class="navegador-cabecalho">
        <strong>Molduras ({ordenadas.length})</strong>
        <button
          type="button"
          class="fmt-btn"
          data-testid="navegador-fechar"
          aria-label="Fechar navegador"
          onClick={onFechar}
        >
          ✕
        </button>
      </div>
      <input
        type="search"
        class="navegador-busca"
        data-testid="navegador-busca"
        placeholder="Filtrar molduras…"
        value={busca.value}
        onInput={(e) => {
          busca.value = e.currentTarget.value;
        }}
      />
      <div class="navegador-lista">
        {filtradas.length === 0 ? (
          <p class="meta">Nenhuma moldura.</p>
        ) : (
          filtradas.map((m, idx) => (
            <div key={m.id} class="navegador-bloco">
            <div class="navegador-item">
              <button
                type="button"
                class="navegador-item-btn"
                data-testid={`nav-moldura-${m.id}`}
                onClick={() => onFocarMoldura(m)}
              >
                <span class="meta">{idx + 1}.</span> {m.titulo || 'Sem título'}
              </button>
              <button
                type="button"
                class="fmt-btn"
                data-testid={`nav-copiar-${m.id}`}
                title="Copiar link"
                onClick={() => void copiarLink(m)}
              >
                {copiadoId.value === m.id ? '✓' : '🔗'}
              </button>
            </div>
            {(() => {
              const r = resumos.get(m.id);
              const secao = secaoDe.get(m.id);
              const velho = r && secao ? assinaturaDaSecao(secao, todosItens) !== r.assinatura : false;
              if (editando.value === m.id) {
                return (
                  <textarea
                    class="resumo-editor"
                    data-testid={`nav-resumo-editor-${m.id}`}
                    maxLength={MAX_RESUMO_DA_SECAO}
                    rows={3}
                    autoFocus
                    value={rascunho.value}
                    onInput={(e) => {
                      rascunho.value = e.currentTarget.value;
                    }}
                    onBlur={() => void salvarEdicao(m)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        rascunho.value = r?.texto ?? '';
                        editando.value = null;
                      }
                      else if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        e.currentTarget.blur();
                      }
                    }}
                  />
                );
              }
              return (
                <button
                  type="button"
                  class={`resumo-texto${r ? '' : ' resumo-vazio'}`}
                  data-testid={`nav-resumo-${m.id}`}
                  title="Clique para editar o resumo"
                  onClick={() => {
                    rascunho.value = r?.texto ?? '';
                    editando.value = m.id;
                  }}
                >
                  {r ? r.texto : 'Adicionar resumo…'}
                  {velho ? <span class="resumo-velho" title="O conteúdo da moldura mudou depois deste resumo"> · desatualizado</span> : null}
                </button>
              );
            })()}
            </div>

          ))
        )}
      </div>
    </aside>
  );
}

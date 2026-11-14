import { useSignal } from '@preact/signals';
import { useRef } from 'preact/hooks';
import { campanhaAtiva } from '../../app/campanha.ts';
import { importarArquivoMiro } from '../../app/importar-miro.ts';
import { avisar } from '../../app/toasts.ts';
import {
  abrirQuadro,
  criarQuadro,
  excluirQuadro,
  quadros,
  renomearQuadro,
} from '../../app/quadros.ts';
import { navegarParaQuadro, tela } from '../../app/rotas.ts';

export function Quadros() {
  const nova = useSignal('');
  const confirmando = useSignal<string | null>(null);
  const inputMiroRef = useRef<HTMLInputElement>(null);
  const c = campanhaAtiva.value;

  if (!c) {
    return (
      <section class="pagina" data-testid="tela-quadros">
        <div class="vazio" data-testid="aviso-sem-campanha">
          <h2>Quadros</h2>
          <p>Escolha ou crie uma campanha para organizar os quadros de aventura.</p>
          <button
            type="button"
            class="botao-pilula destaque"
            data-testid="ir-para-campanhas"
            onClick={() => {
              tela.value = 'campanhas';
            }}
          >
            Escolher campanha
          </button>
        </div>
      </section>
    );
  }

  const enviar = async (e: Event) => {
    e.preventDefault();
    const nome = nova.value.trim();
    if (!nome) return;
    const criado = await criarQuadro(nome);
    if (criado) {
      nova.value = '';
      await abrirQuadro(criado.id);
      navegarParaQuadro(criado.id);
    }
  };

  return (
    <section class="pagina" data-testid="tela-quadros">
      <div class="galeria-topo">
        <h1 class="faixa grande">Quadros</h1>
        <span class="selo">{c.nome}</span>
      </div>

      <form class="barra-campanha" onSubmit={enviar}>
        <input
          type="text"
          class="campo-inline"
          placeholder="Nome do novo quadro (ex.: Lysdal)"
          aria-label="Nome do novo quadro"
          data-testid="novo-quadro-nome"
          value={nova.value}
          onInput={(e) => {
            nova.value = e.currentTarget.value;
          }}
        />
        <button
          type="submit"
          class="botao-pilula destaque"
          data-testid="criar-quadro"
          disabled={!nova.value.trim()}
        >
          + Novo quadro
        </button>
        <button
          type="button"
          class="botao-pilula"
          data-testid="importar-miro-botao"
          onClick={() => inputMiroRef.current?.click()}
        >
          Importar do Miro…
        </button>
        <input
          ref={inputMiroRef}
          type="file"
          accept=".zip,.miro.zip,application/zip"
          style={{ display: 'none' }}
          data-testid="importar-miro-input"
          onChange={async (e) => {
            const f = e.currentTarget.files?.[0];
            e.currentTarget.value = '';
            if (!f) return;
            try {
              const rel = await importarArquivoMiro(f);
              avisar(
                `Quadro "${rel.quadro.nome}" importado (${rel.totalItens} itens, ${rel.paraRevisar} para revisar).`,
              );
              navegarParaQuadro(rel.quadro.id);
            } catch (err) {
              avisar(err instanceof Error ? err.message : String(err), true);
            }
          }}
        />
      </form>

      {quadros.value.length === 0 ? (
        <div class="vazio">
          <h2>Nenhum quadro nesta campanha</h2>
          <p>Crie um quadro para preparar cenas, pistas, anotações e plantas.</p>
        </div>
      ) : (
        <div class="cartoes">
          {quadros.value.map((q) => (
            <article key={q.id} class="cartao" data-testid={`cartao-quadro-${q.id}`}>
              <div class="cartao-corpo">
                <input
                  type="text"
                  class="nome-da-campanha"
                  aria-label={`Nome do quadro ${q.nome}`}
                  data-testid={`nome-quadro-${q.id}`}
                  value={q.nome}
                  onBlur={(e) => {
                    const v = e.currentTarget.value.trim();
                    if (v && v !== q.nome) {
                      void renomearQuadro(q.id, v);
                    } else {
                      e.currentTarget.value = q.nome;
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.currentTarget.blur();
                  }}
                />
                <span class="meta">
                  Atualizado em {new Date(q.atualizadoEm).toLocaleDateString('pt-BR')}
                </span>
                <div class="cartao-rodape">
                  <button
                    type="button"
                    class="botao-pilula destaque"
                    data-testid={`abrir-quadro-${q.id}`}
                    onClick={() => {
                      void abrirQuadro(q.id).then((aberto) => {
                        if (aberto) navegarParaQuadro(aberto.id);
                      });
                    }}
                  >
                    Abrir
                  </button>
                  <span class="espaco" />
                  {confirmando.value === q.id ? (
                    <>
                      <button
                        type="button"
                        class="botao-pilula perigo"
                        data-testid="confirmar-remover-quadro"
                        onClick={() => {
                          confirmando.value = null;
                          void excluirQuadro(q.id);
                        }}
                      >
                        Apagar mesmo
                      </button>
                      <button
                        type="button"
                        class="botao-pilula"
                        data-testid="cancelar-remover-quadro"
                        onClick={() => {
                          confirmando.value = null;
                        }}
                      >
                        Cancelar
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      class="botao-pilula perigo"
                      data-testid={`remover-quadro-${q.id}`}
                      onClick={() => {
                        confirmando.value = q.id;
                      }}
                    >
                      Remover
                    </button>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

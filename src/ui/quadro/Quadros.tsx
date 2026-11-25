import { useSignal } from '@preact/signals';
import { useRef } from 'preact/hooks';
import { DialogoMolduras } from './DialogoMolduras.tsx';
import { campanhaAtiva } from '../../app/campanha.ts';
import { examinarPacoteMiro, importarArquivoMiro, type ExamePacoteMiro, type ProgressoMiro } from '../../app/importar-miro.ts';
import { exportarQuadro, importarPacoteDeQuadro } from '../../app/exportar-quadro.ts';
import { avisar } from '../../app/toasts.ts';
import {
  abrirQuadro,
  criarQuadro,
  excluirQuadro,
  quadros,
  renomearQuadro,
} from '../../app/quadros.ts';
import type { FiltroMolduras } from '../../dominio/molduras-miro.ts';
import { navegarParaQuadro, tela } from '../../app/rotas.ts';
import { abrirMenuContexto } from '../MenuDeContexto.tsx';

export function Quadros() {
  const nova = useSignal('');
  const confirmando = useSignal<string | null>(null);
  const inputMiroRef = useRef<HTMLInputElement>(null);
  const inputPacoteRef = useRef<HTMLInputElement>(null);
  const escolhendo = useSignal<{ arquivo: File; exame: ExamePacoteMiro } | null>(null);
  const importando = useSignal<string | null>(null);
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

  const textoProgresso = (p: ProgressoMiro): string => {
    if (p.fase === 'lendo') return 'Lendo pacote do Miro…';
    if (p.fase === 'imagens') {
      return p.total ? `Preparando imagens (${p.atual ?? 0}/${p.total})…` : 'Preparando imagens…';
    }
    return 'Salvando quadro…';
  };

  const importar = async (arquivo: File, filtro?: FiltroMolduras) => {
    importando.value = 'Lendo pacote do Miro…';
    try {
      const rel = await importarArquivoMiro(arquivo, filtro, (p) => {
        importando.value = textoProgresso(p);
      });
      avisar(
        `Quadro "${rel.quadro.nome}" importado (${rel.totalItens} itens, ${rel.paraRevisar} para revisar).`,
      );
      navegarParaQuadro(rel.quadro.id);
    } catch (err) {
      avisar(err instanceof Error ? err.message : String(err), true);
    } finally {
      importando.value = null;
    }
  };

  return (
    <section class="pagina" data-testid="tela-quadros">
      {escolhendo.value ? (
        <DialogoMolduras
          exame={escolhendo.value.exame}
          aoCancelar={() => {
            escolhendo.value = null;
          }}
          aoImportar={(filtro) => {
            const arquivo = escolhendo.value!.arquivo;
            const exame = escolhendo.value!.exame;
            escolhendo.value = null;
            // Tudo marcado = quadro inteiro, sem filtro guardado.
            const tudo = filtro.soltos && filtro.molduras.length === exame.molduras.length;
            void importar(arquivo, tudo ? undefined : filtro);
          }}
        />
      ) : null}
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
          disabled={importando.value !== null}
          onClick={() => inputMiroRef.current?.click()}
        >
          {importando.value ? 'Importando…' : 'Importar do Miro…'}
        </button>
        <button
          type="button"
          class="botao-pilula"
          data-testid="importar-pacote-botao"
          onClick={() => inputPacoteRef.current?.click()}
        >
          Importar quadro…
        </button>
        <input
          ref={inputPacoteRef}
          type="file"
          accept=".zip,application/zip"
          style={{ display: 'none' }}
          data-testid="importar-pacote-input"
          onChange={async (e) => {
            const f = e.currentTarget.files?.[0];
            e.currentTarget.value = '';
            if (!f) return;
            try {
              const rel = await importarPacoteDeQuadro(f);
              avisar(
                `Quadro "${rel.quadro.nome}" importado (${rel.totalItens} itens${
                  rel.imagensFaltando ? `, ${rel.imagensFaltando} imagens ausentes no pacote` : ''
                }).`,
              );
              await abrirQuadro(rel.quadro.id);
              navegarParaQuadro(rel.quadro.id);
            } catch (err) {
              avisar(err instanceof Error ? err.message : String(err), true);
            }
          }}
        />
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
            importando.value = 'Lendo pacote do Miro…';
            try {
              const exame = await examinarPacoteMiro(f);
              if (exame.molduras.length === 0) {
                await importar(f);
              } else {
                importando.value = null;
                escolhendo.value = { arquivo: f, exame };
              }
            } catch (err) {
              importando.value = null;
              avisar(err instanceof Error ? err.message : String(err), true);
            }
          }}
        />
      </form>

      {importando.value ? (
        <p class="selo" data-testid="progresso-importacao-miro" role="status" aria-live="polite">
          {importando.value}
        </p>
      ) : null}

      {quadros.value.length === 0 ? (
        <div class="vazio">
          <h2>Nenhum quadro nesta campanha</h2>
          <p>Crie um quadro para preparar cenas, pistas, anotações e plantas.</p>
        </div>
      ) : (
        <div class="cartoes">
          {quadros.value.map((q) => (
            <article
              key={q.id}
              class="cartao"
              data-testid={`cartao-quadro-${q.id}`}
              onContextMenu={ev => {
                const alvo = ev.target as HTMLElement | null;
                if (alvo && alvo.tagName === 'INPUT') return;
                abrirMenuContexto(
                  ev,
                  [
                    {
                      id: 'abrir-quadro',
                      rotulo: 'Abrir quadro',
                      executar: async () => {
                        const aberto = await abrirQuadro(q.id);
                        if (aberto) navegarParaQuadro(aberto.id);
                      },
                    },
                    {
                      id: 'exportar-quadro',
                      rotulo: 'Exportar quadro…',
                      executar: () =>
                        exportarQuadro(q.id).catch(err =>
                          avisar(err instanceof Error ? err.message : String(err), true),
                        ),
                    },
                    {
                      id: 'deletar-quadro',
                      rotulo: 'Deletar quadro',
                      perigo: true,
                      confirmar: true,
                      executar: () => excluirQuadro(q.id),
                    },
                  ],
                  q.nome,
                );
              }}
            >
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
                  <button
                    type="button"
                    class="botao-pilula"
                    data-testid={`exportar-quadro-${q.id}`}
                    onClick={() => {
                      exportarQuadro(q.id).catch((err) =>
                        avisar(err instanceof Error ? err.message : String(err), true),
                      );
                    }}
                  >
                    Exportar…
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

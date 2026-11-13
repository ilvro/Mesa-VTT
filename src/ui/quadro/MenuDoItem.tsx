import type { ModoAlinhamento } from '../../dominio/alinhamento.ts';
import type { Item } from '../../dominio/quadro.ts';
import {
  duplicar,
  levarParaTras,
  trazerParaFrente,
} from '../../dominio/quadro-operacoes.ts';
import {
  agruparSelecao,
  alinharSelecao,
  desagruparSelecao,
  distribuirSelecao,
  executar,
  itens,
  selecao,
} from '../../app/quadros.ts';

interface MenuDoItemProps {
  x: number;
  y: number;
  quadroId: string;
  selecionados: Item[];
  novoId: () => string;
  onCopiar: () => void;
  onColar: () => void;
  onFechar: () => void;
}

export function MenuDoItem({
  x,
  y,
  quadroId,
  selecionados,
  novoId,
  onCopiar,
  onColar,
  onFechar,
}: MenuDoItemProps) {
  const temSelecao = selecionados.length > 0;
  const todosTravados = temSelecao && selecionados.every((i) => i.travado);
  const todosSoMestre = temSelecao && selecionados.every((i) => i.soMestre);
  const temGrupo = selecionados.some((i) => i.grupoId !== null);
  const primeiro = selecionados[0];

  const copiarLink = async () => {
    if (!primeiro) return;
    const link = `mesa:mesa/item/${quadroId}/${primeiro.id}`;
    try {
      await navigator.clipboard?.writeText(link);
    } catch {
      /* ignora */
    }
    onFechar();
  };

  return (
    <div
      class="menu-contexto-quadro"
      data-testid="menu-do-item"
      style={{ left: `${x}px`, top: `${y}px` }}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {temSelecao ? (
        <button
          type="button"
          class="menu-contexto-btn"
          data-testid="menu-copiar"
          onClick={() => {
            onCopiar();
            onFechar();
          }}
        >
          Copiar
        </button>
      ) : null}
      <button
        type="button"
        class="menu-contexto-btn"
        data-testid="menu-colar"
        onClick={() => {
          onColar();
          onFechar();
        }}
      >
        Colar
      </button>
      {temSelecao ? (
        <>
          <button
            type="button"
            class="menu-contexto-btn"
            data-testid="menu-duplicar"
            onClick={() => {
              const maxZ = Math.max(0, ...[...itens.value.values()].map((i) => i.z));
              const passo = duplicar(selecionados, novoId, { dx: 24, dy: 24 }, {
                agora: Date.now(),
                zBase: maxZ + 1,
              });
              executar(passo);
              for (const op of passo.ops) {
                if ('criar' in op) {
                  selecao.value = new Set(op.criar.map((i) => i.id));
                }
              }
              onFechar();
            }}
          >
            Duplicar
          </button>
          <hr class="menu-contexto-sep" />
          <button
            type="button"
            class="menu-contexto-btn"
            data-testid="menu-frente"
            onClick={() => {
              executar(trazerParaFrente(itens.value, selecao.value));
              onFechar();
            }}
          >
            Trazer para frente
          </button>
          <button
            type="button"
            class="menu-contexto-btn"
            data-testid="menu-tras"
            onClick={() => {
              executar(levarParaTras(itens.value, selecao.value));
              onFechar();
            }}
          >
            Levar para trás
          </button>
          <button
            type="button"
            class="menu-contexto-btn"
            data-testid="menu-travar"
            onClick={() => {
              const agora = Date.now();
              executar({
                rotulo: todosTravados ? 'Destravar' : 'Travar',
                ops: [
                  {
                    alterar: selecionados.map((it) => ({
                      id: it.id,
                      antes: { travado: it.travado, atualizadoEm: it.atualizadoEm },
                      depois: { travado: !todosTravados, atualizadoEm: agora },
                    })),
                  },
                ],
              });
              onFechar();
            }}
          >
            {todosTravados ? 'Destravar' : 'Travar'}
          </button>
          {selecionados.length >= 2 ? (
            <button
              type="button"
              class="menu-contexto-btn"
              data-testid="menu-agrupar"
              onClick={() => {
                agruparSelecao(novoId());
                onFechar();
              }}
            >
              Agrupar
            </button>
          ) : null}
          {temGrupo ? (
            <button
              type="button"
              class="menu-contexto-btn"
              data-testid="menu-desagrupar"
              onClick={() => {
                desagruparSelecao();
                onFechar();
              }}
            >
              Desagrupar
            </button>
          ) : null}
          {selecionados.length >= 2 ? (
            <div class="menu-contexto-alinhar">
              <span class="meta">Alinhar</span>
              <div class="menu-contexto-alinhar-grade">
                {(
                  [
                    ['esquerda', '⇤'],
                    ['centro-h', '⇔'],
                    ['direita', '⇥'],
                    ['topo', '⤒'],
                    ['centro-v', '⇕'],
                    ['base', '⤓'],
                  ] as [ModoAlinhamento, string][]
                ).map(([modo, icone]) => (
                  <button
                    key={modo}
                    type="button"
                    class="fmt-btn"
                    data-testid={`menu-alinhar-${modo}`}
                    title={`Alinhar: ${modo}`}
                    onClick={() => {
                      alinharSelecao(modo);
                      onFechar();
                    }}
                  >
                    {icone}
                  </button>
                ))}
                {selecionados.length >= 3 ? (
                  <>
                    <button
                      type="button"
                      class="fmt-btn"
                      data-testid="menu-distribuir-h"
                      title="Distribuir horizontalmente"
                      onClick={() => {
                        distribuirSelecao('h');
                        onFechar();
                      }}
                    >
                      |||
                    </button>
                    <button
                      type="button"
                      class="fmt-btn"
                      data-testid="menu-distribuir-v"
                      title="Distribuir verticalmente"
                      onClick={() => {
                        distribuirSelecao('v');
                        onFechar();
                      }}
                    >
                      ☰
                    </button>
                  </>
                ) : null}
              </div>
            </div>
          ) : null}
          <button
            type="button"
            class="menu-contexto-btn"
            data-testid="menu-somestre"
            onClick={() => {
              const agora = Date.now();
              executar({
                rotulo: todosSoMestre ? 'Visível a todos' : 'Só mestre',
                ops: [
                  {
                    alterar: selecionados.map((it) => ({
                      id: it.id,
                      antes: { soMestre: it.soMestre, atualizadoEm: it.atualizadoEm },
                      depois: { soMestre: !todosSoMestre, atualizadoEm: agora },
                    })),
                  },
                ],
              });
              onFechar();
            }}
          >
            {todosSoMestre ? '✓ Só mestre' : 'Só mestre'}
          </button>
          {primeiro ? (
            <button
              type="button"
              class="menu-contexto-btn"
              data-testid="menu-copiar-link"
              onClick={() => void copiarLink()}
            >
              Copiar link
            </button>
          ) : null}
          <hr class="menu-contexto-sep" />
          <button
            type="button"
            class="menu-contexto-btn perigo"
            data-testid="menu-apagar"
            onClick={() => {
              const removiveis = selecionados.filter((i) => !i.travado);
              if (removiveis.length > 0) {
                executar({ rotulo: 'Apagar', ops: [{ remover: removiveis }] });
                selecao.value = new Set();
              }
              onFechar();
            }}
          >
            Apagar
          </button>
        </>
      ) : null}
    </div>
  );
}

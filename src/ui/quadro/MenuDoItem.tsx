import { useState } from 'preact/hooks';
import type { Ref } from '#mesa';
import type { ModoAlinhamento } from '../../dominio/alinhamento.ts';
import type { AoFocar, Item } from '../../dominio/quadro.ts';
import {
  duplicar,
  levarParaTras,
  trazerParaFrente,
} from '../../dominio/quadro-operacoes.ts';
import { entidades } from '../../app/campanha.ts';
import { adicionarAoRoteiro, sessaoAtiva } from '../../app/registro.ts';
import {
  agruparSelecao,
  alinharSelecao,
  desagruparSelecao,
  distribuirSelecao,
  executar,
  itens,
  marcarFeito,
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
  const [fatoChave, setFatoChave] = useState('');
  const [fatoValor, setFatoValor] = useState<'true' | 'false'>('true');

  const cenasSonoras = entidades.value
    .map((e) => {
      const refJukebox = e.refs.find((r) => r.app === 'jukebox');
      if (!refJukebox && e.tipo !== 'cena') return null;
      const ref: Ref = refJukebox ?? { app: 'mesa', tipo: e.tipo, id: e.id };
      return { nome: e.nome, ref, chave: `${ref.app}:${ref.tipo}:${ref.id}` };
    })
    .filter((c): c is { nome: string; ref: Ref; chave: string } => c !== null);

  const atualizarAoFocar = (novo: AoFocar) => {
    if (!primeiro || primeiro.tipo !== 'moldura') return;
    const vazio = novo.cena === null && Object.keys(novo.fatos).length === 0;
    executar({
      rotulo: 'Ao entrar na moldura',
      ops: [
        {
          alterar: [
            {
              id: primeiro.id,
              antes: {
                aoFocar: primeiro.aoFocar,
                atualizadoEm: primeiro.atualizadoEm,
              },
              depois: {
                aoFocar: vazio ? undefined : novo,
                atualizadoEm: Date.now(),
              },
            },
          ],
        },
      ],
    });
  };

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
          <button
            type="button"
            class="menu-contexto-btn"
            data-testid="menu-feito"
            onClick={() => {
              marcarFeito(selecionados.map((i) => i.id));
              onFechar();
            }}
          >
            {selecionados.every((i) => i.feito) ? 'Desmarcar feito' : 'Marcar feito'}
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
          {selecionados.length === 1 && primeiro?.tipo === 'moldura' ? (
            <div class="menu-contexto-alinhar" data-testid="menu-ao-entrar">
              <span class="meta">Ao entrar</span>
              <select
                class="campo"
                data-testid="ao-entrar-cena"
                value={
                  primeiro.aoFocar?.cena
                    ? `${primeiro.aoFocar.cena.app}:${primeiro.aoFocar.cena.tipo}:${primeiro.aoFocar.cena.id}`
                    : ''
                }
                onChange={(e) => {
                  const val = e.currentTarget.value;
                  const cena =
                    cenasSonoras.find((c) => c.chave === val)?.ref ?? null;
                  atualizarAoFocar({
                    cena,
                    fatos: { ...(primeiro.aoFocar?.fatos ?? {}) },
                  });
                }}
              >
                <option value="">Sem cena sonora</option>
                {cenasSonoras.map((c) => (
                  <option key={c.chave} value={c.chave}>
                    {c.nome}
                  </option>
                ))}
              </select>
              {Object.entries(primeiro.aoFocar?.fatos ?? {}).map(([k, v]) => (
                <div key={k} class="menu-ao-entrar-fato">
                  <span>
                    {k}: {String(v)}
                  </span>
                  <button
                    type="button"
                    class="fmt-btn"
                    title="Remover fato"
                    onClick={() => {
                      const fatos = { ...(primeiro.aoFocar?.fatos ?? {}) };
                      delete fatos[k];
                      atualizarAoFocar({
                        cena: primeiro.aoFocar?.cena ?? null,
                        fatos,
                      });
                    }}
                  >
                    ✕
                  </button>
                </div>
              ))}
              <div class="menu-ao-entrar-novo">
                <input
                  type="text"
                  class="campo"
                  placeholder="fato..."
                  value={fatoChave}
                  onInput={(e) => setFatoChave(e.currentTarget.value)}
                />
                <select
                  class="campo"
                  value={fatoValor}
                  onChange={(e) =>
                    setFatoValor(
                      e.currentTarget.value === 'false' ? 'false' : 'true',
                    )
                  }
                >
                  <option value="true">sim</option>
                  <option value="false">não</option>
                </select>
                <button
                  type="button"
                  class="fmt-btn"
                  onClick={() => {
                    const ch = fatoChave.trim();
                    if (!ch) return;
                    atualizarAoFocar({
                      cena: primeiro.aoFocar?.cena ?? null,
                      fatos: {
                        ...(primeiro.aoFocar?.fatos ?? {}),
                        [ch]: fatoValor === 'true',
                      },
                    });
                    setFatoChave('');
                  }}
                >
                  +
                </button>
              </div>
            </div>
          ) : null}
          {selecionados.length === 1 && primeiro?.tipo === 'moldura' && sessaoAtiva.value ? (
            <button
              type="button"
              class="menu-contexto-btn"
              data-testid="menu-adicionar-roteiro"
              onClick={() => {
                adicionarAoRoteiro({
                  app: 'mesa',
                  tipo: 'item',
                  id: `${quadroId}/${primeiro.id}`,
                });
                onFechar();
              }}
            >
              Adicionar ao roteiro
            </button>
          ) : null}
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

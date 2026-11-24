import { useState } from 'preact/hooks';
import { formatarRef, type Ref } from '#mesa';
import type { ModoAlinhamento } from '../../dominio/alinhamento.ts';
import { parsearRefAncora } from '../../dominio/ancoras.ts';
import { entidadePorRef } from '../../dominio/cenas.ts';
import { NOME_DO_APP, NOME_DO_TIPO_DE_REF } from '../../dominio/entidades.ts';
import { ehRefDeEntidadeDaMesa } from '../../dominio/notas.ts';
import type { AoFocar, Item } from '../../dominio/quadro.ts';
import { abrirNoApp } from '../../app/barramento.ts';
import { entidades } from '../../app/campanha.ts';
import { abrirEntidade } from '../../app/rotas.ts';
import {
  ancorarItemEmRef,
  ancorasDoItem,
  desancorarItemDeRef,
} from '../../app/foco-do-quadro.ts';
import { mostrarAosJogadores } from '../../app/projecao.ts';
import { salvarSelecaoComoModelo } from '../../app/modelos.ts';
import { adicionarAoRoteiro, sessaoAtiva } from '../../app/registro.ts';
import {
  agruparSelecao,
  alinharSelecao,
  desagruparSelecao,
  distribuirSelecao,
  marcarFeito,
} from '../../app/quadros.ts';
import {
  alternarSoMestreSelecao,
  alternarTravadoSelecao,
  atualizarAoFocarMoldura,
  duplicarSelecao,
  levarSelecaoParaTras,
  removerSelecao,
  trazerSelecaoParaFrente,
} from '../../app/quadro-acoes.ts';

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
  const [abrindoAncora, setAbrindoAncora] = useState(false);
  const [salvandoModelo, setSalvandoModelo] = useState(false);
  const [nomeModelo, setNomeModelo] = useState('');
  const [escopoModelo, setEscopoModelo] = useState<'campanha' | 'todas'>('campanha');
  const [textoAncora, setTextoAncora] = useState('');
  const ancorasPrimeiro = primeiro ? ancorasDoItem(quadroId, primeiro.id) : [];
  const entidadeRefPrimeiro =
    primeiro?.tipo === 'ref' ? entidadePorRef(primeiro.ref, entidades.value) : undefined;
  const refsExternasPrimeiro =
    primeiro?.tipo === 'ref'
      ? entidadeRefPrimeiro
        ? entidadeRefPrimeiro.refs.filter((r) => !ehRefDeEntidadeDaMesa(r))
        : [primeiro.ref]
      : [];

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
    atualizarAoFocarMoldura(primeiro.id, novo);
  };

  const guardarModelo = async () => {
    const salvo = await salvarSelecaoComoModelo(nomeModelo, escopoModelo);
    if (salvo) onFechar();
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
      {selecionados.length === 1 && primeiro?.tipo === 'ref' ? (
        <>
          {refsExternasPrimeiro.map((r) => (
            <button
              key={`${r.app}/${r.tipo}/${r.id}`}
              type="button"
              class="menu-contexto-btn"
              data-testid={`menu-abrir-app-${r.app}`}
              onClick={() => {
                void abrirNoApp(r);
                onFechar();
              }}
            >
              Abrir {NOME_DO_TIPO_DE_REF[r.tipo] ?? r.tipo} no {NOME_DO_APP[r.app] ?? r.app} ↗
            </button>
          ))}
          {entidadeRefPrimeiro ? (
            <button
              type="button"
              class="menu-contexto-btn"
              data-testid="menu-abrir-entidade"
              onClick={() => {
                abrirEntidade(entidadeRefPrimeiro.id);
                onFechar();
              }}
            >
              Abrir na Mesa
            </button>
          ) : null}
          <hr class="menu-contexto-sep" />
        </>
      ) : null}
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
              duplicarSelecao(novoId);
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
          {salvandoModelo ? (
            <div class="menu-modelo-form" data-testid="modelo-form">
              <input
                type="text"
                data-testid="modelo-nome"
                placeholder="Nome do modelo"
                value={nomeModelo}
                maxLength={80}
                autoFocus
                onInput={(e) => setNomeModelo(e.currentTarget.value)}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === 'Enter') void guardarModelo();
                  if (e.key === 'Escape') setSalvandoModelo(false);
                }}
              />
              <select
                data-testid="modelo-escopo"
                value={escopoModelo}
                onChange={(e) => setEscopoModelo(e.currentTarget.value as 'campanha' | 'todas')}
              >
                <option value="campanha">Esta campanha</option>
                <option value="todas">Todas as campanhas</option>
              </select>
              <div class="menu-modelo-acoes">
                <button
                  type="button"
                  class="botao-pilula"
                  data-testid="modelo-salvar"
                  disabled={nomeModelo.trim() === ''}
                  onClick={() => void guardarModelo()}
                >
                  Salvar
                </button>
                <button type="button" class="botao-pilula" onClick={() => setSalvandoModelo(false)}>
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              class="menu-contexto-btn"
              data-testid="menu-salvar-modelo"
              onClick={() => setSalvandoModelo(true)}
            >
              Salvar como modelo…
            </button>
          )}
          <hr class="menu-contexto-sep" />
          <button
            type="button"
            class="menu-contexto-btn"
            data-testid="menu-frente"
            onClick={() => {
              trazerSelecaoParaFrente();
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
              levarSelecaoParaTras();
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
              alternarTravadoSelecao();
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
              alternarSoMestreSelecao();
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
          {selecionados.length === 1 && primeiro?.tipo === 'moldura' && !primeiro.soMestre ? (
            <button
              type="button"
              class="menu-contexto-btn"
              data-testid="menu-mostrar-aos-jogadores"
              title="Projeta esta moldura numa janela para os jogadores (sem nada do mestre)"
              onClick={() => {
                mostrarAosJogadores(quadroId, primeiro.id, primeiro.titulo);
                onFechar();
              }}
            >
              Mostrar aos jogadores
            </button>
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
            <>
              <button
                type="button"
                class="menu-contexto-btn"
                data-testid="menu-ancorar-mapa"
                onClick={() => setAbrindoAncora((v) => !v)}
              >
                Ancorar a objeto do mapa…
              </button>
              {abrindoAncora || ancorasPrimeiro.length > 0 ? (
                <div class="menu-contexto-bloco" data-testid="menu-ancorar-bloco">
                  {ancorasPrimeiro.map((anc, idx) => (
                    <div key={anc.id} class="menu-ao-entrar-fato">
                      <button
                        type="button"
                        class="botao-pilula pequeno"
                        data-testid={`menu-ver-no-mapa-${idx}`}
                        onClick={() => {
                          void abrirNoApp(anc.para);
                          onFechar();
                        }}
                      >
                        📍 {anc.para.tipo}: {anc.para.id}
                      </button>
                      <button
                        type="button"
                        class="fmt-btn"
                        aria-label="Remover âncora"
                        data-testid={`menu-remover-ancora-${idx}`}
                        onClick={() => {
                          void desancorarItemDeRef(quadroId, primeiro.id, anc.para);
                        }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  {abrindoAncora ? (
                    <div class="menu-ao-entrar-novo">
                      <input
                        type="text"
                        class="campo"
                        placeholder="Cole mesa:atlas/objeto/..."
                        data-testid="menu-ancorar-input"
                        value={textoAncora}
                        onInput={(e) => setTextoAncora(e.currentTarget.value)}
                      />
                      <button
                        type="button"
                        class="fmt-btn"
                        data-testid="menu-ancorar-confirmar"
                        onClick={() => {
                          const ref = parsearRefAncora(textoAncora);
                          if (!ref) return;
                          void ancorarItemEmRef(quadroId, primeiro.id, ref);
                          setTextoAncora('');
                          setAbrindoAncora(false);
                        }}
                      >
                        +
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}
              <button
                type="button"
                class="menu-contexto-btn"
                data-testid="menu-copiar-link"
                onClick={() => void copiarLink()}
              >
                Copiar link
              </button>
            </>
          ) : null}
          <hr class="menu-contexto-sep" />
          <button
            type="button"
            class="menu-contexto-btn perigo"
            data-testid="menu-apagar"
            onClick={() => {
              removerSelecao('Apagar');
              onFechar();
            }}
          >
            Deletar
          </button>
        </>
      ) : null}
    </div>
  );
}

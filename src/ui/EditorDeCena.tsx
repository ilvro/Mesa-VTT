import { type Entidade, formatarRef } from '#mesa';
import {
  candidatosDeMapa,
  candidatosDePistas,
  candidatosDeParticipantes,
  candidatosDeTrilha,
  extrairPacoteDeCena,
} from '../dominio/cenas.ts';
import { ehEncontro } from '../dominio/entidades.ts';
import { abrirNoApp } from '../app/barramento.ts';
import { abrirEntidade } from '../app/rotas.ts';
import { ativarCena } from '../app/sessao.ts';
import { abrirMenuContexto, acoesParaEntidade, acoesParaRef, type AcaoMenuContexto } from './MenuDeContexto.tsx';
import {
  alternarEncontroDaCena,
  definirMomentoDaCena,
  desvincularDaCena,
  entidades,
  ligacoes,
  vincularMapaNaCena,
  vincularParticipanteNaCena,
  vincularPistaNaCena,
  vincularTrilhaNaCena,
} from '../app/campanha.ts';

function cx(...classes: (string | boolean | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}

export function EditorDeCena({ e, editavel }: { e: Entidade; editavel: boolean }) {
  const listaEntidades = entidades.value;
  const listaLigacoes = ligacoes.value;
  const pacote = extrairPacoteDeCena(e, listaEntidades, listaLigacoes);
  const eCombate = ehEncontro(e);

  const mapas = candidatosDeMapa(listaEntidades);
  const trilhas = candidatosDeTrilha(listaEntidades);
  const participantes = candidatosDeParticipantes(listaEntidades, pacote.participantes);
  const personagensCandidatos = participantes.filter(p => p.tipo === 'personagem');
  const ameacasCandidatas = participantes.filter(p => p.tipo === 'ameaca');
  const pistas = candidatosDePistas(listaEntidades, pacote.pistas);

  return (
    <div class="editor-cena" data-testid="editor-cena">
      <div class="editor-cena-topo">
        <div class="editor-cena-titulo">
          <span class="icone-secao" aria-hidden="true">🎬</span>
          <h4>Pacote da Cena & Encontro</h4>
        </div>
        <div class="editor-cena-acoes-topo">
          <button
            type="button"
            class="botao-pilula destaque botao-ativar-cena"
            data-testid="ativar-cena"
            title={eCombate ? 'Lançar encontro no Atlas e Jukebox' : 'Ativar cena no Atlas e Jukebox'}
            onClick={() => void ativarCena(e)}
          >
            {eCombate ? '⚔ Lançar Encontro' : '▶ Ativar Cena'}
          </button>
          <button
            type="button"
            class={cx('botao-toggle-encontro', eCombate && 'ativo')}
            data-testid="toggle-encontro"
            disabled={!editavel}
            title={eCombate ? 'Remover marcação de encontro de combate' : 'Marcar como encontro de combate'}
            onClick={() => void alternarEncontroDaCena(e)}
          >
            ⚔ {eCombate ? 'Encontro de Combate' : 'Marcar como Encontro'}
          </button>
        </div>
      </div>

      <p class="editor-cena-descricao">
        Reúna o mapa do Atlas, a trilha sonora do Jukebox, os participantes e as pistas que compõem este momento.
      </p>

      {/* 🗺 MAPA DA CENA */}
      <section class="secao-vinculo">
        <div class="secao-vinculo-cabecalho">
          <span class="secao-rotulo">🗺 Mapa do Atlas</span>
          {pacote.mapa && (
            <span class="tag-status vinculada">Vinculado</span>
          )}
        </div>

        {pacote.mapa ? (
          <div
            class="card-vinculado"
            data-testid="mapa-vinculado"
            onContextMenu={ev => {
              const mapa = pacote.mapa!;
              const acoesDesvincular: AcaoMenuContexto[] = editavel
                ? [{ id: 'desvincular-mapa', rotulo: 'Desvincular da cena', executar: () => desvincularDaCena(mapa.ligacaoId, mapa.entidade?.nome) }]
                : [];
              abrirMenuContexto(
                ev,
                mapa.entidade ? acoesParaEntidade(mapa.entidade, { extras: acoesDesvincular }) : acoesParaRef(mapa.ref, acoesDesvincular),
                mapa.entidade?.nome ?? formatarRef(mapa.ref),
              );
            }}
          >
            <span class="icone-vinculo">📍</span>
            <button
              type="button"
              class="nome-vinculo"
              style={{ textAlign: 'left', cursor: 'pointer' }}
              title="Abrir mapa no Atlas"
              onClick={() => void abrirNoApp(pacote.mapa!.ref)}
            >
              {pacote.mapa.entidade?.nome ?? formatarRef(pacote.mapa.ref)}
            </button>
            {editavel && (
              <button
                type="button"
                class="botao-desvincular"
                data-testid="desvincular-mapa"
                title="Desvincular mapa"
                aria-label="Desvincular mapa"
                onClick={() => void desvincularDaCena(pacote.mapa!.ligacaoId, pacote.mapa?.entidade?.nome)}
              >
                ✕
              </button>
            )}
          </div>
        ) : (
          editavel && (
            <select
              class="seletor-vinculo"
              data-testid="seletor-mapa-cena"
              aria-label="Vincular mapa do Atlas"
              onChange={ev => {
                const id = ev.currentTarget.value;
                if (!id) return;
                const mapa = listaEntidades.find(m => m.id === id);
                if (mapa) void vincularMapaNaCena(e, mapa);
                ev.currentTarget.value = '';
              }}
            >
              <option value="">+ Vincular Mapa do Atlas...</option>
              {mapas.map(m => (
                <option key={m.id} value={m.id}>
                  {m.nome}
                </option>
              ))}
            </select>
          )
        )}
      </section>

      {/* 🎬 MOMENTO DE ABERTURA */}
      {pacote.mapa && (
        <section class="secao-vinculo" data-testid="secao-momento-abertura">
          <div class="secao-vinculo-cabecalho">
            <span class="secao-rotulo">⚡ Momento de Abertura</span>
            {pacote.momento && (
              <span class="tag-status vinculada">Configurado</span>
            )}
          </div>

          <div class="card-vinculado" data-testid="momento-vinculado">
            <span class="icone-vinculo">🎬</span>
            {editavel ? (
              <input
                type="text"
                class="campo-texto"
                data-testid="input-momento-abertura"
                placeholder="Nome ou ID do momento no Atlas (ex.: O Porão Acorda)…"
                style={{ flex: 1 }}
                value={pacote.momento ?? ''}
                onBlur={ev => {
                  const val = (ev.target as HTMLInputElement).value.trim();
                  if (val !== (pacote.momento ?? '')) {
                    void definirMomentoDaCena(e, val || null);
                  }
                }}
                onKeyDown={ev => {
                  if (ev.key === 'Enter') {
                    (ev.target as HTMLInputElement).blur();
                  }
                }}
              />
            ) : (
              <span class="nome-vinculo">{pacote.momento || 'Nenhum momento configurado'}</span>
            )}
            {editavel && pacote.momento && (
              <button
                type="button"
                class="botao-desvincular"
                data-testid="desvincular-momento"
                title="Remover momento de abertura"
                aria-label="Remover momento de abertura"
                onClick={() => void definirMomentoDaCena(e, null)}
              >
                ✕
              </button>
            )}
          </div>
        </section>
      )}

      {/* 🎵 TRILHA SONORA */}
      <section class="secao-vinculo">
        <div class="secao-vinculo-cabecalho">
          <span class="secao-rotulo">🎵 Cena Sonora do Jukebox</span>
          {pacote.trilha && (
            <span class="tag-status vinculada">Vinculada</span>
          )}
        </div>

        {pacote.trilha ? (
          <div
            class="card-vinculado"
            data-testid="trilha-vinculada"
            onContextMenu={ev => {
              const trilha = pacote.trilha!;
              const acoesDesvincular: AcaoMenuContexto[] = editavel
                ? [{ id: 'desvincular-trilha', rotulo: 'Desvincular da cena', executar: () => desvincularDaCena(trilha.ligacaoId, trilha.entidade?.nome) }]
                : [];
              abrirMenuContexto(
                ev,
                trilha.entidade ? acoesParaEntidade(trilha.entidade, { extras: acoesDesvincular }) : acoesParaRef(trilha.ref, acoesDesvincular),
                trilha.entidade?.nome ?? formatarRef(trilha.ref),
              );
            }}
          >
            <span class="icone-vinculo">🎧</span>
            <button
              type="button"
              class="nome-vinculo"
              style={{ textAlign: 'left', cursor: 'pointer' }}
              title="Tocar no Jukebox"
              onClick={() => void abrirNoApp(pacote.trilha!.ref)}
            >
              {pacote.trilha.entidade?.nome ?? formatarRef(pacote.trilha.ref)}
            </button>
            {editavel && (
              <button
                type="button"
                class="botao-desvincular"
                data-testid="desvincular-trilha"
                title="Desvincular trilha sonora"
                aria-label="Desvincular trilha sonora"
                onClick={() => void desvincularDaCena(pacote.trilha!.ligacaoId, pacote.trilha?.entidade?.nome)}
              >
                ✕
              </button>
            )}
          </div>
        ) : (
          editavel && (
            <select
              class="seletor-vinculo"
              data-testid="seletor-trilha-cena"
              aria-label="Vincular trilha sonora do Jukebox"
              onChange={ev => {
                const id = ev.currentTarget.value;
                if (!id) return;
                const trilha = listaEntidades.find(t => t.id === id);
                if (trilha) void vincularTrilhaNaCena(e, trilha);
                ev.currentTarget.value = '';
              }}
            >
              <option value="">+ Vincular Trilha do Jukebox...</option>
              {trilhas.map(t => (
                <option key={t.id} value={t.id}>
                  {t.nome}
                </option>
              ))}
            </select>
          )
        )}
      </section>

      {/* 👥 PARTICIPANTES DO ENCONTRO */}
      <section class="secao-vinculo">
        <div class="secao-vinculo-cabecalho">
          <span class="secao-rotulo">👥 Participantes ({pacote.participantes.length})</span>
        </div>

        {pacote.participantes.length > 0 && (
          <ul class="lista-itens-vinculados" data-testid="lista-participantes-cena">
            {pacote.participantes.map(p => {
              const itemId = p.entidade?.id ?? p.ref.id;
              const nome = p.entidade?.nome ?? p.ref.id;
              const acoesDesvincular: AcaoMenuContexto[] = editavel
                ? [{ id: `desvincular-part-${itemId}`, rotulo: 'Desvincular da cena', executar: () => desvincularDaCena(p.ligacaoId, nome) }]
                : [];
              return (
                <li
                  key={p.ligacaoId}
                  class="item-vinculado"
                  data-testid={`participante-${itemId}`}
                  onContextMenu={ev =>
                    abrirMenuContexto(
                      ev,
                      p.entidade ? acoesParaEntidade(p.entidade, { extras: acoesDesvincular }) : acoesParaRef(p.ref, acoesDesvincular),
                      nome,
                    )
                  }
                >
                  <span class={cx('badge-participante', p.ehAmeaca ? 'ameaca' : 'jogador')}>
                    {p.ehAmeaca ? 'Ameaça' : 'Jogador'}
                  </span>
                  <button
                    type="button"
                    class="nome-vinculo"
                    style={{ textAlign: 'left', cursor: 'pointer' }}
                    title={p.ref.app === 'ficha' ? 'Abrir ficha no Dossiê' : 'Abrir na Mesa'}
                    onClick={() => {
                      if (p.ref.app !== 'mesa') void abrirNoApp(p.ref);
                      else if (p.entidade) abrirEntidade(p.entidade.id);
                    }}
                  >
                    {nome}
                  </button>
                  {editavel && (
                    <button
                      type="button"
                      class="botao-desvincular"
                      data-testid={`desvincular-participante-${itemId}`}
                      title={`Remover ${nome}`}
                      aria-label={`Remover ${nome}`}
                      onClick={() => void desvincularDaCena(p.ligacaoId, nome)}
                    >
                      ✕
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {editavel && (personagensCandidatos.length > 0 || ameacasCandidatas.length > 0) && (
          <select
            class="seletor-vinculo"
            data-testid="seletor-participante-cena"
            aria-label="Adicionar participante ao encontro"
            onChange={ev => {
              const id = ev.currentTarget.value;
              if (!id) return;
              const part = listaEntidades.find(x => x.id === id);
              if (part) void vincularParticipanteNaCena(e, part);
              ev.currentTarget.value = '';
            }}
          >
            <option value="">+ Adicionar Personagem ou Ameaça...</option>
            {personagensCandidatos.length > 0 && (
              <optgroup label="Personagens (Jogadores)">
                {personagensCandidatos.map(pc => (
                  <option key={pc.id} value={pc.id}>
                    {pc.nome}
                  </option>
                ))}
              </optgroup>
            )}
            {ameacasCandidatas.length > 0 && (
              <optgroup label="Ameaças & Monstros">
                {ameacasCandidatas.map(am => (
                  <option key={am.id} value={am.id}>
                    {am.nome}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        )}
      </section>

      {/* 🔍 PISTAS REVELADAS */}
      <section class="secao-vinculo">
        <div class="secao-vinculo-cabecalho">
          <span class="secao-rotulo">🔍 Pistas Reveladas ({pacote.pistas.length})</span>
        </div>

        {pacote.pistas.length > 0 && (
          <ul class="lista-itens-vinculados" data-testid="lista-pistas-cena">
            {pacote.pistas.map(pi => {
              const itemId = pi.entidade?.id ?? pi.ref.id;
              const nome = pi.entidade?.nome ?? pi.ref.id;
              const acoesDesvincular: AcaoMenuContexto[] = editavel
                ? [{ id: `desvincular-pista-${itemId}`, rotulo: 'Desvincular da cena', executar: () => desvincularDaCena(pi.ligacaoId, nome) }]
                : [];
              return (
                <li
                  key={pi.ligacaoId}
                  class="item-vinculado"
                  data-testid={`pista-${itemId}`}
                  onContextMenu={ev =>
                    abrirMenuContexto(
                      ev,
                      pi.entidade ? acoesParaEntidade(pi.entidade, { extras: acoesDesvincular }) : acoesParaRef(pi.ref, acoesDesvincular),
                      nome,
                    )
                  }
                >
                  <span class="icone-vinculo">📜</span>
                  <button
                    type="button"
                    class="nome-vinculo"
                    style={{ textAlign: 'left', cursor: 'pointer' }}
                    title={pi.ref.app === 'atelie' ? 'Abrir documento no Ateliê' : 'Abrir na Mesa'}
                    onClick={() => {
                      if (pi.ref.app !== 'mesa') void abrirNoApp(pi.ref);
                      else if (pi.entidade) abrirEntidade(pi.entidade.id);
                    }}
                  >
                    {nome}
                  </button>
                  {editavel && (
                    <button
                      type="button"
                      class="botao-desvincular"
                      data-testid={`desvincular-pista-${itemId}`}
                      title={`Desvincular pista ${nome}`}
                      aria-label={`Desvincular pista ${nome}`}
                      onClick={() => void desvincularDaCena(pi.ligacaoId, nome)}
                    >
                      ✕
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {editavel && pistas.length > 0 && (
          <select
            class="seletor-vinculo"
            data-testid="seletor-pista-cena"
            aria-label="Vincular pista do Ateliê"
            onChange={ev => {
              const id = ev.currentTarget.value;
              if (!id) return;
              const pista = listaEntidades.find(x => x.id === id);
              if (pista) void vincularPistaNaCena(e, pista);
              ev.currentTarget.value = '';
            }}
          >
            <option value="">+ Vincular Pista do Ateliê...</option>
            {pistas.map(pi => (
              <option key={pi.id} value={pi.id}>
                {pi.nome}
              </option>
            ))}
          </select>
        )}
      </section>
    </div>
  );
}

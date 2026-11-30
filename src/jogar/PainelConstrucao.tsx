/** Painel lateral colaborativo do modo construção (S7): participantes, atividade, notas e consulta às fichas. */
import { useEffect, useState } from 'preact/hooks';
import { iniciais } from '../online/feed.ts';
import type { Eu, FichaDaSala, Membro, NotaConstrucao } from '../online/protocolo.ts';
import { nomeDaFicha, retratoDaFicha, urlDoAvatarDiscord } from '../online/saguao.ts';
import {
  corDoColaborador,
  formatarHora,
  resumoDaFicha,
  type AtividadeConstrucao,
} from './ponte-construcao.ts';

export { formatarHora, resumoDaFicha };

export type AbaPainelConstrucao = 'mesa' | 'fichas';

export interface PainelConstrucaoProps {
  nomeMapa: string;
  rev: number;
  ehMestre: boolean;
  membros: readonly Membro[];
  eu?: Eu | null;
  atividades: readonly AtividadeConstrucao[];
  notas: readonly NotaConstrucao[];
  fichas: readonly FichaDaSala[];
  baseDossie?: string;
  baseAvatar?: string;
  podeBaixarMapa: boolean;
  aoBaixarMapa: () => void;
  aoAbrirSaguao: () => void;
  aoEnviarNota: (texto: string) => boolean | void;
}

function AvatarParticipante({ m, baseAvatar }: { m: Membro; baseAvatar?: string }) {
  const url = urlDoAvatarDiscord(m.discordId, m.avatar, 64, baseAvatar);
  const [falhou, setFalhou] = useState(false);
  useEffect(() => { setFalhou(false); }, [url]);
  if (url && !falhou) {
    return <img class="painel-construcao-avatar" src={url} alt="" onError={() => setFalhou(true)} />;
  }
  return <span class="painel-construcao-avatar painel-construcao-iniciais" aria-hidden="true">{iniciais(m.nome)}</span>;
}

function RetratoFicha({ retrato, nome }: { retrato: string | null; nome: string }) {
  const [falhou, setFalhou] = useState(false);
  useEffect(() => { setFalhou(false); }, [retrato]);
  if (retrato && !falhou) {
    return <img class="painel-construcao-ficha-retrato" src={retrato} alt="" onError={() => setFalhou(true)} />;
  }
  return <span class="painel-construcao-ficha-retrato painel-construcao-iniciais" aria-hidden="true">{iniciais(nome)}</span>;
}

export function PainelConstrucao({
  nomeMapa,
  rev,
  ehMestre,
  membros,
  eu = null,
  atividades,
  notas,
  fichas,
  baseDossie,
  baseAvatar,
  podeBaixarMapa,
  aoBaixarMapa,
  aoAbrirSaguao,
  aoEnviarNota,
}: PainelConstrucaoProps) {
  const [aba, setAba] = useState<AbaPainelConstrucao>('mesa');
  const [textoNota, setTextoNota] = useState('');

  const enviarNota = (e: Event) => {
    e.preventDefault();
    const limpo = textoNota.trim();
    if (!limpo) return;
    const ok = aoEnviarNota(limpo);
    if (ok !== false) setTextoNota('');
  };

  return (
    <aside class="painel-construcao" data-testid="painel-construcao" aria-label="Painel de construção colaborativa">
      <header class="painel-construcao-topo">
        <div class="painel-construcao-titulo-linha">
          <div class="painel-construcao-titulo-info">
            <strong class="painel-construcao-mapa" data-testid="painel-construcao-nome">{nomeMapa || 'Mapa em construção'}</strong>
            <span class="painel-construcao-rev" data-testid="painel-construcao-rev">rev {rev}</span>
          </div>
          <span class="painel-construcao-selo">Construção</span>
        </div>

        <div class="painel-construcao-acoes">
          {ehMestre && (
            <button
              type="button"
              class="botao-pilula"
              data-testid="painel-construcao-baixar"
              disabled={!podeBaixarMapa}
              onClick={aoBaixarMapa}
            >
              Baixar mapa (.json)
            </button>
          )}
          <button
            type="button"
            class={`botao-pilula ${ehMestre ? '' : 'discreto'}`}
            data-testid="painel-construcao-saguao"
            onClick={aoAbrirSaguao}
          >
            {ehMestre ? 'Saguão / Trocar modo' : 'Saguão'}
          </button>
        </div>

        <div class="painel-construcao-abas" role="tablist" aria-label="Abas do painel de construção">
          <button
            type="button"
            role="tab"
            class={`painel-construcao-aba ${aba === 'mesa' ? 'ativa' : ''}`}
            aria-selected={aba === 'mesa'}
            data-testid="painel-construcao-aba-mesa"
            onClick={() => setAba('mesa')}
          >
            Mesa
          </button>
          <button
            type="button"
            role="tab"
            class={`painel-construcao-aba ${aba === 'fichas' ? 'ativa' : ''}`}
            aria-selected={aba === 'fichas'}
            data-testid="painel-construcao-aba-fichas"
            onClick={() => setAba('fichas')}
          >
            Fichas ({fichas.length})
          </button>
        </div>
      </header>

      {aba === 'mesa' ? (
        <div class="painel-construcao-corpo" role="tabpanel" aria-label="Mesa">
          <section class="painel-construcao-secao" aria-label="Participantes">
            <h2 class="faixa pequena">Participantes ({membros.length})</h2>
            <ul class="painel-construcao-lista" data-testid="painel-construcao-participantes">
              {membros.map(m => {
                const cor = corDoColaborador(m.discordId, m.papel);
                const souEu = eu?.discordId === m.discordId;
                return (
                  <li key={m.discordId} class="painel-construcao-membro" data-testid="painel-construcao-membro">
                    <span class="painel-construcao-cor" style={{ backgroundColor: cor }} aria-hidden="true" />
                    <AvatarParticipante m={m} baseAvatar={baseAvatar} />
                    <span class="painel-construcao-membro-nome">
                      {m.nome}
                      {souEu && <span class="meta"> (você)</span>}
                    </span>
                    {m.papel === 'mestre' && <span class="saguao-selo-mestre">Mestre</span>}
                  </li>
                );
              })}
            </ul>
          </section>

          <section class="painel-construcao-secao" aria-label="Atividade recente">
            <h2 class="faixa pequena">Atividade recente</h2>
            {atividades.length === 0 ? (
              <p class="meta painel-construcao-vazio" data-testid="painel-construcao-sem-atividade">Nenhuma edição registrada ainda.</p>
            ) : (
              <ul class="painel-construcao-lista" data-testid="painel-construcao-atividades">
                {atividades.map(a => {
                  const cor = corDoColaborador(a.autor.discordId, a.autor.papel);
                  return (
                    <li key={`${a.rev}-${a.opId}`} class="painel-construcao-atividade" data-testid="painel-construcao-atividade">
                      <span class="painel-construcao-cor" style={{ backgroundColor: cor }} aria-hidden="true" />
                      <div class="painel-construcao-atividade-texto">
                        <div class="painel-construcao-atividade-linha">
                          <strong class="painel-construcao-autor">{a.autor.nome}</strong>
                          <span class="painel-construcao-hora">{formatarHora(a.em)}</span>
                        </div>
                        <span class="painel-construcao-rotulo">{a.rotulo}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section class="painel-construcao-secao painel-construcao-notas-secao" aria-label="Notas e chat">
            <h2 class="faixa pequena">Notas / Chat</h2>
            {notas.length === 0 ? (
              <p class="meta painel-construcao-vazio" data-testid="painel-construcao-sem-notas">Nenhuma nota na construção.</p>
            ) : (
              <ul class="painel-construcao-lista painel-construcao-notas" data-testid="painel-construcao-notas">
                {notas.map(n => {
                  const cor = corDoColaborador(n.autor.discordId, n.autor.papel);
                  return (
                    <li key={n.id} class="painel-construcao-nota" data-testid="painel-construcao-nota">
                      <div class="painel-construcao-atividade-linha">
                        <span class="painel-construcao-nota-autor">
                          <span class="painel-construcao-cor" style={{ backgroundColor: cor }} aria-hidden="true" />
                          <strong>{n.autor.nome}</strong>
                        </span>
                        <span class="painel-construcao-hora">{formatarHora(n.em)}</span>
                      </div>
                      <p class="painel-construcao-nota-texto">{n.texto}</p>
                    </li>
                  );
                })}
              </ul>
            )}
            <form class="painel-construcao-form" data-testid="painel-construcao-form-nota" onSubmit={enviarNota}>
              <input
                type="text"
                class="painel-construcao-input"
                data-testid="painel-construcao-input-nota"
                placeholder="Escrever nota ou recado…"
                maxLength={500}
                value={textoNota}
                onInput={e => setTextoNota(e.currentTarget.value)}
              />
              <button
                type="submit"
                class="botao-pilula destaque"
                data-testid="painel-construcao-enviar-nota"
                disabled={!textoNota.trim()}
              >
                Enviar
              </button>
            </form>
          </section>
        </div>
      ) : (
        <div class="painel-construcao-corpo" role="tabpanel" aria-label="Fichas">
          <section class="painel-construcao-secao" aria-label="Fichas da sala">
            <h2 class="faixa pequena">Consulta rápida</h2>
            {fichas.length === 0 ? (
              <p class="meta painel-construcao-vazio" data-testid="painel-construcao-sem-fichas">Nenhuma ficha disponível na sala.</p>
            ) : (
              <ul class="painel-construcao-lista" data-testid="painel-construcao-fichas">
                {fichas.map(f => {
                  const nome = nomeDaFicha(f);
                  const retrato = retratoDaFicha(f, baseDossie);
                  const resumo = resumoDaFicha(f);
                  return (
                    <li key={f.id} class="painel-construcao-ficha" data-testid="painel-construcao-ficha">
                      <RetratoFicha retrato={retrato} nome={nome} />
                      <div class="painel-construcao-ficha-info">
                        <strong class="painel-construcao-ficha-nome">{nome}</strong>
                        {resumo && <span class="meta painel-construcao-ficha-resumo">{resumo}</span>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      )}
    </aside>
  );
}

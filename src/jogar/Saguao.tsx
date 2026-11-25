/** Saguão da mesa online (R12b): capa e nome da campanha, membros presentes e escolha de personagem. */
import { useRef, useState } from 'preact/hooks';
import { iniciais } from '../online/feed.ts';
import type { FichaDaSala } from '../online/protocolo.ts';
import {
  nomeDaFicha,
  prepararFichasImportadas,
  retratoDaFicha,
  type EstadoDoSaguao,
  type MembroNoSaguao,
} from '../online/saguao.ts';

export interface SaguaoProps {
  nomeDaSala: string;
  capaUrl: string | null;
  estado: EstadoDoSaguao;
  fichas: readonly FichaDaSala[];
  meuPersonagemId: string | null;
  podeFechar: boolean;
  espectador?: boolean;
  aoEscolher: (fichaId: string) => void;
  aoNovaFicha: () => void;
  aoImportar: (fichas: FichaDaSala[]) => void;
  aoFechar: () => void;
}

function Avatar({ m }: { m: MembroNoSaguao }) {
  const [falhou, setFalhou] = useState(false);
  if (m.avatarUrl && !falhou) {
    return <img class="saguao-avatar" src={m.avatarUrl} alt="" onError={() => setFalhou(true)} />;
  }
  return <span class="saguao-avatar saguao-iniciais" aria-hidden="true">{iniciais(m.nome)}</span>;
}

export function MembroLinha({ m }: { m: MembroNoSaguao }) {
  return (
    <li class="saguao-membro" data-testid="saguao-membro" data-papel={m.papel}>
      <Avatar m={m} />
      <div class="saguao-membro-info">
        <div class="saguao-membro-topo">
          <strong class="saguao-membro-nome">{m.nome}</strong>
          {m.papel === 'mestre' && <span class="saguao-selo-mestre">mestre</span>}
        </div>
        {m.papel === 'jogador' && (
          <span class="saguao-membro-pers">
            {m.escolheu ? (m.personagemNome ?? 'Personagem escolhido') : 'Escolhendo personagem…'}
          </span>
        )}
      </div>
      {m.personagemRetrato && (
        <img class="saguao-membro-retrato" src={m.personagemRetrato} alt={m.personagemNome ?? ''} />
      )}
    </li>
  );
}

export function Saguao({
  nomeDaSala,
  capaUrl,
  estado,
  fichas,
  meuPersonagemId,
  podeFechar,
  espectador = false,
  aoEscolher,
  aoNovaFicha,
  aoImportar,
  aoFechar,
}: SaguaoProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [erroImport, setErroImport] = useState<string | null>(null);

  const lerArquivo = async (arquivo: File | undefined) => {
    if (!arquivo) return;
    setErroImport(null);
    try {
      const parsed: unknown = JSON.parse(await arquivo.text());
      const prontas = prepararFichasImportadas(parsed, () => `sheet-${crypto.randomUUID().slice(0, 8)}`);
      aoImportar(prontas);
    } catch (e) {
      setErroImport(e instanceof Error ? e.message : 'Arquivo JSON inválido.');
    }
  };

  return (
    <div class="saguao" data-testid="casca-saguao" role="dialog" aria-label="Saguão da mesa">
      <div class="saguao-miolo">
        <header class={`saguao-capa ${capaUrl ? 'com-imagem' : ''}`}>
          {capaUrl && <img class="saguao-capa-img" src={capaUrl} alt="" />}
          <div class="saguao-capa-conteudo">
            <h1 class="faixa saguao-titulo" data-testid="saguao-nome">{nomeDaSala || 'Mesa online'}</h1>
            {estado.mesaAberta ? (
              <div class="saguao-status-linha">
                <span class="saguao-status aberta" data-testid="saguao-status">Mesa aberta</span>
                {podeFechar && (
                  <button type="button" class="botao-pilula destaque" data-testid="saguao-voltar-mapa" onClick={aoFechar}>
                    Voltar ao mapa
                  </button>
                )}
              </div>
            ) : (
              <p class="saguao-status" data-testid="casca-aguardando">Aguardando o mestre abrir a mesa</p>
            )}
          </div>
        </header>

        <div class="saguao-grade">
          {!espectador && (
          <section class="saguao-bloco" aria-label="Personagem">
            <div class="saguao-bloco-cabecalho">
              <h2 class="faixa pequena">Seu personagem</h2>
              <div class="saguao-acoes-ficha">
                <button type="button" class="botao-pilula" data-testid="saguao-nova-ficha" onClick={aoNovaFicha}>
                  Nova ficha
                </button>
                <button type="button" class="botao-pilula" data-testid="saguao-importar-json" onClick={() => inputRef.current?.click()}>
                  Importar JSON
                </button>
                <input
                  ref={inputRef}
                  type="file"
                  accept=".json,application/json"
                  style={{ display: 'none' }}
                  onChange={e => {
                    void lerArquivo(e.currentTarget.files?.[0]);
                    e.currentTarget.value = '';
                  }}
                />
              </div>
            </div>
            {erroImport && <div class="aviso" role="alert">{erroImport}</div>}

            {fichas.length === 0 ? (
              <p class="dica" data-testid="saguao-sem-fichas">
                Você ainda não tem fichas nesta mesa. Crie uma nova ou importe um JSON.
              </p>
            ) : (
              <ul class="saguao-fichas" data-testid="saguao-fichas">
                {fichas.map(f => {
                  const nome = nomeDaFicha(f);
                  const retrato = retratoDaFicha(f);
                  const ativa = f.id === meuPersonagemId;
                  return (
                    <li key={f.id}>
                      <button
                        type="button"
                        class={`saguao-cartao-ficha ${ativa ? 'ativa' : ''}`}
                        data-testid="saguao-ficha"
                        aria-pressed={ativa}
                        onClick={() => aoEscolher(f.id)}
                      >
                        {retrato
                          ? <img class="saguao-ficha-retrato" src={retrato} alt="" />
                          : <span class="saguao-ficha-retrato saguao-iniciais" aria-hidden="true">{iniciais(nome)}</span>}
                        <span class="saguao-ficha-nome">{nome}</span>
                        {ativa && <span class="saguao-ficha-selo">Escolhido</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
          )}

          <section class="saguao-bloco" aria-label="Participantes">
            <h2 class="faixa pequena">Na mesa ({estado.membros.length})</h2>
            <ul class="saguao-membros" data-testid="saguao-membros">
              {estado.membros.length === 0 && <li class="meta">Conectando…</li>}
              {estado.membros.map(m => <MembroLinha key={m.discordId} m={m} />)}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}

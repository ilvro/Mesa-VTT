/** Saguão da mesa online (R12b / S2): capa e nome da campanha, seletor de modo, construção ou escolha de personagem. */
import { useEffect, useRef, useState } from 'preact/hooks';
import { iniciais } from '../online/feed.ts';
import {
  GENEROS_MAPA,
  TAMANHO_CELULA_PADRAO,
  criarMapaConstrucaoInicial,
  extrairMapaImportado,
  normalizarCelulasMapa,
  type RenderizadorMapa,
} from '../online/mapa-inicial.ts';
import type { FichaDaSala, ModoDaSala, ResumoConstrucao } from '../online/protocolo.ts';
import {
  nomeDaFicha,
  prepararFichasImportadas,
  retratoDaFicha,
  visaoDoSaguao,
  type EstadoDoSaguao,
  type MembroNoSaguao,
} from '../online/saguao.ts';

export interface SaguaoProps {
  nomeDaSala: string;
  capaUrl: string | null;
  baseDossie?: string;
  estado: EstadoDoSaguao;
  fichas: readonly FichaDaSala[];
  meuPersonagemId: string | null;
  podeFechar: boolean;
  espectador?: boolean;
  ehMestre?: boolean;
  modo?: ModoDaSala;
  construcao?: ResumoConstrucao;
  preparandoSons?: boolean;
  aoLiberarSom?: () => void;
  aoMudarModo?: (modo: ModoDaSala) => void;
  aoAbrirMapaConstrucao?: (mapa: Record<string, unknown>, nome?: string) => void | Promise<void>;
  aoEscolher: (fichaId: string) => void;
  aoNovaFicha: () => void;
  aoImportar: (fichas: FichaDaSala[]) => void;
  aoFechar: () => void;
}

interface MapaPendente {
  mapa: Record<string, unknown>;
  nome: string;
}

function Avatar({ m }: { m: MembroNoSaguao }) {
  const [falhou, setFalhou] = useState(false);
  useEffect(() => { setFalhou(false); }, [m.avatarUrl]);
  if (m.avatarUrl && !falhou) {
    return <img class="saguao-avatar" src={m.avatarUrl} alt="" onError={() => setFalhou(true)} />;
  }
  return <span class="saguao-avatar saguao-iniciais" aria-hidden="true">{iniciais(m.nome)}</span>;
}

function RetratoDaFicha({ retrato, nome }: { retrato: string | null; nome: string }) {
  const [falhou, setFalhou] = useState(false);
  useEffect(() => { setFalhou(false); }, [retrato]);
  if (retrato && !falhou) {
    return <img class="saguao-ficha-retrato" src={retrato} alt="" onError={() => setFalhou(true)} />;
  }
  return <span class="saguao-ficha-retrato saguao-iniciais" aria-hidden="true">{iniciais(nome)}</span>;
}

export function MembroLinha({ m, modo = 'sessao' }: { m: MembroNoSaguao; modo?: ModoDaSala }) {
  const [retratoFalhou, setRetratoFalhou] = useState(false);
  useEffect(() => { setRetratoFalhou(false); }, [m.personagemRetrato]);
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
            {modo === 'construcao'
              ? (m.escolheu && m.personagemNome ? m.personagemNome : 'Na construção')
              : (m.escolheu ? (m.personagemNome ?? 'Personagem escolhido') : 'Escolhendo personagem…')}
          </span>
        )}
      </div>
      {m.personagemRetrato && !retratoFalhou && (
        <img class="saguao-membro-retrato" src={m.personagemRetrato} alt="" onError={() => setRetratoFalhou(true)} />
      )}
    </li>
  );
}

export function Saguao({
  nomeDaSala,
  capaUrl,
  baseDossie,
  estado,
  fichas,
  meuPersonagemId,
  podeFechar,
  espectador = false,
  ehMestre: ehMestreProp,
  modo = 'sessao',
  construcao = { temMapa: false, rev: 0 },
  preparandoSons = false,
  aoLiberarSom,
  aoMudarModo,
  aoAbrirMapaConstrucao,
  aoEscolher,
  aoNovaFicha,
  aoImportar,
  aoFechar,
}: SaguaoProps) {
  const ehMestre = ehMestreProp ?? espectador;
  const visao = visaoDoSaguao({
    modo,
    ehMestre,
    mesaAberta: estado.mesaAberta,
    temMapaConstrucao: construcao.temMapa,
    podeFechar,
  });

  const inputRef = useRef<HTMLInputElement>(null);
  const inputMapaRef = useRef<HTMLInputElement>(null);
  const [erroImport, setErroImport] = useState<string | null>(null);

  // Estado do formulário "Mapa da construção" (mestre)
  const [nomeMapa, setNomeMapa] = useState('');
  const [larguraTexto, setLarguraTexto] = useState('30');
  const [alturaTexto, setAlturaTexto] = useState('20');
  const [renderer, setRenderer] = useState<RenderizadorMapa>('illustrated');
  const [genre, setGenre] = useState('investigacao');
  const [trocandoMapa, setTrocandoMapa] = useState(false);
  const [pendenteAbrir, setPendenteAbrir] = useState<MapaPendente | null>(null);
  const [abrindoMapa, setAbrindoMapa] = useState(false);
  const [erroMapa, setErroMapa] = useState<string | null>(null);

  useEffect(() => {
    setTrocandoMapa(false);
    setPendenteAbrir(null);
    setErroMapa(null);
  }, [modo, construcao.temMapa]);

  const larguraCelulas = normalizarCelulasMapa(Number(larguraTexto) || undefined, 30);
  const alturaCelulas = normalizarCelulasMapa(Number(alturaTexto) || undefined, 20);
  const larguraMetros = Math.round(larguraCelulas * TAMANHO_CELULA_PADRAO * 10) / 10;
  const alturaMetros = Math.round(alturaCelulas * TAMANHO_CELULA_PADRAO * 10) / 10;

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

  const enviarOuConfirmarMapa = async (mapa: Record<string, unknown>, nome: string) => {
    setErroMapa(null);
    if (construcao.temMapa) {
      setPendenteAbrir({ mapa, nome });
      return;
    }
    await confirmarAbertura({ mapa, nome });
  };

  const confirmarAbertura = async (alvo: MapaPendente) => {
    if (!aoAbrirMapaConstrucao) return;
    setAbrindoMapa(true);
    setErroMapa(null);
    try {
      await aoAbrirMapaConstrucao(alvo.mapa, alvo.nome);
      setPendenteAbrir(null);
      setTrocandoMapa(false);
    } catch (e) {
      setErroMapa(e instanceof Error ? e.message : 'Não foi possível abrir o mapa.');
    } finally {
      setAbrindoMapa(false);
    }
  };

  const criarNovoMapaEmBranco = async (e: Event) => {
    e.preventDefault();
    const mapa = criarMapaConstrucaoInicial({
      nome: nomeMapa.trim() || 'Mapa sem nome',
      larguraCelulas,
      alturaCelulas,
      renderer,
      genre,
    });
    await enviarOuConfirmarMapa(mapa, mapa.name);
  };

  const lerArquivoMapa = async (arquivo: File | undefined) => {
    if (!arquivo) return;
    setErroMapa(null);
    try {
      const parsed: unknown = JSON.parse(await arquivo.text());
      const mapa = extrairMapaImportado(parsed);
      await enviarOuConfirmarMapa(mapa, mapa.name);
    } catch (e) {
      setErroMapa(e instanceof Error ? e.message : 'Arquivo JSON de mapa inválido.');
    }
  };

  const temColunaEsquerda = visao.mostrarPersonagens || visao.mostrarMapaConstrucao || visao.mostrarStatusConstrucaoJogador;
  const nomeConstrucaoAtual = construcao.nome || 'Mapa sem nome';

  return (
    <div class="saguao" data-testid="casca-saguao" role="dialog" aria-label="Saguão da mesa" onClick={() => aoLiberarSom?.()}>
      <div class="saguao-miolo">
        <header class={`saguao-capa ${capaUrl ? 'com-imagem' : ''}`}>
          {capaUrl && <img class="saguao-capa-img" src={capaUrl} alt="" />}
          <div class="saguao-capa-conteudo">
            <div class="saguao-capa-topo">
              <h1 class="faixa saguao-titulo" data-testid="saguao-nome">{nomeDaSala || 'Mesa online'}</h1>
              <div class="saguao-modo-barra">
                <span class={`saguao-modo-selo ${visao.modo}`} data-testid="saguao-modo-selo">
                  {visao.rotuloModo}
                </span>
                {visao.mostrarSeletorModo && (
                  <div class="saguao-modo-seletor" role="group" aria-label="Alternar modo da sala" data-testid="saguao-modo-seletor">
                    <button
                      type="button"
                      class={`saguao-modo-opcao ${visao.modo === 'sessao' ? 'ativa' : ''}`}
                      data-testid="saguao-modo-sessao"
                      aria-pressed={visao.modo === 'sessao'}
                      onClick={() => { if (visao.modo !== 'sessao') aoMudarModo?.('sessao'); }}
                    >
                      Modo Sessão
                    </button>
                    <button
                      type="button"
                      class={`saguao-modo-opcao ${visao.modo === 'construcao' ? 'ativa' : ''}`}
                      data-testid="saguao-modo-construcao"
                      aria-pressed={visao.modo === 'construcao'}
                      onClick={() => { if (visao.modo !== 'construcao') aoMudarModo?.('construcao'); }}
                    >
                      Modo Construção
                    </button>
                  </div>
                )}
              </div>
            </div>

            {visao.aberta ? (
              <div class="saguao-status-linha">
                <span class="saguao-status aberta" data-testid="saguao-status">{visao.statusTexto}</span>
                {visao.podeEntrarNoCabecalho && (
                  <button
                    type="button"
                    class="botao-pilula destaque"
                    data-testid={visao.modo === 'construcao' ? 'saguao-entrar-construcao' : 'saguao-voltar-mapa'}
                    onClick={aoFechar}
                  >
                    {visao.rotuloBotaoEntrar}
                  </button>
                )}
              </div>
            ) : (
              <p
                class="saguao-status"
                data-testid={!ehMestre ? 'casca-aguardando' : 'saguao-aguardando-mapa'}
              >
                {visao.statusTexto}
              </p>
            )}
            {preparandoSons && <p class="saguao-status" data-testid="saguao-preparando-sons">Preparando os sons…</p>}
          </div>
        </header>

        <div class={`saguao-grade ${temColunaEsquerda ? '' : 'uma-coluna'}`}>
          {visao.mostrarPersonagens && (
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
                    const retrato = retratoDaFicha(f, baseDossie);
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
                          <RetratoDaFicha retrato={retrato} nome={nome} />
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

          {visao.mostrarMapaConstrucao && (
            <section class="saguao-bloco" aria-label="Mapa da construção" data-testid="saguao-bloco-construcao">
              <div class="saguao-bloco-cabecalho">
                <h2 class="faixa pequena">Mapa da construção</h2>
              </div>

              {erroMapa && <div class="aviso" role="alert" data-testid="construcao-erro">{erroMapa}</div>}

              {construcao.temMapa && (
                <div class="saguao-mapa-ativo" data-testid="saguao-mapa-ativo">
                  <div class="saguao-mapa-ativo-info">
                    <strong class="saguao-mapa-ativo-nome" data-testid="saguao-mapa-ativo-nome">{nomeConstrucaoAtual}</strong>
                    <span class="meta" data-testid="saguao-mapa-ativo-rev">Revisão {construcao.rev}</span>
                  </div>
                  <div class="saguao-acoes-ficha">
                    {podeFechar && (
                      <button
                        type="button"
                        class="botao-pilula destaque"
                        data-testid="saguao-entrar-construcao"
                        onClick={aoFechar}
                      >
                        Entrar na construção
                      </button>
                    )}
                    <button
                      type="button"
                      class="botao-pilula"
                      data-testid="saguao-trocar-mapa"
                      onClick={() => {
                        setTrocandoMapa(v => !v);
                        setPendenteAbrir(null);
                        setErroMapa(null);
                      }}
                    >
                      {trocandoMapa ? 'Cancelar troca' : 'Novo / Trocar mapa'}
                    </button>
                  </div>
                </div>
              )}

              {(!construcao.temMapa || trocandoMapa) && (
                <div class="saguao-construcao-opcoes">
                  <form class="saguao-form" data-testid="saguao-form-novo-mapa" onSubmit={e => { void criarNovoMapaEmBranco(e); }}>
                    <h3 class="saguao-subtitulo">Novo mapa em branco</h3>
                    <label class="saguao-campo">
                      <span>Nome do mapa</span>
                      <input
                        type="text"
                        data-testid="construcao-mapa-nome"
                        placeholder="Mapa sem nome"
                        maxLength={120}
                        value={nomeMapa}
                        onInput={e => setNomeMapa(e.currentTarget.value)}
                      />
                    </label>

                    <div class="saguao-campos-linha">
                      <label class="saguao-campo">
                        <span>Largura (células)</span>
                        <input
                          type="number"
                          min={2}
                          max={400}
                          step={1}
                          data-testid="construcao-mapa-largura"
                          value={larguraTexto}
                          onInput={e => setLarguraTexto(e.currentTarget.value)}
                        />
                      </label>
                      <label class="saguao-campo">
                        <span>Altura (células)</span>
                        <input
                          type="number"
                          min={2}
                          max={400}
                          step={1}
                          data-testid="construcao-mapa-altura"
                          value={alturaTexto}
                          onInput={e => setAlturaTexto(e.currentTarget.value)}
                        />
                      </label>
                    </div>
                    <p class="meta saguao-dimensao-metros" data-testid="construcao-mapa-metros">
                      Dimensões no Atlas: {larguraCelulas}×{alturaCelulas} células ({larguraMetros}×{alturaMetros} m)
                    </p>

                    <div class="saguao-campos-linha">
                      <label class="saguao-campo">
                        <span>Estilo</span>
                        <select
                          data-testid="construcao-mapa-estilo"
                          value={renderer}
                          onChange={e => setRenderer(e.currentTarget.value === 'pixel' ? 'pixel' : 'illustrated')}
                        >
                          <option value="illustrated">Ilustrado</option>
                          <option value="pixel">Pixel</option>
                        </select>
                      </label>
                      <label class="saguao-campo">
                        <span>Gênero</span>
                        <select
                          data-testid="construcao-mapa-genero"
                          value={genre}
                          onChange={e => setGenre(e.currentTarget.value)}
                        >
                          {GENEROS_MAPA.map(g => (
                            <option key={g.id} value={g.id}>{g.nome}</option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <div class="saguao-construcao-acoes">
                      <button
                        type="submit"
                        class="botao-pilula destaque"
                        data-testid="construcao-criar-mapa"
                        disabled={abrindoMapa}
                      >
                        {abrindoMapa ? 'Abrindo…' : 'Criar e abrir'}
                      </button>
                      <button
                        type="button"
                        class="botao-pilula"
                        data-testid="construcao-importar-json"
                        disabled={abrindoMapa}
                        onClick={() => inputMapaRef.current?.click()}
                      >
                        Importar arquivo (.json)
                      </button>
                      <input
                        ref={inputMapaRef}
                        type="file"
                        accept=".json,.atlas,.atlas.json,application/json"
                        style={{ display: 'none' }}
                        onChange={e => {
                          void lerArquivoMapa(e.currentTarget.files?.[0]);
                          e.currentTarget.value = '';
                        }}
                      />
                    </div>
                  </form>

                  {pendenteAbrir && (
                    <div class="saguao-confirmacao" role="region" aria-label="Confirmar troca de mapa" data-testid="saguao-confirmar-troca">
                      <p>
                        Já existe o mapa <strong>{nomeConstrucaoAtual}</strong> (rev. {construcao.rev}) em construção.
                        Trocar por <strong>{pendenteAbrir.nome}</strong> substitui o mapa atual da sala.
                      </p>
                      <div class="saguao-acoes-ficha">
                        <button
                          type="button"
                          class="botao-pilula perigo"
                          data-testid="saguao-confirmar-substituir"
                          disabled={abrindoMapa}
                          onClick={() => { void confirmarAbertura(pendenteAbrir); }}
                        >
                          {abrindoMapa ? 'Substituindo…' : 'Substituir mapa'}
                        </button>
                        <button
                          type="button"
                          class="botao-pilula"
                          data-testid="saguao-cancelar-substituir"
                          disabled={abrindoMapa}
                          onClick={() => setPendenteAbrir(null)}
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </section>
          )}

          {visao.mostrarStatusConstrucaoJogador && (
            <section class="saguao-bloco" aria-label="Construção" data-testid="saguao-construcao-jogador">
              <div class="saguao-bloco-cabecalho">
                <h2 class="faixa pequena">Construção colaborativa</h2>
              </div>
              {construcao.temMapa ? (
                <div class="saguao-mapa-ativo" data-testid="saguao-jogador-mapa-info">
                  <div class="saguao-mapa-ativo-info">
                    <strong class="saguao-mapa-ativo-nome">{nomeConstrucaoAtual}</strong>
                    <span class="meta">Revisão {construcao.rev} · Todos os participantes podem editar juntos</span>
                  </div>
                </div>
              ) : (
                <p class="dica">
                  Não é necessário escolher personagem para construir. Assim que o mestre criar ou importar um mapa, você poderá entrar no editor.
                </p>
              )}
            </section>
          )}

          <section class="saguao-bloco" aria-label="Participantes">
            <h2 class="faixa pequena">Na mesa ({estado.membros.length})</h2>
            <ul class="saguao-membros" data-testid="saguao-membros">
              {estado.membros.length === 0 && <li class="meta">Conectando…</li>}
              {estado.membros.map(m => <MembroLinha key={m.discordId} m={m} modo={visao.modo} />)}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}

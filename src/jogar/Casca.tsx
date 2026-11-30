/** A casca do jogador (`#/jogar/<salaId>`): o mapa projetado pelo mestre (o projetor remoto do Atlas num `iframe`) e a ficha (o Dossiê num único `iframe`: card no painel, completa na tela toda). Plano: R7 e R12. */
import { useEffect, useRef, useState } from 'preact/hooks';
import { baseDoApp } from '../app/inventario.ts';
import { carregarSessaoOnline, iniciarLogin, sairDoOnline, sessaoOnline } from '../app/online-login.ts';
import { conectarSala, type ClienteDaSala, type EstadoDaSala } from '../online/cliente.ts';
import { urlDoWebSocket } from '../online/config.ts';
import type { ConfigSala, Eu, FichaDaSala, Membro, ModoDaSala, ResumoConstrucao } from '../online/protocolo.ts';
import { enviarAberturaConstrucao } from '../online/mapa-inicial.ts';
import { deveMostrarSaguao, estadoDoSaguao, retratoDaFicha } from '../online/saguao.ts';
import {
  BASE_PROXY_DISCORD,
  atualizarAtividadeDiscord,
  baseDoAppNoDiscord,
  descobrirSalaDoServidor,
  iniciarAtividadeDiscord,
  ligarSalaNoDiscord,
  type OpcoesDiscord,
  type ResultadoDiscord,
} from './discord.ts';
import { FeedDeRolagens } from './FeedDeRolagens.tsx';
import { criarPonteDoJogador, type CanalLocal } from './ponte-jogador.ts';
import { Saguao } from './Saguao.tsx';
import { criarSomDaCasca, type EstadoDoSomNaCasca, type SomDaCasca } from './som.ts';
import { lerPreferenciasDeSom } from '../online/sincronia.ts';
import { agendarEntradaDaFicha, type FaseTelaFicha } from './fase-ficha.ts';
import { AtmosferaCritica } from './AtmosferaCritica.tsx';
import { atmosferaPedidaPeloDossie, batimentoDoDossie, EFEITOS_PADRAO, estadoCriticoDaFicha, type AtmosferaCritica as EstadoAtmosfera } from './atmosfera-critica.ts';
import { dossiePronto, vistaAplicada, fichaCobreOMapa, mensagemDeVista, mensagemDoJogador, projetorPronto, vistaDaFicha, vistaPedidaPeloDossie } from './vista-ficha.ts';
import './casca.css';

/** O endereço do projetor remoto do Atlas para esta sala. Não muda quando o mestre troca de mapa: o projetor aceita o `estado` de qualquer mapa. */
export const enderecoDoProjetorRemoto = (base: string, salaId: string): string => `${base}#/projetor-remoto/${encodeURIComponent(salaId)}`;

/** O endereço do Dossiê em modo jogador. Fixo: a vista muda por `postMessage`, nunca pelo `src`. */
export const enderecoDoDossie = (base: string, salaId: string): string => `${base}?sala=${encodeURIComponent(salaId)}&vista=card`;

const MEDIA_CELULAR = '(max-width: 760px) and (orientation: portrait)';
function useCelularVertical(): boolean {
  const [v, setV] = useState(() => typeof matchMedia === 'function' && matchMedia(MEDIA_CELULAR).matches);
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const m = matchMedia(MEDIA_CELULAR);
    const f = () => setV(m.matches);
    f(); m.addEventListener('change', f);
    return () => m.removeEventListener('change', f);
  }, []);
  return v;
}

export type ErroDaCasca = 'sala' | 'sessao' | null;
type Aba = 'mapa' | 'ficha';

const DURACAO_FADE_FICHA_MS = 220;
const prefereMenosMovimento = (): boolean =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function Casca({ salaId }: { salaId: string }) {
  useEffect(() => { carregarSessaoOnline(); }, []);
  const s = sessaoOnline.value;
  const [motivoDeSaida, setMotivoDeSaida] = useState<string | null>(null);
  if (!s) return <Entrar salaId={salaId} aviso={motivoDeSaida} />;
  return <Sala salaId={salaId} sessao={s.sessao} nome={s.eu.nome} aoSessaoInvalida={() => { sairDoOnline(); setMotivoDeSaida('Sua sessão não vale mais. Entre de novo com o Discord.'); }} />;
}

export function CascaDiscord({
  opcoes,
  iniciar = iniciarAtividadeDiscord,
  ligar = ligarSalaNoDiscord,
}: {
  opcoes?: OpcoesDiscord;
  iniciar?: (o?: OpcoesDiscord) => Promise<ResultadoDiscord>;
  ligar?: typeof ligarSalaNoDiscord;
} = {}) {
  const [estado, setEstado] = useState<
    | { tipo: 'carregando' }
    | { tipo: 'erro'; mensagem: string }
    | { tipo: 'resultado'; dados: ResultadoDiscord }
  >({ tipo: 'carregando' });
  const [salaEscolhida, setSalaEscolhida] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [erroLigacao, setErroLigacao] = useState<string | null>(null);

  const conectar = () => {
    setEstado({ tipo: 'carregando' });
    void iniciar(opcoes).then(
      dados => {
        setEstado({ tipo: 'resultado', dados });
        if (dados.estado === 'sem-sala' && dados.salas.length > 0) {
          setSalaEscolhida(dados.salas[0]!.salaId);
        }
      },
      err => {
        setEstado({ tipo: 'erro', mensagem: err instanceof Error ? err.message : 'Não foi possível entrar pelo Discord.' });
      },
    );
  };

  useEffect(() => { conectar(); }, []);

  if (estado.tipo === 'carregando') {
    return (
      <main class="casca casca-entrar" data-testid="casca-discord-carregando">
        <div class="casca-cartao">
          <h1 class="faixa">Mesa online</h1>
          <p class="dica">Conectando ao Discord…</p>
        </div>
      </main>
    );
  }

  if (estado.tipo === 'erro') {
    return (
      <main class="casca casca-entrar" data-testid="casca-discord-erro">
        <div class="casca-cartao">
          <h1 class="faixa">Mesa online</h1>
          <div class="aviso" role="alert">{estado.mensagem}</div>
          <button type="button" class="botao-pilula destaque" onClick={conectar}>Tentar de novo</button>
        </div>
      </main>
    );
  }

  const dados = estado.dados;
  if (dados.estado === 'sem-sala') {
    const confirmar = async () => {
      if (!salaEscolhida) return;
      setOcupado(true);
      setErroLigacao(null);
      try {
        if (dados.guildId) {
          await ligar({ sessao: dados.sessao, guildId: dados.guildId, salaId: salaEscolhida, fetch: opcoes?.fetch, baseSala: opcoes?.baseSala });
        }
        setEstado({
          tipo: 'resultado',
          dados: { estado: 'pronta', sessao: dados.sessao, eu: dados.eu, salaId: salaEscolhida, guildId: dados.guildId, sdk: dados.sdk },
        });
      } catch (e) {
        setErroLigacao(e instanceof Error ? e.message : 'Não foi possível ligar a sala.');
      } finally {
        setOcupado(false);
      }
    };

    return (
      <main class="casca casca-entrar" data-testid="casca-discord-sem-sala">
        <div class="casca-cartao">
          <h1 class="faixa">Mesa online</h1>
          <p class="dica" data-testid="casca-discord-aviso-sem-sala">O mestre ainda não ligou uma sala a este servidor.</p>
          {dados.eu.podeMestrar && (
            dados.salas.length === 0 ? (
              <p class="dica">Você ainda não criou nenhuma sala. Abra a Mesa no navegador para criar uma.</p>
            ) : (
              <>
                <label class="dica" for="casca-seletor-sala">Escolha uma sala para ligar a este servidor:</label>
                <select
                  id="casca-seletor-sala"
                  class="casca-seletor-sala"
                  data-testid="casca-discord-seletor"
                  value={salaEscolhida}
                  onChange={e => setSalaEscolhida(e.currentTarget.value)}
                >
                  {dados.salas.map(s => (
                    <option key={s.salaId} value={s.salaId}>{s.nome}</option>
                  ))}
                </select>
                {erroLigacao && <div class="aviso" role="alert">{erroLigacao}</div>}
                <button
                  type="button"
                  class="botao-pilula destaque"
                  data-testid="casca-discord-ligar"
                  disabled={!salaEscolhida || ocupado}
                  onClick={() => void confirmar()}
                >
                  {ocupado ? 'Ligando…' : 'Ligar e abrir sala'}
                </button>
              </>
            )
          )}
        </div>
      </main>
    );
  }

  const atualizarSala = async () => {
    if (estado.tipo !== 'resultado') { conectar(); return; }
    const { sessao, eu, guildId, sdk } = estado.dados;
    setEstado({ tipo: 'carregando' });
    try {
      const novo = await descobrirSalaDoServidor({
        sessao,
        eu,
        guildId,
        sdk,
        ...(opcoes?.fetch ? { fetch: opcoes.fetch } : {}),
        ...(opcoes?.baseSala ? { baseSala: opcoes.baseSala } : {}),
      });
      setEstado({ tipo: 'resultado', dados: novo });
      if (novo.estado === 'sem-sala' && novo.salas.length > 0) setSalaEscolhida(novo.salas[0]!.salaId);
    } catch (err) {
      setEstado({ tipo: 'erro', mensagem: err instanceof Error ? err.message : 'Não foi possível atualizar a sala.' });
    }
  };

  return (
    <Sala
      key={dados.salaId}
      salaId={dados.salaId}
      sessao={dados.sessao}
      nome={dados.eu.nome}
      emDiscord
      aoSessaoInvalida={conectar}
      aoAtualizarSala={() => { void atualizarSala(); }}
      aoMudarCampanha={nome => { void atualizarAtividadeDiscord(dados.sdk, nome); }}
    />
  );
}

function Entrar({ salaId, aviso }: { salaId: string; aviso: string | null }) {
  return (
    <main class="casca casca-entrar" data-testid="casca-entrar">
      <div class="casca-cartao">
        <h1 class="faixa">Mesa online</h1>
        <p class="dica">Entre com o Discord para ver o mapa que o mestre está projetando.</p>
        {aviso && <div class="aviso" data-testid="casca-aviso" role="alert">{aviso}</div>}
        <button type="button" class="botao-pilula destaque" data-testid="casca-entrar-discord"
          onClick={() => { location.assign(iniciarLogin({ scope: 'identify', voltarPara: `#/jogar/${salaId}` })); }}>Entrar com o Discord</button>
      </div>
    </main>
  );
}

function Sala({
  salaId,
  sessao,
  nome,
  emDiscord = false,
  aoSessaoInvalida,
  aoAtualizarSala,
  aoMudarCampanha,
}: {
  salaId: string;
  sessao: string;
  nome: string;
  emDiscord?: boolean;
  aoSessaoInvalida: () => void;
  aoAtualizarSala?: () => void;
  aoMudarCampanha?: (nome: string) => void;
}) {
  const [conexao, setConexao] = useState<EstadoDaSala>('conectando');
  const [temMapa, setTemMapa] = useState(false);
  const [erro, setErro] = useState<ErroDaCasca>(null);
  const [aba, setAba] = useState<Aba>('mapa');
  const [clienteSala, setClienteSala] = useState<ClienteDaSala | null>(null);
  const [retratos, setRetratos] = useState<Record<string, string>>({});
  const [eu, setEu] = useState<Eu | null>(null);
  const [membros, setMembros] = useState<Membro[]>([]);
  const [fichas, setFichas] = useState<FichaDaSala[]>([]);
  const [config, setConfig] = useState<ConfigSala | null>(null);
  const [construcaoResumo, setConstrucaoResumo] = useState<ResumoConstrucao>({ temMapa: false, rev: 0 });
  const [capaUrl, setCapaUrl] = useState<string | null>(null);
  const [saguaoAberto, setSaguaoAberto] = useState(false);
  const [somPainelAberto, setSomPainelAberto] = useState(false);
  const [estadoSom, setEstadoSom] = useState<EstadoDoSomNaCasca>(() => ({
    preferencias: lerPreferenciasDeSom(),
    bloqueado: false,
    preparando: false,
  }));
  const somRef = useRef<SomDaCasca | null>(null);
  const capaBlobIdRef = useRef<string | null>(null);
  const capaUrlRef = useRef<string | null>(null);
  const [aberta, setAberta] = useState(false);   // a ficha completa pediu a tela toda (fora do celular)
  const [fichaRecolhida, setFichaRecolhida] = useState(false);
  const [fichaProjetada, setFichaProjetada] = useState<{ fichaId: string; ficha?: FichaDaSala } | null>(null);
  const [projecaoVisivel, setProjecaoVisivel] = useState<{ fichaId: string; ficha?: FichaDaSala } | null>(null);
  const [faseProjecao, setFaseProjecao] = useState<FaseTelaFicha>('inativa');
  const [expandidaVisivel, setExpandidaVisivel] = useState(false);
  const [faseExpandida, setFaseExpandida] = useState<FaseTelaFicha>('inativa');
  const fichaProjetadaAtual = useRef<{ fichaId: string; ficha?: FichaDaSala } | null>(null);
  fichaProjetadaAtual.current = fichaProjetada;
  const projecaoVisivelAtual = useRef<{ fichaId: string; ficha?: FichaDaSala } | null>(null);
  projecaoVisivelAtual.current = projecaoVisivel;
  const faseProjecaoAtual = useRef<FaseTelaFicha>('inativa');
  faseProjecaoAtual.current = faseProjecao;
  const expandidaVisivelAtual = useRef(false);
  expandidaVisivelAtual.current = expandidaVisivel;
  const faseExpandidaAtual = useRef<FaseTelaFicha>('inativa');
  faseExpandidaAtual.current = faseExpandida;
  const timerProjecaoRef = useRef<(() => void) | null>(null);
  const timerExpandidaRef = useRef<(() => void) | null>(null);
  const [retornoPainel, setRetornoPainel] = useState(false);   // o painel lateral reaparece com fade depois da ficha completa
  const aguardandoVista = useRef(new Set<() => void>());
  /** O Dossiê avisa (`dossie.vista-aplicada`) quando termina de aplicar a vista ou a projeção pedida. */
  const ouvirVistaAplicada = (aoReceber: () => void) => {
    aguardandoVista.current.add(aoReceber);
    return () => { aguardandoVista.current.delete(aoReceber); };
  };
  const celular = useCelularVertical();
  const quadro = useRef<HTMLIFrameElement>(null);
  const projetorQuadro = useRef<HTMLIFrameElement>(null);
  const projetandoFicha = projecaoVisivel !== null;
  const expandidaNaTela = !celular && expandidaVisivel;
  const vista = vistaDaFicha({ celularVertical: celular, aba, aberta: expandidaNaTela, projetando: projetandoFicha });
  const cobre = fichaCobreOMapa({ celularVertical: celular, aberta: expandidaNaTela, projetando: projetandoFicha });
  const vistaAtual = useRef(vista);
  vistaAtual.current = vista;
  const invalida = useRef(aoSessaoInvalida);
  invalida.current = aoSessaoInvalida;
  const mudarCampanha = useRef(aoMudarCampanha);
  mudarCampanha.current = aoMudarCampanha;
  const mandarVistaAtual = useRef<() => void>(() => {});
  const mandarJogadorAtual = useRef<() => void>(() => {});
  const baseAtlas = emDiscord ? baseDoAppNoDiscord('atlas') : baseDoApp('atlas');
  const baseFicha = emDiscord ? baseDoAppNoDiscord('ficha') : baseDoApp('ficha');

  useEffect(() => {
    setErro(null); setTemMapa(false); setFichaProjetada(null); setConstrucaoResumo({ temMapa: false, rev: 0 });
    let cliente: ClienteDaSala | null = null;
    const wsUrl = emDiscord ? urlDoWebSocket(salaId, `${location.origin}${BASE_PROXY_DISCORD}`) : urlDoWebSocket(salaId);
    cliente = conectarSala({
      url: wsUrl, sessao,
      aoFechar: codigo => { if (codigo === 4004) setErro('sala'); else if (codigo === 4001) { setErro('sessao'); invalida.current(); } },
    });
    const sairEstado = cliente.aoMudarEstado(setConexao);
    setConexao(cliente.estado);
    setClienteSala(cliente);
    const aplicarConfig = (cfg: ConfigSala | undefined) => {
      if (!cfg) return;
      setConfig(cfg);
      mudarCampanha.current?.(cfg.nome);
      const id = cfg.capaBlobId ?? null;
      if (id !== capaBlobIdRef.current) {
        capaBlobIdRef.current = id;
        if (capaUrlRef.current) { URL.revokeObjectURL(capaUrlRef.current); capaUrlRef.current = null; }
        setCapaUrl(null);
        if (id) cliente?.enviar({ tipo: 'blob.pedir', id });
      }
    };
    const sairBemVindo = cliente.ouvir('bem-vindo', m => {
      setEu(m.eu);
      setMembros(m.membros);
      setFichas(m.fichas);
      aplicarConfig(m.config);
      setConstrucaoResumo(m.construcao ?? { temMapa: false, rev: 0 });
      const por: Record<string, string> = {};
      for (const f of m.fichas) {
        const img = retratoDaFicha(f, baseFicha);
        if (img) por[f.id] = img;
      }
      setRetratos(por);
    });
    const sairMembros = cliente.ouvir('membros', m => setMembros(m.membros));
    const sairConfig = cliente.ouvir('config', m => aplicarConfig(m.config));
    const sairConstrucaoEstado = cliente.ouvir('construcao.estado', m => {
      const rev = m.ops.reduce((acc, op) => Math.max(acc, op.rev), m.rev);
      const nomeMapa = m.nome ?? (typeof m.mapa?.name === 'string' && m.mapa.name ? m.mapa.name : undefined);
      setConstrucaoResumo({
        temMapa: true,
        rev,
        ...(nomeMapa !== undefined ? { nome: nomeMapa } : {}),
      });
    });
    const sairConstrucaoAplicada = cliente.ouvir('construcao.aplicada', m => {
      setConstrucaoResumo(prev => (prev.temMapa ? { ...prev, rev: Math.max(prev.rev, m.rev) } : prev));
    });
    const sairConstrucaoFechada = cliente.ouvir('construcao.fechada', () => {
      setConstrucaoResumo({ temMapa: false, rev: 0 });
    });
    const sairAtualizada = cliente.ouvir('ficha.atualizada', m => {
      setFichas(fs => fs.some(x => x.id === m.ficha.id) ? fs.map(x => x.id === m.ficha.id ? m.ficha : x) : [...fs, m.ficha]);
      const img = retratoDaFicha(m.ficha, baseFicha);
      setRetratos(r => img ? { ...r, [m.ficha.id]: img } : r);
    });
    // a ficha foi entregue a outro jogador (R13): sai da lista de retratos e fichas, e a ponte avisa o Dossiê
    const sairRemovida = cliente.ouvir('ficha.removida', m => {
      setFichas(fs => fs.filter(x => x.id !== m.id));
      setRetratos(r => { const { [m.id]: _tirada, ...resto } = r; return resto; });
    });
    const sairBlob = cliente.ouvirBlob((id, blob) => {
      if (id !== capaBlobIdRef.current) return;
      if (capaUrlRef.current) URL.revokeObjectURL(capaUrlRef.current);
      const url = URL.createObjectURL(blob);
      capaUrlRef.current = url;
      setCapaUrl(url);
    });
    const ponte = criarPonteDoJogador({
      cliente,
      salaId,
      criarCanal: n => new BroadcastChannel(n) as unknown as CanalLocal,
      aoTerMapa: () => setTemMapa(true),
      aoSemMapa: () => setTemMapa(false),
      aoDossiePronto: () => mandarVistaAtual.current(),
      aoProjetarFicha: setFichaProjetada,
    });
    const baseJukebox = emDiscord ? baseDoAppNoDiscord('jukebox') : baseDoApp('jukebox');
    const som = criarSomDaCasca({ cliente, baseJukebox });
    somRef.current = som;
    setEstadoSom(som.estado);
    const sairSom = som.aoMudar(setEstadoSom);
    return () => {
      sairSom(); som.fechar(); somRef.current = null;
      sairEstado(); sairBemVindo(); sairMembros(); sairConfig(); sairConstrucaoEstado(); sairConstrucaoAplicada(); sairConstrucaoFechada(); sairAtualizada(); sairRemovida(); sairBlob();
      if (capaUrlRef.current) { URL.revokeObjectURL(capaUrlRef.current); capaUrlRef.current = null; }
      capaBlobIdRef.current = null;
      ponte.fechar(); cliente?.fechar();
    };
  }, [salaId, sessao, emDiscord]);

  const [atmosferaDoDossie, setAtmosferaDoDossie] = useState<EstadoAtmosfera | null>(null);
  const [pulsoCritico, setPulsoCritico] = useState(0);
  // Pedido do card ("Ficha completa") e avisos de pronto do Dossiê e do projetor remoto: só dos `iframe`s da casca, na mesma origem.
  useEffect(() => {
    const ouvir = (ev: MessageEvent) => {
      const pedida = vistaPedidaPeloDossie(ev, quadro.current?.contentWindow, location.origin);
      if (pedida && !fichaProjetadaAtual.current && !projecaoVisivelAtual.current) setAberta(pedida === 'completa');
      if (vistaAplicada(ev, quadro.current?.contentWindow, location.origin)) for (const f of [...aguardandoVista.current]) f();
      if (dossiePronto(ev, quadro.current?.contentWindow, location.origin)) mandarVistaAtual.current();
      const atm = atmosferaPedidaPeloDossie(ev, quadro.current?.contentWindow, location.origin);
      if (atm) setAtmosferaDoDossie(atm);
      if (batimentoDoDossie(ev, quadro.current?.contentWindow, location.origin)) setPulsoCritico(n => n + 1);
      if (projetorPronto(ev, projetorQuadro.current?.contentWindow, location.origin)) mandarJogadorAtual.current();
    };
    addEventListener('message', ouvir);
    return () => removeEventListener('message', ouvir);
  }, []);
  const meuPersonagemId = (eu ? membros.find(m => m.discordId === eu.discordId)?.personagem : undefined) ?? null;
  const meuPersonagemAtual = useRef<string | null>(null);
  meuPersonagemAtual.current = meuPersonagemId;
  const fichasAtual = useRef<FichaDaSala[]>(fichas);
  fichasAtual.current = fichas;
  const fichasChave = fichas.map(f => f.id).join(',');
  const modo: ModoDaSala = config?.modo ?? 'sessao';
  const saguaoObrigatorio = deveMostrarSaguao({
    modo,
    temMapa,
    temMapaConstrucao: construcaoResumo.temMapa,
    papel: eu?.papel ?? 'jogador',
    personagem: meuPersonagemId,
  });
  // Atmosfera crítica: vale o aviso do Dossiê para a ficha do jogador; antes dele (ou com o card recolhido), o estado sai da própria ficha.
  const fichaDoJogador = meuPersonagemId ? fichas.find(f => f.id === meuPersonagemId) : undefined;
  const atmosferaAtual: EstadoAtmosfera = atmosferaDoDossie && atmosferaDoDossie.fichaId === meuPersonagemId
    ? atmosferaDoDossie
    : { fichaId: meuPersonagemId, estado: estadoCriticoDaFicha(fichaDoJogador), efeitos: atmosferaDoDossie?.efeitos ?? EFEITOS_PADRAO };
  const editandoFicha = modo === 'sessao' && !projetandoFicha && (aberta || expandidaNaTela || (celular && aba === 'ficha'));
  const mostrarSaguao = erro !== 'sala' && !editandoFicha && !projetandoFicha && (saguaoAberto || saguaoObrigatorio);
  const atmosferaVisivel = eu?.papel !== 'mestre' && !mostrarSaguao && !projetandoFicha && (atmosferaAtual.estado.pv.vignette || atmosferaAtual.estado.pd.vignette);
  const projecaoAtivaOuSaindo = (): { fichaId: string; ficha?: FichaDaSala } | null =>
    fichaProjetadaAtual.current ?? projecaoVisivelAtual.current;
  const mandarFichaAtiva = (id: string | null = meuPersonagemAtual.current) => {
    if (!id || projecaoAtivaOuSaindo()) return;
    try { quadro.current?.contentWindow?.postMessage({ tipo: 'dossie:abrir-ficha', fichaId: id }, location.origin); } catch { /* o Dossiê ainda não carregou */ }
  };
  const mandarProjecaoFicha = (p: { fichaId: string; ficha?: FichaDaSala } | null = projecaoAtivaOuSaindo()) => {
    const fichaEnvio = p ? (p.ficha ?? fichasAtual.current.find(x => x.id === p.fichaId)) : undefined;
    try {
      quadro.current?.contentWindow?.postMessage(
        p
          ? { tipo: 'dossie:projetar-ficha', fichaId: p.fichaId, ...(fichaEnvio ? { ficha: fichaEnvio } : {}) }
          : { tipo: 'dossie:projetar-ficha', fichaId: null },
        location.origin,
      );
    } catch { /* o Dossiê ainda não carregou */ }
  };
  useEffect(() => () => {
    timerProjecaoRef.current?.();
    timerExpandidaRef.current?.();
  }, []);
  useEffect(() => {
    timerProjecaoRef.current?.();
    timerProjecaoRef.current = null;
    if (fichaProjetada) {
      setProjecaoVisivel(fichaProjetada);
      if (faseProjecaoAtual.current === 'inativa' || faseProjecaoAtual.current === 'saindo') {
        if (prefereMenosMovimento()) {
          setFaseProjecao('ativa');
        } else {
          setFaseProjecao('preparando');
          timerProjecaoRef.current = agendarEntradaDaFicha(() => {
            timerProjecaoRef.current = null;
            setFaseProjecao('ativa');
          }, ouvirVistaAplicada);
        }
      }
      return;
    }
    if (!projecaoVisivelAtual.current) {
      setFaseProjecao('inativa');
      return;
    }
    if (prefereMenosMovimento() || faseProjecaoAtual.current === 'preparando') {
      setProjecaoVisivel(null);
      setFaseProjecao('inativa');
      return;
    }
    setFaseProjecao('saindo');
    const timeoutId = window.setTimeout(() => {
      timerProjecaoRef.current = null;
      setProjecaoVisivel(null);
      setFaseProjecao('inativa');
    }, DURACAO_FADE_FICHA_MS);
    timerProjecaoRef.current = () => clearTimeout(timeoutId);
  }, [fichaProjetada]);
  useEffect(() => {
    timerExpandidaRef.current?.();
    timerExpandidaRef.current = null;
    if (aberta && !celular) {
      setExpandidaVisivel(true);
      if (faseExpandidaAtual.current === 'inativa' || faseExpandidaAtual.current === 'saindo') {
        if (prefereMenosMovimento()) {
          setFaseExpandida('ativa');
        } else {
          setFaseExpandida('preparando');
          timerExpandidaRef.current = agendarEntradaDaFicha(() => {
            timerExpandidaRef.current = null;
            setFaseExpandida('ativa');
          }, ouvirVistaAplicada);
        }
      }
      return;
    }
    if (!expandidaVisivelAtual.current || celular) {
      setExpandidaVisivel(false);
      setFaseExpandida('inativa');
      return;
    }
    if (prefereMenosMovimento() || faseExpandidaAtual.current === 'preparando') {
      setExpandidaVisivel(false);
      setFaseExpandida('inativa');
      return;
    }
    setFaseExpandida('saindo');
    let retornoId: number | null = null;
    const timeoutId = window.setTimeout(() => {
      setExpandidaVisivel(false);
      setFaseExpandida('inativa');
      setRetornoPainel(true);
      retornoId = window.setTimeout(() => { timerExpandidaRef.current = null; setRetornoPainel(false); }, DURACAO_FADE_FICHA_MS);
    }, DURACAO_FADE_FICHA_MS);
    timerExpandidaRef.current = () => { clearTimeout(timeoutId); if (retornoId !== null) clearTimeout(retornoId); setRetornoPainel(false); };
  }, [aberta, celular]);
  const jaProjetouAntes = useRef(false);
  useEffect(() => { mandarFichaAtiva(meuPersonagemId); }, [meuPersonagemId, fichasChave, mostrarSaguao]);
  useEffect(() => {
    if (projecaoVisivel) {
      jaProjetouAntes.current = true;
      try { quadro.current?.contentWindow?.postMessage(mensagemDeVista(vistaAtual.current), location.origin); } catch { /* */ }
      mandarProjecaoFicha(projecaoVisivel);
      return;
    }
    if (!jaProjetouAntes.current) return;
    jaProjetouAntes.current = false;
    try { quadro.current?.contentWindow?.postMessage(mensagemDeVista(vistaAtual.current), location.origin); } catch { /* */ }
    mandarProjecaoFicha(null);
    mandarFichaAtiva(meuPersonagemAtual.current);
  }, [projecaoVisivel]);
  // A vista muda por mensagem, sem recarregar o `iframe`.
  const mandarVista = () => {
    try { quadro.current?.contentWindow?.postMessage(mensagemDeVista(vistaAtual.current), location.origin); } catch { /* o Dossiê ainda não carregou */ }
    const proj = projecaoAtivaOuSaindo();
    if (proj) mandarProjecaoFicha(proj);
    else mandarFichaAtiva();
  };
  mandarVistaAtual.current = mandarVista;
  useEffect(mandarVista, [vista]);
  // As fichas do jogador vão ao projetor remoto (R14) para marcar as peças próprias (mestre espectador manda lista vazia).
  const espectador = eu?.papel === 'mestre';
  const espectadorAtual = useRef(espectador);
  espectadorAtual.current = espectador;
  const fichasIdsAtual = useRef<string[]>([]);
  fichasIdsAtual.current = fichas.map(f => f.id);
  const mandarJogador = () => {
    const ids = espectadorAtual.current ? [] : fichasIdsAtual.current;
    try { projetorQuadro.current?.contentWindow?.postMessage(mensagemDoJogador(ids), location.origin); } catch { /* o projetor ainda não carregou */ }
  };
  mandarJogadorAtual.current = mandarJogador;
  useEffect(mandarJogador, [fichasChave, espectador]);
  // Esc volta ao mapa, com o foco na casca ou dentro do Dossiê (mesma origem), exceto quando o mestre projeta uma ficha.
  useEffect(() => {
    if (!cobre || projetandoFicha) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberta(false); };
    addEventListener('keydown', esc);
    let dentro: Window | null = null;
    try { dentro = quadro.current?.contentWindow ?? null; dentro?.addEventListener('keydown', esc); } catch { dentro = null; }
    return () => { removeEventListener('keydown', esc); try { dentro?.removeEventListener('keydown', esc); } catch { /* */ } };
  }, [cobre, projetandoFicha]);

  if (erro === 'sessao') return null;   // volta para "Entrar" com o aviso
  const baseAvatar = emDiscord ? `${BASE_PROXY_DISCORD}/sala/cdn` : undefined;
  const resumoSaguao = estadoDoSaguao(membros, fichas, temMapa, baseFicha, baseAvatar);

  const mudarModo = (novoModo: ModoDaSala) => {
    clienteSala?.enviar({ tipo: 'sala.modo', modo: novoModo });
  };
  const abrirMapaConstrucao = async (mapa: Record<string, unknown>, nomeMapa?: string) => {
    await enviarAberturaConstrucao(clienteSala, mapa, nomeMapa);
    setSaguaoAberto(false);
  };

  const escolherPersonagem = (fichaId: string) => {
    clienteSala?.enviar({ tipo: 'membro.personagem', fichaId });
    mandarFichaAtiva(fichaId);
    if (temMapa) setSaguaoAberto(false);
  };
  const importarFichas = (novas: FichaDaSala[]) => {
    for (const f of novas) clienteSala?.enviar({ tipo: 'ficha.salvar', ficha: f, rev: 0 });
    const ultima = novas[novas.length - 1];
    if (ultima) escolherPersonagem(ultima.id);
  };
  const abrirNovaFicha = () => {
    setSaguaoAberto(false);
    if (celular) setAba('ficha');
    else setAberta(true);
  };

  return (
    <main
      class="casca"
      data-testid="casca"
      data-aba={aba}
      data-ficha={cobre ? 'completa' : 'painel'}
      data-ficha-recolhida={fichaRecolhida ? '1' : undefined}
      data-projetando-ficha={projetandoFicha ? '1' : undefined}
      data-projecao-fase={faseProjecao !== 'inativa' ? faseProjecao : undefined}
      data-expandida-fase={!projetandoFicha && faseExpandida !== 'inativa' ? faseExpandida : undefined}
      data-ficha-retorno={retornoPainel ? '1' : undefined}
      data-espectador={espectador ? '1' : undefined}
    >
      <section class="casca-mapa" data-testid="casca-mapa" aria-label="Mapa">
        <iframe ref={projetorQuadro} class="casca-iframe" data-testid="casca-iframe" title="Mapa" src={enderecoDoProjetorRemoto(baseAtlas, salaId)} onLoad={mandarJogador} allow="fullscreen; autoplay" />
        {erro === 'sala' && (
          <div class="casca-sobre aviso-grande" data-testid="casca-erro-sala" role="alert">
            <h2 class="faixa">Sala não encontrada</h2>
            <p>Esta sala não existe ou foi encerrada. Confira o link com o mestre.</p>
            {emDiscord && (
              <button type="button" class="botao-pilula destaque" onClick={() => (aoAtualizarSala ? aoAtualizarSala() : location.reload())}>
                Atualizar sala
              </button>
            )}
          </div>
        )}
        <FeedDeRolagens cliente={clienteSala} salaId={salaId} nome={nome} retratos={retratos} eu={eu} membros={membros} baseAvatar={baseAvatar} />
        {!mostrarSaguao && !projetandoFicha && erro !== 'sala' && (
          <div class="casca-topo-direita">
            {estadoSom.bloqueado && (
              <button
                type="button"
                class="casca-ativar-som"
                data-testid="casca-ativar-som"
                onClick={() => somRef.current?.liberar()}
              >
                Ativar som
              </button>
            )}
            <button
              type="button"
              class={`casca-som-botao ${estadoSom.preferencias.mudo ? 'mudo' : ''}`}
              data-testid="casca-som-botao"
              title="Volume do som"
              aria-label="Volume do som"
              aria-expanded={somPainelAberto}
              onClick={() => { somRef.current?.liberar(); setSomPainelAberto(v => !v); }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                {estadoSom.preferencias.mudo
                  ? <><line x1="23" y1="9" x2="17" y2="15" /><line x1="17" y1="9" x2="23" y2="15" /></>
                  : <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />}
              </svg>
            </button>
            <button
              type="button"
              class="casca-saguao-botao"
              data-testid="casca-saguao-botao"
              title="Saguão da mesa"
              aria-label="Saguão da mesa"
              onClick={() => setSaguaoAberto(true)}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </button>
          </div>
        )}
        {!mostrarSaguao && !projetandoFicha && somPainelAberto && (
          <div class="casca-som-painel" data-testid="casca-som-painel" role="region" aria-label="Controles de som">
            <label class="casca-som-linha">
              <span>Música</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                data-testid="casca-som-musica"
                value={estadoSom.preferencias.mudo ? 0 : estadoSom.preferencias.musica}
                onInput={e => somRef.current?.definirMusica(Number(e.currentTarget.value))}
              />
            </label>
            <label class="casca-som-linha">
              <span>Efeitos</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                data-testid="casca-som-efeitos"
                value={estadoSom.preferencias.mudo ? 0 : estadoSom.preferencias.efeitos}
                onInput={e => somRef.current?.definirEfeitos(Number(e.currentTarget.value))}
              />
            </label>
            <button
              type="button"
              class="botao-pilula"
              data-testid="casca-som-mudo"
              onClick={() => somRef.current?.alternarMudo()}
            >
              {estadoSom.preferencias.mudo ? 'Reativar som' : 'Mudo'}
            </button>
          </div>
        )}
        {!espectador && !cobre && !mostrarSaguao && !projetandoFicha && erro !== 'sala' && (
          <button
            type="button"
            class="casca-recolher-ficha"
            data-testid="casca-recolher-ficha"
            aria-expanded={!fichaRecolhida}
            aria-label={fichaRecolhida ? 'Mostrar ficha' : 'Esconder ficha'}
            title={fichaRecolhida ? 'Mostrar ficha' : 'Esconder ficha'}
            onClick={() => setFichaRecolhida(v => !v)}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        )}
        {(erro || conexao !== 'aberta') && (
          <span class={`casca-selo ${erro ? 'caiu' : conexao}`} data-testid="casca-selo" title={`Entrou como ${nome}`}>{erro === 'sala' ? 'Sem sala' : 'Reconectando…'}</span>
        )}
      </section>
      {mostrarSaguao && (
        <Saguao
          nomeDaSala={config?.nome ?? ''}
          capaUrl={capaUrl}
          baseDossie={baseFicha}
          estado={resumoSaguao}
          fichas={fichas}
          meuPersonagemId={meuPersonagemId}
          podeFechar={!saguaoObrigatorio}
          espectador={espectador}
          ehMestre={espectador}
          modo={modo}
          construcao={construcaoResumo}
          preparandoSons={estadoSom.preparando}
          aoLiberarSom={() => somRef.current?.liberar()}
          aoMudarModo={mudarModo}
          aoAbrirMapaConstrucao={abrirMapaConstrucao}
          aoEscolher={escolherPersonagem}
          aoNovaFicha={abrirNovaFicha}
          aoImportar={importarFichas}
          aoFechar={() => setSaguaoAberto(false)}
        />
      )}
      {(!espectador || projetandoFicha) && (
        <iframe ref={quadro} class="casca-ficha" data-testid="casca-ficha" data-vista={vista} title="Ficha" src={enderecoDoDossie(baseFicha, salaId)} onLoad={mandarVista} allow="fullscreen; autoplay" />
      )}
      {atmosferaVisivel && <AtmosferaCritica atmosfera={atmosferaAtual} pulso={pulsoCritico} />}
      {!espectador && (
        <>
          {cobre && !projetandoFicha && <button type="button" class="casca-voltar" data-testid="casca-voltar" onClick={() => setAberta(false)}>Voltar ao mapa</button>}
          <nav class="casca-abas" role="tablist" aria-label="Seções">
            <button type="button" role="tab" aria-selected={aba === 'mapa'} data-testid="casca-aba-mapa" onClick={() => setAba('mapa')}>Mapa</button>
            <button type="button" role="tab" aria-selected={aba === 'ficha'} data-testid="casca-aba-ficha" onClick={() => setAba('ficha')}>Ficha</button>
          </nav>
        </>
      )}
    </main>
  );
}

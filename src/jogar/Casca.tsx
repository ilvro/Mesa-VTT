/** A casca do jogador (`#/jogar/<salaId>`): o mapa projetado pelo mestre (o projetor remoto do Atlas num `iframe`) e a ficha (o Dossiê num único `iframe`: card no painel, completa na tela toda). Plano: R7 e R12. */
import { useEffect, useRef, useState } from 'preact/hooks';
import { baseDoApp } from '../app/inventario.ts';
import { carregarSessaoOnline, iniciarLogin, sairDoOnline, sessaoOnline } from '../app/online-login.ts';
import { conectarSala, type ClienteDaSala, type EstadoDaSala } from '../online/cliente.ts';
import { urlDoWebSocket } from '../online/config.ts';
import { FeedDeRolagens } from './FeedDeRolagens.tsx';
import { criarPonteDoJogador, type CanalLocal } from './ponte-jogador.ts';
import { fichaCobreOMapa, mensagemDeVista, vistaDaFicha, vistaPedidaPeloDossie } from './vista-ficha.ts';
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

export function Casca({ salaId }: { salaId: string }) {
  useEffect(() => { carregarSessaoOnline(); }, []);
  const s = sessaoOnline.value;
  const [motivoDeSaida, setMotivoDeSaida] = useState<string | null>(null);
  if (!s) return <Entrar salaId={salaId} aviso={motivoDeSaida} />;
  return <Sala salaId={salaId} sessao={s.sessao} nome={s.eu.nome} aoSessaoInvalida={() => { sairDoOnline(); setMotivoDeSaida('Sua sessão não vale mais. Entre de novo com o Discord.'); }} />;
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

function Sala({ salaId, sessao, nome, aoSessaoInvalida }: { salaId: string; sessao: string; nome: string; aoSessaoInvalida: () => void }) {
  const [conexao, setConexao] = useState<EstadoDaSala>('conectando');
  const [temMapa, setTemMapa] = useState(false);
  const [erro, setErro] = useState<ErroDaCasca>(null);
  const [aba, setAba] = useState<Aba>('mapa');
  const [clienteSala, setClienteSala] = useState<ClienteDaSala | null>(null);
  const [retratos, setRetratos] = useState<Record<string, string>>({});
  const [aberta, setAberta] = useState(false);   // a ficha completa pediu a tela toda (fora do celular)
  const celular = useCelularVertical();
  const quadro = useRef<HTMLIFrameElement>(null);
  const vista = vistaDaFicha({ celularVertical: celular, aba, aberta });
  const cobre = fichaCobreOMapa({ celularVertical: celular, aberta });
  const vistaAtual = useRef(vista);
  vistaAtual.current = vista;
  const invalida = useRef(aoSessaoInvalida);
  invalida.current = aoSessaoInvalida;

  useEffect(() => {
    setErro(null); setTemMapa(false);
    let cliente: ClienteDaSala | null = null;
    cliente = conectarSala({
      url: urlDoWebSocket(salaId), sessao,
      aoFechar: codigo => { if (codigo === 4004) setErro('sala'); else if (codigo === 4001) { setErro('sessao'); invalida.current(); } },
    });
    const sairEstado = cliente.aoMudarEstado(setConexao);
    setConexao(cliente.estado);
    setClienteSala(cliente);
    // retratos conhecidos: o `tokenImage` das fichas que a sala entrega (as do próprio jogador)
    const sairBemVindo = cliente.ouvir('bem-vindo', m => {
      const por: Record<string, string> = {};
      for (const f of m.fichas) if (typeof f.tokenImage === 'string' && f.tokenImage) por[f.id] = f.tokenImage;
      setRetratos(por);
    });
    // a ficha foi entregue a outro jogador (R13): sai da lista de retratos, e a ponte avisa o Dossiê
    const sairRemovida = cliente.ouvir('ficha.removida', m => setRetratos(r => { const { [m.id]: _tirada, ...resto } = r; return resto; }));
    const ponte = criarPonteDoJogador({ cliente, salaId, criarCanal: n => new BroadcastChannel(n) as unknown as CanalLocal, aoTerMapa: () => setTemMapa(true) });
    return () => { sairEstado(); sairBemVindo(); sairRemovida(); ponte.fechar(); cliente?.fechar(); };
  }, [salaId, sessao]);

  // Pedido do card ("Ficha completa"): só do `iframe` do Dossiê, na mesma origem.
  useEffect(() => {
    const ouvir = (ev: MessageEvent) => {
      const pedida = vistaPedidaPeloDossie(ev, quadro.current?.contentWindow, location.origin);
      if (pedida) setAberta(pedida === 'completa');
    };
    addEventListener('message', ouvir);
    return () => removeEventListener('message', ouvir);
  }, []);
  // A vista muda por mensagem, sem recarregar o `iframe`.
  const mandarVista = () => { try { quadro.current?.contentWindow?.postMessage(mensagemDeVista(vistaAtual.current), location.origin); } catch { /* o Dossiê ainda não carregou */ } };
  useEffect(mandarVista, [vista]);
  // Esc volta ao mapa, com o foco na casca ou dentro do Dossiê (mesma origem).
  useEffect(() => {
    if (!cobre) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberta(false); };
    addEventListener('keydown', esc);
    let dentro: Window | null = null;
    try { dentro = quadro.current?.contentWindow ?? null; dentro?.addEventListener('keydown', esc); } catch { dentro = null; }
    return () => { removeEventListener('keydown', esc); try { dentro?.removeEventListener('keydown', esc); } catch { /* */ } };
  }, [cobre]);

  if (erro === 'sessao') return null;   // volta para "Entrar" com o aviso
  const selo = conexao === 'aberta' ? 'Conectado' : 'Reconectando…';
  return (
    <main class="casca" data-testid="casca" data-aba={aba} data-ficha={cobre ? 'completa' : 'painel'}>
      <section class="casca-mapa" data-testid="casca-mapa" aria-label="Mapa">
        <iframe class="casca-iframe" data-testid="casca-iframe" title="Mapa" src={enderecoDoProjetorRemoto(baseDoApp('atlas'), salaId)} allow="fullscreen; autoplay" />
        {erro === 'sala'
          ? <div class="casca-sobre aviso-grande" data-testid="casca-erro-sala" role="alert"><h2 class="faixa">Sala não encontrada</h2><p>Esta sala não existe ou foi encerrada. Confira o link com o mestre.</p></div>
          : !temMapa && <div class="casca-sobre" data-testid="casca-aguardando"><p>Aguardando o mestre abrir a mesa</p></div>}
        <FeedDeRolagens cliente={clienteSala} salaId={salaId} nome={nome} retratos={retratos} />
        <span class={`casca-selo ${erro ? 'caiu' : conexao}`} data-testid="casca-selo" title={`Entrou como ${nome}`}>{erro === 'sala' ? 'Sem sala' : selo}</span>
      </section>
      {/* Um só `iframe`, filho direto da casca: o CSS (`data-ficha`) o move entre o painel e a tela toda, sem remontar. O feed fica por baixo na ficha completa. */}
      <iframe ref={quadro} class="casca-ficha" data-testid="casca-ficha" data-vista={vista} title="Ficha" src={enderecoDoDossie(baseDoApp('ficha'), salaId)} onLoad={mandarVista} allow="fullscreen; autoplay" />
      {cobre && <button type="button" class="casca-voltar" data-testid="casca-voltar" onClick={() => setAberta(false)}>Voltar ao mapa</button>}
      <nav class="casca-abas" role="tablist" aria-label="Seções">
        <button type="button" role="tab" aria-selected={aba === 'mapa'} data-testid="casca-aba-mapa" onClick={() => setAba('mapa')}>Mapa</button>
        <button type="button" role="tab" aria-selected={aba === 'ficha'} data-testid="casca-aba-ficha" onClick={() => setAba('ficha')}>Ficha</button>
      </nav>
    </main>
  );
}

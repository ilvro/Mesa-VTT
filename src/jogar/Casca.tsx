/** A casca do jogador (`#/jogar/<salaId>`): o mapa projetado pelo mestre (o projetor remoto do Atlas num `iframe`) e o painel da ficha (reservado até a R12). Plano: R7. */
import { useEffect, useRef, useState } from 'preact/hooks';
import { baseDoApp } from '../app/inventario.ts';
import { carregarSessaoOnline, iniciarLogin, sairDoOnline, sessaoOnline } from '../app/online-login.ts';
import { conectarSala, type ClienteDaSala, type EstadoDaSala } from '../online/cliente.ts';
import { urlDoWebSocket } from '../online/config.ts';
import { criarPonteDoJogador, type CanalLocal } from './ponte-jogador.ts';
import './casca.css';

/** O endereço do projetor remoto do Atlas para esta sala. Não muda quando o mestre troca de mapa: o projetor aceita o `estado` de qualquer mapa. */
export const enderecoDoProjetorRemoto = (base: string, salaId: string): string => `${base}#/projetor-remoto/${encodeURIComponent(salaId)}`;

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
    const ponte = criarPonteDoJogador({ cliente, salaId, criarCanal: n => new BroadcastChannel(n) as unknown as CanalLocal, aoTerMapa: () => setTemMapa(true) });
    return () => { sairEstado(); ponte.fechar(); cliente?.fechar(); };
  }, [salaId, sessao]);

  if (erro === 'sessao') return null;   // volta para "Entrar" com o aviso
  const selo = conexao === 'aberta' ? 'Conectado' : 'Reconectando…';
  return (
    <main class="casca" data-testid="casca" data-aba={aba}>
      <section class="casca-mapa" data-testid="casca-mapa" aria-label="Mapa">
        <iframe class="casca-iframe" data-testid="casca-iframe" title="Mapa" src={enderecoDoProjetorRemoto(baseDoApp('atlas'), salaId)} allow="fullscreen; autoplay" />
        {erro === 'sala'
          ? <div class="casca-sobre aviso-grande" data-testid="casca-erro-sala" role="alert"><h2 class="faixa">Sala não encontrada</h2><p>Esta sala não existe ou foi encerrada. Confira o link com o mestre.</p></div>
          : !temMapa && <div class="casca-sobre" data-testid="casca-aguardando"><p>Aguardando o mestre abrir a mesa</p></div>}
        <span class={`casca-selo ${erro ? 'caiu' : conexao}`} data-testid="casca-selo" title={`Entrou como ${nome}`}>{erro === 'sala' ? 'Sem sala' : selo}</span>
      </section>
      <aside class="casca-ficha" data-testid="casca-ficha" aria-label="Ficha"><p class="meta">A ficha aparece aqui em breve</p></aside>
      <nav class="casca-abas" role="tablist" aria-label="Seções">
        <button type="button" role="tab" aria-selected={aba === 'mapa'} data-testid="casca-aba-mapa" onClick={() => setAba('mapa')}>Mapa</button>
        <button type="button" role="tab" aria-selected={aba === 'ficha'} data-testid="casca-aba-ficha" onClick={() => setAba('ficha')}>Ficha</button>
      </nav>
    </main>
  );
}

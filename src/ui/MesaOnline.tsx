import { useEffect, useState } from 'preact/hooks';
import { campanhaAtiva } from '../app/campanha.ts';
import { abrirMesaOnline, confirmarSemNevoa, conexaoOnline, estadoDaPonte, fecharMesaOnline, salaConectadaId } from '../app/online.ts';
import {
  abrirLoginDiscord, aguardandoLoginExterno, cancelarLoginExterno, carregarSessaoOnline, erroDoLogin, sairDoOnline, sessaoOnline,
} from '../app/online-login.ts';
import { apagarSala, criarSala, ligarAoServidor, listarMinhasSalasComLigacoes, listarServidoresDoDiscord, salaDaCampanha, type SalaDoMestre, type ServidorDiscord } from '../app/online-salas.ts';
import { avisar, mensagemDe } from '../app/toasts.ts';
import { MembroLinha } from '../jogar/Saguao.tsx';
import { CHAVE_URL_DA_SALA, ehDesktopMesa, urlDaSala, urlDeConviteDaSala, URL_SALA_LOCAL, URL_SALA_PRODUCAO } from '../online/config.ts';
import { estadoDoSaguao } from '../online/saguao.ts';
import './online.css';

const ROTULO_DA_CONEXAO = { desconectada: 'Desconectada', conectando: 'Conectando…', aberta: 'Conectada', caiu: 'Sem conexão (tentando de novo)' } as const;

/** `12,4 MB`, `830 KB`. */
export function formatarBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
  return `${Math.max(0, Math.round(n / 1024))} KB`;
}

export function MesaOnline() {
  const s = sessaoOnline.value;
  useEffect(() => { carregarSessaoOnline(); }, []);
  return (
    <section class="pagina online" data-testid="mesa-online">
      <h2 class="faixa">Mesa online</h2>
      {erroDoLogin.value && <div class="aviso" data-testid="online-erro">{erroDoLogin.value}</div>}
      {!s ? <SemSessao /> : (
        <>
          <div class="online-quem">
            <span>Entrou como <strong data-testid="online-nome">{s.eu.nome}</strong></span>
            <button type="button" class="botao-pilula" onClick={() => { fecharMesaOnline(); sairDoOnline(); }}>Sair</button>
          </div>
          {s.eu.podeMestrar ? <PainelDoMestre sessao={s.sessao} /> : (
            <div class="aviso suave" data-testid="online-so-mestres">Só mestres cadastrados criam salas. Peça ao dono da Mesa para incluir o seu Discord na lista.</div>
          )}
        </>
      )}
    </section>
  );
}

function SemSessao() {
  const aguardando = aguardandoLoginExterno.value;
  return (
    <div class="online-bloco">
      <p class="dica">Entre com o Discord para abrir a campanha aos jogadores. Sem entrar, a Mesa continua funcionando como sempre.</p>
      {aguardando ? (
        <div class="online-acoes" data-testid="online-aguardando">
          <span class="meta">Aguardando autorização no navegador…</span>
          <button type="button" class="botao-pilula" data-testid="online-cancelar-login" onClick={() => cancelarLoginExterno()}>Cancelar</button>
        </div>
      ) : (
        <button type="button" class="botao-pilula destaque" data-testid="online-entrar" onClick={() => void abrirLoginDiscord()}>Entrar com o Discord</button>
      )}
    </div>
  );
}

function PainelDoMestre({ sessao }: { sessao: string }) {
  const camp = campanhaAtiva.value;
  const [salas, setSalas] = useState<SalaDoMestre[]>([]);
  const [ligacoes, setLigacoes] = useState<Record<string, string>>({});
  const [servidores, setServidores] = useState<ServidorDiscord[]>([]);
  const [precisaRelogar, setPrecisaRelogar] = useState(false);
  const [escolhida, setEscolhida] = useState<string | null>(() => salaDaCampanha(camp?.id));
  const [guild, setGuild] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [servidorAtual, setServidorAtual] = useState(() => urlDaSala());

  const recarregar = () => listarMinhasSalasComLigacoes(sessao)
    .then(r => { setSalas(r.salas); setLigacoes(r.ligacoes); })
    .catch(e => avisar(`Não consegui listar as salas: ${mensagemDe(e)}`, true));
  const carregarServidores = () => {
    void listarServidoresDoDiscord(sessao)
      .then(r => { setServidores(r.servidores); setPrecisaRelogar(!!r.precisaRelogar); })
      .catch(() => { /* fallback manual segue disponível */ });
  };
  useEffect(() => { void recarregar(); carregarServidores(); setEscolhida(salaDaCampanha(camp?.id)); }, [sessao, camp?.id]);

  const sala = salas.find(x => x.salaId === escolhida) ?? null;
  const conexao = conexaoOnline.value, ponte = estadoDaPonte.value;

  const criar = async () => {
    if (!camp) return;
    setOcupado(true);
    try {
      const r = await criarSala(sessao, camp.nome, camp.id);
      setEscolhida(r.salaId);
      await recarregar();
      avisar('Sala criada.');
    } catch (e) { avisar(`Não consegui criar a sala: ${mensagemDe(e)}`, true); } finally { setOcupado(false); }
  };
  const ligar = async (guildId: string = guild.trim()) => {
    if (!sala || !guildId) return;
    setOcupado(true);
    try { await ligarAoServidor(sessao, guildId, sala.salaId); setGuild(''); await recarregar(); avisar('Sala ligada ao servidor do Discord.'); }
    catch (e) { avisar(`Não consegui ligar ao servidor: ${mensagemDe(e)}`, true); } finally { setOcupado(false); }
  };
  const apagar = async (salaId: string) => {
    setOcupado(true);
    try {
      if (salaConectadaId.value === salaId) fecharMesaOnline();
      await apagarSala(sessao, salaId);
      if (escolhida === salaId) setEscolhida(null);
      await recarregar();
      avisar('Sala apagada.');
    } catch (e) { avisar(`Não consegui apagar a sala: ${mensagemDe(e)}`, true); } finally { setOcupado(false); }
  };
  const servidoresDaSala = (salaId: string): string[] =>
    Object.entries(ligacoes)
      .filter(([, s]) => s === salaId)
      .map(([gid]) => servidores.find(srv => srv.id === gid)?.name ?? gid);

  const ehLocal = servidorAtual === URL_SALA_LOCAL;
  const ehProducao = servidorAtual === URL_SALA_PRODUCAO;
  const alternarServidor = () => {
    const proximo = ehLocal ? URL_SALA_PRODUCAO : URL_SALA_LOCAL;
    const padrao = ehDesktopMesa() ? URL_SALA_PRODUCAO : URL_SALA_LOCAL;
    try {
      if (proximo === padrao) localStorage.removeItem(CHAVE_URL_DA_SALA);
      else localStorage.setItem(CHAVE_URL_DA_SALA, proximo);
    } catch { /* ignora */ }
    if (conexao !== 'desconectada') fecharMesaOnline();
    setServidorAtual(urlDaSala());
    void recarregar();
  };
  const copiarConvite = async () => {
    if (!sala) return;
    try {
      await navigator.clipboard.writeText(urlDeConviteDaSala(sala.salaId));
      avisar('Link de jogador copiado.');
    } catch {
      avisar('Não consegui copiar o link de jogador.', true);
    }
  };

  return (
    <>
      <h3 class="faixa pequena">Salas</h3>
      <ul class="lista online-salas" data-testid="online-salas">
        {salas.length === 0 && <li class="meta">Nenhuma sala ainda.</li>}
        {salas.map(x => {
          const ligados = servidoresDaSala(x.salaId);
          return (
            <li key={x.salaId} class="online-sala-item">
              <label class="online-sala">
                <input type="radio" name="sala" checked={x.salaId === escolhida} onChange={() => setEscolhida(x.salaId)} />
                <span>{x.nome}</span>
                {ligados.length > 0 && <span class="online-ligada" title={`Ligada a: ${ligados.join(', ')}`}>{ligados.join(', ')}</span>}
                <span class="meta">{x.salaId}</span>
              </label>
              <button type="button" class="botao-pilula perigo" data-testid={`online-apagar-${x.salaId}`} disabled={ocupado} onClick={() => void apagar(x.salaId)}>Apagar</button>
            </li>
          );
        })}
      </ul>
      <div class="online-acoes">
        <button type="button" class="botao-pilula" data-testid="online-criar" disabled={!camp || ocupado} onClick={() => void criar()}>Criar sala para esta campanha</button>
        {!camp && <span class="meta">Escolha uma campanha no cabeçalho.</span>}
      </div>

      <h3 class="faixa pequena">Servidor do Discord</h3>
      {precisaRelogar ? (
        <p class="meta">Saia e entre de novo com o Discord para listar seus servidores.</p>
      ) : servidores.length > 0 ? (
        <ul class="lista online-salas" data-testid="online-servidores">
          {servidores.map(srv => {
            const salaLigada = salas.find(x => x.salaId === ligacoes[srv.id]);
            return (
              <li key={srv.id} class="online-servidor">
                <span class="online-servidor-info">
                  <span>{srv.name}</span>
                  {salaLigada && <span class="meta">Ligada: {salaLigada.nome} ({salaLigada.salaId.slice(0, 6)})</span>}
                </span>
                <button type="button" class="botao-pilula" data-testid={`online-ligar-${srv.id}`} disabled={!sala || ocupado} onClick={() => void ligar(srv.id)}>
                  {salaLigada && salaLigada.salaId === sala?.salaId ? 'Religar' : 'Ligar'}
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p class="meta">Nenhum servidor visto pela atividade ainda. Abra a atividade no servidor ou cole o id abaixo.</p>
      )}
      <div class="online-acoes">
        <input type="text" data-testid="online-guild" placeholder="Id do servidor do Discord" value={guild} onInput={e => setGuild(e.currentTarget.value)} />
        <button type="button" class="botao-pilula" disabled={!sala || !guild.trim() || ocupado} onClick={() => void ligar()}>Ligar a um servidor do Discord</button>
      </div>

      <h3 class="faixa pequena">Mesa online</h3>
      <div class="online-acoes">
        {salaConectadaId.value && salaConectadaId.value === sala?.salaId
          ? <button type="button" class="botao-pilula perigo" data-testid="online-fechar" onClick={() => fecharMesaOnline()}>Fechar a mesa online</button>
          : <button type="button" class="botao-pilula destaque" data-testid="online-abrir" disabled={!sala} onClick={() => abrirMesaOnline(sessao, sala!.salaId, sala!.nome)}>Abrir a mesa online</button>}
        {sala && <button type="button" class="botao-pilula" data-testid="online-copiar-convite" onClick={() => void copiarConvite()}>Copiar link de jogador</button>}
        <span class={`online-estado ${conexao}`} data-testid="online-conexao">{ROTULO_DA_CONEXAO[conexao]}</span>
      </div>
      <div class="online-acoes">
        <span class="meta" data-testid="online-servidor-url">
          Servidor da sala: {ehLocal ? 'Local (127.0.0.1:8787)' : ehProducao ? `Produção (${URL_SALA_PRODUCAO})` : servidorAtual}
        </span>
        <button type="button" class="botao-pilula" data-testid="online-alternar-servidor" onClick={alternarServidor}>
          {ehLocal ? 'Trocar para produção' : 'Trocar para local'}
        </button>
      </div>
      {conexao !== 'desconectada' && ponte.semNevoa.map(x => (
        <div key={x.mapa} class="aviso suave" data-testid="online-sem-nevoa">
          <p>Este mapa está sem névoa: os jogadores vão receber o mapa inteiro.</p>
          <p class="meta">{x.nome}</p>
          <button type="button" class="botao-pilula perigo" data-testid="online-sem-nevoa-confirmar" onClick={() => confirmarSemNevoa(x.mapa)}>Mandar assim mesmo</button>
        </div>
      ))}
      {conexao !== 'desconectada' && ponte.sons.total > 0 && (
        <div data-testid="online-sons">
          <p class="meta" data-testid="online-sons-resumo">Sons: {ponte.sons.naSala} de {ponte.sons.total} na sala · {formatarBytes(ponte.sons.bytes)}</p>
          {ponte.sons.falhas > 0 && <p class="meta">{ponte.sons.falhas} som(ns) não subiram (o Jukebox não respondeu); a Mesa tenta de novo.</p>}
          {ponte.sons.grandes.map(g => (
            <div key={g.faixaId} class="aviso suave" data-testid="online-som-grande">
              <p>Este som passa de 40 MB e não vai para a sala: {g.titulo || g.faixaId.slice(0, 8)} ({formatarBytes(g.bytes)}). Os jogadores não o ouvirão.</p>
            </div>
          ))}
        </div>
      )}
      {conexao !== 'desconectada' && (
        <>
          <h3 class="faixa pequena">Conectados ({ponte.membros.length})</h3>
          <ul class="lista online-membros saguao-membros" data-testid="online-membros">
            {ponte.membros.length === 0 && <li class="meta">Ninguém por aqui ainda.</li>}
            {estadoDoSaguao(ponte.membros, ponte.fichas, false).membros.map(m => <MembroLinha key={m.discordId} m={m} />)}
          </ul>
        </>
      )}
    </>
  );
}

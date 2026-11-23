import { useEffect, useState } from 'preact/hooks';
import { campanhaAtiva } from '../app/campanha.ts';
import { abrirMesaOnline, conexaoOnline, estadoDaPonte, fecharMesaOnline, salaConectadaId } from '../app/online.ts';
import { carregarSessaoOnline, erroDoLogin, iniciarLogin, sairDoOnline, sessaoOnline } from '../app/online-login.ts';
import { criarSala, ligarAoServidor, listarMinhasSalas, salaDaCampanha, type SalaDoMestre } from '../app/online-salas.ts';
import { avisar, mensagemDe } from '../app/toasts.ts';
import { urlDaSala } from '../online/config.ts';
import './online.css';

const ROTULO_DA_CONEXAO = { desconectada: 'Desconectada', conectando: 'Conectando…', aberta: 'Conectada', caiu: 'Sem conexão (tentando de novo)' } as const;

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
  return (
    <div class="online-bloco">
      <p class="dica">Entre com o Discord para abrir a campanha aos jogadores. Sem entrar, a Mesa continua funcionando como sempre.</p>
      <button type="button" class="botao-pilula destaque" data-testid="online-entrar" onClick={() => { location.assign(iniciarLogin()); }}>Entrar com o Discord</button>
    </div>
  );
}

function PainelDoMestre({ sessao }: { sessao: string }) {
  const camp = campanhaAtiva.value;
  const [salas, setSalas] = useState<SalaDoMestre[]>([]);
  const [escolhida, setEscolhida] = useState<string | null>(() => salaDaCampanha(camp?.id));
  const [guild, setGuild] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const recarregar = () => listarMinhasSalas(sessao).then(setSalas).catch(e => avisar(`Não consegui listar as salas: ${mensagemDe(e)}`, true));
  useEffect(() => { void recarregar(); setEscolhida(salaDaCampanha(camp?.id)); }, [sessao, camp?.id]);

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
  const ligar = async () => {
    if (!sala || !guild.trim()) return;
    setOcupado(true);
    try { await ligarAoServidor(sessao, guild.trim(), sala.salaId); setGuild(''); avisar('Sala ligada ao servidor do Discord.'); }
    catch (e) { avisar(`Não consegui ligar ao servidor: ${mensagemDe(e)}`, true); } finally { setOcupado(false); }
  };

  return (
    <>
      <h3 class="faixa pequena">Salas</h3>
      <ul class="lista online-salas" data-testid="online-salas">
        {salas.length === 0 && <li class="meta">Nenhuma sala ainda.</li>}
        {salas.map(x => (
          <li key={x.salaId}>
            <label class="online-sala">
              <input type="radio" name="sala" checked={x.salaId === escolhida} onChange={() => setEscolhida(x.salaId)} />
              <span>{x.nome}</span><span class="meta">{x.salaId}</span>
            </label>
          </li>
        ))}
      </ul>
      <div class="online-acoes">
        <button type="button" class="botao-pilula" data-testid="online-criar" disabled={!camp || ocupado} onClick={() => void criar()}>Criar sala para esta campanha</button>
        {!camp && <span class="meta">Escolha uma campanha no cabeçalho.</span>}
      </div>

      <h3 class="faixa pequena">Servidor do Discord</h3>
      <div class="online-acoes">
        <input type="text" data-testid="online-guild" placeholder="Id do servidor do Discord" value={guild} onInput={e => setGuild(e.currentTarget.value)} />
        <button type="button" class="botao-pilula" disabled={!sala || !guild.trim() || ocupado} onClick={() => void ligar()}>Ligar a um servidor do Discord</button>
      </div>

      <h3 class="faixa pequena">Mesa online</h3>
      <div class="online-acoes">
        {salaConectadaId.value && salaConectadaId.value === sala?.salaId
          ? <button type="button" class="botao-pilula perigo" data-testid="online-fechar" onClick={() => fecharMesaOnline()}>Fechar a mesa online</button>
          : <button type="button" class="botao-pilula destaque" data-testid="online-abrir" disabled={!sala} onClick={() => abrirMesaOnline(sessao, sala!.salaId, sala!.nome)}>Abrir a mesa online</button>}
        <span class={`online-estado ${conexao}`} data-testid="online-conexao">{ROTULO_DA_CONEXAO[conexao]}</span>
      </div>
      <p class="meta">Servidor da sala: {urlDaSala()}</p>
      {conexao !== 'desconectada' && ponte.bloqueada && (
        <div class="aviso suave" data-testid="online-trava">A projeção para jogadores online chega na próxima etapa. Por enquanto o mapa não sai; eventos e membros funcionam.</div>
      )}
      {conexao !== 'desconectada' && (
        <>
          <h3 class="faixa pequena">Conectados ({ponte.membros.length})</h3>
          <ul class="lista online-membros" data-testid="online-membros">
            {ponte.membros.length === 0 && <li class="meta">Ninguém por aqui ainda.</li>}
            {ponte.membros.map(m => <li key={m.discordId}><strong>{m.nome}</strong> <span class="meta">{m.papel === 'mestre' ? 'mestre' : 'jogador'}</span></li>)}
          </ul>
        </>
      )}
    </>
  );
}

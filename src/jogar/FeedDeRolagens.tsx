/** O feed de rolagens no canto do mapa da casca (R9): as 5 últimas, que somem em 8 s, e o histórico das 200 da sala. */
import { useEffect, useRef, useState } from 'preact/hooks';
import type { ClienteDaSala } from '../online/cliente.ts';
import {
  avatarDaRolagem, criarFeed, iniciais, lerHistorico, lerRolagem, mapaDeAvatares, type RolagemDoFeed,
} from '../online/feed.ts';
import type { Eu, Membro } from '../online/protocolo.ts';
import { canalEventosDaSala } from './ponte-jogador.ts';

const MAX_HISTORICO = 200;

function Retrato({
  r, retratos, avatares, baseAvatar,
}: {
  r: RolagemDoFeed;
  retratos: Record<string, string>;
  avatares: Record<string, string>;
  baseAvatar?: string;
}) {
  const url = avatarDaRolagem(r, avatares, baseAvatar) ?? retratos[r.fichaId] ?? null;
  const [falhou, setFalhou] = useState(false);
  useEffect(() => { setFalhou(false); }, [url]);
  if (url && !falhou) {
    return <img class="feed-retrato" src={url} alt="" onError={() => setFalhou(true)} />;
  }
  return <span class="feed-retrato feed-iniciais" aria-hidden="true">{iniciais(r.autor)}</span>;
}

function Cartao({
  r, retratos, avatares, baseAvatar, teste,
}: {
  r: RolagemDoFeed;
  retratos: Record<string, string>;
  avatares: Record<string, string>;
  baseAvatar?: string;
  teste: string;
}) {
  return (
    <li class="feed-item" data-testid={teste} data-tom={r.tom}>
      <Retrato r={r} retratos={retratos} avatares={avatares} baseAvatar={baseAvatar} />
      <span class="feed-texto"><b class="feed-autor">{r.autor || 'Jogador'}</b><span class="feed-titulo">{r.titulo}</span></span>
      <b class="feed-total">{r.total}</b>
    </li>
  );
}

export function FeedDeRolagens({
  cliente,
  salaId,
  nome,
  retratos,
  eu = null,
  membros = [],
  baseAvatar,
}: {
  cliente: ClienteDaSala | null;
  salaId: string;
  nome: string;
  retratos: Record<string, string>;
  eu?: Eu | null;
  membros?: readonly Membro[];
  baseAvatar?: string;
}) {
  const [itens, setItens] = useState<RolagemDoFeed[]>([]);
  const [historico, setHistorico] = useState<RolagemDoFeed[]>([]);
  const [aberto, setAberto] = useState(false);
  const nomeRef = useRef(nome);
  nomeRef.current = nome;
  const euRef = useRef(eu);
  euRef.current = eu;
  const avatares = mapaDeAvatares(membros, eu, baseAvatar);

  useEffect(() => {
    const feed = criarFeed({ aoMudar: setItens });
    const junta = (novas: RolagemDoFeed[]) => setHistorico(h => {
      const ids = new Set(novas.map(r => r.id));
      return [...novas, ...h.filter(r => !ids.has(r.id))].sort((a, b) => b.em - a.em).slice(0, MAX_HISTORICO);
    });
    const canal = new BroadcastChannel(canalEventosDaSala(salaId));
    canal.onmessage = ({ data }) => {
      const r = lerRolagem(data);
      if (!r) return;
      const euAtual = euRef.current;
      // a que o próprio Dossiê emitiu ainda não passou pela sala (sem `autor`)
      const minha: RolagemDoFeed = r.autor
        ? r
        : {
            ...r,
            autor: euAtual?.nome ?? nomeRef.current,
            ...(euAtual ? {
              autorId: euAtual.discordId,
              ...(euAtual.avatar !== undefined ? { autorAvatar: euAtual.avatar } : {}),
            } : {}),
          };
      if (feed.receber(minha)) junta([minha]);
    };
    const soltar = cliente ? [
      cliente.ouvir('bem-vindo', m => junta(lerHistorico(m.rolagens ?? []))),
      cliente.ouvir('rolagens.historico', m => junta(lerHistorico(m.rolagens))),
    ] : [];
    return () => { canal.onmessage = null; canal.close(); feed.fechar(); for (const f of soltar) f(); };
  }, [cliente, salaId]);

  const alternar = () => {
    if (!aberto) cliente?.enviar({ tipo: 'rolagens.historico' });
    setAberto(!aberto);
  };

  return (
    <div class="feed" data-testid="feed">
      <button
        type="button"
        class="feed-botao"
        data-testid="feed-historico-botao"
        title="Histórico de rolagens"
        aria-label="Histórico de rolagens"
        aria-expanded={aberto}
        onClick={alternar}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <polygon points="12 2 21 7 21 17 12 22 3 17 3 7" />
          <polygon points="12 6.5 17 15 7 15" />
          <line x1="12" y1="2" x2="12" y2="6.5" />
          <line x1="21" y1="7" x2="17" y2="15" />
          <line x1="3" y1="7" x2="7" y2="15" />
          <line x1="12" y1="22" x2="7" y2="15" />
          <line x1="12" y1="22" x2="17" y2="15" />
        </svg>
        {historico.length > 0 && !aberto && <span class="feed-botao-ponto" aria-hidden="true" />}
      </button>
      {aberto && (
        <div class="feed-historico" data-testid="feed-historico" role="dialog" aria-label="Histórico de rolagens">
          {historico.length === 0
            ? <p class="feed-vazio">Ninguém rolou ainda.</p>
            : <ul>{historico.map(r => <Cartao key={r.id} r={r} retratos={retratos} avatares={avatares} baseAvatar={baseAvatar} teste="feed-historico-item" />)}</ul>}
        </div>
      )}
      <ul class="feed-lista" aria-live="polite" aria-label="Rolagens recentes">
        {itens.map(r => <Cartao key={r.id} r={r} retratos={retratos} avatares={avatares} baseAvatar={baseAvatar} teste="feed-item" />)}
      </ul>
    </div>
  );
}

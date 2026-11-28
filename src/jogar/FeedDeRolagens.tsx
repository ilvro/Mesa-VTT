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
      <ul class="feed-lista" aria-live="polite" aria-label="Rolagens recentes">
        {itens.map(r => <Cartao key={r.id} r={r} retratos={retratos} avatares={avatares} baseAvatar={baseAvatar} teste="feed-item" />)}
      </ul>
      <button type="button" class="feed-botao" data-testid="feed-historico-botao" aria-expanded={aberto} onClick={alternar}>
        {aberto ? 'Fechar histórico' : 'Histórico de rolagens'}
      </button>
      {aberto && (
        <div class="feed-historico" data-testid="feed-historico" role="dialog" aria-label="Histórico de rolagens">
          {historico.length === 0
            ? <p class="feed-vazio">Ninguém rolou ainda.</p>
            : <ul>{historico.map(r => <Cartao key={r.id} r={r} retratos={retratos} avatares={avatares} baseAvatar={baseAvatar} teste="feed-historico-item" />)}</ul>}
        </div>
      )}
    </div>
  );
}

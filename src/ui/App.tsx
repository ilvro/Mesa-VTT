import type { ComponentType } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { repositorio } from '../app/campanha.ts';
import { avisar } from '../app/toasts.ts';
import { jogarSalaId, projecaoQuadroId, tela, telaoLocal } from '../app/rotas.ts';
import { Aprender } from './Aprender.tsx';
import { Tutor } from './Tutor.tsx';
import { Aplicativos } from './Aplicativos.tsx';
import { Avisos } from './Avisos.tsx';
import { Cabecalho } from './Cabecalho.tsx';
import { Campanhas } from './Campanhas.tsx';
import { Entidades } from './Entidades.tsx';
import { FaixaDeCombateSessao } from './FaixaDeCombateSessao.tsx';
import { BuscaRapida, buscaRapidaAberta } from './BuscaRapida.tsx';
import { InspecaoDePista } from './InspecaoDePista.tsx';
import { MenuDeContexto } from './MenuDeContexto.tsx';
import { quadroAberto } from '../app/quadros.ts';
import { Quadros } from './quadro/Quadros.tsx';

function carregarSobDemanda<P extends object>(
  carregar: () => Promise<ComponentType<P>>,
  mensagem = 'Carregando…',
): ComponentType<P> {
  let emCache: ComponentType<P> | null = null;
  return function TelaSobDemanda(props: P) {
    const [Comp, setComp] = useState<ComponentType<P> | null>(() => emCache);
    useEffect(() => {
      if (emCache) return;
      let ativo = true;
      void carregar().then((c) => {
        emCache = c;
        if (ativo) setComp(() => c);
      });
      return () => { ativo = false; };
    }, []);
    return Comp ? <Comp {...props} /> : <div class="carregando">{mensagem}</div>;
  };
}

const CascaSobDemanda = carregarSobDemanda(
  () => import('../jogar/Casca.tsx').then(m => m.Casca),
  'Abrindo a mesa…',
);
const TelaoLocalSobDemanda = carregarSobDemanda(
  () => import('./TelaoLocal.tsx').then(m => m.TelaoLocal),
  'Abrindo o telão…',
);
const ProjecaoDoQuadroSobDemanda = carregarSobDemanda(
  () => import('./quadro/ProjecaoDoQuadro.tsx').then(m => m.ProjecaoDoQuadro),
  'Abrindo projeção…',
);
const QuadroSobDemanda = carregarSobDemanda(
  () => import('./quadro/Quadro.tsx').then(m => m.Quadro),
  'Abrindo o quadro…',
);
const ModoSessaoSobDemanda = carregarSobDemanda(
  () => import('./ModoSessao.tsx').then(m => m.ModoSessao),
  'Abrindo a sessão…',
);
const MesaOnlineSobDemanda = carregarSobDemanda(
  () => import('./MesaOnline.tsx').then(m => m.MesaOnline),
  'Abrindo mesa online…',
);

/** A janela de projeção é a própria Mesa numa rota: sem cabeçalho, avisos nem atalhos do mestre. */
export function App() {
  if (jogarSalaId.value) return <CascaSobDemanda salaId={jogarSalaId.value} />;
  if (telaoLocal.value.ativo) return <TelaoLocalSobDemanda mapaId={telaoLocal.value.mapaId} />;
  return projecaoQuadroId.value ? <ProjecaoDoQuadroSobDemanda /> : <AppDoMestre />;
}

function AppDoMestre() {
  const r = repositorio.value;

  useEffect(() => {
    if (typeof sessionStorage !== 'undefined') {
      const pendente = sessionStorage.getItem('mesa:aviso-pos-importacao');
      if (pendente) {
        sessionStorage.removeItem('mesa:aviso-pos-importacao');
        avisar(pendente);
      }
    }
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        buscaRapidaAberta.value = !buscaRapidaAberta.value;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <>
      <Cabecalho />
      {r === null
        ? <div class="carregando">Abrindo a campanha…</div>
        : r === 'indisponivel'
          ? <section class="pagina"><div class="aviso">Este navegador não deixa a Mesa guardar a campanha (IndexedDB indisponível). Abra em uma janela normal, fora do modo privado.</div></section>
          : tela.value === 'aprender' ? <Aprender /> : tela.value === 'campanhas' ? <Campanhas /> : tela.value === 'aplicativos' ? <Aplicativos /> : tela.value === 'online' ? <MesaOnlineSobDemanda /> : tela.value === 'sessao' ? <div class="sessao-envoltorio"><FaixaDeCombateSessao /><ModoSessaoSobDemanda /></div> : tela.value === 'quadros' ? (quadroAberto.value ? <QuadroSobDemanda /> : <Quadros />) : <Entidades />}
      <Avisos />
      <BuscaRapida />
      <MenuDeContexto />
      <InspecaoDePista />
      <Tutor />
    </>
  );
}

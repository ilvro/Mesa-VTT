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
import { MesaOnline } from './MesaOnline.tsx';
import { ModoSessao } from './ModoSessao.tsx';
import { FaixaDeCombateSessao } from './FaixaDeCombateSessao.tsx';
import { BuscaRapida, buscaRapidaAberta } from './BuscaRapida.tsx';
import { InspecaoDePista } from './InspecaoDePista.tsx';
import { MenuDeContexto } from './MenuDeContexto.tsx';
import { quadroAberto } from '../app/quadros.ts';
import { Quadro } from './quadro/Quadro.tsx';
import { Quadros } from './quadro/Quadros.tsx';
import { ProjecaoDoQuadro } from './quadro/ProjecaoDoQuadro.tsx';
import { TelaoLocal } from './TelaoLocal.tsx';

/** A janela de projeção é a própria Mesa numa rota: sem cabeçalho, avisos nem atalhos do mestre. */
export function App() {
  if (jogarSalaId.value) return <CascaSobDemanda salaId={jogarSalaId.value} />;
  if (telaoLocal.value.ativo) return <TelaoLocal mapaId={telaoLocal.value.mapaId} />;
  return projecaoQuadroId.value ? <ProjecaoDoQuadro /> : <AppDoMestre />;
}

/** `#/jogar/<sala>`: a casca do jogador carrega por `import()` só quando a rota abre, para não pesar no hub. */
function CascaSobDemanda({ salaId }: { salaId: string }) {
  const [Casca, setCasca] = useState<ComponentType<{ salaId: string }> | null>(null);
  useEffect(() => { void import('../jogar/Casca.tsx').then(m => setCasca(() => m.Casca)); }, []);
  return Casca ? <Casca salaId={salaId} /> : <div class="carregando">Abrindo a mesa…</div>;
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
          : tela.value === 'aprender' ? <Aprender /> : tela.value === 'campanhas' ? <Campanhas /> : tela.value === 'aplicativos' ? <Aplicativos /> : tela.value === 'online' ? <MesaOnline /> : tela.value === 'sessao' ? <div class="sessao-envoltorio"><FaixaDeCombateSessao /><ModoSessao /></div> : tela.value === 'quadros' ? (quadroAberto.value ? <Quadro /> : <Quadros />) : <Entidades />}
      <Avisos />
      <BuscaRapida />
      <MenuDeContexto />
      <InspecaoDePista />
      <Tutor />
    </>
  );
}

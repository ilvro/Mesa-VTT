import { useEffect } from 'preact/hooks';
import { repositorio } from '../app/campanha.ts';
import { avisar } from '../app/toasts.ts';
import { tela } from '../app/rotas.ts';
import { Aplicativos } from './Aplicativos.tsx';
import { Avisos } from './Avisos.tsx';
import { Cabecalho } from './Cabecalho.tsx';
import { Campanhas } from './Campanhas.tsx';
import { Entidades } from './Entidades.tsx';
import { ModoSessao } from './ModoSessao.tsx';
import { BuscaRapida, buscaRapidaAberta } from './BuscaRapida.tsx';
import { quadroAberto } from '../app/quadros.ts';
import { Quadro } from './quadro/Quadro.tsx';
import { Quadros } from './quadro/Quadros.tsx';

export function App() {
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
          : tela.value === 'campanhas' ? <Campanhas /> : tela.value === 'aplicativos' ? <Aplicativos /> : tela.value === 'sessao' ? <ModoSessao /> : tela.value === 'quadros' ? (quadroAberto.value ? <Quadro /> : <Quadros />) : <Entidades />}
      <Avisos />
      <BuscaRapida />
    </>
  );
}

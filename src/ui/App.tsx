import { repositorio } from '../app/campanha.ts';
import { tela } from '../app/rotas.ts';
import { Avisos } from './Avisos.tsx';
import { Cabecalho } from './Cabecalho.tsx';
import { Campanhas } from './Campanhas.tsx';
import { Entidades } from './Entidades.tsx';

export function App() {
  const r = repositorio.value;
  return (
    <>
      <Cabecalho />
      {r === null
        ? <div class="carregando">Abrindo a campanha…</div>
        : r === 'indisponivel'
          ? <section class="pagina"><div class="aviso">Este navegador não deixa a Mesa guardar a campanha (IndexedDB indisponível). Abra em uma janela normal, fora do modo privado.</div></section>
          : tela.value === 'campanhas' ? <Campanhas /> : <Entidades />}
      <Avisos />
    </>
  );
}

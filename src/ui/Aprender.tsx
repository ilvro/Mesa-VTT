import { apagarTreino, campanhaDeTreino, exportarRelatorioDosTutoriais, iniciarLicao, tutor } from '../app/tutoriais.ts';
import { LICOES, PASTAS_DE_LICOES } from '../tutorial/licoes.ts';
import { porPasta } from '../tutorial/tutor.ts';

/** Com `?tutor-teste` no endereço a lista mostra também as lições ocultas (é como o e2e roda a de teste, sem expor nada em `window`). */
const mostrarOcultas = (): boolean => { try { return new URLSearchParams(location.search).has('tutor-teste'); } catch { return false; } };

/** A lista de tutoriais, em pastas, com o que já foi feito e onde a pessoa parou. Cada lição acontece numa campanha de treino. */
export function Aprender() {
  void tutor.versao.value;
  const progresso = tutor.progresso(), treino = campanhaDeTreino.value;
  const lista = mostrarOcultas() ? LICOES.map(l => ({ ...l, oculta: false })) : LICOES, grupos = porPasta(lista, PASTAS_DE_LICOES);
  return (
    <section class="pagina aprender" data-testid="aprender-lista" aria-label="Tutoriais">
      <h2 class="aprender-titulo">Aprender</h2>
      <p class="dica">Cada tutorial acontece numa <b>campanha de treino</b> criada por ele: o tutor aponta, você faz, e o passo avança quando o resultado aparece. A sua campanha não é tocada.</p>
      {treino && !tutor.info() && (
        <p class="aprender-treino" data-testid="aprender-treino">Há uma campanha de treino guardada (“{treino.nome}”). <button type="button" class="link" data-testid="aprender-apagar-treino" onClick={() => { void apagarTreino(); }}>Apagar o treino</button></p>
      )}
      {grupos.map(({ pasta, licoes }) => (
        <div key={pasta.id ?? 'outros'} class="aprender-pasta">
          <h3 class="aprender-pasta-nome">{pasta.nome}</h3>{pasta.sobre && <p class="dica">{pasta.sobre}</p>}
          {licoes.map(l => {
            const p = progresso[l.id] ?? {}, retomar = !p.done && (p.step ?? 0) > 0;
            return (
              <article key={l.id} class="aprender-licao" data-testid={`licao-${l.id}`}>
                <h4>{l.titulo}{p.done && <span class="aprender-feita"> ✓ feita</span>}<small> · {l.minutos} min · {l.passos.length} passos</small></h4>
                {l.resumo && <p class="dica">{l.resumo}</p>}
                <div class="aprender-acoes">
                  <button type="button" class="botao-pilula destaque" data-testid={`licao-comecar-${l.id}`} onClick={() => void iniciarLicao(l.id)}>{p.done ? 'Refazer' : 'Começar'}</button>
                  {retomar && <button type="button" class="botao-pilula" data-testid={`licao-retomar-${l.id}`} onClick={() => void iniciarLicao(l.id, p.step ?? 0)}>Continuar do passo {(p.step ?? 0) + 1}</button>}
                </div>
              </article>
            );
          })}
        </div>
      ))}
      <button type="button" class="link" data-testid="tutoriais-relatorio" onClick={exportarRelatorioDosTutoriais}>Exportar relatório dos tutoriais</button>
    </section>
  );
}

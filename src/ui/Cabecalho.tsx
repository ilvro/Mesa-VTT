import { TEMAS, TEMAS_BASE } from '#mesa';
import { campanhaAtiva, campanhas, escolherCampanha } from '../app/campanha.ts';
import { sondarAplicativos } from '../app/inventario.ts';
import { tela } from '../app/rotas.ts';
import { tema, trocarTema } from '../app/tema.ts';
import { cx } from './cx.ts';

export function Cabecalho() {
  return (
    <header class="cabecalho">
      <a class="marca" href="./" aria-label="Mesa"><span class="marca-escudo">◆</span>MESA</a>
      <span class="separador">/</span>
      <label class="linha-campanha">
        <span class="so-leitor">Campanha</span>
        <select data-testid="campanha-select" value={campanhaAtiva.value?.id ?? ''} onChange={e => { void escolherCampanha(e.currentTarget.value || null); }}>
          <option value="">{campanhas.value.length ? 'Escolha uma campanha' : 'Nenhuma campanha'}</option>
          {campanhas.value.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
      </label>
      <nav class="abas-de-tela" aria-label="Telas">
        <button type="button" class={cx('ficha', tela.value === 'entidades' && 'ativa')} data-testid="aba-entidades" onClick={() => { tela.value = 'entidades'; }}>Campanha</button>
        <button type="button" class={cx('ficha', tela.value === 'sessao' && 'ativa')} data-testid="aba-sessao" onClick={() => { tela.value = 'sessao'; }}>Sessão</button>
        <button type="button" class={cx('ficha', tela.value === 'campanhas' && 'ativa')} data-testid="aba-campanhas" onClick={() => { tela.value = 'campanhas'; }}>Campanhas</button>
        <button type="button" class={cx('ficha', tela.value === 'aplicativos' && 'ativa')} data-testid="aba-aplicativos" onClick={() => { tela.value = 'aplicativos'; void sondarAplicativos(); }}>Aplicativos</button>
      </nav>
      <span class="espaco" />
      <div class="grupo" role="group" aria-label="Tema">
        {TEMAS_BASE.map(id => (
          <button key={id} type="button" class="botao-pilula" aria-pressed={tema.value.id === id} data-testid={`tema-${id}`} onClick={() => trocarTema({ id })}>{TEMAS[id].nome}</button>
        ))}
      </div>
    </header>
  );
}

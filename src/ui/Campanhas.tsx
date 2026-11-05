import { signal } from '@preact/signals';
import { TEMAS, TEMAS_BASE, type Campanha } from '#mesa';
import { alterarCampanha, campanhaAtiva, campanhas, criarCampanha, escolherCampanha, removerCampanha } from '../app/campanha.ts';
import { tela } from '../app/rotas.ts';
import { cx } from './cx.ts';

const nomeNovo = signal('');
const confirmando = signal<string | null>(null);

async function criar(e: Event) {
  e.preventDefault();
  const c = await criarCampanha(nomeNovo.value);
  if (c) { nomeNovo.value = ''; tela.value = 'entidades'; }
}

function CartaoDeCampanha({ c }: { c: Campanha }) {
  const ativa = campanhaAtiva.value?.id === c.id;
  return (
    <article class={cx('cartao', 'campanha', ativa && 'ativa')} data-testid={`campanha-${c.id}`}>
      <div class="cartao-corpo">
        <input key={`n-${c.id}`} type="text" class="nome-da-campanha" aria-label="Nome da campanha" maxLength={200} defaultValue={c.nome} data-testid="campanha-nome"
          onBlur={async e => { const campo = e.currentTarget, v = campo.value.trim(); if (v !== c.nome && !(await alterarCampanha(c, { nome: v }))) campo.value = c.nome; }}
          onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
        <div class="linha-campos">
          <label>Sistema
            <input key={`s-${c.id}`} type="text" maxLength={80} defaultValue={c.sistema} placeholder="ordem-paranormal" data-testid="campanha-sistema"
              onBlur={e => { const v = e.currentTarget.value.trim(); if (v !== c.sistema) void alterarCampanha(c, { sistema: v }); }}
              onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
          </label>
          <label>Tema
            <select value={c.tema ?? ''} data-testid="campanha-tema" onChange={e => { const v = e.currentTarget.value; void alterarCampanha(c, { tema: v === '' ? null : (v as Campanha['tema']) }); }}>
              <option value="">O da mesa</option>
              {TEMAS_BASE.map(id => <option key={id} value={id}>{TEMAS[id].nome}</option>)}
            </select>
          </label>
        </div>
        <div class="cartao-rodape">
          {ativa
            ? <span class="selo">Campanha ativa</span>
            : <button type="button" class="botao-pilula destaque" data-testid="usar-campanha" onClick={async () => { await escolherCampanha(c.id); tela.value = 'entidades'; }}>Usar</button>}
          <span class="espaco" />
          {confirmando.value === c.id
            ? <>
                <span class="meta">Apaga também entidades, ligações e sessões.</span>
                <button type="button" class="botao-pilula perigo" data-testid="confirmar-apagar" onClick={() => { confirmando.value = null; void removerCampanha(c); }}>Apagar mesmo</button>
                <button type="button" class="botao-pilula" onClick={() => { confirmando.value = null; }}>Cancelar</button>
              </>
            : <button type="button" class="botao-pilula perigo" data-testid="apagar-campanha" onClick={() => { confirmando.value = c.id; }}>Apagar</button>}
        </div>
      </div>
    </article>
  );
}

export function Campanhas() {
  return (
    <section class="pagina" data-testid="tela-campanhas">
      <div class="galeria-topo"><h2 class="faixa grande">Campanhas</h2></div>
      <p class="dica">Todas as campanhas deste navegador, compartilhadas com o Atlas, o Dossiê e os outros aplicativos da mesa.</p>
      <form class="barra-campanha" onSubmit={criar}>
        <input type="text" class="campo-inline" data-testid="nova-campanha-nome" placeholder="Nome da nova campanha" maxLength={200} value={nomeNovo.value} onInput={e => { nomeNovo.value = e.currentTarget.value; }} />
        <button type="submit" class="botao-pilula destaque" data-testid="criar-campanha" disabled={!nomeNovo.value.trim()}>Criar campanha</button>
      </form>
      {campanhas.value.length === 0
        ? <div class="vazio"><h2>Nenhuma campanha ainda</h2><p>Crie a primeira acima. Ela aparece também no Atlas.</p></div>
        : <div class="cartoes">{campanhas.value.map(c => <CartaoDeCampanha key={c.id} c={c} />)}</div>}
    </section>
  );
}

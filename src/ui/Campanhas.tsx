import { signal } from '@preact/signals';
import { useEffect, useState } from 'preact/hooks';
import { TEMAS, TEMAS_BASE, type Campanha, type Entidade } from '#mesa';
import {
  alterarCampanha,
  alternarPersonagemNoElenco,
  campanhaAtiva,
  campanhas,
  criarCampanha,
  definirElenco,
  entidades,
  escolherCampanha,
  removerCampanha,
  repositorio,
} from '../app/campanha.ts';
import { importarCofreParaApp } from '../app/cofre.ts';
import { tela } from '../app/rotas.ts';
import { personagensParaElenco } from '../dominio/entidades.ts';
import { cx } from './cx.ts';

const nomeNovo = signal('');
const confirmando = signal<string | null>(null);

function RetratoDoElenco({ e }: { e: Entidade }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!e.retrato) { setUrl(null); return; }
    try {
      if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
        const u = URL.createObjectURL(e.retrato);
        setUrl(u);
        return () => { try { URL.revokeObjectURL(u); } catch { /* ignora */ } };
      }
    } catch { setUrl(null); }
  }, [e.retrato]);

  if (url) return <img src={url} alt={e.nome} class="elenco-retrato" loading="lazy" />;
  return <span class="elenco-retrato elenco-retrato-vazio" aria-hidden="true">{e.nome.slice(0, 1).toUpperCase()}</span>;
}

function SecaoElenco({ c }: { c: Campanha }) {
  const ativa = campanhaAtiva.value?.id === c.id;
  const [outras, setOutras] = useState<Entidade[]>([]);
  const r = repositorio.value;

  useEffect(() => {
    if (ativa || !r || r === 'indisponivel') return;
    let cancelado = false;
    void r.listarEntidades(c.id, { tipo: 'personagem' }).then(lista => {
      if (!cancelado) setOutras(lista);
    }).catch(() => {});
    return () => { cancelado = true; };
  }, [ativa, c.id, c.atualizadaEm, r]);

  const base = ativa ? entidades.value : outras;
  const { noElenco, todos } = personagensParaElenco(base, c.elenco);
  const idsNoElenco = new Set(noElenco.map(e => e.id));

  return (
    <section class="campanha-elenco" data-testid={`elenco-${c.id}`}>
      <div class="elenco-cabecalho">
        <h3 class="faixa pequena">Elenco</h3>
        {c.elenco === undefined ? (
          <>
            <span class="meta">Sem elenco definido (todos aparecem no Atlas).</span>
            <button type="button" class="botao-pilula" data-testid="definir-elenco" onClick={() => void definirElenco(c, [])}>
              Definir elenco
            </button>
          </>
        ) : (
          <span class="meta" data-testid="elenco-contagem">{noElenco.length} no elenco</span>
        )}
      </div>
      {todos.length === 0 ? (
        <p class="dica">Nenhum personagem com ficha no Dossiê nesta campanha.</p>
      ) : (
        <ul class="elenco-lista" data-testid="elenco-lista">
          {todos.map(e => {
            const participa = idsNoElenco.has(e.id);
            return (
              <li key={e.id} class={cx('elenco-item', participa && 'no-elenco')} data-testid={`elenco-item-${e.id}`}>
                <RetratoDoElenco e={e} />
                <span class="elenco-nome">{e.nome}</span>
                <button
                  type="button"
                  class={cx('botao-pilula', !participa && 'destaque')}
                  data-testid={participa ? `elenco-sair-${e.id}` : `elenco-entrar-${e.id}`}
                  onClick={() => void alternarPersonagemNoElenco(c, e.id)}
                >
                  {participa ? 'Sair' : 'Entrar'}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

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
        <SecaoElenco c={c} />
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
        <button type="button" class="botao-pilula" data-testid="importar-cofre-campanhas" title="Importar cofre (.json)" onClick={() => void importarCofreParaApp()}>↑ Importar Cofre</button>
      </form>
      {campanhas.value.length === 0
        ? <div class="vazio"><h2>Nenhuma campanha ainda</h2><p>Crie a primeira acima. Ela aparece também no Atlas.</p></div>
        : <div class="cartoes">{campanhas.value.map(c => <CartaoDeCampanha key={c.id} c={c} />)}</div>}
    </section>
  );
}

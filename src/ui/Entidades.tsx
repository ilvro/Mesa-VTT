import { signal } from '@preact/signals';
import { TIPOS_ENTIDADE, type Entidade, type TipoEntidade } from '#mesa';
import { alterarEntidade, busca, campanhaAtiva, criarEntidade, entidades, filtroTipo, removerEntidade, selecionada, selecionadaId, visiveis } from '../app/campanha.ts';
import { abrirEntidade, tela } from '../app/rotas.ts';
import { sondarAplicativos } from '../app/inventario.ts';
import { contarPorTipo, lerTags, NOME_DO_APP, NOME_DO_TIPO_DE_REF, podeEditar, ROTULO_DO_TIPO, TIPOS_CRIAVEIS } from '../dominio/entidades.ts';
import { descobrirApp, enderecoDe } from '../app/aplicativos.ts';
import { ehRefDeEntidadeDaMesa } from '../dominio/notas.ts';
import { formatarRef, type Ref } from '#mesa';
import { cx } from './cx.ts';
import { EditorDeNota } from './EditorDeNota.tsx';

const tipoNovo = signal<TipoEntidade>('personagem');
const nomeNovo = signal('');
const confirmando = signal<string | null>(null);

async function criar(e: Event) {
  e.preventDefault();
  const criada = await criarEntidade(tipoNovo.value, nomeNovo.value);
  if (criada) { nomeNovo.value = ''; filtroTipo.value = null; busca.value = ''; abrirEntidade(criada.id); }
}

function Filtros() {
  const contagem = contarPorTipo(entidades.value);
  const usados = TIPOS_ENTIDADE.filter(t => contagem[t] > 0 || TIPOS_CRIAVEIS.includes(t));
  return (
    <div class="chips" role="group" aria-label="Tipo">
      <button type="button" class={cx('chip', filtroTipo.value === null && 'ativa')} data-testid="tipo-todos" onClick={() => { filtroTipo.value = null; }}>Tudo <b>{entidades.value.length}</b></button>
      {usados.map(t => (
        <button key={t} type="button" class={cx('chip', filtroTipo.value === t && 'ativa')} data-testid={`tipo-${t}`} onClick={() => { filtroTipo.value = filtroTipo.value === t ? null : t; }}>{ROTULO_DO_TIPO[t].plural} <b>{contagem[t]}</b></button>
      ))}
    </div>
  );
}

function ChipDeRef({ r }: { r: Ref }) {
  void descobrirApp(r.app);
  const endereco = enderecoDe(r);
  const rotulo = `${NOME_DO_APP[r.app]} · ${NOME_DO_TIPO_DE_REF[r.tipo] ?? r.tipo}`;
  return (
    <li class="ref" data-testid="ref" title={formatarRef(r)}>
      <span class="ref-app">{rotulo}</span>
      <code class="ref-id">{r.id}</code>
      {endereco
        ? <a class="botao-pilula" href={endereco} target="_blank" rel="noopener" data-testid="abrir-ref">Abrir</a>
        : <span class="meta" title="O aplicativo não foi encontrado ao lado da Mesa.">sem link</span>}
    </li>
  );
}

function Detalhe({ e }: { e: Entidade }) {
  const editavel = podeEditar(e), refsVisiveis = e.refs.filter(r => !ehRefDeEntidadeDaMesa(r));
  return (
    <section class="detalhe" data-testid="detalhe">
      <header class="detalhe-topo">
        <span class="selo">{ROTULO_DO_TIPO[e.tipo].singular}</span>
        <span class="meta">criada por {NOME_DO_APP[e.criadaPor]}</span>
        <span class="espaco" />
        {editavel && (confirmando.value === e.id
          ? <>
              <button type="button" class="botao-pilula perigo" data-testid="confirmar-remover" onClick={() => { confirmando.value = null; void removerEntidade(e); }}>Remover mesmo</button>
              <button type="button" class="botao-pilula" onClick={() => { confirmando.value = null; }}>Cancelar</button>
            </>
          : <button type="button" class="botao-pilula perigo" data-testid="remover-entidade" onClick={() => { confirmando.value = e.id; }}>Remover</button>)}
      </header>
      {!editavel && <p class="aviso suave" data-testid="so-leitura">Criada pelo {NOME_DO_APP[e.criadaPor]}: só ele altera o nome, as etiquetas e as notas.</p>}
      <label class="campo">Nome
        <input key={`nome-${e.id}`} type="text" class="nome-grande" maxLength={200} defaultValue={e.nome} disabled={!editavel} data-testid="campo-nome"
          onBlur={async ev => { const campo = ev.currentTarget, v = campo.value.trim(); if (v !== e.nome && !(await alterarEntidade(e, { nome: v }))) campo.value = e.nome; }}
          onKeyDown={ev => { if (ev.key === 'Enter') ev.currentTarget.blur(); }} />
      </label>
      <label class="campo"><span>Etiquetas <span class="meta">(separadas por vírgula)</span></span>
        <input key={`tags-${e.id}`} type="text" defaultValue={e.tags.join(', ')} disabled={!editavel} data-testid="campo-tags" placeholder="mansão, vila, mistério"
          onBlur={ev => { const novas = lerTags(ev.currentTarget.value); if (JSON.stringify(novas) !== JSON.stringify(e.tags)) void alterarEntidade(e, { tags: novas }); }}
          onKeyDown={ev => { if (ev.key === 'Enter') ev.currentTarget.blur(); }} />
      </label>
      <EditorDeNota key={`notas-${e.id}`} e={e} editavel={editavel} />
      <h3 class="faixa pequena">Onde aparece</h3>
      {refsVisiveis.length === 0
        ? <p class="dica">Ainda não está em nenhum aplicativo. O Atlas, o Dossiê e os outros acrescentam aqui o que a representa neles.</p>
        : <ul class="refs">{refsVisiveis.map(r => <ChipDeRef key={formatarRef(r)} r={r} />)}</ul>}
    </section>
  );
}

function Visao({ nome }: { nome: string }) {
  const lista = entidades.value, contagem = contarPorTipo(lista);
  const recentes = [...lista].sort((a, b) => b.atualizadaEm - a.atualizadaEm).slice(0, 6);
  const hora = new Date().getHours(), saudacao = hora < 6 ? 'Boa madrugada' : hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';
  return (
    <section class="visao" data-testid="visao-geral">
      <p class="visao-saudacao">{saudacao}</p>
      <h2 class="faixa grande">{nome}</h2>
      <dl class="numeros" aria-label="Resumo da campanha">
        <div><dd>{lista.length}</dd><dt>Entidades</dt></div>
        {TIPOS_CRIAVEIS.filter(t => t !== 'sessao').map(t => <div key={t}><dd>{contagem[t]}</dd><dt>{ROTULO_DO_TIPO[t].plural}</dt></div>)}
      </dl>
      {recentes.length > 0 && (<>
        <h3 class="faixa pequena">Mexidas por último</h3>
        <ul class="recentes">{recentes.map(e => (
          <li key={e.id}><button type="button" onClick={() => abrirEntidade(e.id)}><span class="item-tipo">{ROTULO_DO_TIPO[e.tipo].singular}</span><b>{e.nome}</b><span class="meta">{new Date(e.atualizadaEm).toLocaleDateString('pt-BR')}</span></button></li>
        ))}</ul>
      </>)}
      <h3 class="faixa pequena">Começar</h3>
      <div class="comecar">
        <button type="button" class="comecar-cartao" onClick={() => document.querySelector<HTMLInputElement>('[data-testid="nova-entidade-nome"]')?.focus()}><b>Criar uma entidade</b><small>Personagem, lugar, pista, facção ou nota.</small></button>
        <button type="button" class="comecar-cartao" onClick={() => { tela.value = 'sessao'; }}><b>Abrir a sessão</b><small>Os aplicativos lado a lado, com o diário.</small></button>
        <button type="button" class="comecar-cartao" onClick={() => { tela.value = 'aplicativos'; void sondarAplicativos(); }}><b>Ver os aplicativos</b><small>O que a Mesa achou ao lado dela.</small></button>
      </div>
    </section>
  );
}

export function Entidades() {
  const c = campanhaAtiva.value;
  if (!c) return <section class="pagina"><div class="vazio"><h2>Escolha uma campanha</h2><p>Use o seletor no topo ou crie uma na aba “Campanhas”.</p></div></section>;
  const lista = visiveis.value, sel = selecionada.value;
  return (
    <div class="entidades" data-testid="tela-entidades">
      <aside class="coluna-lista">
        <h2 class="faixa">{c.nome}</h2>
        <form class="nova-entidade" onSubmit={criar}>
          <select aria-label="Tipo da nova entidade" data-testid="novo-tipo" value={tipoNovo.value} onChange={ev => { tipoNovo.value = ev.currentTarget.value as TipoEntidade; }}>
            {TIPOS_CRIAVEIS.map(t => <option key={t} value={t}>{ROTULO_DO_TIPO[t].singular}</option>)}
          </select>
          <input type="text" data-testid="nova-entidade-nome" placeholder="Nome e Enter" maxLength={200} value={nomeNovo.value} onInput={ev => { nomeNovo.value = ev.currentTarget.value; }} />
          <button type="submit" class="botao-pilula destaque" data-testid="criar-entidade" disabled={!nomeNovo.value.trim()}>Criar</button>
        </form>
        <input type="search" class="busca" data-testid="busca" placeholder="Buscar por nome, etiqueta ou nota" value={busca.value} onInput={ev => { busca.value = ev.currentTarget.value; }} />
        <Filtros />
        {lista.length === 0
          ? <p class="dica" data-testid="lista-vazia">{entidades.value.length === 0 ? 'Nada na campanha ainda. Crie uma entidade acima, ou crie mapas no Atlas: cada mapa vira um lugar aqui.' : 'Nenhum resultado para essa busca.'}</p>
          : <ul class="lista" data-testid="lista-entidades">
              {lista.map(e => (
                <li key={e.id}>
                  <button type="button" class={cx('item', selecionadaId.value === e.id && 'ativa')} data-testid={`entidade-${e.id}`} data-tipo={e.tipo} onClick={() => abrirEntidade(e.id)}>
                    <span class="item-tipo">{ROTULO_DO_TIPO[e.tipo].singular}</span>
                    <span class="item-nome">{e.nome}</span>
                    {e.refs.length > 0 && <span class="item-apps">{[...new Set(e.refs.map(r => NOME_DO_APP[r.app]))].join(' · ')}</span>}
                  </button>
                </li>
              ))}
            </ul>}
      </aside>
      <main class="coluna-detalhe">
        {sel ? <Detalhe e={sel} /> : <Visao nome={c.nome} />}
      </main>
    </div>
  );
}

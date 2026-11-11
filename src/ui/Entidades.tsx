import { signal } from '@preact/signals';
import { formatarRef, type Entidade, type Ref, type TipoEntidade } from '#mesa';
import {
  alterarEntidade,
  avancarSelecao,
  busca,
  campanhaAtiva,
  campanhas,
  criarCampanha,
  criarEntidade,
  entidades,
  escolherCampanha,
  filtroTipo,
  ligacoes,
  ordem,
  podeAvancar,
  podeVoltar,
  removerEntidade,
  selecionada,
  selecionadaId,
  sidebarAberta,
  soElenco,
  tagAtiva,
  visiveis,
  voltarSelecao,
} from '../app/campanha.ts';
import { abrirEntidade, tela } from '../app/rotas.ts';
import { sondarAplicativos } from '../app/inventario.ts';
import {
  contarPorTag,
  contarPorTipo,
  ehEncontro,
  lerTags,
  NOME_DO_APP,
  NOME_DO_TIPO_DE_REF,
  podeEditar,
  ROTULO_DO_TIPO,
  semAcento,
  TIPOS_CRIAVEIS,
  type CategoriaFiltro,
  type OrdemColecao,
} from '../dominio/entidades.ts';
import { descobrirApp, enderecoDe } from '../app/aplicativos.ts';
import { ehRefDeEntidadeDaMesa } from '../dominio/notas.ts';
import { GradeDeColecao, modoExibicao } from './GradeDeColecao.tsx';
import { EditorDeCena } from './EditorDeCena.tsx';
import { cx } from './cx.ts';
import { EditorDeNota } from './EditorDeNota.tsx';
import {
  desvincularPastaLocal,
  exportarCofreJson,
  importarCofreParaApp,
  pastaVinculadaNome,
  sincronizandoCofre,
  vincularPastaLocal,
} from '../app/cofre.ts';

const tipoNovo = signal<TipoEntidade>('personagem');
const nomeNovo = signal('');
const confirmando = signal<string | null>(null);
const buscaTagLocal = signal('');
const nomeCampanhaNova = signal('');

async function criarCampanhaPeloSemCampanha(e: Event) {
  e.preventDefault();
  const c = await criarCampanha(nomeCampanhaNova.value);
  if (c) { nomeCampanhaNova.value = ''; }
}

async function criar(e: Event) {
  e.preventDefault();
  const criada = await criarEntidade(tipoNovo.value, nomeNovo.value);
  if (criada) { nomeNovo.value = ''; filtroTipo.value = null; busca.value = ''; abrirEntidade(criada.id); }
}

const CATEGORIAS_PADRAO: readonly { id: CategoriaFiltro | null; rotulo: string; testId: string; encontro?: boolean }[] = [
  { id: null, rotulo: 'Tudo', testId: 'tipo-todos' },
  { id: 'cena', rotulo: 'Cenas', testId: 'tipo-cena' },
  { id: 'lugar', rotulo: 'Mapas', testId: 'tipo-lugar' },
  { id: 'encontro', rotulo: '⚔ Encontros', testId: 'tipo-encontro', encontro: true },
  { id: 'personagem', rotulo: 'Personagens', testId: 'tipo-personagem' },
  { id: 'ameaca', rotulo: 'Ameaças', testId: 'tipo-ameaca' },
  { id: 'pista', rotulo: 'Pistas', testId: 'tipo-pista' },
  { id: 'faccao', rotulo: 'Facções', testId: 'tipo-faccao' },
  { id: 'nota', rotulo: 'Notas', testId: 'tipo-nota' },
];

function selecionarCategoria(cat: CategoriaFiltro | null) {
  if (cat === null) {
    filtroTipo.value = null;
  } else {
    filtroTipo.value = filtroTipo.value === cat ? null : cat;
  }
}

function BarraSuperior() {
  const lista = entidades.value;
  const contagem = contarPorTipo(lista);
  const contagemEncontros = lista.filter(ehEncontro).length;

  return (
    <header class="colecao-barra" data-testid="colecao-barra">
      <div class="colecao-barra-nav">
        <button
          type="button"
          class={cx('botao-icone-barra', !sidebarAberta.value && 'recolhido')}
          data-testid="alternar-sidebar"
          title={sidebarAberta.value ? 'Recolher etiquetas' : 'Mostrar etiquetas'}
          aria-label="Alternar barra de etiquetas"
          onClick={() => { sidebarAberta.value = !sidebarAberta.value; }}
        >
          {sidebarAberta.value ? '◧' : '◫'}
        </button>
        <div class="historico-botoes" role="group" aria-label="Histórico de navegação">
          <button
            type="button"
            class="botao-icone-barra"
            data-testid="historico-voltar"
            title="Voltar seleção"
            aria-label="Voltar"
            disabled={!podeVoltar.value}
            onClick={voltarSelecao}
          >
            ‹
          </button>
          <button
            type="button"
            class="botao-icone-barra"
            data-testid="historico-avancar"
            title="Avançar seleção"
            aria-label="Avançar"
            disabled={!podeAvancar.value}
            onClick={avancarSelecao}
          >
            ›
          </button>
        </div>
      </div>

      <div class="chips colecao-categorias" role="group" aria-label="Categorias da coleção">
        {CATEGORIAS_PADRAO.map(cat => {
          const ativo = filtroTipo.value === cat.id;
          const qtd = cat.id === null ? lista.length : cat.id === 'encontro' ? contagemEncontros : contagem[cat.id];
          return (
            <button
              key={cat.testId}
              type="button"
              class={cx('chip', cat.encontro && 'chip-encontro', ativo && 'ativa')}
              data-testid={cat.testId}
              onClick={() => selecionarCategoria(cat.id)}
            >
              {cat.rotulo} <b>{qtd}</b>
            </button>
          );
        })}
        {contagem.efeito > 0 && (
          <button
            type="button"
            class={cx('chip', filtroTipo.value === 'efeito' && 'ativa')}
            data-testid="tipo-efeito"
            onClick={() => selecionarCategoria('efeito')}
          >
            Efeitos <b>{contagem.efeito}</b>
          </button>
        )}
        {contagem.sessao > 0 && (
          <button
            type="button"
            class={cx('chip', filtroTipo.value === 'sessao' && 'ativa')}
            data-testid="tipo-sessao"
            onClick={() => selecionarCategoria('sessao')}
          >
            Sessões <b>{contagem.sessao}</b>
          </button>
        )}
        <button
          type="button"
          class={cx('chip', soElenco.value && 'ativa')}
          data-testid="filtro-so-elenco"
          aria-pressed={soElenco.value}
          title="Mostrar apenas personagens do elenco da campanha"
          onClick={() => { soElenco.value = !soElenco.value; }}
        >
          Só o elenco
        </button>
      </div>

      <span class="espaco" />

      <div class="colecao-barra-direita">
        <div class="modo-botoes" role="group" aria-label="Modo de exibição">
          <button
            type="button"
            class={cx('botao-icone-barra', modoExibicao.value === 'grade' && 'ativa')}
            data-testid="modo-grade"
            title="Visualização em Grade"
            aria-label="Grade"
            aria-pressed={modoExibicao.value === 'grade'}
            onClick={() => { modoExibicao.value = 'grade'; }}
          >
            ▦
          </button>
          <button
            type="button"
            class={cx('botao-icone-barra', modoExibicao.value === 'lista' && 'ativa')}
            data-testid="modo-lista"
            title="Visualização em Lista"
            aria-label="Lista"
            aria-pressed={modoExibicao.value === 'lista'}
            onClick={() => { modoExibicao.value = 'lista'; }}
          >
            ☰
          </button>
        </div>
        <input
          type="search"
          class="busca colecao-busca"
          data-testid="busca"
          placeholder="Buscar por nome, etiqueta ou nota"
          value={busca.value}
          onInput={ev => { busca.value = ev.currentTarget.value; }}
        />
        <select
          class="seletor-ordem"
          data-testid="seletor-ordem"
          aria-label="Ordenar coleção"
          value={ordem.value}
          onChange={ev => { ordem.value = ev.currentTarget.value as OrdemColecao; }}
        >
          <option value="nome-asc">Nome (A-Z)</option>
          <option value="nome-desc">Nome (Z-A)</option>
          <option value="recentes">Mais recentes</option>
        </select>
        <button
          type="button"
          class="botao-pilula destaque botao-novo"
          data-testid="abrir-criador"
          title="Nova entidade"
          onClick={() => {
            const input = document.querySelector<HTMLInputElement>('[data-testid="nova-entidade-nome"]');
            if (input) {
              input.focus();
              input.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
          }}
        >
          + Nova
        </button>
      </div>
    </header>
  );
}

function SidebarColecao({ nomeCampanha }: { nomeCampanha: string }) {
  const lista = entidades.value;
  const tagsContadas = contarPorTag(lista);
  const buscaLimpa = semAcento(buscaTagLocal.value.trim());
  const tagsFiltradas = buscaLimpa
    ? tagsContadas.filter(ct => ct.chave.includes(buscaLimpa) || semAcento(ct.tag).includes(buscaLimpa))
    : tagsContadas;

  return (
    <aside
      class={cx('colecao-sidebar', !sidebarAberta.value && 'recolhida')}
      data-testid="colecao-sidebar"
      aria-label="Árvore de Etiquetas da Coleção"
    >
      <div class="colecao-sidebar-topo">
        <button
          type="button"
          class="colecao-sidebar-campanha"
          data-testid="sidebar-campanha"
          title="Gerenciar campanhas"
          onClick={() => { tela.value = 'campanhas'; }}
        >
          <span class="icone-pasta" aria-hidden="true">📁</span>
          <span class="nome-campanha" title={nomeCampanha}>{nomeCampanha}</span>
        </button>

        <div class="colecao-sidebar-acoes-cofre">
          <button
            type="button"
            class={cx('botao-icone-cofre', pastaVinculadaNome.value && 'ativo')}
            data-testid="vincular-pasta-cofre"
            title={pastaVinculadaNome.value ? `Pasta vinculada: ${pastaVinculadaNome.value} (clique para desvincular)` : 'Vincular pasta local no computador (Cofre)'}
            aria-label="Vincular pasta local"
            onClick={() => {
              if (pastaVinculadaNome.value) desvincularPastaLocal();
              else void vincularPastaLocal();
            }}
          >
            {sincronizandoCofre.value ? '🔄' : (pastaVinculadaNome.value ? '💾' : '📁')}
          </button>
          <button
            type="button"
            class="botao-icone-cofre"
            data-testid="exportar-cofre"
            title="Exportar cofre da campanha (.json)"
            aria-label="Exportar cofre"
            onClick={() => {
              const c = campanhaAtiva.value;
              if (c) exportarCofreJson(c, entidades.value, ligacoes.value);
            }}
          >
            ↓
          </button>
          <button
            type="button"
            class="botao-icone-cofre"
            data-testid="importar-cofre"
            title="Importar cofre (.json)"
            aria-label="Importar cofre"
            onClick={() => void importarCofreParaApp()}
          >
            ↑
          </button>
        </div>
      </div>
      {pastaVinculadaNome.value && (
        <div class="tag-pasta-vinculada" title={`Sincronizando com ${pastaVinculadaNome.value}`}>
          <span class="ponto-status" aria-hidden="true">●</span>
          <span>{pastaVinculadaNome.value}</span>
        </div>
      )}

      <div class="colecao-sidebar-secao">
        <div class="colecao-sidebar-faixa">
          <span class="faixa-tag-hash">#</span>
          <span class="faixa-tag-titulo">Etiquetas</span>
          <span class="meta">{tagsContadas.length}</span>
        </div>
        <input
          type="search"
          class="busca-tags"
          data-testid="busca-tags"
          placeholder="Filtrar etiquetas..."
          value={buscaTagLocal.value}
          onInput={ev => { buscaTagLocal.value = ev.currentTarget.value; }}
        />
        <div class="colecao-sidebar-tags" role="list">
          <button
            type="button"
            class={cx('tag-item', tagAtiva.value === null && 'ativa')}
            data-testid="tag-filtro-todas"
            onClick={() => { tagAtiva.value = null; }}
          >
            <span class="tag-hash">#</span>
            <span class="tag-nome">Todas as etiquetas</span>
            <span class="tag-badge">{lista.length}</span>
          </button>

          {tagsFiltradas.length === 0 ? (
            <p class="dica dica-tags">
              {tagsContadas.length === 0 ? 'Sem etiquetas ainda.' : 'Nenhuma etiqueta encontrada.'}
            </p>
          ) : (
            tagsFiltradas.map(ct => (
              <button
                key={ct.chave}
                type="button"
                class={cx('tag-item', tagAtiva.value === ct.chave && 'ativa')}
                data-testid={`tag-filtro-${ct.chave}`}
                onClick={() => { tagAtiva.value = tagAtiva.value === ct.chave ? null : ct.chave; }}
              >
                <span class="tag-hash">#</span>
                <span class="tag-nome">{ct.tag}</span>
                <span class="tag-badge">({ct.contagem})</span>
              </button>
            ))
          )}
        </div>
      </div>

      <div class="espaco" />

      <footer class="colecao-sidebar-rodape">
        <button
          type="button"
          class="botao-gerenciar-campanha"
          data-testid="gerenciar-campanha"
          onClick={() => { tela.value = 'campanhas'; }}
        >
          ⚙ Gerenciar Campanha
        </button>
      </footer>
    </aside>
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
        <button type="button" class="botao-icone-texto fechar-detalhe" data-testid="fechar-detalhe" title="Fechar detalhes" aria-label="Fechar detalhes" onClick={() => abrirEntidade(null)}>✕</button>
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
      {e.tipo === 'cena' && <EditorDeCena key={`cena-${e.id}`} e={e} editavel={editavel} />}
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
  if (!c) {
    return (
      <section class="pagina">
        <div class="vazio" data-testid="sem-campanha">
          <h2>Escolha ou crie uma campanha</h2>
          {campanhas.value.length > 0 && (
            <div class="barra-campanha" style={{ justifyContent: 'center' }}>
              {campanhas.value.map(camp => (
                <button
                  key={camp.id}
                  type="button"
                  class="botao-pilula"
                  data-testid={`escolher-campanha-${camp.id}`}
                  onClick={() => void escolherCampanha(camp.id)}
                >
                  {camp.nome}
                </button>
              ))}
            </div>
          )}
          <form class="barra-campanha" onSubmit={criarCampanhaPeloSemCampanha} style={{ justifyContent: 'center' }}>
            <input
              type="text"
              class="campo-inline"
              data-testid="nova-campanha-nome"
              placeholder="Nome da nova campanha"
              maxLength={200}
              value={nomeCampanhaNova.value}
              onInput={e => { nomeCampanhaNova.value = e.currentTarget.value; }}
            />
            <button
              type="submit"
              class="botao-pilula destaque"
              data-testid="criar-campanha"
              disabled={!nomeCampanhaNova.value.trim()}
            >
              Criar
            </button>
          </form>
        </div>
      </section>
    );
  }
  const lista = visiveis.value, sel = selecionada.value;

  return (
    <div class="entidades" data-testid="tela-entidades">
      <SidebarColecao nomeCampanha={c.nome} />

      <div class="colecao-corpo">
        <BarraSuperior />

        <div class="colecao-conteudo">
          <aside class="coluna-lista">
            <h2 class="faixa">{c.nome}</h2>
            <form class="nova-entidade" onSubmit={criar}>
              <select aria-label="Tipo da nova entidade" data-testid="novo-tipo" value={tipoNovo.value} onChange={ev => { tipoNovo.value = ev.currentTarget.value as TipoEntidade; }}>
                {TIPOS_CRIAVEIS.map(t => <option key={t} value={t}>{ROTULO_DO_TIPO[t].singular}</option>)}
              </select>
              <input type="text" data-testid="nova-entidade-nome" placeholder="Nome e Enter" maxLength={200} value={nomeNovo.value} onInput={ev => { nomeNovo.value = ev.currentTarget.value; }} />
              <button type="submit" class="botao-pilula destaque" data-testid="criar-entidade" disabled={!nomeNovo.value.trim()}>Criar</button>
            </form>

            {tagAtiva.value && (
              <div class="filtro-ativo-tag">
                <span>Tag ativa: <b>#{tagAtiva.value}</b></span>
                <button type="button" class="botao-limpar-tag" title="Remover filtro de etiqueta" onClick={() => { tagAtiva.value = null; }}>×</button>
              </div>
            )}

            {lista.length === 0 ? (
              <p class="dica" data-testid="lista-vazia">
                {entidades.value.length === 0
                  ? 'Nada na campanha ainda. Crie uma entidade acima, ou crie mapas no Atlas: cada mapa vira um lugar aqui.'
                  : 'Nenhum resultado para essa busca.'}
              </p>
            ) : (
              <GradeDeColecao lista={lista} />
            )}
          </aside>

          <main class="coluna-detalhe">
            {sel ? <Detalhe e={sel} /> : <Visao nome={c.nome} />}
          </main>
        </div>
      </div>
    </div>
  );
}

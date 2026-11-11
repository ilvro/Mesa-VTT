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
import {
  baixarExportacaoAparelho,
  importarAparelho,
  type RelatorioDeImportacao,
} from '../app/transferencia.ts';
import { avisar, mensagemDe } from '../app/toasts.ts';
import { tela } from '../app/rotas.ts';
import { personagensParaElenco } from '../dominio/entidades.ts';
import { cx } from './cx.ts';

const nomeNovo = signal('');
const confirmando = signal<string | null>(null);
const exportandoAparelho = signal(false);
const arquivoParaImportar = signal<File | null>(null);

function DialogoImportacaoAparelho({
  arquivo,
  aoFechar,
}: {
  arquivo: File;
  aoFechar: () => void;
}) {
  const [modo, setModo] = useState<'mesclar' | 'substituir'>('mesclar');
  const [importando, setImportando] = useState(false);
  const [relatorio, setRelatorio] = useState<RelatorioDeImportacao | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const executar = async () => {
    setImportando(true);
    setErro(null);
    try {
      const rel = await importarAparelho(arquivo, { substituir: modo === 'substituir' });
      setRelatorio(rel);
    } catch (e) {
      setErro(mensagemDe(e));
    } finally {
      setImportando(false);
    }
  };

  const concluirERecarregar = () => {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem('mesa:aviso-pos-importacao', 'Reabra os outros apps');
    }
    if (typeof location !== 'undefined') {
      location.reload();
    } else {
      aoFechar();
    }
  };

  return (
    <div
      class="dialogo-fundo"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.65)',
        display: 'grid',
        placeItems: 'center',
        zIndex: 1000,
        padding: '16px',
      }}
      data-testid="dialogo-importar-aparelho"
    >
      <div
        class="dialogo-cartao"
        style={{
          background: 'var(--superficie-1, #1e1e24)',
          border: '1px solid var(--linha, #333)',
          borderRadius: '8px',
          padding: '24px',
          maxWidth: '520px',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        <h3 class="faixa">{relatorio ? 'Importação concluída' : 'Importar deste aparelho'}</h3>

        {relatorio ? (
          <>
            <p class="dica">
              {relatorio.bancos.length} banco(s) e {relatorio.chaves} chave(s) de configuração importados.
            </p>
            <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '13px' }}>
              {relatorio.bancos.map(b => (
                <li key={b.nome}>
                  <b>{b.nome}:</b> {b.registros} registro(s)
                </li>
              ))}
            </ul>
            <p class="meta">
              Reabra os outros aplicativos (Atlas, Dossiê, Ateliê, Jukebox) para carregar os novos dados.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                type="button"
                class="botao-pilula destaque"
                data-testid="concluir-importacao"
                onClick={concluirERecarregar}
              >
                Recarregar e concluir
              </button>
            </div>
          </>
        ) : (
          <>
            <p class="dica">
              Arquivo selecionado: <b>{arquivo.name}</b>
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="modo-importacao"
                  value="mesclar"
                  checked={modo === 'mesclar'}
                  onChange={() => setModo('mesclar')}
                />
                <span><b>Mesclar com o que já existe</b> (padrão, mantém outros itens)</span>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="modo-importacao"
                  value="substituir"
                  checked={modo === 'substituir'}
                  onChange={() => setModo('substituir')}
                />
                <span><b>Substituir tudo</b> (apaga os bancos atuais antes)</span>
              </label>
            </div>

            {modo === 'substituir' && (
              <p class="aviso" style={{ fontSize: '13px' }}>
                Antes de substituir, feche os outros apps abertos (Atlas, Dossiê, Ateliê, Jukebox).
              </p>
            )}

            <p class="meta" style={{ fontSize: '12.5px' }}>
              As músicas da Jukebox não vão junto: carregue o preset de novo no outro aparelho.
            </p>

            {erro && <p class="aviso perigo" style={{ color: 'var(--perigo)' }}>{erro}</p>}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
              <button
                type="button"
                class="botao-pilula"
                onClick={aoFechar}
                disabled={importando}
              >
                Cancelar
              </button>
              <button
                type="button"
                class="botao-pilula destaque"
                data-testid="confirmar-importar-aparelho"
                onClick={() => void executar()}
                disabled={importando}
              >
                {importando ? 'Importando…' : 'Importar'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

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
  const aoExportarAparelho = async () => {
    exportandoAparelho.value = true;
    try {
      await baixarExportacaoAparelho();
      avisar('Exportação deste aparelho concluída.');
    } catch (e) {
      avisar(mensagemDe(e), true);
    } finally {
      exportandoAparelho.value = false;
    }
  };

  const aoSelecionarArquivo = (e: Event) => {
    const input = e.currentTarget as HTMLInputElement;
    const arq = input.files?.[0];
    if (arq) {
      arquivoParaImportar.value = arq;
      input.value = '';
    }
  };

  return (
    <section class="pagina" data-testid="tela-campanhas">
      <div class="galeria-topo"><h2 class="faixa grande">Campanhas</h2></div>
      <p class="dica">Todas as campanhas deste navegador, compartilhadas com o Atlas, o Dossiê e os outros aplicativos da mesa.</p>
      <form class="barra-campanha" onSubmit={criar}>
        <input type="text" class="campo-inline" data-testid="nova-campanha-nome" placeholder="Nome da nova campanha" maxLength={200} value={nomeNovo.value} onInput={e => { nomeNovo.value = e.currentTarget.value; }} />
        <button type="submit" class="botao-pilula destaque" data-testid="criar-campanha" disabled={!nomeNovo.value.trim()}>Criar campanha</button>
        <button type="button" class="botao-pilula" data-testid="importar-cofre-campanhas" title="Importar cofre (.json)" onClick={() => void importarCofreParaApp()}>↑ Importar Cofre</button>
      </form>
      <section class="secao-aparelho" data-testid="secao-este-aparelho" style={{ margin: '18px 0 24px', padding: '14px 16px', border: '1px solid var(--linha)', borderRadius: '8px', background: 'var(--superficie-2)' }}>
        <h3 class="faixa pequena" style={{ margin: '0 0 6px' }}>Este aparelho</h3>
        <p class="meta" style={{ margin: '0 0 10px' }}>As músicas da Jukebox não vão junto: carregue o preset de novo no outro aparelho.</p>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" class="botao-pilula" data-testid="exportar-aparelho" disabled={exportandoAparelho.value} onClick={aoExportarAparelho}>
            {exportandoAparelho.value ? 'Exportando…' : 'Exportar tudo deste aparelho'}
          </button>
          <label class="botao-pilula" data-testid="importar-aparelho-botao" style={{ cursor: 'pointer' }}>
            Importar…
            <input type="file" accept=".mesa" style={{ display: 'none' }} data-testid="importar-aparelho-input" onChange={aoSelecionarArquivo} />
          </label>
        </div>
      </section>
      {arquivoParaImportar.value && (
        <DialogoImportacaoAparelho
          arquivo={arquivoParaImportar.value}
          aoFechar={() => { arquivoParaImportar.value = null; }}
        />
      )}
      {campanhas.value.length === 0
        ? <div class="vazio"><h2>Nenhuma campanha ainda</h2><p>Crie a primeira acima. Ela aparece também no Atlas.</p></div>
        : <div class="cartoes">{campanhas.value.map(c => <CartaoDeCampanha key={c.id} c={c} />)}</div>}
    </section>
  );
}

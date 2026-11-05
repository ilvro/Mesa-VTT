import { useRef, useState } from 'preact/hooks';
import type { Entidade, Ref } from '#mesa';
import { alterarEntidade, criarEntidade, entidades, atualizar, sincronizarLigacoes } from '../app/campanha.ts';
import { abrirNoApp } from '../app/barramento.ts';
import { abrirEntidade } from '../app/rotas.ts';
import { NOME_DO_APP, NOME_DO_TIPO_DE_REF, ROTULO_DO_TIPO, TIPOS_CRIAVEIS } from '../dominio/entidades.ts';
import { analisarNota, autocompletarEm, ehRefDeEntidadeDaMesa, nomeLigavel, resolver, sugerirEntidades, textoDaSugestao, type Trecho } from '../dominio/notas.ts';
import { cx } from './cx.ts';

/** O rótulo de uma ligação a um Ref que a nota não nomeou: “Atlas · mapa”. */
const rotuloDoRef = (r: Ref): string => `${NOME_DO_APP[r.app]} · ${NOME_DO_TIPO_DE_REF[r.tipo] ?? r.tipo}`;

function SemDestino({ nome, notaId }: { nome: string; notaId: string }) {
  const [escolhendo, setEscolhendo] = useState(false);
  const criar = async (tipo: (typeof TIPOS_CRIAVEIS)[number]) => {
    setEscolhendo(false);
    if (await criarEntidade(tipo, nome, false)) { await sincronizarLigacoes(notaId); await atualizar(); }
  };
  return (
    <span class="ligacao-orfa">
      <span class="ligacao sem-destino" data-testid="ligacao-sem-destino" title="Nenhuma entidade com este nome">{nome}</span>
      {escolhendo
        ? <span class="criar-tipos">{TIPOS_CRIAVEIS.map(t => <button key={t} type="button" class="chip" data-testid={`ligacao-criar-${t}`} onClick={() => void criar(t)}>{ROTULO_DO_TIPO[t].singular}</button>)}</span>
        : <button type="button" class="ligacao-criar" data-testid="ligacao-criar" onClick={() => setEscolhendo(true)}>Criar entidade</button>}
    </span>
  );
}

function Ligacao({ t, notaId }: { t: Extract<Trecho, { tipo: 'ligacao' }>; notaId: string }) {
  const destino = resolver(t.alvo, entidades.value);
  if (destino.tipo === 'sem-destino') return <SemDestino nome={t.rotulo ?? destino.nome} notaId={notaId} />;
  if (destino.tipo === 'ref') {
    return <button type="button" class="ligacao ligacao-ref" data-testid="ligacao-ref" title={t.bruto} onClick={() => void abrirNoApp(destino.ref)}>{t.rotulo ?? rotuloDoRef(destino.ref)}<span class="seta"> ↗</span></button>;
  }
  const e = destino.entidade, fora = e.refs.filter(r => !ehRefDeEntidadeDaMesa(r));
  return (
    <span class="ligacao-entidade">
      <button type="button" class="ligacao" data-testid="ligacao-entidade" onClick={() => abrirEntidade(e.id)}>{t.rotulo ?? e.nome}</button>
      {fora.map(r => <button key={`${r.app}/${r.tipo}/${r.id}`} type="button" class="ligacao-app" data-testid={`ligacao-abrir-${r.app}`} title={`Abrir no ${NOME_DO_APP[r.app]}`} onClick={() => void abrirNoApp(r)}>{NOME_DO_APP[r.app]} ↗</button>)}
    </span>
  );
}

/** A nota lida: o texto como foi escrito e cada `[[ligação]]` clicável. */
export function LeituraDeNota({ texto, notaId }: { texto: string; notaId: string }) {
  const trechos = analisarNota(texto);
  if (!texto.trim()) return <p class="dica" data-testid="nota-vazia">Sem notas. Escreva e ligue com <code>[[Nome]]</code>.</p>;
  return <div class="leitura" data-testid="leitura">{trechos.map((t, i) => t.tipo === 'texto' ? <span key={i}>{t.texto}</span> : <Ligacao key={i} t={t} notaId={notaId} />)}</div>;
}

/**
 * O editor de notas: texto simples com autocompletar ao digitar `[[`. Ao sair do campo grava e as ligações viram `menciona`
 * no banco da campanha (apaga as que saíram). Para quem não pode editar (entidade de outro aplicativo), só a leitura.
 */
export function EditorDeNota({ e, editavel }: { e: Entidade; editavel: boolean }) {
  const temLigacao = analisarNota(e.notas).some(t => t.tipo === 'ligacao');
  const [modo, setModo] = useState<'editar' | 'ler'>(!editavel || temLigacao ? 'ler' : 'editar');
  const [aberto, setAberto] = useState<{ inicio: number; termo: string; indice: number } | null>(null);
  const campo = useRef<HTMLTextAreaElement>(null);
  const [texto, setTexto] = useState(e.notas);
  const sugestoes = aberto ? sugerirEntidades(entidades.value.filter(x => x.id !== e.id && nomeLigavel(x.nome)), aberto.termo) : [];

  const gravar = async (valor: string) => { if (valor !== e.notas) await alterarEntidade(e, { notas: valor }); };
  const aoDigitar = (el: HTMLTextAreaElement) => { setTexto(el.value); const c = autocompletarEm(el.value, el.selectionStart); setAberto(c ? { ...c, indice: 0 } : null); };
  const aceitar = (s: Entidade) => {
    const el = campo.current; if (!el || !aberto) return;
    const depois = el.value.slice(el.selectionStart), pular = depois.startsWith(']]') ? 2 : 0;
    const antes = el.value.slice(0, aberto.inicio) + textoDaSugestao(s), posicao = antes.length;
    el.value = antes + depois.slice(pular); el.setSelectionRange(posicao, posicao); setTexto(el.value); setAberto(null); el.focus();
  };
  const aoTeclar = (ev: KeyboardEvent) => {
    if (!aberto || !sugestoes.length) return;
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') { ev.preventDefault(); setAberto({ ...aberto, indice: (aberto.indice + (ev.key === 'ArrowDown' ? 1 : -1) + sugestoes.length) % sugestoes.length }); }
    else if (ev.key === 'Enter' || ev.key === 'Tab') { ev.preventDefault(); const s = sugestoes[aberto.indice]; if (s) aceitar(s); }
    else if (ev.key === 'Escape') { ev.preventDefault(); setAberto(null); }
  };

  return (
    <div class="campo nota">
      <div class="nota-topo">
        <span>Notas <span class="meta">(ligue com <code>[[Nome]]</code>)</span></span>
        {editavel && (
          <span class="grupo" role="group" aria-label="Modo da nota">
            <button type="button" class={cx('chip', modo === 'editar' && 'ativa')} data-testid="nota-modo-editar" onClick={() => setModo('editar')}>Editar</button>
            <button type="button" class={cx('chip', modo === 'ler' && 'ativa')} data-testid="nota-modo-ler" onClick={async () => { await gravar(campo.current?.value ?? texto); setModo('ler'); }}>Ler</button>
          </span>
        )}
      </div>
      {modo === 'editar' && editavel
        ? <div class="nota-editor">
            <textarea ref={campo} rows={9} defaultValue={e.notas} data-testid="campo-notas" placeholder="O que o mestre precisa lembrar… Digite [[ para ligar a uma entidade."
              onInput={ev => aoDigitar(ev.currentTarget)} onKeyDown={aoTeclar} onClick={ev => aoDigitar(ev.currentTarget)}
              onBlur={ev => { const v = ev.currentTarget.value; setAberto(null); void gravar(v); }} />
            {aberto && sugestoes.length > 0 && (
              <ul class="autocompletar" data-testid="autocompletar" role="listbox">
                {sugestoes.map((s, i) => (
                  <li key={s.id} role="option" aria-selected={i === aberto.indice}>
                    <button type="button" class={cx('sugestao', i === aberto.indice && 'ativa')} data-testid={`sugestao-${i}`} onMouseDown={ev => { ev.preventDefault(); aceitar(s); }}>
                      <span class="item-tipo">{ROTULO_DO_TIPO[s.tipo].singular}</span>{s.nome}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        : <LeituraDeNota texto={e.notas} notaId={e.id} />}
    </div>
  );
}

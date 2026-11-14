import { useState } from 'preact/hooks';
import type { Entidade } from '#mesa';
import { alterarEntidade, entidades, tagAtiva } from '../app/campanha.ts';
import { adicionarTags, contarPorTag, removerTag, semAcento } from '../dominio/entidades.ts';

/** Editor de etiquetas em chips: cada mudança grava na hora. */
export function CampoDeEtiquetas({ e, disabled }: { e: Entidade; disabled?: boolean }) {
  const [texto, setTexto] = useState('');
  const chaveDe = (t: string) => semAcento(t.replace(/^#/, '').trim());
  const gravar = (novas: string[]) => {
    if (JSON.stringify(novas) !== JSON.stringify(e.tags)) void alterarEntidade(e, { tags: novas });
  };
  const adicionar = () => {
    const t = texto;
    setTexto('');
    if (t.trim()) gravar(adicionarTags(e.tags, t));
  };
  const minhas = new Set(e.tags.map(chaveDe));
  const sugestoes = contarPorTag(entidades.value).filter(ct => !minhas.has(ct.chave));

  return (
    <div class="campo-etiquetas" data-testid="campo-etiquetas" role="group" aria-labelledby="rotulo-etiquetas">
      {e.tags.map(t => {
        const chave = chaveDe(t);
        return (
          <span key={chave} class="chip etiqueta-chip" data-testid={`etiqueta-${chave}`}>
            <button type="button" class="etiqueta-nome" title="Filtrar a coleção por esta etiqueta" onClick={() => { tagAtiva.value = chave; }}>
              #{t.replace(/^#/, '')}
            </button>
            {!disabled && (
              <button type="button" class="etiqueta-remover" aria-label={`Remover etiqueta ${t}`} onClick={() => gravar(removerTag(e.tags, t))}>×</button>
            )}
          </span>
        );
      })}
      {!disabled && (
        <>
          <input
            type="text"
            class="etiqueta-input"
            data-testid="campo-tags"
            list={`etiquetas-sugeridas-${e.id}`}
            placeholder={e.tags.length === 0 ? 'mansão, vila, mistério' : 'Nova etiqueta…'}
            aria-labelledby="rotulo-etiquetas"
            value={texto}
            onInput={ev => setTexto(ev.currentTarget.value)}
            onBlur={adicionar}
            onKeyDown={ev => {
              if (ev.key === 'Enter' || ev.key === ',') {
                ev.preventDefault();
                adicionar();
              } else if (ev.key === 'Tab' && !ev.shiftKey && texto.trim()) {
                ev.preventDefault();
                adicionar();
              } else if (ev.key === 'Backspace' && texto === '' && e.tags.length > 0) {
                gravar(e.tags.slice(0, -1));
              }
            }}
          />
          <datalist id={`etiquetas-sugeridas-${e.id}`}>
            {sugestoes.map(ct => <option key={ct.chave} value={ct.tag} />)}
          </datalist>
        </>
      )}
    </div>
  );
}

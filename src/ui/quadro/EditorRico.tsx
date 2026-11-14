import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import TextAlign from '@tiptap/extension-text-align';
import {
  BackgroundColor,
  Color,
  FontFamily,
  FontSize,
  TextStyle,
} from '@tiptap/extension-text-style';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Entidade } from '#mesa';
import { entidades } from '../../app/campanha.ts';
import { normalizarDoc } from '../../dominio/doc-rico.ts';
import { ROTULO_DO_TIPO } from '../../dominio/entidades.ts';
import {
  autocompletarEm,
  nomeLigavel,
  sugerirEntidades,
  textoDaSugestao,
} from '../../dominio/notas.ts';
import type { DocRico } from '../../dominio/quadro.ts';

interface EditorRicoProps {
  doc: DocRico;
  alturaAuto: boolean;
  padding: number;
  onSair: (novoDoc: DocRico, novaAltura?: number) => void;
  onEditorPronto?: (editor: Editor | null) => void;
}

export function EditorRico({
  doc,
  alturaAuto,
  padding,
  onSair,
  onEditorPronto,
}: EditorRicoProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<Editor | null>(null);
  const saiuRef = useRef(false);
  const onSairRef = useRef(onSair);
  onSairRef.current = onSair;
  const onEditorProntoRef = useRef(onEditorPronto);
  onEditorProntoRef.current = onEditorPronto;

  const [aberto, setAberto] = useState<{
    pmInicio: number;
    pmFim: number;
    termo: string;
    indice: number;
  } | null>(null);
  const abertoRef = useRef(aberto);
  abertoRef.current = aberto;

  const sugestoes = aberto
    ? sugerirEntidades(
        entidades.value.filter((x) => nomeLigavel(x.nome)),
        aberto.termo,
      )
    : [];
  const sugestoesRef = useRef(sugestoes);
  sugestoesRef.current = sugestoes;

  const aceitar = (s: Entidade) => {
    const ed = editorRef.current;
    const ab = abertoRef.current;
    if (!ed || !ab) return;
    const depois = ed.state.doc.textBetween(
      ab.pmFim,
      Math.min(ed.state.doc.content.size, ab.pmFim + 2),
      '\n',
      '\0',
    );
    const pular = depois.startsWith(']]') ? 2 : 0;
    ed.chain()
      .focus()
      .insertContentAt(
        { from: ab.pmInicio, to: ab.pmFim + pular },
        textoDaSugestao(s),
      )
      .run();
    setAberto(null);
  };

  const finalizar = () => {
    if (saiuRef.current) return;
    saiuRef.current = true;
    const ed = editorRef.current;
    if (!ed) return;
    const novoDoc = normalizarDoc(ed.getJSON());
    let novaAltura: number | undefined;
    if (alturaAuto && hostRef.current) {
      const h = Math.ceil(hostRef.current.scrollHeight + padding * 2);
      if (Number.isFinite(h) && h > 0) novaAltura = h;
    }
    onSairRef.current(novoDoc, novaAltura);
  };

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;

    saiuRef.current = false;
    const editor = new Editor({
      element: el,
      extensions: [
        StarterKit.configure({
          heading: { levels: [1, 2, 3] },
        }),
        TextStyle,
        Color,
        BackgroundColor,
        FontFamily,
        FontSize,
        TextAlign.configure({
          types: ['heading', 'paragraph'],
        }),
      ],
      content: doc,
      onUpdate({ editor: ed }) {
        const { from } = ed.state.selection;
        const blocoInicio = ed.state.selection.$from.start();
        const textoAntes = ed.state.doc.textBetween(blocoInicio, from, '\n', '\0');
        const c = autocompletarEm(textoAntes, textoAntes.length);
        if (c) {
          const pmInicio = from - (textoAntes.length - c.inicio);
          setAberto({ pmInicio, pmFim: from, termo: c.termo, indice: 0 });
        } else {
          setAberto(null);
        }
      },
      editorProps: {
        attributes: {
          class: 'editor-rico-prosemirror',
          'data-testid': 'editor-rico',
        },
        handleKeyDown(_view, event) {
          const ab = abertoRef.current;
          const lista = sugestoesRef.current;
          if (ab && lista.length > 0) {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault();
              event.stopPropagation();
              const delta = event.key === 'ArrowDown' ? 1 : -1;
              setAberto({
                ...ab,
                indice: (ab.indice + delta + lista.length) % lista.length,
              });
              return true;
            }
            if (event.key === 'Enter' || event.key === 'Tab') {
              event.preventDefault();
              event.stopPropagation();
              const s = lista[ab.indice];
              if (s) aceitar(s);
              return true;
            }
          }
          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            if (ab) {
              setAberto(null);
              return true;
            }
            finalizar();
            return true;
          }
          return false;
        },
      },
    });

    editorRef.current = editor;
    onEditorProntoRef.current?.(editor);
    editor.commands.focus('end');

    return () => {
      finalizar();
      onEditorProntoRef.current?.(null);
      editor.destroy();
      editorRef.current = null;
    };
  }, []);

  return (
    <div
      class="editor-rico-caixa"
      onPointerDown={(e) => e.stopPropagation()}
      onDblClick={(e) => e.stopPropagation()}
    >
      <div ref={hostRef} />
      {aberto && sugestoes.length > 0 ? (
        <ul class="sugestoes editor-rico-sugestoes" role="listbox" data-testid="editor-rico-sugestoes">
          {sugestoes.map((s, idx) => (
            <li
              key={s.id}
              role="option"
              aria-selected={idx === aberto.indice}
              class={idx === aberto.indice ? 'ativa' : ''}
              data-testid={`editor-rico-sugestao-${s.id}`}
              onMouseDown={(e) => {
                e.preventDefault();
                aceitar(s);
              }}
            >
              <span>{s.nome}</span>
              <span class="meta">{ROTULO_DO_TIPO[s.tipo].singular}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

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
import { useEffect, useRef } from 'preact/hooks';
import { normalizarDoc } from '../../dominio/doc-rico.ts';
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
      editorProps: {
        attributes: {
          class: 'editor-rico-prosemirror',
          'data-testid': 'editor-rico',
        },
        handleKeyDown(_view, event) {
          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
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
      ref={hostRef}
      class="editor-rico-caixa"
      onPointerDown={(e) => e.stopPropagation()}
      onDblClick={(e) => e.stopPropagation()}
    />
  );
}

import type { Editor } from '@tiptap/core';
import { useSignal } from '@preact/signals';
import { familiaCss, FONTES } from '../../dominio/fontes.ts';
import { IDS_FONTE, type IdFonte } from '../../dominio/quadro.ts';
import { SeletorDeCor } from './SeletorDeCor.tsx';

const TAMANHOS = [10, 12, 14, 16, 18, 20, 24, 28, 36, 48, 64, 96, 144];

interface BarraEditorTextoProps {
  editorAtivo: Editor;
  left: number;
  top: number;
}

export function BarraEditorTexto({ editorAtivo, left, top }: BarraEditorTextoProps) {
  const linkAberto = useSignal(false);
  const linkUrl = useSignal('');

  return (
    <div
      class="barra-formatacao"
      data-testid="barra-formatacao"
      style={{ left: `${left}px`, top: `${top}px` }}
      onMouseDown={(e) => e.preventDefault()}
      onPointerDown={(e) => e.stopPropagation()}
      onDblClick={(e) => e.stopPropagation()}
    >
      <select
        class="fmt-select"
        aria-label="Fonte"
        data-testid="fmt-fonte"
        value=""
        onMouseDown={(e) => e.stopPropagation()}
        onChange={(e) => {
          const id = e.currentTarget.value as IdFonte;
          if (!id) return;
          editorAtivo.chain().focus().setFontFamily(FONTES[id].nome).run();
        }}
      >
        <option value="">Fonte…</option>
        {IDS_FONTE.map((id) => (
          <option key={id} value={id} style={{ fontFamily: familiaCss(id) }}>
            {FONTES[id].nome}
          </option>
        ))}
      </select>

      <select
        class="fmt-select fmt-select-pequeno"
        aria-label="Tamanho"
        data-testid="fmt-tamanho"
        value=""
        onMouseDown={(e) => e.stopPropagation()}
        onChange={(e) => {
          const v = e.currentTarget.value;
          if (!v) return;
          editorAtivo.chain().focus().setFontSize(`${v}px`).run();
        }}
      >
        <option value="">Tam</option>
        {TAMANHOS.map((t) => (
          <option key={t} value={String(t)}>
            {t}
          </option>
        ))}
      </select>

      <button
        type="button"
        class={`fmt-btn ${editorAtivo.isActive('bold') ? 'ativa' : ''}`}
        data-testid="fmt-negrito"
        title="Negrito (Ctrl+B)"
        onClick={() => editorAtivo.chain().focus().toggleBold().run()}
      >
        <b>B</b>
      </button>
      <button
        type="button"
        class={`fmt-btn ${editorAtivo.isActive('italic') ? 'ativa' : ''}`}
        data-testid="fmt-italico"
        title="Itálico (Ctrl+I)"
        onClick={() => editorAtivo.chain().focus().toggleItalic().run()}
      >
        <i>I</i>
      </button>
      <button
        type="button"
        class={`fmt-btn ${editorAtivo.isActive('underline') ? 'ativa' : ''}`}
        data-testid="fmt-sublinhado"
        title="Sublinhado (Ctrl+U)"
        onClick={() => editorAtivo.chain().focus().toggleUnderline().run()}
      >
        <u>U</u>
      </button>
      <button
        type="button"
        class={`fmt-btn ${editorAtivo.isActive('strike') ? 'ativa' : ''}`}
        data-testid="fmt-tachado"
        title="Tachado"
        onClick={() => editorAtivo.chain().focus().toggleStrike().run()}
      >
        <s>S</s>
      </button>

      <SeletorDeCor
        valor={null}
        permiteNula
        rotulo="Cor do texto"
        testIdPrefix="fmt-cor-texto"
        onEscolher={(cor) => {
          if (cor) editorAtivo.chain().focus().setColor(cor).run();
          else editorAtivo.chain().focus().unsetColor().run();
        }}
      />
      <SeletorDeCor
        valor={null}
        permiteNula
        rotulo="Fundo do texto"
        testIdPrefix="fmt-cor-destaque"
        onEscolher={(cor) => {
          if (cor) editorAtivo.chain().focus().setBackgroundColor(cor).run();
          else editorAtivo.chain().focus().unsetBackgroundColor().run();
        }}
      />

      <span class="fmt-sep" />

      <button
        type="button"
        class={`fmt-btn ${editorAtivo.isActive({ textAlign: 'left' }) ? 'ativa' : ''}`}
        title="Esquerda"
        onClick={() => editorAtivo.chain().focus().setTextAlign('left').run()}
      >
        ⫷
      </button>
      <button
        type="button"
        class={`fmt-btn ${editorAtivo.isActive({ textAlign: 'center' }) ? 'ativa' : ''}`}
        title="Centro"
        onClick={() => editorAtivo.chain().focus().setTextAlign('center').run()}
      >
        ☰
      </button>
      <button
        type="button"
        class={`fmt-btn ${editorAtivo.isActive({ textAlign: 'right' }) ? 'ativa' : ''}`}
        title="Direita"
        onClick={() => editorAtivo.chain().focus().setTextAlign('right').run()}
      >
        ⫸
      </button>

      <button
        type="button"
        class={`fmt-btn ${editorAtivo.isActive('bulletList') ? 'ativa' : ''}`}
        title="Lista"
        onClick={() => editorAtivo.chain().focus().toggleBulletList().run()}
      >
        •
      </button>
      <button
        type="button"
        class={`fmt-btn ${editorAtivo.isActive('orderedList') ? 'ativa' : ''}`}
        title="Lista numerada"
        onClick={() => editorAtivo.chain().focus().toggleOrderedList().run()}
      >
        1.
      </button>
      {([1, 2, 3] as const).map((lvl) => (
        <button
          key={lvl}
          type="button"
          class={`fmt-btn ${editorAtivo.isActive('heading', { level: lvl }) ? 'ativa' : ''}`}
          title={`Título H${lvl}`}
          onClick={() => editorAtivo.chain().focus().toggleHeading({ level: lvl }).run()}
        >
          H{lvl}
        </button>
      ))}

      <button
        type="button"
        class={`fmt-btn ${editorAtivo.isActive('link') ? 'ativa' : ''}`}
        title="Link"
        onClick={() => {
          linkUrl.value = (editorAtivo.getAttributes('link').href as string | undefined) ?? '';
          linkAberto.value = !linkAberto.value;
        }}
      >
        🔗
      </button>

      {linkAberto.value ? (
        <div class="fmt-popover-caixa" onMouseDown={(e) => e.stopPropagation()}>
          <input
            type="text"
            placeholder="https://... ou mesa:..."
            value={linkUrl.value}
            onInput={(e) => {
              linkUrl.value = e.currentTarget.value;
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const href = linkUrl.value.trim();
                if (href) editorAtivo.chain().focus().setLink({ href }).run();
                else editorAtivo.chain().focus().unsetLink().run();
                linkAberto.value = false;
              }
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

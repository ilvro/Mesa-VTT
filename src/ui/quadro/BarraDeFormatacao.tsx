import type { Editor } from '@tiptap/core';
import { useSignal } from '@preact/signals';
import { caixaDe } from '../../dominio/geometria.ts';
import { familiaCss, FONTES } from '../../dominio/fontes.ts';
import { mundoParaTela, type Camera, type Tamanho } from '../../dominio/camera.ts';
import {
  CABECAS_SETA,
  IDS_FONTE,
  ROTAS_SETA,
  TRACEJADOS,
  type Cabeca,
  type DocRico,
  type EstiloDeCaixa,
  type EstiloDeTexto,
  type IdFonte,
  type Item,
  type NoRico,
} from '../../dominio/quadro.ts';
import {
  duplicar,
  levarParaTras,
  trazerParaFrente,
} from '../../dominio/quadro-operacoes.ts';
import { executar, itens, selecao } from '../../app/quadros.ts';
import { SeletorDeCor } from './SeletorDeCor.tsx';

const ROTULO_FONTE: Record<IdFonte, string> = {
  'open-sans': 'Open Sans',
  'pt-serif': 'PT Serif',
  hanken: 'Hanken',
  cinzel: 'Cinzel',
  caveat: 'Caveat',
  'jetbrains-mono': 'JetBrains Mono',
};

const FAMILIA_EDITOR: Record<IdFonte, string> = {
  'open-sans': 'Open Sans',
  'pt-serif': 'PT Serif',
  hanken: 'Hanken Grotesk',
  cinzel: 'Cinzel',
  caveat: 'Caveat',
  'jetbrains-mono': 'JetBrains Mono',
};

const TAMANHOS = [10, 12, 14, 16, 18, 20, 24, 28, 36, 48, 64, 96, 144];

function valorComum<T>(lista: T[]): T | null {
  if (lista.length === 0) return null;
  const primeiro = lista[0]!;
  for (let i = 1; i < lista.length; i++) {
    if (lista[i] !== primeiro) return null;
  }
  return primeiro;
}

function temMarcaEmTodoDoc(doc: DocRico, tipoMarca: string): boolean {
  let achouTexto = false;
  const visitar = (no: NoRico): boolean => {
    if (no.type === 'text' && (no.text ?? '').length > 0) {
      achouTexto = true;
      return Boolean(no.marks?.some((m) => m.type === tipoMarca));
    }
    if (!no.content) return true;
    return no.content.every(visitar);
  };
  const ok = doc.content.every(visitar);
  return achouTexto && ok;
}

function alternarMarcaNoDoc(doc: DocRico, tipoMarca: string, ativar: boolean): DocRico {
  const mapearNo = (no: NoRico): NoRico => {
    if (no.type === 'text') {
      const atuais = (no.marks ?? []).filter((m) => m.type !== tipoMarca);
      const marks = ativar ? [...atuais, { type: tipoMarca }] : atuais;
      return marks.length > 0 ? { ...no, marks } : { type: 'text', text: no.text ?? '' };
    }
    if (!no.content) return no;
    return { ...no, content: no.content.map(mapearNo) };
  };
  return { type: 'doc', content: doc.content.map(mapearNo) };
}

interface BarraDeFormatacaoProps {
  selecionados: Item[];
  camera: Camera;
  tamanhoTela: Tamanho;
  editorAtivo: Editor | null;
  novoId: () => string;
}

export function BarraDeFormatacao({
  selecionados,
  camera,
  tamanhoTela,
  editorAtivo,
  novoId,
}: BarraDeFormatacaoProps) {
  const caixaAberta = useSignal(false);
  const linkAberto = useSignal(false);
  const linkUrl = useSignal('');

  if (selecionados.length === 0) return null;

  // Posição acima da seleção, em coordenadas de tela
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity;
  for (const it of selecionados) {
    const c = caixaDe(it);
    if (c.x < minX) minX = c.x;
    if (c.y < minY) minY = c.y;
    if (c.x + c.largura > maxX) maxX = c.x + c.largura;
  }
  const topoTela = mundoParaTela(camera, { x: (minX + maxX) / 2, y: minY });
  const left = Math.min(Math.max(16, topoTela.x), Math.max(16, tamanhoTela.largura - 16));
  const top = Math.max(12, topoTela.y - 52);

  // Modo edição (TipTap ativo)
  if (editorAtivo && !editorAtivo.isDestroyed) {
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
            editorAtivo.chain().focus().setFontFamily(FAMILIA_EDITOR[id]).run();
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

  // Modo seleção (sem edição)
  const textuais = selecionados.filter(
    (i): i is Extract<Item, { tipo: 'texto' | 'forma' }> =>
      i.tipo === 'texto' || i.tipo === 'forma',
  );
  const todosTextuais = textuais.length === selecionados.length;
  const comCaixa = selecionados.filter(
    (i): i is Extract<Item, { tipo: 'texto' | 'forma' | 'imagem' | 'moldura' }> =>
      'caixa' in i,
  );
  const todosComCaixa = comCaixa.length === selecionados.length;
  const setas = selecionados.filter(
    (i): i is Extract<Item, { tipo: 'seta' }> => i.tipo === 'seta',
  );
  const todasSetas = setas.length === selecionados.length;

  const alterarSetas = (
    rotulo: string,
    fn: (s: Extract<Item, { tipo: 'seta' }>) => Partial<Extract<Item, { tipo: 'seta' }>>,
  ) => {
    const agora = Date.now();
    executar({
      rotulo,
      ops: [
        {
          alterar: setas.map((s) => ({
            id: s.id,
            antes: {
              cor: s.cor,
              espessura: s.espessura,
              tracejado: s.tracejado,
              rota: s.rota,
              inicio: s.inicio,
              fim: s.fim,
              de: s.de,
              para: s.para,
              atualizadoEm: s.atualizadoEm,
            },
            depois: { ...fn(s), atualizadoEm: agora },
          })),
        },
      ],
    });
  };

  const alterarTextuais = (
    rotulo: string,
    fn: (it: Extract<Item, { tipo: 'texto' | 'forma' }>) => Partial<Extract<Item, { tipo: 'texto' | 'forma' }>>,
  ) => {
    const agora = Date.now();
    executar({
      rotulo,
      ops: [
        {
          alterar: textuais.map((it) => {
            const mud = fn(it);
            return {
              id: it.id,
              antes: { texto: it.texto, doc: it.doc, atualizadoEm: it.atualizadoEm },
              depois: { ...mud, atualizadoEm: agora },
            };
          }),
        },
      ],
    });
  };

  const alterarCaixas = (
    rotulo: string,
    fn: (c: EstiloDeCaixa) => EstiloDeCaixa,
  ) => {
    const agora = Date.now();
    executar({
      rotulo,
      ops: [
        {
          alterar: comCaixa.map((it) => ({
            id: it.id,
            antes: { caixa: it.caixa, atualizadoEm: it.atualizadoEm },
            depois: { caixa: fn(it.caixa), atualizadoEm: agora },
          })),
        },
      ],
    });
  };

  const fonteComum = valorComum(textuais.map((i) => i.texto.fonte)) ?? '';
  const tamanhoComum = valorComum(textuais.map((i) => i.texto.tamanho));
  const corTextoComum = valorComum(textuais.map((i) => i.texto.cor));
  const fundoComum = valorComum(comCaixa.map((i) => i.caixa.fundo));
  const todosTravados = selecionados.every((i) => i.travado);
  const todosSoMestre = selecionados.every((i) => i.soMestre);

  return (
    <div
      class="barra-formatacao"
      data-testid="barra-formatacao"
      style={{ left: `${left}px`, top: `${top}px` }}
      onPointerDown={(e) => e.stopPropagation()}
      onDblClick={(e) => e.stopPropagation()}
    >
      {todosTextuais ? (
        <>
          <select
            class="fmt-select"
            aria-label="Fonte"
            data-testid="fmt-fonte"
            value={fonteComum}
            onChange={(e) => {
              const fonte = e.currentTarget.value as IdFonte;
              if (!fonte) return;
              alterarTextuais('Fonte', (it) => ({
                texto: { ...it.texto, fonte },
              }));
            }}
          >
            {fonteComum === '' ? <option value="">Misto</option> : null}
            {IDS_FONTE.map((id) => (
              <option key={id} value={id}>
                {ROTULO_FONTE[id]}
              </option>
            ))}
          </select>

          <input
            type="number"
            class="fmt-input-num"
            aria-label="Tamanho da fonte"
            data-testid="fmt-tamanho"
            min={6}
            max={400}
            value={tamanhoComum ?? ''}
            placeholder="—"
            onChange={(e) => {
              const tamanho = Number(e.currentTarget.value);
              if (!Number.isFinite(tamanho) || tamanho < 6 || tamanho > 400) return;
              alterarTextuais('Tamanho do texto', (it) => ({
                texto: { ...it.texto, tamanho },
              }));
            }}
          />

          <SeletorDeCor
            valor={corTextoComum}
            rotulo="Cor do texto"
            testIdPrefix="fmt-cor-texto"
            onEscolher={(cor) => {
              if (!cor) return;
              alterarTextuais('Cor do texto', (it) => ({
                texto: { ...it.texto, cor },
              }));
            }}
          />

          <button
            type="button"
            class={`fmt-btn ${textuais.every((i) => temMarcaEmTodoDoc(i.doc, 'bold')) ? 'ativa' : ''}`}
            data-testid="fmt-negrito"
            title="Negrito"
            onClick={() => {
              const ativar = !textuais.every((i) => temMarcaEmTodoDoc(i.doc, 'bold'));
              alterarTextuais('Negrito', (it) => ({
                doc: alternarMarcaNoDoc(it.doc, 'bold', ativar),
              }));
            }}
          >
            <b>B</b>
          </button>

          <button
            type="button"
            class={`fmt-btn ${textuais.every((i) => temMarcaEmTodoDoc(i.doc, 'italic')) ? 'ativa' : ''}`}
            data-testid="fmt-italico"
            title="Itálico"
            onClick={() => {
              const ativar = !textuais.every((i) => temMarcaEmTodoDoc(i.doc, 'italic'));
              alterarTextuais('Itálico', (it) => ({
                doc: alternarMarcaNoDoc(it.doc, 'italic', ativar),
              }));
            }}
          >
            <i>I</i>
          </button>

          <select
            class="fmt-select fmt-select-pequeno"
            aria-label="Alinhamento"
            data-testid="fmt-alinhamento"
            value={valorComum(textuais.map((i) => i.texto.alinhamento)) ?? ''}
            onChange={(e) => {
              const alinhamento = e.currentTarget.value as EstiloDeTexto['alinhamento'];
              if (!alinhamento) return;
              alterarTextuais('Alinhamento', (it) => ({
                texto: { ...it.texto, alinhamento },
              }));
            }}
          >
            <option value="esquerda">Esq</option>
            <option value="centro">Cen</option>
            <option value="direita">Dir</option>
            <option value="justificado">Just</option>
          </select>

          <select
            class="fmt-select fmt-select-pequeno"
            aria-label="Alinhamento vertical"
            data-testid="fmt-vertical"
            value={valorComum(textuais.map((i) => i.texto.vertical)) ?? ''}
            onChange={(e) => {
              const vertical = e.currentTarget.value as EstiloDeTexto['vertical'];
              if (!vertical) return;
              alterarTextuais('Alinhamento vertical', (it) => ({
                texto: { ...it.texto, vertical },
              }));
            }}
          >
            <option value="topo">Topo</option>
            <option value="meio">Meio</option>
            <option value="base">Base</option>
          </select>
        </>
      ) : null}

      {todosComCaixa ? (
        <>
          <SeletorDeCor
            valor={fundoComum}
            permiteNula
            rotulo="Cor de fundo"
            testIdPrefix="fmt-fundo"
            onEscolher={(fundo) => {
              alterarCaixas('Fundo', (c) => ({ ...c, fundo }));
            }}
          />

          <button
            type="button"
            class="fmt-btn"
            data-testid="fmt-caixa-opcoes"
            title="Opções da caixa (borda, opacidade, raio)"
            onClick={() => {
              caixaAberta.value = !caixaAberta.value;
            }}
          >
            ▢
          </button>

          {caixaAberta.value ? (
            <div class="fmt-popover-caixa" data-testid="fmt-popover-caixa">
              <label class="painel-fundo-linha">
                <span class="meta">Opacidade</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={valorComum(comCaixa.map((i) => i.caixa.opacidade)) ?? 1}
                  onInput={(e) => {
                    const opacidade = Number(e.currentTarget.value);
                    alterarCaixas('Opacidade', (c) => ({ ...c, opacidade }));
                  }}
                />
              </label>
              <label class="painel-fundo-linha">
                <span class="meta">Borda (px)</span>
                <input
                  type="number"
                  class="fmt-input-num"
                  min={0}
                  max={24}
                  value={valorComum(comCaixa.map((i) => i.caixa.espessuraBorda)) ?? 0}
                  onChange={(e) => {
                    const espessuraBorda = Math.max(0, Number(e.currentTarget.value));
                    alterarCaixas('Espessura da borda', (c) => ({
                      ...c,
                      espessuraBorda,
                      borda: espessuraBorda > 0 ? (c.borda ?? '#e8efe9') : c.borda,
                    }));
                  }}
                />
              </label>
              <label class="painel-fundo-linha">
                <span class="meta">Raio (px)</span>
                <input
                  type="number"
                  class="fmt-input-num"
                  min={0}
                  max={64}
                  value={valorComum(comCaixa.map((i) => i.caixa.raio)) ?? 0}
                  onChange={(e) => {
                    const raio = Math.max(0, Number(e.currentTarget.value));
                    alterarCaixas('Raio', (c) => ({ ...c, raio }));
                  }}
                />
              </label>
              <label class="painel-fundo-linha">
                <span class="meta">Padding</span>
                <input
                  type="number"
                  class="fmt-input-num"
                  min={0}
                  max={64}
                  value={valorComum(comCaixa.map((i) => i.caixa.padding)) ?? 8}
                  onChange={(e) => {
                    const padding = Math.max(0, Number(e.currentTarget.value));
                    alterarCaixas('Padding', (c) => ({ ...c, padding }));
                  }}
                />
              </label>
              <label class="painel-fundo-check">
                <input
                  type="checkbox"
                  checked={comCaixa.every((i) => i.caixa.sombra)}
                  onChange={(e) => {
                    const sombra = e.currentTarget.checked;
                    alterarCaixas('Sombra', (c) => ({ ...c, sombra }));
                  }}
                />
                <span>Sombra</span>
              </label>
            </div>
          ) : null}
        </>
      ) : null}

      {todasSetas ? (
        <>
          <SeletorDeCor
            valor={valorComum(setas.map((s) => s.cor))}
            rotulo="Cor da seta"
            testIdPrefix="fmt-seta-cor"
            onEscolher={(cor) => {
              if (cor) alterarSetas('Cor da seta', () => ({ cor }));
            }}
          />
          <input
            type="number"
            class="fmt-input-num"
            data-testid="fmt-seta-espessura"
            title="Espessura (1–12)"
            min={1}
            max={12}
            value={valorComum(setas.map((s) => s.espessura)) ?? 2}
            onChange={(e) => {
              const espessura = Math.max(1, Math.min(12, Number(e.currentTarget.value) || 2));
              alterarSetas('Espessura da seta', () => ({ espessura }));
            }}
          />
          <select
            class="fmt-select"
            data-testid="fmt-seta-tracejado"
            aria-label="Tracejado da seta"
            value={valorComum(setas.map((s) => s.tracejado)) ?? ''}
            onChange={(e) => {
              const v = e.currentTarget.value as (typeof TRACEJADOS)[number];
              if (v) alterarSetas('Tracejado da seta', () => ({ tracejado: v }));
            }}
          >
            {TRACEJADOS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <select
            class="fmt-select"
            data-testid="fmt-seta-rota"
            aria-label="Rota da seta"
            value={valorComum(setas.map((s) => s.rota)) ?? ''}
            onChange={(e) => {
              const v = e.currentTarget.value as (typeof ROTAS_SETA)[number];
              if (v) alterarSetas('Rota da seta', () => ({ rota: v }));
            }}
          >
            {ROTAS_SETA.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <select
            class="fmt-select"
            data-testid="fmt-seta-inicio"
            aria-label="Ponta inicial"
            value={valorComum(setas.map((s) => s.inicio)) ?? ''}
            onChange={(e) => {
              const v = e.currentTarget.value as Cabeca;
              if (v) alterarSetas('Ponta inicial', () => ({ inicio: v }));
            }}
          >
            {CABECAS_SETA.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select
            class="fmt-select"
            data-testid="fmt-seta-fim"
            aria-label="Ponta final"
            value={valorComum(setas.map((s) => s.fim)) ?? ''}
            onChange={(e) => {
              const v = e.currentTarget.value as Cabeca;
              if (v) alterarSetas('Ponta final', () => ({ fim: v }));
            }}
          >
            {CABECAS_SETA.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <button
            type="button"
            class="fmt-btn"
            data-testid="fmt-seta-inverter"
            title="Inverter sentido"
            onClick={() => {
              alterarSetas('Inverter seta', (s) => ({
                de: s.para,
                para: s.de,
                inicio: s.fim,
                fim: s.inicio,
              }));
            }}
          >
            ⇄
          </button>
        </>
      ) : null}

      <span class="fmt-sep" />

      <button
        type="button"
        class="fmt-btn"
        data-testid="fmt-frente"
        title="Trazer para frente"
        onClick={() => executar(trazerParaFrente(itens.value, selecao.value))}
      >
        ↑
      </button>
      <button
        type="button"
        class="fmt-btn"
        data-testid="fmt-tras"
        title="Levar para trás"
        onClick={() => executar(levarParaTras(itens.value, selecao.value))}
      >
        ↓
      </button>
      <button
        type="button"
        class={`fmt-btn ${todosTravados ? 'ativa' : ''}`}
        data-testid="fmt-travar"
        title={todosTravados ? 'Destravar' : 'Travar'}
        onClick={() => {
          const travado = !todosTravados;
          const agora = Date.now();
          executar({
            rotulo: travado ? 'Travar' : 'Destravar',
            ops: [
              {
                alterar: selecionados.map((i) => ({
                  id: i.id,
                  antes: { travado: i.travado, atualizadoEm: i.atualizadoEm },
                  depois: { travado, atualizadoEm: agora },
                })),
              },
            ],
          });
        }}
      >
        🔒
      </button>
      <button
        type="button"
        class={`fmt-btn ${todosSoMestre ? 'ativa' : ''}`}
        data-testid="fmt-so-mestre"
        title="Só mestre"
        onClick={() => {
          const soMestre = !todosSoMestre;
          const agora = Date.now();
          executar({
            rotulo: 'Visibilidade',
            ops: [
              {
                alterar: selecionados.map((i) => ({
                  id: i.id,
                  antes: { soMestre: i.soMestre, atualizadoEm: i.atualizadoEm },
                  depois: { soMestre, atualizadoEm: agora },
                })),
              },
            ],
          });
        }}
      >
        👁
      </button>
      <button
        type="button"
        class="fmt-btn"
        data-testid="fmt-duplicar"
        title="Duplicar (Ctrl+D)"
        onClick={() => {
          const maxZ = Math.max(0, ...[...itens.value.values()].map((i) => i.z));
          const passo = duplicar(selecionados, novoId, { dx: 24, dy: 24 }, {
            agora: Date.now(),
            zBase: maxZ + 1,
          });
          executar(passo);
          const criados = (passo.ops[0] as { criar: Item[] } | undefined)?.criar ?? [];
          selecao.value = new Set(criados.map((i) => i.id));
        }}
      >
        ⧉
      </button>
      <button
        type="button"
        class="fmt-btn fmt-btn-perigo"
        data-testid="fmt-apagar"
        title="Apagar (Delete)"
        onClick={() => {
          executar({ rotulo: 'Remover', ops: [{ remover: selecionados }] });
          selecao.value = new Set();
        }}
      >
        ✕
      </button>
    </div>
  );
}

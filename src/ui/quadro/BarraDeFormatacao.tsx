import type { Editor } from '@tiptap/core';
import { useSignal } from '@preact/signals';
import { caixaDe } from '../../dominio/geometria.ts';
import { FONTES } from '../../dominio/fontes.ts';
import { mundoParaTela, type Camera, type Tamanho } from '../../dominio/camera.ts';
import {
  CABECAS_SETA,
  IDS_FONTE,
  ROTAS_SETA,
  TIPOS_SEMANTICOS,
  TRACEJADOS,
  type Cabeca,
  type DocRico,
  type EstiloDeTexto,
  type IdFonte,
  type Item,
  type NoRico,
  type TipoSemantico,
} from '../../dominio/quadro.ts';
import { NOMES_SEMANTICOS } from '../../dominio/paleta.ts';
import {
  agruparSelecao,
  alinharSelecao,
  desagruparSelecao,
  distribuirSelecao,
  paletaDaCampanha,
} from '../../app/quadros.ts';
import {
  alterarCaixasSelecao as alterarCaixas,
  alterarSetasSelecao as alterarSetas,
  alterarTextuaisSelecao as alterarTextuais,
  alterarTracosSelecao as alterarTracos,
  alternarSoMestreSelecao,
  alternarTravadoSelecao,
  duplicarSelecao,
  levarSelecaoParaTras,
  removerSelecao,
  trazerSelecaoParaFrente,
} from '../../app/quadro-acoes.ts';
import type { ModoAlinhamento } from '../../dominio/alinhamento.ts';
import { BarraEditorTexto } from './BarraEditorTexto.tsx';
import { SeletorDeCor } from './SeletorDeCor.tsx';

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
    return <BarraEditorTexto editorAtivo={editorAtivo} left={left} top={top} />;
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
  const tracos = selecionados.filter(
    (i): i is Extract<Item, { tipo: 'traco' }> => i.tipo === 'traco',
  );
  const todosTracos = tracos.length === selecionados.length;

  const fonteComum = valorComum(textuais.map((i) => i.texto.fonte)) ?? '';
  const semanticaComum = valorComum(textuais.map((i) => i.semantica ?? ''));
  const tamanhoComum = valorComum(textuais.map((i) => i.texto.tamanho));
  const corTextoComum = valorComum(textuais.map((i) => i.texto.cor));
  const fundoComum = valorComum(comCaixa.map((i) => i.caixa.fundo));
  const coresPaleta = Object.values(paletaDaCampanha.value);
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
            aria-label="Tipo semântico"
            data-testid="fmt-semantica"
            value={semanticaComum ?? ''}
            onChange={(e) => {
              const v = e.currentTarget.value as TipoSemantico | '';
              alterarTextuais('Tipo semântico', (it) => ({
                semantica: v ? v : null,
                caixa: { ...it.caixa, fundo: null },
              }));
            }}
          >
            <option value="">Sem tipo</option>
            {TIPOS_SEMANTICOS.map((t) => (
              <option key={t} value={t}>
                {NOMES_SEMANTICOS[t]}
              </option>
            ))}
          </select>

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
                {FONTES[id].nome}
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
            coresSemanticas={coresPaleta}
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
            type="range"
            data-testid="fmt-seta-espessura-range"
            title="Espessura (1–48)"
            min={1}
            max={48}
            style={{ width: '68px' }}
            value={valorComum(setas.map((s) => s.espessura)) ?? 2}
            onInput={(e) => {
              const espessura = Math.max(1, Math.min(48, Number(e.currentTarget.value) || 2));
              alterarSetas('Espessura da seta', () => ({ espessura }));
            }}
          />
          <input
            type="number"
            class="fmt-input-num"
            data-testid="fmt-seta-espessura"
            title="Espessura (1–48)"
            min={1}
            max={48}
            value={valorComum(setas.map((s) => s.espessura)) ?? 2}
            onChange={(e) => {
              const espessura = Math.max(1, Math.min(48, Number(e.currentTarget.value) || 2));
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

      {todosTracos ? (
        <>
          <SeletorDeCor
            valor={valorComum(tracos.map((t) => t.cor))}
            rotulo="Cor do traço"
            testIdPrefix="fmt-traco-cor"
            onEscolher={(cor) => {
              if (cor) alterarTracos('Cor do traço', () => ({ cor }));
            }}
          />
          <input
            type="number"
            class="fmt-input-num"
            data-testid="fmt-traco-espessura"
            title="Espessura (1–48)"
            min={1}
            max={48}
            value={valorComum(tracos.map((t) => t.espessura)) ?? 4}
            onChange={(e) => {
              const espessura = Math.max(1, Math.min(48, Number(e.currentTarget.value) || 4));
              alterarTracos('Espessura do traço', () => ({ espessura }));
            }}
          />
        </>
      ) : null}

      {selecionados.length >= 2 ? (
        <>
          <span class="fmt-sep" />
          <button
            type="button"
            class="fmt-btn"
            data-testid="fmt-agrupar"
            title="Agrupar (Ctrl+G)"
            onClick={() => agruparSelecao(novoId())}
          >
            ⊞
          </button>
          {selecionados.some((i) => i.grupoId !== null) ? (
            <button
              type="button"
              class="fmt-btn"
              data-testid="fmt-desagrupar"
              title="Desagrupar (Ctrl+Shift+G)"
              onClick={() => desagruparSelecao()}
            >
              ⊟
            </button>
          ) : null}
          {(
            [
              ['esquerda', '⇤'],
              ['centro-h', '⇔'],
              ['direita', '⇥'],
              ['topo', '⤒'],
              ['centro-v', '⇕'],
              ['base', '⤓'],
            ] as [ModoAlinhamento, string][]
          ).map(([modo, icone]) => (
            <button
              key={modo}
              type="button"
              class="fmt-btn"
              data-testid={`fmt-alinhar-${modo}`}
              title={`Alinhar: ${modo}`}
              onClick={() => alinharSelecao(modo)}
            >
              {icone}
            </button>
          ))}
          {selecionados.length >= 3 ? (
            <>
              <button
                type="button"
                class="fmt-btn"
                data-testid="fmt-distribuir-h"
                title="Distribuir horizontalmente"
                onClick={() => distribuirSelecao('h')}
              >
                |||
              </button>
              <button
                type="button"
                class="fmt-btn"
                data-testid="fmt-distribuir-v"
                title="Distribuir verticalmente"
                onClick={() => distribuirSelecao('v')}
              >
                ☰
              </button>
            </>
          ) : null}
        </>
      ) : null}

      <span class="fmt-sep" />

      <button
        type="button"
        class="fmt-btn"
        data-testid="fmt-frente"
        title="Trazer para frente"
        onClick={() => trazerSelecaoParaFrente()}
      >
        ↑
      </button>
      <button
        type="button"
        class="fmt-btn"
        data-testid="fmt-tras"
        title="Levar para trás"
        onClick={() => levarSelecaoParaTras()}
      >
        ↓
      </button>
      <button
        type="button"
        class={`fmt-btn ${todosTravados ? 'ativa' : ''}`}
        data-testid="fmt-travar"
        title={todosTravados ? 'Destravar' : 'Travar'}
        onClick={() => alternarTravadoSelecao()}
      >
        🔒
      </button>
      <button
        type="button"
        class={`fmt-btn ${todosSoMestre ? 'ativa' : ''}`}
        data-testid="fmt-so-mestre"
        title="Só mestre"
        onClick={() => alternarSoMestreSelecao(false)}
      >
        👁
      </button>
      <button
        type="button"
        class="fmt-btn"
        data-testid="fmt-duplicar"
        title="Duplicar (Ctrl+D)"
        onClick={() => {
          duplicarSelecao(novoId);
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
          removerSelecao('Remover');
        }}
      >
        ✕
      </button>
    </div>
  );
}

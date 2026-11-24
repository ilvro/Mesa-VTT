import { docParaHtml } from '../../dominio/doc-rico.ts';
import { chaveDaCondicao, type EstadoDoMundo } from '../../dominio/estado-do-mundo.ts';
import { classificarRef } from '../../dominio/ligacoes-quadro.ts';
import { decorarMarcadores } from '../../dominio/paleta.ts';
import type { DocRico } from '../../dominio/quadro.ts';
import { lerRef } from '#mesa';
import { abrirNoApp } from '../../app/barramento.ts';
import { entidades } from '../../app/campanha.ts';
import { ancorasDoItem, focarRefNoQuadro } from '../../app/foco-do-quadro.ts';
import { alternarFato } from '../../app/quadros.ts';
import { abrirEntidade } from '../../app/rotas.ts';
import { abrirMenuContexto, acoesParaEntidade, acoesParaRef } from '../MenuDeContexto.tsx';

export const ALINHAMENTO_CSS = {
  esquerda: 'left',
  centro: 'center',
  direita: 'right',
  justificado: 'justify',
} as const;

export const VERTICAL_CSS = {
  topo: 'flex-start',
  meio: 'center',
  base: 'flex-end',
} as const;

export function aoClicarTextoDecorado(e: MouseEvent): void {
  const alvo = e.target as HTMLElement | null;
  if (!alvo) return;
  const elCond = alvo.closest<HTMLElement>('[data-condicao]');
  if (elCond) {
    e.preventDefault();
    e.stopPropagation();
    const cond = elCond.dataset.condicao;
    if (cond) void alternarFato(chaveDaCondicao(cond));
    return;
  }
  const elEnt = alvo.closest<HTMLElement>('[data-entidade-id]');
  if (elEnt) {
    e.preventDefault();
    e.stopPropagation();
    const id = elEnt.dataset.entidadeId;
    if (id) abrirEntidade(id);
    return;
  }
  const elMesa = alvo.closest<HTMLElement>('a[data-mesa-ref]');
  if (elMesa) {
    e.preventDefault();
    e.stopPropagation();
    const ref = lerRef(elMesa.dataset.mesaRef ?? '');
    if (!ref) return;
    const classe = classificarRef(ref);
    if (classe === 'item' || classe === 'quadro') {
      void focarRefNoQuadro(ref, { abrirEspiar: false });
    } else if (classe === 'entidade') {
      abrirEntidade(ref.id);
    } else {
      void abrirNoApp(ref);
    }
    return;
  }
  const elRef = alvo.closest<HTMLElement>('[data-ref-app]');
  if (elRef && elRef.dataset.refApp && elRef.dataset.refTipo && elRef.dataset.refId) {
    e.preventDefault();
    e.stopPropagation();
    void abrirNoApp({
      app: elRef.dataset.refApp as 'mesa',
      tipo: elRef.dataset.refTipo,
      id: elRef.dataset.refId,
    });
  }
}

export function aoContextMenuTextoDecorado(e: MouseEvent): void {
  const alvo = e.target as HTMLElement | null;
  if (!alvo) return;
  const elEnt = alvo.closest<HTMLElement>('[data-entidade-id]');
  if (elEnt) {
    const id = elEnt.dataset.entidadeId;
    const ent = id ? entidades.value.find((x) => x.id === id) : undefined;
    if (ent) abrirMenuContexto(e, acoesParaEntidade(ent), ent.nome);
    return;
  }
  const elRef = alvo.closest<HTMLElement>('[data-ref-app]');
  if (elRef && elRef.dataset.refApp && elRef.dataset.refTipo && elRef.dataset.refId) {
    abrirMenuContexto(
      e,
      acoesParaRef({
        app: elRef.dataset.refApp as 'mesa',
        tipo: elRef.dataset.refTipo,
        id: elRef.dataset.refId,
      }),
    );
  }
}

export function PinoAncora({ quadroId, itemId }: { quadroId: string; itemId: string }) {
  const ancs = ancorasDoItem(quadroId, itemId);
  if (ancs.length === 0) return null;
  return (
    <button
      type="button"
      class="item-pino-ancora"
      title={`Ver no mapa (${ancs[0]!.para.tipo}: ${ancs[0]!.para.id})`}
      data-testid={`pino-ancora-${itemId}`}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        void abrirNoApp(ancs[0]!.para);
      }}
    >
      📍
    </button>
  );
}

export function ConteudoDecorado({
  doc,
  estado,
  className = 'item-texto-conteudo doc-rico-html',
}: {
  doc: DocRico;
  estado?: EstadoDoMundo;
  className?: string;
}) {
  return (
    <div
      class={className}
      onClick={aoClicarTextoDecorado}
      onContextMenu={aoContextMenuTextoDecorado}
      onPointerDown={(e) => {
        if ((e.target as HTMLElement | null)?.closest('[data-entidade-id],[data-ref-app],[data-condicao],a[href]')) {
          e.stopPropagation();
        }
      }}
      dangerouslySetInnerHTML={{
        __html: docParaHtml(doc, {
          decorar: (t) => decorarMarcadores(t, entidades.value, estado),
        }),
      }}
    />
  );
}

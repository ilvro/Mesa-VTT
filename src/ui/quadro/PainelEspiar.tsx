import { docParaHtml } from '../../dominio/doc-rico.ts'
import { decorarMarcadores, NOMES_SEMANTICOS } from '../../dominio/paleta.ts'
import { abrirNoApp } from '../../app/barramento.ts'
import { entidades } from '../../app/campanha.ts'
import {
  espiarAtivo,
  focarRefNoQuadro,
  pedidoFocarItem,
  type ItemAncorado,
} from '../../app/foco-do-quadro.ts'
import {
  abrirQuadro,
  estadoDoMundo,
  itens,
  marcarFeito,
  quadroAberto,
} from '../../app/quadros.ts'
import { navegarParaQuadro, tela } from '../../app/rotas.ts'
import { aoClicarTextoDecorado } from './TextoDecorado.tsx'

export function PainelEspiar() {
  const estado = espiarAtivo.value
  if (!estado) return null

  const { alvo, itens: listaAncorados } = estado
  const listaEntidades = entidades.value
  const mundo = estadoDoMundo.value

  const irParaItem = async (anc: ItemAncorado) => {
    if (quadroAberto.value?.id !== anc.quadroId) {
      await abrirQuadro(anc.quadroId)
    }
    if (tela.value !== 'sessao') {
      navegarParaQuadro(anc.quadroId)
    }
    pedidoFocarItem.value = { quadroId: anc.quadroId, itemId: anc.item.id }
  }

  const alternarFeitoEspiar = async (anc: ItemAncorado) => {
    if (quadroAberto.value?.id !== anc.quadroId) {
      await abrirQuadro(anc.quadroId)
    }
    marcarFeito([anc.item.id])
    void focarRefNoQuadro(alvo, { abrirEspiar: true })
  }

  return (
    <aside
      class="painel-fundo painel-espiar"
      data-testid="painel-espiar"
      onPointerDown={(e) => e.stopPropagation()}
      onDblClick={(e) => e.stopPropagation()}
    >
      <div class="painel-fundo-topo">
        <div>
          <strong class="faixa pequena">Espiar</strong>
          <span class="meta" style={{ marginLeft: '8px' }} data-testid="espiar-alvo">
            {alvo.app}/{alvo.tipo}: {alvo.id}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '4px' }}>
          {alvo.app === 'atlas' ? (
            <button
              type="button"
              class="botao-pilula pequeno"
              data-testid="espiar-ver-no-mapa"
              onClick={() => {
                void abrirNoApp(alvo)
              }}
            >
              Ver no mapa
            </button>
          ) : null}
          <button
            type="button"
            class="botao-pilula pequeno"
            data-testid="espiar-fechar"
            onClick={() => {
              espiarAtivo.value = null
            }}
          >
            Fechar
          </button>
        </div>
      </div>

      {listaAncorados.length === 0 ? (
        <p class="quadro-painel-vazio" data-testid="espiar-vazio">
          Nenhum cartão ancorado a este elemento nos quadros da campanha.
        </p>
      ) : (
        <ul class="espiar-lista" data-testid="espiar-lista">
          {listaAncorados.map((anc) => {
            const itemvivo =
              quadroAberto.value?.id === anc.quadroId
                ? (itens.value.get(anc.item.id) ?? anc.item)
                : anc.item
            const html =
              itemvivo.tipo === 'texto' || itemvivo.tipo === 'forma'
                ? docParaHtml(itemvivo.doc, {
                    decorar: (t: string) =>
                      decorarMarcadores(t, listaEntidades, mundo),
                  })
                : itemvivo.tipo === 'moldura'
                  ? itemvivo.titulo
                  : itemvivo.tipo
            const sem =
              itemvivo.tipo === 'texto' || itemvivo.tipo === 'forma'
                ? itemvivo.semantica
                : null

            return (
              <li
                key={`${anc.quadroId}/${itemvivo.id}`}
                class="espiar-cartao"
                data-testid={`espiar-item-${itemvivo.id}`}
              >
                <div class="espiar-cartao-topo">
                  <span class="meta">{anc.nomeDoQuadro}</span>
                  {sem ? (
                    <span class="selo pequeno">{NOMES_SEMANTICOS[sem]}</span>
                  ) : null}
                </div>
                <div
                  class="espiar-cartao-corpo item-texto-html"
                  onClick={aoClicarTextoDecorado}
                  dangerouslySetInnerHTML={{ __html: html }}
                />
                <div class="espiar-cartao-acoes">
                  <button
                    type="button"
                    class={`botao-pilula pequeno ${itemvivo.feito ? 'destaque' : ''}`}
                    data-testid={`espiar-feito-${itemvivo.id}`}
                    onClick={() => void alternarFeitoEspiar(anc)}
                  >
                    {itemvivo.feito ? '✓ Feito' : 'Marcar ✓'}
                  </button>
                  <button
                    type="button"
                    class="botao-pilula pequeno"
                    data-testid={`espiar-ir-${itemvivo.id}`}
                    onClick={() => void irParaItem(anc)}
                  >
                    Ir para no quadro
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </aside>
  )
}

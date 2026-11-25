import { useSignal } from '@preact/signals'
import { useMemo } from 'preact/hooks'
import { entidades } from '../../app/campanha.ts'
import { executar, paletaDaCampanha } from '../../app/quadros.ts'
import { ordemDeLeitura, type ItemMoldura } from '../../dominio/molduras.ts'
import { refDaEntidade, sugerirEntidades } from '../../dominio/notas.ts'
import { NOMES_SEMANTICOS } from '../../dominio/paleta.ts'
import {
  ehConflitoOuSaida,
  ehDoAssistente,
  passoDeRevisaoEmMassa,
  resumoDaRevisao,
  type ResumoPorTipo,
} from '../../dominio/revisao.ts'
import {
  docDeTexto,
  novaRef,
  textoPuro,
  TIPOS_SEMANTICOS,
  type Item,
  type TipoSemantico,
} from '../../dominio/quadro.ts'

interface FilaDeRevisaoProps {
  itens: ReadonlyMap<string, Item>
  onFocarItem: (item: Item) => void
  onFechar: () => void
}

interface GrupoRevisao {
  molduraId: string | null
  titulo: string
  itens: Item[]
}

function ordenarItensEmLeitura(lista: Item[]): Item[] {
  return [...lista].sort((a, b) => a.y - b.y || a.x - b.x || a.id.localeCompare(b.id))
}

function resumoDoItem(item: Item): string {
  if (item.tipo === 'texto' || item.tipo === 'forma') {
    const t = textoPuro(item.doc).replace(/\s+/g, ' ').trim()
    return t ? (t.length > 90 ? `${t.slice(0, 90)}…` : t) : '(Sem texto)'
  }
  if (item.tipo === 'moldura') return item.titulo || 'Moldura'
  if (item.tipo === 'seta') return item.rotulo || 'Seta'
  return item.tipo
}

export function FilaDeRevisao({ itens, onFocarItem, onFechar }: FilaDeRevisaoProps) {
  const confirmandoMolduraId = useSignal<string | null>(null)
  const ligandoItemId = useSignal<string | null>(null)
  const buscaEntidade = useSignal('')
  const pulados = useSignal<string[]>([])
  // Filtro da lista: 'sem' = sem sugestão, 'conflitos' = conflitos e saídas do Miro.
  const filtro = useSignal<TipoSemantico | 'sem' | 'conflitos' | null>(null)
  const confirmandoDescarte = useSignal(false)
  const confirmandoMassa = useSignal<string | null>(null)
  const limiteExibido = useSignal(80)

  const { moldurasOrdenadas, todosEmRevisao, resumo, doAssistente, emRevisao, grupos } = useMemo(() => {
    const molduras: ItemMoldura[] = []
    const revisao: Item[] = []
    for (const i of itens.values()) {
      if (i.tipo === 'moldura') molduras.push(i)
      if (i.revisao) revisao.push(i)
    }
    const moldOrd = ordemDeLeitura(molduras)
    const res = resumoDaRevisao(revisao)
    const f = filtro.value
    const passa = (i: Item): boolean => {
      if (!f) return true
      if (ehConflitoOuSaida(i)) return f === 'conflitos'
      return f === (i.revisao?.tipoSugerido ?? 'sem')
    }
    const assistente: Item[] = []
    const restantes: Item[] = []
    for (const i of revisao) {
      if (ehDoAssistente(i)) assistente.push(i)
      else if (passa(i)) restantes.push(i)
    }

    const porMoldura = new Map<string, Item[]>()
    const semMold: Item[] = []
    const idsMold = new Set(moldOrd.map((m) => m.id))
    for (const i of restantes) {
      if (i.molduraId && idsMold.has(i.molduraId)) {
        const lista = porMoldura.get(i.molduraId)
        if (lista) lista.push(i)
        else porMoldura.set(i.molduraId, [i])
      } else {
        semMold.push(i)
      }
    }

    const grps: GrupoRevisao[] = []
    for (const m of moldOrd) {
      const daMoldura = porMoldura.get(m.id)
      if (daMoldura && daMoldura.length > 0) {
        grps.push({
          molduraId: m.id,
          titulo: m.titulo || 'Moldura',
          itens: ordenarItensEmLeitura(daMoldura),
        })
      }
    }
    if (semMold.length > 0) {
      grps.push({
        molduraId: null,
        titulo: 'Fora de molduras',
        itens: ordenarItensEmLeitura(semMold),
      })
    }

    return {
      moldurasOrdenadas: moldOrd,
      todosEmRevisao: revisao,
      resumo: res,
      doAssistente: ordenarItensEmLeitura(assistente),
      emRevisao: restantes,
      grupos: grps,
    }
  }, [itens, filtro.value])
  const chaveDoTipo = (r: ResumoPorTipo) => r.tipo ?? 'sem'

  const descartarDoAssistente = () => {
    if (doAssistente.length > 0) {
      executar({ rotulo: `Descartar ${doAssistente.length} do assistente`, ops: [{ remover: doAssistente }] })
    }
    confirmandoDescarte.value = false
  }

  const aplicarTipo = (item: Item, novoTipo: TipoSemantico | null, rotulo: string) => {
    if (item.tipo === 'texto' || item.tipo === 'forma') {
      executar({
        rotulo,
        ops: [
          {
            alterar: [
              {
                id: item.id,
                antes: { semantica: item.semantica, revisao: item.revisao },
                depois: { semantica: novoTipo, revisao: undefined },
              },
            ],
          },
        ],
      })
    } else {
      executar({
        rotulo,
        ops: [
          {
            alterar: [
              {
                id: item.id,
                antes: { revisao: item.revisao },
                depois: { revisao: undefined },
              },
            ],
          },
        ],
      })
    }
  }

  const aceitarEmMassa = (r: ResumoPorTipo) => {
    const passo = passoDeRevisaoEmMassa(
      itens,
      r.ids,
      r.tipo,
      r.tipo ? `Aceitar ${r.quantidade} (${NOMES_SEMANTICOS[r.tipo]})` : `Aceitar ${r.quantidade} sem tipo`,
    )
    if (passo.ops.length > 0) executar(passo)
    confirmandoMassa.value = null
  }

  const aceitarMoldura = (grupo: GrupoRevisao) => {
    const alteracoes = grupo.itens.filter((i) => !ehConflitoOuSaida(i)).map((item) => {
      const sugerido = item.revisao?.tipoSugerido ?? null
      if (item.tipo === 'texto' || item.tipo === 'forma') {
        return {
          id: item.id,
          antes: { semantica: item.semantica, revisao: item.revisao },
          depois: { semantica: sugerido, revisao: undefined },
        }
      }
      return {
        id: item.id,
        antes: { revisao: item.revisao },
        depois: { revisao: undefined },
      }
    })
    if (alteracoes.length > 0) {
      executar({
        rotulo: `Aceitar revisão de ${grupo.titulo}`,
        ops: [{ alterar: alteracoes }],
      })
    }
    confirmandoMolduraId.value = null
  }

  const pularItem = (item: Item) => {
    const todosOrdenados = [...doAssistente, ...grupos.flatMap((g) => g.itens)]
    const idx = todosOrdenados.findIndex((i) => i.id === item.id)
    const proximo =
      idx >= 0 && todosOrdenados.length > 1
        ? todosOrdenados[(idx + 1) % todosOrdenados.length]
        : null
    pulados.value = [...pulados.value.filter((id) => id !== item.id), item.id]
    if (proximo) onFocarItem(proximo)
  }

  const converterEmRef = (item: Item, entidadeId: string) => {
    const agora = Date.now()
    const itemRef = novaRef(
      {
        quadroId: item.quadroId,
        ref: refDaEntidade(entidadeId),
        x: item.x,
        y: item.y,
        largura: item.largura,
        altura: item.altura,
        z: item.z,
      },
      agora,
      crypto.randomUUID(),
    )
    itemRef.molduraId = item.molduraId
    executar({
      rotulo: 'Converter item em entidade',
      ops: [{ remover: [item] }, { criar: [itemRef] }],
    })
    ligandoItemId.value = null
  }

  const acrescentarMencao = (item: Item, nomeEntidade: string) => {
    if (item.tipo !== 'texto' && item.tipo !== 'forma') return
    const atual = textoPuro(item.doc).trim()
    const novoDoc = docDeTexto(atual ? `${atual}\n[[${nomeEntidade}]]` : `[[${nomeEntidade}]]`)
    executar({
      rotulo: 'Ligar item a entidade',
      ops: [
        {
          alterar: [
            {
              id: item.id,
              antes: { doc: item.doc, revisao: item.revisao },
              depois: { doc: novoDoc, revisao: undefined },
            },
          ],
        },
      ],
    })
    ligandoItemId.value = null
  }

  const renderItem = (item: Item) => {
                    const rev = item.revisao!
                    const sugerido = rev.tipoSugerido
                    return (
                      <li
                        key={item.id}
                        class="fila-revisao-item"
                        data-testid={`revisao-item-${item.id}`}
                      >
                        <button
                          type="button"
                          class="fila-revisao-foco"
                          data-testid={`revisao-focar-${item.id}`}
                          onClick={() => onFocarItem(item)}
                        >
                          <span class="fila-revisao-resumo">{resumoDoItem(item)}</span>
                          <span class="fila-revisao-sugestao">
                            {sugerido ? `Sugerido: ${NOMES_SEMANTICOS[sugerido]}` : 'Sem sugestão'}
                          </span>
                          {rev.motivos.length > 0 ? (
                            <span class="fila-revisao-motivos">{rev.motivos.join(' · ')}</span>
                          ) : null}
                        </button>

                        <div class="fila-revisao-acoes">
                          <button
                            type="button"
                            class="botao-pilula pequeno destaque"
                            data-testid={`revisao-aceitar-${item.id}`}
                            onClick={() =>
                              aplicarTipo(item, sugerido, 'Aceitar sugestão de revisão')
                            }
                          >
                            Aceitar
                          </button>

                          <select
                            class="campo pequeno"
                            aria-label="Outro tipo semântico"
                            data-testid={`revisao-outro-tipo-${item.id}`}
                            value=""
                            onChange={(e) => {
                              const val = e.currentTarget.value as TipoSemantico | ''
                              if (!val) return
                              aplicarTipo(item, val, `Definir tipo ${NOMES_SEMANTICOS[val]}`)
                            }}
                          >
                            <option value="">Outro tipo…</option>
                            {TIPOS_SEMANTICOS.map((t) => (
                              <option key={t} value={t}>
                                {NOMES_SEMANTICOS[t]}
                              </option>
                            ))}
                          </select>

                          <button
                            type="button"
                            class="botao-pilula pequeno"
                            data-testid={`revisao-sem-tipo-${item.id}`}
                            onClick={() => aplicarTipo(item, null, 'Revisar como sem tipo')}
                          >
                            Sem tipo
                          </button>

                          <button
                            type="button"
                            class="botao-pilula pequeno"
                            data-testid={`revisao-ligar-entidade-${item.id}`}
                            onClick={() => {
                              ligandoItemId.value =
                                ligandoItemId.value === item.id ? null : item.id
                              buscaEntidade.value = ''
                            }}
                          >
                            Ligar a entidade…
                          </button>

                          <button
                            type="button"
                            class="botao-pilula pequeno"
                            data-testid={`revisao-pular-${item.id}`}
                            onClick={() => pularItem(item)}
                          >
                            Pular
                          </button>
                        </div>

                        {ligandoItemId.value === item.id ? (
                          <div
                            class="fila-revisao-ligar-box"
                            data-testid={`revisao-ligar-box-${item.id}`}
                          >
                            <input
                              type="search"
                              class="campo pequeno"
                              placeholder="Buscar entidade..."
                              value={buscaEntidade.value}
                              onInput={(e) => {
                                buscaEntidade.value = e.currentTarget.value
                              }}
                            />
                            <ul class="seletor-entidade-lista">
                              {sugerirEntidades(entidades.value, buscaEntidade.value, 6).map(
                                (ent) => (
                                  <li key={ent.id} class="fila-revisao-entidade-opcoes">
                                    <span>{ent.nome}</span>
                                    <div>
                                      <button
                                        type="button"
                                        class="botao-pilula pequeno"
                                        data-testid={`revisao-mencionar-${item.id}-${ent.id}`}
                                        onClick={() => acrescentarMencao(item, ent.nome)}
                                      >
                                        + [[menção]]
                                      </button>
                                      <button
                                        type="button"
                                        class="botao-pilula pequeno"
                                        data-testid={`revisao-converter-ref-${item.id}-${ent.id}`}
                                        onClick={() => converterEmRef(item, ent.id)}
                                      >
                                        Virar cartão
                                      </button>
                                    </div>
                                  </li>
                                ),
                              )}
                            </ul>
                          </div>
                        ) : null}
                      </li>
                    )
  }

  return (
    <aside
      class="painel-fundo fila-de-revisao"
      data-testid="painel-fila-revisao"
      onPointerDown={(e) => e.stopPropagation()}
      onDblClick={(e) => e.stopPropagation()}
    >
      <div class="painel-fundo-topo">
        <div>
          <strong>Fila de revisão</strong>
          <span class="meta" data-testid="contador-revisao" style={{ marginLeft: '8px' }}>
            faltam {todosEmRevisao.length}
          </span>
        </div>
        <button
          type="button"
          class="botao-pilula"
          data-testid="fechar-fila-revisao"
          onClick={onFechar}
          aria-label="Fechar fila de revisão"
        >
          Fechar
        </button>
      </div>

      {todosEmRevisao.length === 0 ? (
        <p class="quadro-painel-vazio" data-testid="revisao-vazia">
          Todos os itens importados foram revisados.
        </p>
      ) : (
        <div class="fila-revisao-grupos">
          <section class="fila-revisao-massa" data-testid="revisao-massa">
            {resumo.conflitos.length > 0 ? (
              <div class="fila-revisao-massa-linha fila-revisao-massa-conflitos">
                <button
                  type="button"
                  class={`fila-revisao-massa-filtro${filtro.value === 'conflitos' ? ' ativo' : ''}`}
                  data-testid="revisao-filtro-conflitos"
                  onClick={() => {
                    filtro.value = filtro.value === 'conflitos' ? null : 'conflitos'
                  }}
                >
                  Conflitos e saídas do Miro · {resumo.conflitos.length}
                </button>
                <span class="meta">decida um a um</span>
              </div>
            ) : null}
            {resumo.porTipo.map((r) => {
              const chave = chaveDoTipo(r)
              const nome = r.tipo ? NOMES_SEMANTICOS[r.tipo] : 'Sem sugestão'
              return (
                <div class="fila-revisao-massa-linha" key={chave}>
                  <button
                    type="button"
                    class={`fila-revisao-massa-filtro${filtro.value === chave ? ' ativo' : ''}`}
                    data-testid={`revisao-filtro-${chave}`}
                    onClick={() => {
                      filtro.value = filtro.value === chave ? null : (chave as TipoSemantico | 'sem')
                    }}
                  >
                    <span
                      class="fila-revisao-massa-cor"
                      style={{ background: r.tipo ? paletaDaCampanha.value[r.tipo] : 'transparent' }}
                      aria-hidden="true"
                    />
                    {nome} · {r.quantidade}
                  </button>
                  {confirmandoMassa.value === chave ? (
                    <span class="fila-revisao-confirmacao">
                      <button
                        type="button"
                        class="botao-pilula pequeno destaque"
                        data-testid={`revisao-massa-confirmar-${chave}`}
                        onClick={() => aceitarEmMassa(r)}
                      >
                        Confirmar ({r.quantidade})
                      </button>
                      <button
                        type="button"
                        class="botao-pilula pequeno"
                        data-testid={`revisao-massa-cancelar-${chave}`}
                        onClick={() => {
                          confirmandoMassa.value = null
                        }}
                      >
                        Cancelar
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      class="botao-pilula pequeno"
                      data-testid={`revisao-massa-${chave}`}
                      onClick={() => {
                        confirmandoMassa.value = chave
                      }}
                    >
                      {r.tipo ? `Aceitar ${r.quantidade}` : `${r.quantidade} sem sugestão → sem tipo`}
                    </button>
                  )}
                </div>
              )
            })}
          </section>
          {doAssistente.length > 0 ? (
            <section class="fila-revisao-grupo fila-revisao-assistente" data-testid="revisao-grupo-assistente">
              <header class="fila-revisao-grupo-topo">
                <strong>Do assistente · {doAssistente.length}</strong>
                {confirmandoDescarte.value ? (
                  <span class="fila-revisao-confirmacao">
                    <button
                      type="button"
                      class="botao-pilula pequeno destaque"
                      data-testid="revisao-assistente-descartar-confirmar"
                      onClick={descartarDoAssistente}
                    >
                      Confirmar descarte ({doAssistente.length})
                    </button>
                    <button
                      type="button"
                      class="botao-pilula pequeno"
                      onClick={() => {
                        confirmandoDescarte.value = false
                      }}
                    >
                      Cancelar
                    </button>
                  </span>
                ) : (
                  <span class="fila-revisao-confirmacao">
                    <button
                      type="button"
                      class="botao-pilula pequeno"
                      data-testid="revisao-assistente-aceitar"
                      onClick={() => aceitarMoldura({ molduraId: null, titulo: 'Do assistente', itens: doAssistente })}
                    >
                      Aceitar todas do assistente
                    </button>
                    <button
                      type="button"
                      class="botao-pilula pequeno"
                      data-testid="revisao-assistente-descartar"
                      onClick={() => {
                        confirmandoDescarte.value = true
                      }}
                    >
                      Descartar todas
                    </button>
                  </span>
                )}
              </header>
              <ul class="fila-revisao-lista">{doAssistente.map(renderItem)}</ul>
            </section>
          ) : null}
          {(() => {
            let resta = limiteExibido.value
            return grupos.map((grupo) => {
              if (resta <= 0) return null
              const visiveis = grupo.itens.length <= resta ? grupo.itens : grupo.itens.slice(0, resta)
              resta -= visiveis.length
              const chaveGrupo = grupo.molduraId ?? 'sem-moldura'
              return (
                <section
                  key={chaveGrupo}
                  class="fila-revisao-grupo"
                  data-testid={`revisao-grupo-${chaveGrupo}`}
                >
                  <header class="fila-revisao-grupo-topo">
                    <strong>{grupo.titulo}</strong>
                    {confirmandoMolduraId.value === chaveGrupo ? (
                      <span class="fila-revisao-confirmacao">
                        <button
                          type="button"
                          class="botao-pilula pequeno destaque"
                          data-testid={`revisao-confirmar-moldura-${chaveGrupo}`}
                          onClick={() => aceitarMoldura(grupo)}
                        >
                          Confirmar ({grupo.itens.filter((i) => !ehConflitoOuSaida(i)).length})
                        </button>
                        <button
                          type="button"
                          class="botao-pilula pequeno"
                          onClick={() => {
                            confirmandoMolduraId.value = null
                          }}
                        >
                          Cancelar
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        class="botao-pilula pequeno"
                        data-testid={`revisao-aceitar-moldura-${chaveGrupo}`}
                        onClick={() => {
                          confirmandoMolduraId.value = chaveGrupo
                        }}
                      >
                        Aceitar todos desta moldura
                      </button>
                    )}
                  </header>

                  <ul class="fila-revisao-lista">
                    {visiveis.map(renderItem)}
                  </ul>
                </section>
              )
            })
          })()}
          {emRevisao.length > limiteExibido.value ? (
            <button
              type="button"
              class="botao-pilula pequeno"
              data-testid="revisao-mostrar-mais"
              onClick={() => {
                limiteExibido.value += 120
              }}
            >
              Mostrar mais ({emRevisao.length - limiteExibido.value} restantes)
            </button>
          ) : null}
        </div>
      )}
    </aside>
  )
}

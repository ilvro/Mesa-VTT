import { itemEhSecreto } from '../../dominio/busca-quadro.ts';
import { textoPuro, type Item } from '../../dominio/quadro.ts';

interface PainelDeSegredosProps {
  itens: ReadonlyMap<string, Item>;
  onIrPara: (item: Item) => void;
  onAlternarFeito: (item: Item) => void;
  onFechar: () => void;
}

function resumoItem(it: Item): string {
  if (it.tipo === 'texto' || it.tipo === 'forma') {
    return textoPuro(it.doc).replace(/\[SEGREDO\]/gi, '').trim() || '(sem texto)';
  }
  if (it.tipo === 'moldura') return it.titulo || '(moldura)';
  if (it.tipo === 'seta') return it.rotulo || '(seta)';
  return it.tipo;
}

export function PainelDeSegredos({
  itens,
  onIrPara,
  onAlternarFeito,
  onFechar,
}: PainelDeSegredosProps) {
  const segredos = [...itens.values()]
    .filter((it) => itemEhSecreto(it))
    .sort((a, b) => a.y - b.y || a.x - b.x);

  return (
    <aside
      class="painel-fundo painel-segredos"
      data-testid="painel-segredos"
      aria-label="Segredos do quadro"
      onPointerDown={(e) => e.stopPropagation()}
      onDblClick={(e) => e.stopPropagation()}
    >
      <div class="painel-fundo-topo">
        <span class="faixa pequena">Segredos ({segredos.length})</span>
        <button
          type="button"
          class="botao-pilula"
          data-testid="fechar-painel-segredos"
          onClick={onFechar}
        >
          Fechar
        </button>
      </div>

      {segredos.length === 0 ? (
        <p class="dica">Nenhum segredo neste quadro.</p>
      ) : (
        <ul class="painel-estado-lista" data-testid="segredos-lista">
          {segredos.map((it) => (
            <li key={it.id} class="painel-estado-linha">
              <button
                type="button"
                class={`chip-filtro ${it.feito ? 'ativa' : ''}`}
                title={it.feito ? 'Revelado (clique para desmarcar)' : 'Oculto (clique para revelar)'}
                data-testid={`segredo-feito-${it.id}`}
                onClick={() => onAlternarFeito(it)}
              >
                {it.feito ? '✓ Revelado' : 'Oculto'}
              </button>
              <button
                type="button"
                class="seletor-entidade-opcao"
                onClick={() => onIrPara(it)}
              >
                <span class="busca-quadro-trecho">{resumoItem(it)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}

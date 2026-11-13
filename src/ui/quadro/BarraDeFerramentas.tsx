import { cx } from '../cx.ts';

export type FerramentaQuadro =
  | 'selecionar'
  | 'mao'
  | 'texto'
  | 'nota'
  | 'forma'
  | 'seta'
  | 'caneta'
  | 'marca-texto'
  | 'borracha'
  | 'imagem'
  | 'moldura'
  | 'entidade';

interface DefinicaoFerramenta {
  id: FerramentaQuadro;
  rotulo: string;
  atalho?: string;
  icone: string;
  habilitada: boolean;
}

const FERRAMENTAS: readonly DefinicaoFerramenta[] = [
  { id: 'selecionar', rotulo: 'Selecionar', atalho: 'V', icone: '↖', habilitada: true },
  { id: 'mao', rotulo: 'Mão', atalho: 'H', icone: '✋', habilitada: true },
  { id: 'texto', rotulo: 'Texto', atalho: 'T', icone: 'T', habilitada: true },
  { id: 'nota', rotulo: 'Nota adesiva', atalho: 'N', icone: '❏', habilitada: true },
  { id: 'forma', rotulo: 'Forma', atalho: 'S', icone: '▢', habilitada: false },
  { id: 'seta', rotulo: 'Seta', atalho: 'L', icone: '↗', habilitada: false },
  { id: 'caneta', rotulo: 'Caneta', atalho: 'P', icone: '✎', habilitada: false },
  { id: 'marca-texto', rotulo: 'Marca-texto', icone: '🖍', habilitada: false },
  { id: 'borracha', rotulo: 'Borracha', atalho: 'E', icone: '⌫', habilitada: false },
  { id: 'imagem', rotulo: 'Imagem', icone: '🖼', habilitada: false },
  { id: 'moldura', rotulo: 'Moldura', atalho: 'F', icone: '#', habilitada: false },
  { id: 'entidade', rotulo: 'Entidade', icone: '◆', habilitada: false },
];

interface BarraDeFerramentasProps {
  ativa: FerramentaQuadro;
  onEscolher: (ferramenta: FerramentaQuadro) => void;
}

export function BarraDeFerramentas({ ativa, onEscolher }: BarraDeFerramentasProps) {
  return (
    <nav
      class="barra-ferramentas-quadro"
      data-testid="barra-ferramentas"
      aria-label="Ferramentas do quadro"
    >
      {FERRAMENTAS.map((f) => (
        <button
          key={f.id}
          type="button"
          class={cx('ferramenta-btn', ativa === f.id && 'ativa')}
          data-testid={`ferramenta-${f.id}`}
          disabled={!f.habilitada}
          title={
            f.habilitada
              ? `${f.rotulo}${f.atalho ? ` (${f.atalho})` : ''}`
              : `${f.rotulo} — em breve`
          }
          aria-label={f.rotulo}
          aria-pressed={ativa === f.id}
          onClick={() => {
            if (f.habilitada) onEscolher(f.id);
          }}
        >
          <span class="ferramenta-icone">{f.icone}</span>
        </button>
      ))}
    </nav>
  );
}

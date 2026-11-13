import { useSignal } from '@preact/signals';
import { FORMAS, type Forma } from '../../dominio/quadro.ts';
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
  { id: 'forma', rotulo: 'Forma', atalho: 'S', icone: '▢', habilitada: true },
  { id: 'seta', rotulo: 'Seta', atalho: 'L', icone: '↗', habilitada: true },
  { id: 'caneta', rotulo: 'Caneta', atalho: 'P', icone: '✎', habilitada: true },
  { id: 'marca-texto', rotulo: 'Marca-texto', icone: '🖍', habilitada: true },
  { id: 'borracha', rotulo: 'Borracha', atalho: 'E', icone: '⌫', habilitada: true },
  { id: 'imagem', rotulo: 'Imagem', icone: '🖼', habilitada: true },
  { id: 'moldura', rotulo: 'Moldura', atalho: 'F', icone: '#', habilitada: false },
  { id: 'entidade', rotulo: 'Entidade', icone: '◆', habilitada: false },
];

const ROTULO_FORMA: Record<Forma, string> = {
  retangulo: 'Retângulo',
  arredondado: 'Arredondado',
  elipse: 'Elipse',
  losango: 'Losango',
  triangulo: 'Triângulo',
  paralelogramo: 'Paralelogramo',
  hexagono: 'Hexágono',
  estrela: 'Estrela',
  nuvem: 'Nuvem',
};

export interface ConfigTraco {
  cor: string;
  espessura: number;
}

const CORES_TRACO = ['#e8efe9', '#f7e48c', '#c45b43', '#7aa7f0', '#8bd197', '#b894eb'];

interface BarraDeFerramentasProps {
  ativa: FerramentaQuadro;
  formaAtiva?: Forma;
  configCaneta?: ConfigTraco;
  configMarcaTexto?: ConfigTraco;
  onEscolher: (ferramenta: FerramentaQuadro) => void;
  onEscolherForma?: (forma: Forma) => void;
  onMudarConfigTraco?: (tipo: 'caneta' | 'marca-texto', cfg: ConfigTraco) => void;
}

export function BarraDeFerramentas({
  ativa,
  formaAtiva = 'retangulo',
  configCaneta = { cor: '#e8efe9', espessura: 4 },
  configMarcaTexto = { cor: '#f7e48c', espessura: 18 },
  onEscolher,
  onEscolherForma,
  onMudarConfigTraco,
}: BarraDeFerramentasProps) {
  const formasAbertas = useSignal(false);

  return (
    <nav
      class="barra-ferramentas-quadro"
      data-testid="barra-ferramentas"
      aria-label="Ferramentas do quadro"
    >
      {FERRAMENTAS.map((f) => (
        <div key={f.id} class="ferramenta-item-wrap">
          <button
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
              if (!f.habilitada) return;
              if (f.id === 'forma') {
                formasAbertas.value = ativa === 'forma' ? !formasAbertas.value : true;
              } else {
                formasAbertas.value = false;
              }
              onEscolher(f.id);
            }}
          >
            <span class="ferramenta-icone">{f.icone}</span>
          </button>

          {f.id === 'forma' && formasAbertas.value ? (
            <div class="submenu-formas" data-testid="submenu-formas">
              {FORMAS.map((forma) => (
                <button
                  key={forma}
                  type="button"
                  class={cx('submenu-forma-btn', formaAtiva === forma && 'ativa')}
                  data-testid={`forma-${forma}`}
                  onClick={() => {
                    onEscolherForma?.(forma);
                    onEscolher('forma');
                    formasAbertas.value = false;
                  }}
                >
                  {ROTULO_FORMA[forma]}
                </button>
              ))}
            </div>
          ) : null}

          {(f.id === 'caneta' || f.id === 'marca-texto') && ativa === f.id ? (
            <div class="submenu-traco" data-testid={`submenu-${f.id}`}>
              <div class="submenu-traco-cores">
                {CORES_TRACO.map((cor) => {
                  const atual = f.id === 'caneta' ? configCaneta : configMarcaTexto;
                  return (
                    <button
                      key={cor}
                      type="button"
                      class={cx('traco-cor-btn', atual.cor === cor && 'ativa')}
                      style={{ backgroundColor: cor }}
                      aria-label={`Cor ${cor}`}
                      onClick={() => onMudarConfigTraco?.(f.id as 'caneta' | 'marca-texto', { ...atual, cor })}
                    />
                  );
                })}
              </div>
              <div class="submenu-traco-espessuras">
                {(f.id === 'caneta' ? [2, 4, 8, 12] : [12, 18, 28]).map((esp) => {
                  const atual = f.id === 'caneta' ? configCaneta : configMarcaTexto;
                  return (
                    <button
                      key={esp}
                      type="button"
                      class={cx('submenu-forma-btn', atual.espessura === esp && 'ativa')}
                      onClick={() =>
                        onMudarConfigTraco?.(f.id as 'caneta' | 'marca-texto', {
                          ...atual,
                          espessura: esp,
                        })
                      }
                    >
                      {esp}px
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      ))}
    </nav>
  );
}

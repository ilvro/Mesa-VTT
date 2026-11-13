import { GRADES, type Grade, type Quadro } from '../../dominio/quadro.ts';
import { cx } from '../cx.ts';

export type ModoRoda = 'zoom' | 'rolagem';

interface PainelDoFundoProps {
  fundo: Quadro['fundo'];
  roda: ModoRoda;
  onMudarFundo: (parcial: Partial<Quadro['fundo']>) => void;
  onMudarRoda: (modo: ModoRoda) => void;
  onFechar: () => void;
}

const AMOSTRAS_FUNDO = [
  '#101412',
  '#0c0a12',
  '#141920',
  '#1d1916',
  '#232724',
  '#f4f1ea',
  '#ffffff',
];

const ROTULO_GRADE: Record<Grade, string> = {
  nenhuma: 'Nenhuma',
  pontos: 'Pontos',
  linhas: 'Linhas',
};

const PASSOS = [12, 24, 32, 48];

export function PainelDoFundo({
  fundo,
  roda,
  onMudarFundo,
  onMudarRoda,
  onFechar,
}: PainelDoFundoProps) {
  return (
    <aside class="painel-fundo" data-testid="painel-fundo" aria-label="Fundo e grade">
      <div class="painel-fundo-topo">
        <span class="faixa pequena">Fundo e grade</span>
        <button
          type="button"
          class="botao-pilula"
          data-testid="fechar-painel-fundo"
          onClick={onFechar}
        >
          Fechar
        </button>
      </div>

      <div class="painel-fundo-secao">
        <span class="painel-fundo-rotulo">Cor do fundo</span>
        <div class="painel-fundo-cores">
          <input
            type="color"
            aria-label="Cor do fundo"
            data-testid="fundo-cor"
            value={fundo.cor}
            onInput={(e) => onMudarFundo({ cor: e.currentTarget.value })}
          />
          {AMOSTRAS_FUNDO.map((cor) => (
            <button
              key={cor}
              type="button"
              class={cx('amostra-cor', fundo.cor.toLowerCase() === cor && 'ativa')}
              style={{ backgroundColor: cor }}
              aria-label={`Cor ${cor}`}
              data-testid={`amostra-cor-${cor.slice(1)}`}
              onClick={() => onMudarFundo({ cor })}
            />
          ))}
        </div>
      </div>

      <div class="painel-fundo-secao">
        <span class="painel-fundo-rotulo">Grade</span>
        <div class="grupo">
          {GRADES.map((g) => (
            <button
              key={g}
              type="button"
              class={cx('ficha', fundo.grade === g && 'ativa')}
              data-testid={`grade-${g}`}
              onClick={() => onMudarFundo({ grade: g })}
            >
              {ROTULO_GRADE[g]}
            </button>
          ))}
        </div>
      </div>

      <div class="painel-fundo-secao">
        <label class="painel-fundo-linha">
          <span class="painel-fundo-rotulo">Passo (px)</span>
          <select
            data-testid="fundo-passo"
            value={String(fundo.passo)}
            onChange={(e) => {
              const passo = Number(e.currentTarget.value);
              if (Number.isFinite(passo) && passo > 0) onMudarFundo({ passo });
            }}
          >
            {PASSOS.map((p) => (
              <option key={p} value={String(p)}>
                {p} px
              </option>
            ))}
          </select>
        </label>
      </div>

      <div class="painel-fundo-secao">
        <label class="painel-fundo-check">
          <input
            type="checkbox"
            data-testid="fundo-encaixar"
            checked={fundo.encaixar}
            onChange={(e) => onMudarFundo({ encaixar: e.currentTarget.checked })}
          />
          <span>Encaixar na grade</span>
        </label>
      </div>

      <div class="painel-fundo-secao">
        <span class="painel-fundo-rotulo">Roda do mouse</span>
        <div class="grupo">
          <button
            type="button"
            class={cx('ficha', roda === 'zoom' && 'ativa')}
            data-testid="roda-zoom"
            onClick={() => onMudarRoda('zoom')}
          >
            Zoom
          </button>
          <button
            type="button"
            class={cx('ficha', roda === 'rolagem' && 'ativa')}
            data-testid="roda-rolagem"
            onClick={() => onMudarRoda('rolagem')}
          >
            Rolagem
          </button>
        </div>
      </div>
    </aside>
  );
}

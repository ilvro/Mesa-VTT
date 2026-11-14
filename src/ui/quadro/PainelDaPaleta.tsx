import {
  NOMES_SEMANTICOS,
  corDoTexto,
  type PaletaDaCampanha,
} from '../../dominio/paleta.ts';
import { TIPOS_SEMANTICOS, type TipoSemantico } from '../../dominio/quadro.ts';

interface PainelDaPaletaProps {
  paleta: PaletaDaCampanha;
  onMudarCor: (tipo: TipoSemantico, cor: string) => void;
  onRestaurar: () => void;
  onFechar: () => void;
}

export function PainelDaPaleta({
  paleta,
  onMudarCor,
  onRestaurar,
  onFechar,
}: PainelDaPaletaProps) {
  return (
    <aside
      class="painel-fundo painel-paleta"
      data-testid="painel-paleta"
      aria-label="Paleta da campanha"
    >
      <div class="painel-fundo-topo">
        <span class="faixa pequena">Paleta da campanha</span>
        <button
          type="button"
          class="botao-pilula"
          data-testid="fechar-painel-paleta"
          onClick={onFechar}
        >
          Fechar
        </button>
      </div>

      <div class="painel-paleta-lista">
        {TIPOS_SEMANTICOS.map((tipo) => {
          const cor = paleta[tipo];
          return (
            <label key={tipo} class="painel-paleta-linha">
              <span
                class="painel-paleta-amostra"
                style={{ backgroundColor: cor, color: corDoTexto(cor) }}
              >
                {NOMES_SEMANTICOS[tipo]}
              </span>
              <input
                type="color"
                aria-label={`Cor de ${NOMES_SEMANTICOS[tipo]}`}
                data-testid={`paleta-cor-${tipo}`}
                value={cor}
                onInput={(e) => onMudarCor(tipo, e.currentTarget.value)}
              />
            </label>
          );
        })}
      </div>

      <div class="painel-paleta-rodape">
        <button
          type="button"
          class="botao-pilula"
          data-testid="restaurar-paleta"
          onClick={onRestaurar}
        >
          Restaurar padrão
        </button>
      </div>
    </aside>
  );
}

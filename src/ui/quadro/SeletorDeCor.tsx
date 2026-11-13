import { useSignal } from '@preact/signals';

const CHAVE_RECENTES = 'mesa:quadro:cores-recentes';

const CORES_SEMANTICAS_PADRAO = [
  '#f7e48c',
  '#7aa7f0',
  '#f2a7b8',
  '#f0a35e',
  '#8fe3b0',
  '#ffd84d',
  '#5fe3a1',
];

const PALETA_MIRO = [
  '#f7e48c', // amarelo
  '#f0a35e', // laranja
  '#f2a7b8', // rosa
  '#e86f68', // vermelho
  '#8fe3b0', // verde
  '#7aa7f0', // azul
  '#a58de0', // roxo
  '#7a8580', // cinza
  '#1b1b1b', // preto
  '#ffffff', // branco
];

function lerRecentes(): string[] {
  try {
    const raw = localStorage.getItem(CHAVE_RECENTES);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string').slice(0, 8) : [];
  } catch {
    return [];
  }
}

function salvarRecente(cor: string): string[] {
  const norm = cor.trim().toLowerCase();
  const prox = [norm, ...lerRecentes().filter((c) => c !== norm)].slice(0, 8);
  try {
    localStorage.setItem(CHAVE_RECENTES, JSON.stringify(prox));
  } catch {
    /* ignora */
  }
  return prox;
}

interface SeletorDeCorProps {
  valor: string | null;
  permiteNula?: boolean;
  coresSemanticas?: readonly string[];
  rotulo?: string;
  testIdPrefix: string;
  onEscolher: (cor: string | null) => void;
}

export function SeletorDeCor({
  valor,
  permiteNula = false,
  coresSemanticas = CORES_SEMANTICAS_PADRAO,
  rotulo = 'Cor',
  testIdPrefix,
  onEscolher,
}: SeletorDeCorProps) {
  const aberto = useSignal(false);
  const recentes = useSignal<string[]>(lerRecentes());
  const hex = useSignal(valor ?? '');

  const aplicar = (cor: string | null) => {
    if (cor) {
      recentes.value = salvarRecente(cor);
      hex.value = cor;
    } else {
      hex.value = '';
    }
    onEscolher(cor);
    aberto.value = false;
  };

  const abrirContaGotas = async () => {
    const EyeDropperCtor = (
      window as unknown as { EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> } }
    ).EyeDropper;
    if (!EyeDropperCtor) return;
    try {
      const res = await new EyeDropperCtor().open();
      if (res?.sRGBHex) aplicar(res.sRGBHex);
    } catch {
      /* cancelado */
    }
  };

  return (
    <div class="seletor-cor-wrap" onMouseDown={(e) => e.preventDefault()}>
      <button
        type="button"
        class="fmt-btn fmt-btn-cor"
        data-testid={`${testIdPrefix}-abrir`}
        title={rotulo}
        onClick={() => {
          hex.value = valor ?? '';
          aberto.value = !aberto.value;
        }}
      >
        <span
          class="fmt-amostra-atual"
          style={{
            backgroundColor: valor ?? 'transparent',
            backgroundImage: valor ? undefined : 'linear-gradient(135deg, transparent 45%, var(--perigo) 45%, var(--perigo) 55%, transparent 55%)',
          }}
        />
      </button>

      {aberto.value ? (
        <div
          class="seletor-cor-popover"
          data-testid={`${testIdPrefix}-popover`}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div class="seletor-cor-grade">
            {[...new Set([...coresSemanticas, ...PALETA_MIRO])].map((cor) => (
              <button
                key={cor}
                type="button"
                class={`amostra-cor ${valor?.toLowerCase() === cor ? 'ativa' : ''}`}
                style={{ backgroundColor: cor }}
                data-testid={`${testIdPrefix}-cor-${cor.slice(1)}`}
                aria-label={cor}
                onClick={() => aplicar(cor)}
              />
            ))}
          </div>

          {recentes.value.length > 0 ? (
            <div class="seletor-cor-recentes">
              <span class="meta">Recentes</span>
              <div class="seletor-cor-grade">
                {recentes.value.map((cor) => (
                  <button
                    key={cor}
                    type="button"
                    class="amostra-cor"
                    style={{ backgroundColor: cor }}
                    aria-label={cor}
                    onClick={() => aplicar(cor)}
                  />
                ))}
              </div>
            </div>
          ) : null}

          <div class="seletor-cor-acoes">
            <input
              type="text"
              class="seletor-cor-hex"
              placeholder="#rrggbb"
              data-testid={`${testIdPrefix}-hex`}
              value={hex.value}
              onMouseDown={(e) => e.stopPropagation()}
              onInput={(e) => {
                hex.value = e.currentTarget.value;
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const v = hex.value.trim();
                  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v)) aplicar(v);
                }
              }}
            />
            {permiteNula ? (
              <button
                type="button"
                class="botao-pilula"
                data-testid={`${testIdPrefix}-nenhuma`}
                onClick={() => aplicar(null)}
              >
                Sem cor
              </button>
            ) : null}
            {typeof window !== 'undefined' && 'EyeDropper' in window ? (
              <button
                type="button"
                class="botao-pilula"
                title="Conta-gotas"
                onClick={() => void abrirContaGotas()}
              >
                Pipeta
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

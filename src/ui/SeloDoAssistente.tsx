// Só em desenvolvimento: importado por `app/ponte.ts` (que entra por `import()` sob `import.meta.env.DEV`); o estilo vai junto, num <style>, para não ir ao build.
import { signal } from '@preact/signals';
import type { EstadoDaPonte } from '#mesa/ponte';

export const estadoDaPonte = signal<EstadoDaPonte | null>(null);

const ESTILO = `
.selo-assistente { display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px; border: 1px solid var(--linha); border-radius: 999px; background: var(--acento-suave); font-size: 12px; line-height: 1.4; cursor: default; user-select: none; }
.selo-assistente .ponto { width: 8px; height: 8px; border-radius: 50%; background: var(--sucesso); }
.selo-assistente.trabalhando .ponto { animation: selo-assistente-pulsa 1s ease-in-out infinite; }
@keyframes selo-assistente-pulsa { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: .35; transform: scale(1.4); } }
@media (prefers-reduced-motion: reduce) { .selo-assistente.trabalhando .ponto { animation: none; box-shadow: 0 0 0 3px var(--acento-media); } }
`;

export function SeloDoAssistente() {
  const e = estadoDaPonte.value;
  if (!e || e.conexao !== 'conectada') return null;
  const n = e.ferramentas;
  return (
    <span class={`selo-assistente ${e.ocupada ? 'trabalhando' : ''}`} data-testid="selo-assistente" role="status" title={`Assistente conectado: esta aba oferece ${n} ${n === 1 ? 'ferramenta' : 'ferramentas'}${e.ocupada ? ' (trabalhando agora)' : ''}`}>
      <style>{ESTILO}</style>
      <span class="ponto" aria-hidden="true" />Assistente
    </span>
  );
}

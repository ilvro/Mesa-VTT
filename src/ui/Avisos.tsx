import { avisos } from '../app/toasts.ts';
import { cx } from './cx.ts';

export function Avisos() {
  return (
    <div class="avisos" role="status" aria-live="polite">
      {avisos.value.map(a => <div key={a.id} class={cx('aviso-flutuante', a.erro && 'erro')} data-testid="aviso">{a.texto}{a.acao && <button type="button" class="aviso-acao" data-testid="aviso-acao" onClick={() => { const { aoClicar } = a.acao!; avisos.value = avisos.value.filter(x => x.id !== a.id); aoClicar(); }}>{a.acao.rotulo}</button>}</div>)}
    </div>
  );
}

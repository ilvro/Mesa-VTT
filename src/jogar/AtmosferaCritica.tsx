/** Camada de atmosfera crítica (PV e PD baixos) da casca do jogador: vinheta, escuridão e tentáculos sobre o mapa e a ficha. */
import { useEffect, useRef } from 'preact/hooks';
import { aparenciaDaAtmosfera, type AtmosferaCritica as Estado } from './atmosfera-critica.ts';
import { criarTentaculos, type Tentaculos } from './atmosfera-tentaculos.ts';

/** `pulso` muda a cada batimento do Dossiê (o som segue lá): reinicia a animação da vinheta no mesmo instante. */
export function AtmosferaCritica({ atmosfera, pulso }: { atmosfera: Estado; pulso: number }) {
  const raiz = useRef<HTMLDivElement>(null);
  const tela = useRef<HTMLCanvasElement>(null);
  const tentaculos = useRef<Tentaculos | null>(null);
  const a = aparenciaDaAtmosfera(atmosfera);
  const pd = atmosfera.estado.pd;

  useEffect(() => {
    if (!tela.current) return;
    const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
    tentaculos.current = criarTentaculos(tela.current, () => !!mq?.matches);
    return () => { tentaculos.current?.parar(); tentaculos.current = null; };
  }, []);

  useEffect(() => {
    if (a.pdSpecial) tentaculos.current?.definir(pd.specialIntensity); else tentaculos.current?.recolher();
  }, [a.pdSpecial, pd.specialIntensity]);

  useEffect(() => {
    const el = raiz.current;
    if (!pulso || !el || !a.pvSpecial) return;
    el.classList.remove('heartbeat-beat'); void el.offsetWidth; el.classList.add('heartbeat-beat');
    const t = window.setTimeout(() => el.classList.remove('heartbeat-beat'), 390);
    return () => clearTimeout(t);
  }, [pulso]);

  const classes = ['critical-atmosphere', 'casca-atmosfera-critica', a.pv && 'critical-pv', a.pd && 'critical-pd', a.pvSpecial && 'critical-pv-special', a.pdSpecial && 'critical-pd-special', a.combinado && 'critical-combined'].filter(Boolean).join(' ');
  return (
    <div ref={raiz} class={classes} data-testid="casca-atmosfera-critica" aria-hidden="true" style={a.vars}>
      <div class="critical-pd-darkness" />
      <div class="critical-pv-vignette" />
      <div class="critical-pd-vignette" />
      <canvas ref={tela} class="critical-tendrils" />
      <div class="critical-distortion" />
    </div>
  );
}

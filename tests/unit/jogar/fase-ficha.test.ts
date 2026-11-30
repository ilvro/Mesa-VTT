import { test } from 'node:test';
import assert from 'node:assert/strict';
import { agendarEntradaDaFicha, type RelogioDaFicha } from '../../../src/jogar/fase-ficha.ts';
import { vistaAplicada, vistaDoAviso } from '../../../src/jogar/vista-ficha.ts';

/** Relógio manual: quadros e esperas só andam quando o teste manda. */
function relogioManual() {
  let id = 0;
  const quadros = new Map<number, () => void>(), esperas = new Map<number, { f: () => void; ms: number }>();
  const relogio: RelogioDaFicha = {
    quadro: f => { quadros.set(++id, f); return id; },
    cancelarQuadro: i => { quadros.delete(i as number); },
    esperar: (f, ms) => { esperas.set(++id, { f, ms }); return id; },
    cancelarEspera: i => { esperas.delete(i as number); },
  };
  const quadro = () => { const [k, f] = [...quadros][0] ?? []; if (k !== undefined) { quadros.delete(k); f!(); } };
  const estouro = () => { const [k, e] = [...esperas][0] ?? []; if (k !== undefined) { esperas.delete(k); e!.f(); } };
  return { relogio, quadro, estouro, esperas, quadros };
}

/** A fase como a casca a conduz: inativa → preparando → ativa → saindo → inativa. */
function conduzir(espectador: boolean) {
  const r = relogioManual();
  const ouvintes = new Set<() => void>();
  const ouvir = (f: () => void) => { ouvintes.add(f); return () => { ouvintes.delete(f); }; };
  const fases: string[] = ['inativa'];
  fases.push('preparando');
  agendarEntradaDaFicha(() => fases.push('ativa'), ouvir, r.relogio);
  // No espectador o `iframe` nasce agora: o sinal só chega depois do `load`, mas nunca antes dos dois quadros pintados.
  if (!espectador) for (const f of [...ouvintes]) f();
  r.quadro();
  assert.deepEqual(fases, ['inativa', 'preparando'], 'um quadro só não basta');
  r.quadro();
  if (espectador) { assert.deepEqual(fases, ['inativa', 'preparando'], 'sem sinal do Dossiê, segue preparando'); for (const f of [...ouvintes]) f(); }
  fases.push('saindo', 'inativa');
  return fases;
}

test('entrada da ficha: preparando → ativa → saindo → inativa ao expandir', () => {
  assert.deepEqual(conduzir(false), ['inativa', 'preparando', 'ativa', 'saindo', 'inativa']);
});

test('entrada da ficha: o mesmo vale ao projetar, inclusive com o espectador montando o iframe agora', () => {
  assert.deepEqual(conduzir(true), ['inativa', 'preparando', 'ativa', 'saindo', 'inativa']);
});

test('entrada da ficha: o sinal antes dos dois quadros espera os quadros', () => {
  const r = relogioManual();
  let ativou = 0;
  let aviso: () => void = () => {};
  agendarEntradaDaFicha(() => { ativou++; }, f => { aviso = f; return () => {}; }, r.relogio);
  aviso();
  assert.equal(ativou, 0);
  r.quadro(); assert.equal(ativou, 0);
  r.quadro(); assert.equal(ativou, 1);
});

test('entrada da ficha: sem sinal, ativa no teto de 180 ms e uma vez só', () => {
  const r = relogioManual();
  let ativou = 0;
  agendarEntradaDaFicha(() => { ativou++; }, () => () => {}, r.relogio);
  assert.equal([...r.esperas.values()][0]!.ms, 180);
  r.estouro();
  assert.equal(ativou, 1);
  assert.equal(r.quadros.size, 0, 'o quadro pendente foi cancelado');
});

test('entrada da ficha: cancelar impede a ativação', () => {
  const r = relogioManual();
  let ativou = 0;
  const cancelar = agendarEntradaDaFicha(() => { ativou++; }, () => () => {}, r.relogio);
  cancelar();
  assert.equal(r.esperas.size, 0);
  assert.equal(ativou, 0);
});

test('vistaAplicada só vale vindo do iframe da ficha, na mesma origem', () => {
  const janela = {};
  const ev = (o: Partial<{ source: unknown; origin: string; data: unknown }> = {}) => ({ source: janela, origin: 'http://a', data: { tipo: 'dossie.vista-aplicada' }, ...o });
  assert.equal(vistaAplicada(ev(), janela, 'http://a'), true);
  assert.equal(vistaAplicada(ev({ source: {} }), janela, 'http://a'), false);
  assert.equal(vistaAplicada(ev({ origin: 'http://b' }), janela, 'http://a'), false);
  assert.equal(vistaAplicada(ev({ data: { tipo: 'outro' } }), janela, 'http://a'), false);
});

test('vistaDoAviso lê a vista do aviso e ignora avisos sem ela ou inválidos', () => {
  assert.equal(vistaDoAviso({ tipo: 'dossie.vista-aplicada', vista: 'card' }), 'card');
  assert.equal(vistaDoAviso({ tipo: 'dossie.vista-aplicada', vista: 'completa' }), 'completa');
  assert.equal(vistaDoAviso({ tipo: 'dossie.vista-aplicada' }), null);
  assert.equal(vistaDoAviso({ vista: 'x' }), null);
  assert.equal(vistaDoAviso(null), null);
});

test('ciclo completo da ficha expandida: inativa → preparando → ativa → saindo → retornando → inativa', () => {
  const fases: string[] = ['inativa', 'preparando'];
  const r = relogioManual();
  const ouvintes = new Set<() => void>();
  const ouvir = (f: () => void) => { ouvintes.add(f); return () => { ouvintes.delete(f); }; };
  agendarEntradaDaFicha(() => fases.push('ativa'), ouvir, r.relogio);
  for (const f of [...ouvintes]) f();
  r.quadro(); r.quadro();
  fases.push('saindo', 'retornando');
  agendarEntradaDaFicha(() => fases.push('inativa'), ouvir, r.relogio);
  r.quadro(); r.quadro();
  assert.deepEqual(fases, ['inativa', 'preparando', 'ativa', 'saindo', 'retornando'], 'o card só reaparece depois do aviso');
  for (const f of [...ouvintes]) f();
  assert.deepEqual(fases, ['inativa', 'preparando', 'ativa', 'saindo', 'retornando', 'inativa']);
});

test('retornando: sem aviso do Dossiê, o card reaparece no teto de 180 ms', () => {
  const r = relogioManual();
  let voltou = 0;
  agendarEntradaDaFicha(() => { voltou++; }, () => () => {}, r.relogio);
  r.estouro();
  assert.equal(voltou, 1);
});

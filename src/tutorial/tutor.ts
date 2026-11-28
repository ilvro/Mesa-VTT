import { signal, type Signal } from '@preact/signals';
import type { Semente } from './semente.ts';
import { atendida, type Condicao, type EstadoDoTutor } from './condicoes.ts';

/** O que um teste faz para executar um passo pela interface de verdade (a lição não escreve os gestos duas vezes: o tutor também os usa para mostrar os valores). */
export type Acao =
  | readonly ['clicar', string]
  | readonly ['preencher', string, string]
  | readonly ['escolher', string, string]
  | readonly ['tecla', string];

export interface Passo {
  /** A instrução, uma frase (aceita `<b>`). */
  diga: string;
  porque?: string;
  /** O que apontar, por seletor CSS (os `data-testid` e `data-campo` da interface). */
  alvo?: string;
  /** A condição que conclui o passo. `['ler']` espera o "Continuar". */
  feito: Condicao;
  acao?: Acao | readonly Acao[];
  /** Passo "agora sozinho": só o objetivo, sem anel, até a pessoa pedir "Mostrar onde". */
  tentar?: boolean;
  /** Os valores do passo, escritos à mão, se não saem das ações. */
  valores?: string;
  /** No primeiro passo de uma parte de uma lição longa: o cartão diz a etapa. */
  etapa?: string;
  /** O que o passo ensina: uma tecla e o que faz, ou uma frase (aparece no cartão final). */
  aprendeu?: string | readonly [string, string];
  /** A aba do inspetor a trazer para a frente antes de apontar. */
  aba?: string;
}

export interface Licao {
  id: string; titulo: string; minutos: number;
  passos: readonly Passo[];
  proxima?: string;
  /** A pasta da lista de tutoriais. */
  pasta?: string;
  /** Lições de teste e de manutenção não aparecem na lista. */
  oculta?: boolean;
  /** O resumo de uma linha na lista. */
  resumo?: string;
  /** O que a campanha de treino leva para a lição começar (entidades, quadro, itens). */
  semente?: Semente;
}

export interface InfoDaLicao { id: string; titulo: string; indice: number; total: number }
export interface Fim { id: string; titulo: string; concluida: boolean; proxima: string | null; aprendeu: (string | readonly [string, string])[] }

export interface ArmazenamentoSimples { getItem(chave: string): string | null; setItem(chave: string, valor: string): void }

/** Depois deste tempo no mesmo passo o anel insiste; passado o segundo, o cartão oferece os valores. Em segundos. */
export const INSISTIR = 20, OFERECER = 35;
export const CHAVE_DO_PROGRESSO = 'mesa-tutoriais-v1', CHAVE_DO_REGISTRO = 'mesa-tutoriais-registro-v1';

export interface Progresso { done?: boolean; step?: number }
interface PassoDoRegistro { seconds: number; skips: number; backs: number; lost: number; hints: number }
interface LicaoDoRegistro { starts: number; completes: number; steps: Record<number, PassoDoRegistro> }

export interface OpcoesDoTutor {
  licoes: readonly Licao[];
  /** O estado da Mesa (tela, quadro, sessão), lido a cada quadro. */
  estado(): EstadoDoTutor;
  agora?(): number;
  armazenamento?: ArmazenamentoSimples | null;
}

export interface Tutor {
  readonly licoes: readonly Licao[];
  /** Muda a cada passo, ao começar e ao sair: a interface se redesenha por ele. */
  readonly versao: Signal<number>;
  readonly fim: Signal<Fim | null>;
  info(): InfoDaLicao | null;
  passo(): Passo | null;
  progresso(): Record<string, Progresso>;
  iniciar(id: string, de?: number): boolean;
  parar(): void;
  voltar(): void;
  /** "Pular o passo" (conta no relatório). */
  pular(): void;
  /** "Continuar" dos passos de leitura (e do passo a que se voltou). */
  continuar(): void;
  /** Confere o passo atual e avança se o resultado já existe. Devolve se avançou. */
  tique(): boolean;
  ajuda(): { insiste: boolean; oferecer: boolean; mostrouOnde: boolean; valores: boolean };
  mostrarOnde(): void;
  pedirValores(): void;
  /** O passo ficou sem o controle na tela por um tempo (a interface avisa). */
  perdido(): void;
  relatorio(): { exportado: string; progresso: Record<string, Progresso>; passos: Record<string, LicaoDoRegistro> };
  fecharFim(): void;
  /** A lição atual deixa de ser a ativa sem registrar saída (a interface a trocou). */
  readonly ativaId: () => string | null;
}

const armazenamentoPadrao = (): ArmazenamentoSimples | null => { try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; } };

export function criarTutor(opcoes: OpcoesDoTutor): Tutor {
  const { licoes, estado } = opcoes, agora = opcoes.agora ?? (() => performance.now()), arm = opcoes.armazenamento === undefined ? armazenamentoPadrao() : opcoes.armazenamento;
  const ler = <T,>(chave: string): T | null => { try { const v = arm?.getItem(chave); return v ? JSON.parse(v) as T : null; } catch { return null; } };
  const gravar = (chave: string, valor: unknown) => { try { arm?.setItem(chave, JSON.stringify(valor)); } catch { /* janela privada: sem progresso gravado */ } };
  const versao = signal(0), fim = signal<Fim | null>(null);
  let licao: Licao | null = null, indice = 0, retido = -1, desde = 0, mostrouOnde = false, valores = false;
  const progresso = (): Record<string, Progresso> => ler<Record<string, Progresso>>(CHAVE_DO_PROGRESSO) ?? {};
  const passo = (): Passo | null => licao?.passos[indice] ?? null;
  const emitir = () => { versao.value++; };

  /** O que a pessoa faz em cada passo, só neste navegador, para achar os que confundem (a paleta exporta o relatório). */
  function anotar(tipo: 'start' | 'complete' | 'leave' | 'skips' | 'backs' | 'lost' | 'hints'): void {
    if (!licao) return;
    const reg = ler<Record<string, LicaoDoRegistro>>(CHAVE_DO_REGISTRO) ?? {}, e = reg[licao.id] ??= { starts: 0, completes: 0, steps: {} }, p = e.steps[indice] ??= { seconds: 0, skips: 0, backs: 0, lost: 0, hints: 0 };
    if (tipo === 'start') e.starts++; else if (tipo === 'complete') e.completes++;
    else if (tipo === 'leave') p.seconds = Math.round(p.seconds + (agora() - desde) / 1000); else if (tipo === 'skips') p.skips++; else if (tipo === 'backs') p.backs++; else if (tipo === 'lost') p.lost++; else p.hints++;
    gravar(CHAVE_DO_REGISTRO, reg);
  }
  function mostrar(): void { desde = agora(); mostrouOnde = false; valores = false; emitir(); }

  function encerrar(concluida: boolean): void {
    const terminada = licao; if (!terminada) return;
    if (concluida) anotar('complete'); else anotar('leave');
    const todos = progresso(); todos[terminada.id] = concluida ? { done: true } : { ...todos[terminada.id], step: indice }; gravar(CHAVE_DO_PROGRESSO, todos);
    licao = null; retido = -1;
    fim.value = { id: terminada.id, titulo: terminada.titulo, concluida, proxima: concluida ? terminada.proxima ?? null : null, aprendeu: concluida ? terminada.passos.flatMap(p => (p.aprendeu ? [p.aprendeu] : [])) : [] };
    emitir();
  }
  function avancar(): void {
    if (!licao) return;
    anotar('leave');
    if (indice >= licao.passos.length - 1) { encerrar(true); return; }
    retido = -1; indice++; const todos = progresso(); todos[licao.id] = { ...todos[licao.id], step: indice }; gravar(CHAVE_DO_PROGRESSO, todos); mostrar();
  }

  return {
    licoes, versao, fim, ativaId: () => licao?.id ?? null,
    info: () => (licao ? { id: licao.id, titulo: licao.titulo, indice, total: licao.passos.length } : null),
    passo, progresso,
    iniciar(id, de = 0) {
      const achada = licoes.find(l => l.id === id); if (!achada) return false;
      licao = achada; indice = Math.max(0, Math.min(achada.passos.length - 1, de)); retido = -1; fim.value = null; anotar('start'); mostrar(); return true;
    },
    parar: () => encerrar(false),
    voltar() { if (!licao) return; anotar('leave'); anotar('backs'); indice = Math.max(0, indice - 1); retido = indice; mostrar(); },
    pular() { if (!licao) return; anotar('skips'); avancar(); },
    continuar() { avancar(); },
    tique() {
      const p = passo(); if (!p) return false;
      // Um passo a que a pessoa voltou é dela para sair, e os de leitura esperam o "Continuar".
      if (p.feito[0] !== 'ler' && retido !== indice && atendida(p.feito, estado())) { avancar(); return true; }
      return false;
    },
    ajuda() {
      const p = passo(), esperou = (agora() - desde) / 1000;
      return { insiste: !!p && p.feito[0] !== 'ler' && esperou > INSISTIR, oferecer: !!p && p.feito[0] !== 'ler' && esperou > (p.tentar ? INSISTIR : OFERECER), mostrouOnde, valores };
    },
    mostrarOnde() { if (passo()?.tentar) { mostrouOnde = true; anotar('hints'); emitir(); } },
    pedirValores() { valores = true; anotar('hints'); emitir(); },
    perdido: () => anotar('lost'),
    relatorio: () => ({ exportado: new Date().toISOString(), progresso: progresso(), passos: ler<Record<string, LicaoDoRegistro>>(CHAVE_DO_REGISTRO) ?? {} }),
    fecharFim() { fim.value = null; },
  };
}

/** As lições visíveis na lista, por pasta (as sem pasta vão para "Outros"). */
export function porPasta(licoes: readonly Licao[], pastas: readonly { id: string; nome: string; sobre: string }[]): { pasta: { id: string | null; nome: string; sobre: string }; licoes: Licao[] }[] {
  const visiveis = licoes.filter(l => !l.oculta);
  return [...pastas, { id: null as unknown as string, nome: 'Outros', sobre: '' }].map(pasta => ({ pasta: pasta as { id: string | null; nome: string; sobre: string }, licoes: visiveis.filter(l => (l.pasta ?? null) === (pasta.id ?? null)) })).filter(x => x.licoes.length);
}

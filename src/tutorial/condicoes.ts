import type { Entidade, Ligacao } from '#mesa';
import { entidadePorRef } from '../dominio/cenas.ts';
import { analisarMarcadores } from '../dominio/marcadores.ts';
import { textoPuro, type Item } from '../dominio/quadro.ts';

/**
 * Verificações nomeadas que um passo de lição espera. Cada uma lê o estado da Mesa (quadro, sessão, campanha, projeção), nunca qual botão foi
 * apertado: o passo termina quando o resultado existe, por qualquer caminho que a pessoa tenha seguido.
 */
export interface EstadoDoTutor {
  tela: string;
  itens: readonly Item[];
  quadroAbertoId: string | null;
  ferramenta: string;
  modoQuadro: 'quadro' | 'ler';
  selecao: readonly string[];
  entidades: readonly Entidade[];
  ligacoes: readonly Ligacao[];
  sessaoGravando: boolean;
  temSessao: boolean;
  linhasDoRegistro: number;
  /** O preset de layout do Modo Sessão que coincide com o layout atual, ou `null` se é personalizado. */
  preset: string | null;
  paineisVisiveis: readonly string[];
  modoFoco: string;
  cenaAtivada: boolean;
  projetando: boolean;
  buscaRapidaAberta: boolean;
  menuContextoAberto: boolean;
  /** Modelos criados depois do início da lição. */
  modelosDesde: number;
}
/** `['nome', ...argumentos]`. */
export type Condicao = readonly [string, ...unknown[]];

const textoDe = (i: Item): string | null => (i.tipo === 'texto' || i.tipo === 'forma' ? textoPuro(i.doc) : null);
const norm = (s: string): string => s.trim().toLowerCase();
const nomeIgual = (a: string, b: string): boolean => norm(a) === norm(b);

/** Os tipos de ligação que `vincular*NaCena` grava, com o lado em que a cena fica. */
const LIGACOES_DA_CENA = { 'esta-em': 'de', 'toca-em': 'de', revela: 'de', 'aparece-em': 'para' } as const;

export const CONDICOES: Record<string, (e: EstadoDoTutor, ...a: never[]) => boolean> = {
  /** Uma explicação que a pessoa deixa com "Continuar". */
  ler: () => false,
  /** Todas as condições. */
  e: (e, ...condicoes: Condicao[]) => condicoes.every(c => atendida(c, e)),
  tela: (e, t: string) => e.tela === t,
  ferramenta: (e, f: string) => e.ferramenta === f,
  modoQuadro: (e, m: string) => e.modoQuadro === m,
  /** O quadro tem pelo menos `n` itens daquele tipo. */
  itens: (e, tipo: string, n: number) => e.itens.filter(i => i.tipo === tipo).length >= n,
  molduraComTitulo: (e, titulo: string) => e.itens.some(i => i.tipo === 'moldura' && nomeIgual(i.titulo, titulo)),
  /** Um texto ou forma cujo texto tem `n` marcadores daquele tipo (ex.: `[segredo]`). */
  marcador: (e, tipo: string, n = 1) => e.itens.some(i => {
    const t = textoDe(i);
    return t !== null && analisarMarcadores(t).filter(x => x.tipo === 'marcador' && x.marcador.tipo === tipo).length >= n;
  }),
  /** Um texto com `[[nome]]` (também `[[nome|rótulo]]`). */
  ligacaoNoTexto: (e, nome: string) => e.itens.some(i => {
    const t = textoDe(i); if (t === null) return false;
    return analisarMarcadores(t).some(x => x.tipo === 'ligacao' && nomeIgual(x.bruto.replace(/^\[\[|\]\]$/g, '').split('|')[0] ?? '', nome));
  }),
  /** Um item `ref` (de uma entidade do tipo dado, se o tipo vier). */
  refDe: (e, tipoEntidade?: string) => e.itens.some(i => {
    if (i.tipo !== 'ref') return false;
    if (tipoEntidade === undefined) return true;
    return entidadePorRef(i.ref, e.entidades)?.tipo === tipoEntidade;
  }),
  /** `n` setas com as duas pontas presas a itens. */
  setaLigada: (e, n = 1) => e.itens.filter(i => i.tipo === 'seta' && 'itemId' in i.de && 'itemId' in i.para).length >= n,
  /** `n` itens do tipo dentro de uma moldura. */
  dentroDeMoldura: (e, tipo: string, n: number) => e.itens.filter(i => i.tipo === tipo && i.molduraId !== null).length >= n,
  selecionados: (e, n: number) => e.selecao.length >= n,
  /** Há `n` itens selecionados daquele tipo (ex.: a moldura, para o menu dela). */
  selecaoDe: (e, tipo: string, n = 1) => e.itens.filter(i => i.tipo === tipo && e.selecao.includes(i.id)).length >= n,
  semRevisao: e => !e.itens.some(i => i.revisao !== undefined),
  modelos: (e, n: number) => e.modelosDesde >= n,
  projetando: e => e.projetando,
  naoProjetando: e => !e.projetando,
  sessaoGravando: e => e.sessaoGravando,
  /** Há sessão e ela não está gravando. */
  sessaoParada: e => e.temSessao && !e.sessaoGravando,
  registro: (e, n: number) => e.linhasDoRegistro >= n,
  preset: (e, id: string) => e.preset === id,
  painel: (e, id: string) => e.paineisVisiveis.includes(id),
  modoFoco: (e, m: string) => e.modoFoco === m,
  cenaAtivada: e => e.cenaAtivada,
  entidadeDe: (e, tipo: string, n: number) => e.entidades.filter(x => x.tipo === tipo).length >= n,
  entidadeNomeada: (e, nome: string) => e.entidades.some(x => nomeIgual(x.nome, nome)),
  /** Uma cena tem ligação (`esta-em`, `toca-em`, `revela` ou `aparece-em`) com uma entidade daquele tipo. Casa a ponta pelo Ref da Mesa ou pelo do app dono. */
  cenaCom: (e, tipoLigado: string) => {
    const cenas = e.entidades.filter(x => x.tipo === 'cena');
    return e.ligacoes.some(l => {
      const lado = LIGACOES_DA_CENA[l.tipo as keyof typeof LIGACOES_DA_CENA]; if (!lado) return false;
      const dona = entidadePorRef(lado === 'de' ? l.de : l.para, e.entidades), outra = entidadePorRef(lado === 'de' ? l.para : l.de, e.entidades);
      return !!dona && dona.tipo === 'cena' && cenas.includes(dona) && outra?.tipo === tipoLigado;
    });
  },
  buscaRapida: e => e.buscaRapidaAberta,
  menuContexto: e => e.menuContextoAberto,
};

/** Confere uma condição; uma condição que não existe nunca é atendida (e a lição de teste acusa). */
export function atendida(feito: Condicao | undefined, estado: EstadoDoTutor): boolean {
  if (!feito) return false;
  const f = CONDICOES[feito[0]]; if (!f) return false;
  return (f as (e: EstadoDoTutor, ...a: unknown[]) => boolean)(estado, ...feito.slice(1));
}

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarTutor, INSISTIR, OFERECER, porPasta, type Licao, type ArmazenamentoSimples } from '../../../src/tutorial/tutor.ts';
import type { EstadoDoTutor } from '../../../src/tutorial/condicoes.ts';

const memoria = (): ArmazenamentoSimples & { dados: Map<string, string> } => { const dados = new Map<string, string>(); return { dados, getItem: k => dados.get(k) ?? null, setItem: (k, v) => { dados.set(k, v); } }; };
const base = (): EstadoDoTutor => ({
  tela: 'quadros', itens: [], quadroAbertoId: null, ferramenta: 'selecionar', modoQuadro: 'quadro', selecao: [], entidades: [], ligacoes: [],
  sessaoGravando: false, temSessao: false, linhasDoRegistro: 0, preset: null, paineisVisiveis: [], modoFoco: 'auto', cenaAtivada: false,
  projetando: false, buscaRapidaAberta: false, menuContextoAberto: false, modelosDesde: 0,
});
const LICAO: Licao = { id: 'duas', titulo: 'Duas coisas', minutos: 1, proxima: 'outra', passos: [
  { diga: 'Leia', feito: ['ler'], aprendeu: 'Ler antes de fazer' },
  { diga: 'Pegue a nota', alvo: '[data-testid="ferramenta-nota"]', feito: ['ferramenta', 'nota'], aprendeu: ['N', 'nota adesiva'] },
  { diga: 'Agora o modo Ler, sozinho', feito: ['modoQuadro', 'ler'], tentar: true },
] };
function montar() {
  const e = base(), arm = memoria(); let t = 0;
  const tutor = criarTutor({ licoes: [LICAO], estado: () => e, agora: () => t, armazenamento: arm });
  return { e, arm, tutor, passa: (s: number) => { t += s * 1000; } };
}

test('a lição anda sozinha quando o resultado existe, espera o Continuar nos passos de leitura e termina com o que aprendeu', () => {
  const { e, tutor } = montar();
  assert.equal(tutor.iniciar('nao-existe'), false); assert.equal(tutor.iniciar('duas'), true);
  assert.deepEqual(tutor.info(), { id: 'duas', titulo: 'Duas coisas', indice: 0, total: 3 });
  assert.equal(tutor.tique(), false, 'o passo de leitura não avança sozinho'); tutor.continuar(); assert.equal(tutor.info()!.indice, 1);
  assert.equal(tutor.tique(), false); e.ferramenta = 'nota'; assert.equal(tutor.tique(), true); assert.equal(tutor.info()!.indice, 2);
  e.modoQuadro = 'ler'; assert.equal(tutor.tique(), true);
  assert.equal(tutor.info(), null); const f = tutor.fim.value!;
  assert.equal(f.concluida, true); assert.equal(f.proxima, 'outra'); assert.deepEqual(f.aprendeu, ['Ler antes de fazer', ['N', 'nota adesiva']]);
  assert.deepEqual(tutor.progresso().duas, { done: true });
});

test('o tutor nunca faz o passo: sem o resultado, nada avança, e voltar a um passo o segura até a pessoa sair', () => {
  const { e, tutor } = montar(); tutor.iniciar('duas', 1);
  for (let i = 0; i < 5; i++) assert.equal(tutor.tique(), false);
  e.ferramenta = 'nota'; tutor.voltar(); assert.equal(tutor.info()!.indice, 0);
  tutor.continuar(); assert.equal(tutor.info()!.indice, 1);        // o passo 1 já está feito, mas foi mostrado de novo: avança no próximo tique
  assert.equal(tutor.tique(), true);
  tutor.voltar(); assert.equal(tutor.info()!.indice, 1); assert.equal(tutor.tique(), false, 'o passo a que se voltou é da pessoa'); tutor.continuar(); assert.equal(tutor.info()!.indice, 2);
});

test('ajuda em degraus: o anel insiste aos 20 s, o cartão oferece os valores aos 35 s (aos 20 nos passos “sozinho”); “Mostrar onde” só nos passos sozinho', () => {
  const { tutor, passa } = montar(); tutor.iniciar('duas', 1);
  assert.deepEqual(tutor.ajuda(), { insiste: false, oferecer: false, mostrouOnde: false, valores: false });
  passa(INSISTIR + 1); assert.equal(tutor.ajuda().insiste, true); assert.equal(tutor.ajuda().oferecer, false);
  passa(OFERECER - INSISTIR); assert.equal(tutor.ajuda().oferecer, true);
  tutor.mostrarOnde(); assert.equal(tutor.ajuda().mostrouOnde, false, 'este passo não é “sozinho”');
  tutor.pedirValores(); assert.equal(tutor.ajuda().valores, true);
  tutor.iniciar('duas', 2); passa(INSISTIR + 1); assert.equal(tutor.ajuda().oferecer, true, 'passo sozinho: oferece aos 20 s'); tutor.mostrarOnde(); assert.equal(tutor.ajuda().mostrouOnde, true);
  tutor.iniciar('duas', 0); passa(100); assert.deepEqual(tutor.ajuda(), { insiste: false, oferecer: false, mostrouOnde: false, valores: false }, 'leitura não tem ajuda');
});

test('progresso e registro ficam no armazenamento; sair guarda o passo; o relatório junta tudo; sem armazenamento tudo continua funcionando', () => {
  const { arm, tutor, passa } = montar();
  tutor.iniciar('duas', 1); passa(12); tutor.pular(); tutor.voltar(); tutor.pedirValores(); passa(3); tutor.parar();
  assert.deepEqual(tutor.progresso().duas, { step: 1 }); assert.equal(tutor.fim.value!.concluida, false); assert.equal(tutor.fim.value!.proxima, null);
  const rel = tutor.relatorio(); assert.equal(rel.passos.duas!.starts, 1); assert.equal(rel.passos.duas!.completes, 0);
  assert.equal(rel.passos.duas!.steps[1]!.skips, 1); assert.equal(rel.passos.duas!.steps[1]!.seconds, 15, "12 s da primeira vez e 3 s da volta"); assert.equal(rel.passos.duas!.steps[2]!.backs, 1); assert.equal(rel.passos.duas!.steps[1]!.hints, 1);
  assert.ok(arm.dados.has('mesa-tutoriais-v1') && arm.dados.has('mesa-tutoriais-registro-v1'));
  const sem = criarTutor({ licoes: [LICAO], estado: base, armazenamento: null }); assert.equal(sem.iniciar('duas'), true); sem.continuar(); assert.equal(sem.info()!.indice, 1);
});

test('porPasta: agrupa na ordem das pastas, esconde as ocultas e junta o resto em “Outros”', () => {
  const l = (id: string, pasta?: string, oculta?: boolean): Licao => ({ id, titulo: id, minutos: 1, passos: [], ...(pasta ? { pasta } : {}), ...(oculta ? { oculta } : {}) });
  const grupos = porPasta([l('a', 'x'), l('b', 'y'), l('c'), l('d', 'x', true), l('e', 'x')], [{ id: 'x', nome: 'X', sobre: '' }, { id: 'y', nome: 'Y', sobre: '' }, { id: 'z', nome: 'Z', sobre: '' }]);
  assert.deepEqual(grupos.map(g => [g.pasta.nome, g.licoes.map(x => x.id)]), [['X', ['a', 'e']], ['Y', ['b']], ['Outros', ['c']]]);
});

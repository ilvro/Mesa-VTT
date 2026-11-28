import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarRef, type Entidade, type Ligacao } from '#mesa';
import { atendida, CONDICOES, type Condicao, type EstadoDoTutor } from '../../../src/tutorial/condicoes.ts';
import { docDeTexto, novaMoldura, novaRef, novaSeta, novoTexto, type Item } from '../../../src/dominio/quadro.ts';
import { refDaEntidade } from '../../../src/dominio/notas.ts';

const base = (): EstadoDoTutor => ({
  tela: 'quadros', itens: [], quadroAbertoId: null, ferramenta: 'selecionar', modoQuadro: 'quadro', selecao: [], entidades: [], ligacoes: [],
  sessaoGravando: false, temSessao: false, linhasDoRegistro: 0, preset: null, paineisVisiveis: [], modoFoco: 'auto', cenaAtivada: false,
  projetando: false, buscaRapidaAberta: false, menuContextoAberto: false, modelosDesde: 0, selecionadaId: null,
});
const com = (mud: Partial<EstadoDoTutor>): EstadoDoTutor => ({ ...base(), ...mud });
const texto = (id: string, s: string, extra: Partial<Item> = {}): Item => ({ ...novoTexto({ quadroId: 'q', x: 0, y: 0, doc: docDeTexto(s) }, 1, id), ...extra }) as Item;
const entidade = (id: string, tipo: Entidade['tipo'], nome: string, refs: Entidade['refs'] = []): Entidade =>
  ({ id, campanhaId: 'c', tipo, nome, refs, tags: [], notas: '', criadaPor: 'mesa', criadaEm: 1, atualizadaEm: 1 });
const lig = (de: Ligacao['de'], para: Ligacao['para'], tipo: Ligacao['tipo']): Ligacao => ({ id: `${tipo}-${de.id}`, campanhaId: 'c', de, para, tipo, criadaPor: 'mesa', criadaEm: 1 });
const ok = (c: Condicao | undefined, e: EstadoDoTutor) => atendida(c, e);

test('condição inexistente nunca é atendida; ler nunca é; e exige todas', () => {
  assert.equal(ok(['nao-existe'], base()), false); assert.equal(ok(['ler'], base()), false); assert.equal(ok(undefined, base()), false);
  assert.equal(ok(['e', ['tela', 'quadros'], ['ferramenta', 'nota']], com({ ferramenta: 'nota' })), true);
  assert.equal(ok(['e', ['tela', 'quadros'], ['ferramenta', 'nota']], base()), false);
});

test('tela, ferramenta e modoQuadro', () => {
  assert.equal(ok(['tela', 'sessao'], com({ tela: 'sessao' })), true); assert.equal(ok(['tela', 'sessao'], base()), false);
  assert.equal(ok(['ferramenta', 'seta'], com({ ferramenta: 'seta' })), true);
  assert.equal(ok(['modoQuadro', 'ler'], com({ modoQuadro: 'ler' })), true); assert.equal(ok(['modoQuadro', 'ler'], base()), false);
});

test('itens, molduraComTitulo, dentroDeMoldura, selecionados, semRevisao', () => {
  const m = novaMoldura({ quadroId: 'q', x: 0, y: 0, titulo: 'Cena 1' }, 1, 'm');
  const dentro = texto('t', 'a', { molduraId: 'm' });
  const e = com({ itens: [m, dentro, texto('u', 'b')], selecao: ['t', 'u'] });
  assert.equal(ok(['itens', 'texto', 2], e), true); assert.equal(ok(['itens', 'texto', 3], e), false); assert.equal(ok(['itens', 'moldura', 1], e), true);
  assert.equal(ok(['molduraComTitulo', 'cena 1'], e), true); assert.equal(ok(['molduraComTitulo', 'Outra'], e), false);
  assert.equal(ok(['dentroDeMoldura', 'texto', 1], e), true); assert.equal(ok(['dentroDeMoldura', 'texto', 2], e), false);
  assert.equal(ok(['selecionados', 2], e), true); assert.equal(ok(['selecionados', 3], e), false);
  assert.equal(ok(['selecaoDe', 'moldura'], e), false); assert.equal(ok(['selecaoDe', 'texto', 2], e), true); assert.equal(ok(['selecaoDe', 'moldura'], com({ itens: [m], selecao: ['m'] })), true);
  assert.equal(ok(['semRevisao'], e), true);
  const rev = texto('r', 'x', { revisao: { tipoSugerido: null, motivos: [], origem: 'miro' } });
  assert.equal(ok(['semRevisao'], com({ itens: [rev] })), false);
});

test('marcador e ligacaoNoTexto', () => {
  const e = com({ itens: [texto('a', 'O baú tem um [segredo] antigo'), texto('b', 'Fale com [[Marta]] depois'), texto('c', 'nada')] });
  assert.equal(ok(['marcador', 'segredo'], e), true); assert.equal(ok(['marcador', 'segredo', 2], e), false); assert.equal(ok(['marcador', 'loot'], e), false);
  assert.equal(ok(['marcador', 'segredo'], com({ itens: [texto('c', 'segredo sem colchetes')] })), false);
  assert.equal(ok(['ligacaoNoTexto', 'marta'], e), true); assert.equal(ok(['ligacaoNoTexto', 'Pedro'], e), false);
});

test('refDe e setaLigada', () => {
  const marta = entidade('e1', 'personagem', 'Marta');
  const r = novaRef({ quadroId: 'q', x: 0, y: 0, ref: refDaEntidade('e1') }, 1, 'r');
  const e = com({ itens: [r], entidades: [marta] });
  assert.equal(ok(['refDe'], e), true); assert.equal(ok(['refDe', 'personagem'], e), true); assert.equal(ok(['refDe', 'lugar'], e), false); assert.equal(ok(['refDe'], base()), false);
  const solta = novaSeta({ quadroId: 'q', de: { itemId: 'a', lado: 'direita' }, para: { ponto: [1, 1] } }, 1, 's1');
  const presa = novaSeta({ quadroId: 'q', de: { itemId: 'a', lado: 'direita' }, para: { itemId: 'b', lado: 'esquerda' } }, 1, 's2');
  assert.equal(ok(['setaLigada'], com({ itens: [solta] })), false); assert.equal(ok(['setaLigada'], com({ itens: [solta, presa] })), true); assert.equal(ok(['setaLigada', 2], com({ itens: [solta, presa] })), false);
});

test('modelos, projeção, sessão, registro, preset, painel, foco, cena ativada, busca e menu', () => {
  assert.equal(ok(['modelos', 1], com({ modelosDesde: 1 })), true); assert.equal(ok(['modelos', 1], base()), false);
  assert.equal(ok(['projetando'], com({ projetando: true })), true); assert.equal(ok(['naoProjetando'], com({ projetando: true })), false); assert.equal(ok(['naoProjetando'], base()), true);
  assert.equal(ok(['sessaoGravando'], com({ sessaoGravando: true })), true); assert.equal(ok(['sessaoGravando'], base()), false);
  assert.equal(ok(['sessaoParada'], base()), false); assert.equal(ok(['sessaoParada'], com({ temSessao: true })), true); assert.equal(ok(['sessaoParada'], com({ temSessao: true, sessaoGravando: true })), false);
  assert.equal(ok(['registro', 3], com({ linhasDoRegistro: 3 })), true); assert.equal(ok(['registro', 3], com({ linhasDoRegistro: 2 })), false);
  assert.equal(ok(['preset', 'Padrão'], com({ preset: 'Padrão' })), true); assert.equal(ok(['preset', 'Padrão'], base()), false);
  assert.equal(ok(['painel', 'quadro'], com({ paineisVisiveis: ['mapa', 'quadro'] })), true); assert.equal(ok(['painel', 'quadro'], base()), false);
  assert.equal(ok(['modoFoco', 'quadro'], com({ modoFoco: 'quadro' })), true); assert.equal(ok(['modoFoco', 'quadro'], base()), false);
  assert.equal(ok(['cenaAtivada'], com({ cenaAtivada: true })), true); assert.equal(ok(['cenaAtivada'], base()), false);
  assert.equal(ok(['buscaRapida'], com({ buscaRapidaAberta: true })), true); assert.equal(ok(['buscaRapida'], base()), false);
  assert.equal(ok(['menuContexto'], com({ menuContextoAberto: true })), true); assert.equal(ok(['menuContexto'], base()), false);
});

test('entidadeDe e entidadeNomeada', () => {
  const e = com({ entidades: [entidade('1', 'cena', 'A Taverna'), entidade('2', 'cena', 'B'), entidade('3', 'lugar', 'C')] });
  assert.equal(ok(['entidadeDe', 'cena', 2], e), true); assert.equal(ok(['entidadeDe', 'cena', 3], e), false); assert.equal(ok(['entidadeDe', 'pista', 1], e), false);
  assert.equal(ok(['entidadeNomeada', 'a taverna'], e), true); assert.equal(ok(['entidadeNomeada', 'Z'], e), false);
});

test('cenaCom: como vincular*NaCena grava (mapa/trilha/pista saem da cena, participante entra nela), pelo Ref da Mesa ou do app dono', () => {
  const cena = entidade('c1', 'cena', 'Cena'), refCena = refDaEntidade('c1');
  const mapa = entidade('l1', 'lugar', 'Mapa', [criarRef('atlas', 'mapa', 'm1')]);
  const trilha = entidade('t1', 'efeito', 'Trilha', [criarRef('jukebox', 'cena-sonora', 's1')]);
  const pista = entidade('p1', 'pista', 'Pista', [criarRef('atelie', 'documento', 'd1')]);
  const pers = entidade('x1', 'personagem', 'Ana', [criarRef('ficha', 'ficha', 'f1')]);
  const entidades = [cena, mapa, trilha, pista, pers];
  assert.equal(ok(['cenaCom', 'lugar'], com({ entidades })), false);
  // Ponta pelo Ref do app dono
  assert.equal(ok(['cenaCom', 'lugar'], com({ entidades, ligacoes: [lig(refCena, criarRef('atlas', 'mapa', 'm1'), 'esta-em')] })), true);
  // Ponta pelo Ref da Mesa
  assert.equal(ok(['cenaCom', 'lugar'], com({ entidades, ligacoes: [lig(refCena, refDaEntidade('l1'), 'esta-em')] })), true);
  assert.equal(ok(['cenaCom', 'efeito'], com({ entidades, ligacoes: [lig(refCena, criarRef('jukebox', 'cena-sonora', 's1'), 'toca-em')] })), true);
  assert.equal(ok(['cenaCom', 'pista'], com({ entidades, ligacoes: [lig(refCena, criarRef('atelie', 'documento', 'd1'), 'revela')] })), true);
  assert.equal(ok(['cenaCom', 'personagem'], com({ entidades, ligacoes: [lig(criarRef('ficha', 'ficha', 'f1'), refCena, 'aparece-em')] })), true);
  // Tipo errado, ligação de outro tipo e cena que não é cena não contam
  assert.equal(ok(['cenaCom', 'pista'], com({ entidades, ligacoes: [lig(refCena, refDaEntidade('l1'), 'esta-em')] })), false);
  assert.equal(ok(['cenaCom', 'lugar'], com({ entidades, ligacoes: [lig(refCena, refDaEntidade('l1'), 'menciona')] })), false);
  assert.equal(ok(['cenaCom', 'lugar'], com({ entidades, ligacoes: [lig(refDaEntidade('p1'), refDaEntidade('l1'), 'esta-em')] })), false);
});

test('selecionada: a entidade aberta tem aquele nome', () => {
  const entidades = [entidade('j', 'personagem', 'Joana'), entidade('c', 'cena', 'Chegada')];
  assert.equal(ok(['selecionada', 'joana'], com({ entidades, selecionadaId: 'j' })), true);
  assert.equal(ok(['selecionada', 'Joana'], com({ entidades, selecionadaId: 'c' })), false);
  assert.equal(ok(['selecionada', 'Joana'], com({ entidades })), false);
});

test('toda condição do catálogo existe como função', () => {
  for (const [nome, f] of Object.entries(CONDICOES)) assert.equal(typeof f, 'function', nome);
});

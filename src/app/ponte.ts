// Só em desenvolvimento: carregado por `main.tsx` dentro de `if (import.meta.env.DEV)`; o Vite elimina o chunk do build.
import { conectarPonte, type FerramentaDaPonte } from '#mesa/ponte';
import { FONTES } from '../dominio/fontes.ts';
import { capturadorDoQuadro, estadoDaPonte, medidorDeLargura, medidorDeTexto } from './assistente-slot.ts';
import { abrirAplicativo } from './aplicativos.ts';
import { alternarEncontroDaCena, alterarEntidade, atualizar, campanhaAtiva, campanhas, criarCampanha, criarEntidade, definirMomentoDaCena, ligarRefs, obterRepositorio, salvarElencoDaCampanha, vincularMapaNaCena, vincularParticipanteNaCena, vincularPistaNaCena, vincularTrilhaNaCena } from './campanha.ts';
import { ferramentasDaMesa } from './ponte-ferramentas.ts';
import { momentosDoMapaDoAtlas } from './momentos-do-atlas.ts';
import { gravarItens, guardarImagem, listarItens, listarQuadros, listarResumos } from './banco-quadros.ts';
import { gravarResumo } from './resumos-quadro.ts';
import { imagemReduzidaParaAssistente } from './imagens-quadro.ts';
import { executar as executarNoQuadro, itens as itensDoQuadro, paletaDaCampanha, quadroAberto } from './quadros.ts';
import { oQueVejo } from './o-que-vejo.ts';
import { alterarSessaoPorId, carregarSessoes, planejarSessao } from './registro.ts';
import type { Item } from '../dominio/quadro.ts';
import type { Efeito } from '../dominio/efeitos.ts';
import { registrarChamadaConcluida } from './atividade-do-assistente.ts';

/** A campanha da chamada: a da tela ou, se a tela ainda não a tem, a salva no navegador (`atualizar` a valida no banco). Os dados vêm sempre do banco, não dos signals. */
async function campanhaDaChamada(): Promise<{ id: string; nome: string } | null> {
  if (!campanhaAtiva.value) await atualizar();
  const c = campanhaAtiva.value;
  return c ? { id: c.id, nome: c.nome } : null;
}
async function entidadesDoBanco() { const c = await campanhaDaChamada(); return c ? obterRepositorio().listarEntidades(c.id) : []; }
async function ligacoesDoBanco() { const c = await campanhaDaChamada(); return c ? obterRepositorio().listarLigacoes(c.id) : []; }

const FERRAMENTAS_DE_ESCRITA = new Set([
  'mesa_sessao_criar',
  'mesa_sessao_editar',
  'mesa_entidade_criar',
  'mesa_entidade_editar',
  'mesa_ligar',
  'mesa_cena_montar',
  'mesa_elenco',
  'mesa_campanha_criar',
]);

let efeitosAtuais: Efeito[] = [];
const registrar = (e: Efeito) => {
  efeitosAtuais.push(e);
};

function resumirChamada(ferramenta: string, args: Record<string, unknown>): string {
  switch (ferramenta) {
    case 'mesa_sessao_criar':
      return `Criou sessão "${args.nome ?? ''}"`;
    case 'mesa_sessao_editar':
      return `Editou sessão "${args.nome ?? args.id ?? ''}"`;
    case 'mesa_entidade_criar':
      return `Criou ${args.tipo ?? 'entidade'} "${args.nome ?? ''}"`;
    case 'mesa_entidade_editar':
      return `Editou "${args.nome ?? args.id ?? ''}"`;
    case 'mesa_ligar':
      return `Ligou referências (${args.tipo ?? ''})`;
    case 'mesa_cena_montar':
      return `Montou cena "${args.cenaId ?? ''}"`;
    case 'mesa_elenco':
      return 'Alterou elenco';
    case 'mesa_campanha_criar':
      return `Criou campanha "${args.nome ?? ''}"`;
    default:
      return ferramenta;
  }
}

function embrulharFerramenta(f: FerramentaDaPonte): FerramentaDaPonte {
  if (!FERRAMENTAS_DE_ESCRITA.has(f.nome)) return f;
  return {
    ...f,
    async executar(args) {
      efeitosAtuais = [];
      const quando = Date.now();
      const resultado = await f.executar(args);
      if (efeitosAtuais.length > 0) {
        registrarChamadaConcluida({
          quando,
          ferramenta: f.nome,
          resumo: resumirChamada(f.nome, args),
          efeitos: [...efeitosAtuais],
          desfeita: false,
        });
      }
      return resultado;
    },
  };
}

const ferramentas = ferramentasDaMesa({
  repositorio: async () => obterRepositorio(),
  sessoes: {
    campanha: campanhaDaChamada,
    sessoes: async () => { const c = await campanhaDaChamada(); return c ? obterRepositorio().listarSessoes(c.id) : []; },
    planejar: planejarSessao,
    alterar: async (id, mudancas) => { await carregarSessoes(); return alterarSessaoPorId(id, mudancas); },
    recarregar: carregarSessoes,
    registrar,
  },
  entidades: {
    campanha: campanhaDaChamada,
    entidades: entidadesDoBanco,
    criar: (t, n) => criarEntidade(t, n, false),
    alterar: alterarEntidade,
    ligar: ligarRefs,
    registrar,
  },
  campanhas: {
    campanhas: async () => { await atualizar(); return campanhas.value; },
    ativaId: () => campanhaAtiva.value?.id ?? null,
    criar: criarCampanha,
    registrar,
  },
  cenas: {
    campanha: campanhaDaChamada,
    entidades: entidadesDoBanco,
    ligacoes: ligacoesDoBanco,
    vincularMapa: vincularMapaNaCena,
    vincularTrilha: vincularTrilhaNaCena,
    vincularParticipante: vincularParticipanteNaCena,
    vincularPista: vincularPistaNaCena,
    alternarEncontro: alternarEncontroDaCena,
    definirMomento: definirMomentoDaCena,
    momentosDoMapa: momentosDoMapaDoAtlas,
    abrirApp: app => abrirAplicativo(app),
    registrar,
  },
  elenco: {
    campanha: async () => { const c = await campanhaDaChamada(); return c ? (await obterRepositorio().obterCampanha(c.id)) ?? null : null; },
    entidades: entidadesDoBanco,
    salvarElenco: salvarElencoDaCampanha,
    registrar,
  },
  quadros: {
    campanha: campanhaDaChamada,
    quadros: id => listarQuadros(id),
    itens: id => listarItens(id),
    aberto: () => (quadroAberto.value ? { quadro: quadroAberto.value, itens: [...itensDoQuadro.value.values()] } : null),
    entidades: async () => new Map((await entidadesDoBanco()).map(e => [e.id, { nome: e.nome, tipo: e.tipo }])),
    imagem: imagemReduzidaParaAssistente,
    retratoDaEntidade: async entidadeId => {
      const retrato = (await entidadesDoBanco()).find(e => e.id === entidadeId)?.retrato;
      if (!retrato) return null;
      // Copia o retrato para o banco de imagens do quadro (o id é o hash, então copiar de novo não duplica).
      const { id, largura, altura } = await guardarImagem(retrato);
      return { imagemId: id, larguraOriginal: largura > 0 ? largura : 320, alturaOriginal: altura > 0 ? altura : 240 };
    },
    guardarImagemDeDados: async dataUrl => {
      const blob = await (await fetch(dataUrl)).blob();
      const { id, largura, altura } = await guardarImagem(blob);
      return { imagemId: id, larguraOriginal: largura > 0 ? largura : 320, alturaOriginal: altura > 0 ? altura : 240 };
    },
    resumos: id => listarResumos(id),
    salvarResumo: gravarResumo,
    criarItens: async (quadroId, novos, rotulo, mover = []) => {
      const agora = Date.now();
      const descer = (it: Item, dy: number): Item => ({ ...it, y: it.y + dy, atualizadoEm: agora });
      if (quadroAberto.value?.id === quadroId) {
        const alterar = mover.flatMap(({ id, dy }) => {
          const it = itensDoQuadro.value.get(id);
          return it ? [{ id, antes: { y: it.y, atualizadoEm: it.atualizadoEm }, depois: { y: it.y + dy, atualizadoEm: agora } }] : [];
        });
        // Um único passo: um Ctrl+Z desfaz a criação e o movimento juntos.
        executarNoQuadro({ rotulo, ops: alterar.length > 0 ? [{ criar: novos }, { alterar }] : [{ criar: novos }] });
      } else {
        const existentes = mover.length > 0 ? new Map((await listarItens(quadroId)).map(i => [i.id, i])) : new Map<string, Item>();
        const movidos = mover.flatMap(({ id, dy }) => { const it = existentes.get(id); return it ? [descer(it, dy)] : []; });
        await gravarItens([...novos, ...movidos], []);
      }
    },
    prepararFontes: async () => {
      // As fontes só baixam no primeiro uso; medir antes disso usa a reserva, mais larga (sobrava ~15% de caixa).
      if (typeof document === 'undefined' || !document.fonts) return;
      const pesos = ['400 14px', '700 14px', 'italic 400 14px'];
      await Promise.all(Object.values(FONTES).flatMap(f => pesos.map(p => document.fonts.load(`${p} ${f.familia}`).catch(() => []))));
    },
    medirTexto: item => {
      const medida = medidorDeTexto.value?.({ doc: item.doc, largura: item.largura, padding: item.caixa.padding, tamanhoFonte: item.texto.tamanho, fonte: item.texto.fonte, corPadrao: item.texto.cor, alinhamento: item.texto.alinhamento });
      // Fontes já carregadas (prepararFontes): folga de 2% para arredondamentos; texto vazio ou sem medidor: a altura atual.
      return medida == null ? item.altura : Math.ceil(medida * 1.02);
    },
    medirLarguraDoTexto: item => {
      const medida = medidorDeLargura.value?.({ doc: item.doc, padding: item.caixa.padding, tamanhoFonte: item.texto.tamanho, fonte: item.texto.fonte, corPadrao: item.texto.cor, alinhamento: item.texto.alinhamento });
      // Mesma folga de 6% do medirTexto; sem medida, null (o domínio mantém a largura copiada).
      return medida == null ? null : Math.ceil(medida * 1.06);
    },
    paleta: () => paletaDaCampanha.value,
    capturar: async (quadro, itens, caixa, lado) => {
      const capturar = capturadorDoQuadro.value;
      if (!capturar) throw new Error('A captura do quadro ainda não carregou; tente de novo em instantes.');
      return capturar(itens, caixa, { lado, fundo: quadro.fundo.cor, paleta: paletaDaCampanha.value });
    },
  },
  campanhaAtual: () => campanhaAtiva.value,
  oQueVejo,
}).map(embrulharFerramenta);

const cliente = conectarPonte({
  app: 'mesa',
  titulo: 'Mesa',
  ferramentas,
});

estadoDaPonte.value = cliente.estado();
cliente.aoMudarEstado(e => { estadoDaPonte.value = e; });

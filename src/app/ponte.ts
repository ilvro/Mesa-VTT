// Só em desenvolvimento: importado por `main.tsx` dentro de `if (import.meta.env.DEV)`; o Vite elimina o chunk do build.
import { conectarPonte, type FerramentaDaPonte } from '#mesa/ponte';
import { SeloDoAssistente, estadoDaPonte } from '../ui/SeloDoAssistente.tsx';
import { seloDoAssistente } from './assistente-slot.ts';
import { abrirAplicativo } from './aplicativos.ts';
import { alternarEncontroDaCena, alterarEntidade, atualizar, campanhaAtiva, campanhas, criarCampanha, criarEntidade, definirMomentoDaCena, ligarRefs, obterRepositorio, salvarElencoDaCampanha, vincularMapaNaCena, vincularParticipanteNaCena, vincularPistaNaCena, vincularTrilhaNaCena } from './campanha.ts';
import { ferramentasDaMesa } from './ponte-ferramentas.ts';
import { momentosDoMapaDoAtlas } from './momentos-do-atlas.ts';
import { oQueVejo } from './o-que-vejo.ts';
import { alterarSessaoPorId, carregarSessoes, planejarSessao } from './registro.ts';
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
seloDoAssistente.value = SeloDoAssistente;

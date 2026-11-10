// Só em desenvolvimento: importado por `main.tsx` dentro de `if (import.meta.env.DEV)`; o Vite elimina o chunk do build.
import { conectarPonte, ferramentasDaCampanha, json } from '#mesa/ponte';
import { SeloDoAssistente, estadoDaPonte } from '../ui/SeloDoAssistente.tsx';
import { seloDoAssistente } from './assistente-slot.ts';
import { abrirAplicativo } from './aplicativos.ts';
import { alternarEncontroDaCena, alterarEntidade, atualizar, campanhaAtiva, criarEntidade, definirMomentoDaCena, ligarRefs, obterRepositorio, salvarElencoDaCampanha, vincularMapaNaCena, vincularParticipanteNaCena, vincularPistaNaCena, vincularTrilhaNaCena } from './campanha.ts';
import { ferramentasDeCena, ferramentasDeElenco, ferramentasDeEntidade, ferramentasDeSessao } from './ponte-escrita.ts';
import { oQueVejo } from './o-que-vejo.ts';
import { alterarSessaoPorId, carregarSessoes, planejarSessao } from './registro.ts';

/** A campanha da chamada: a da tela ou, se a tela ainda não a tem, a salva no navegador (`atualizar` a valida no banco). Os dados vêm sempre do banco, não dos signals. */
async function campanhaDaChamada(): Promise<{ id: string; nome: string } | null> {
  if (!campanhaAtiva.value) await atualizar();
  const c = campanhaAtiva.value;
  return c ? { id: c.id, nome: c.nome } : null;
}
async function entidadesDoBanco() { const c = await campanhaDaChamada(); return c ? obterRepositorio().listarEntidades(c.id) : []; }
async function ligacoesDoBanco() { const c = await campanhaDaChamada(); return c ? obterRepositorio().listarLigacoes(c.id) : []; }

const cliente = conectarPonte({
  app: 'mesa', titulo: 'Mesa',
  ferramentas: [
    ...ferramentasDaCampanha(async () => obterRepositorio()),
    ...ferramentasDeSessao({
      campanha: campanhaDaChamada,
      sessoes: async () => { const c = await campanhaDaChamada(); return c ? obterRepositorio().listarSessoes(c.id) : []; },
      planejar: planejarSessao,
      alterar: async (id, mudancas) => { await carregarSessoes(); return alterarSessaoPorId(id, mudancas); },   // a cópia da tela pode estar velha ou vazia
      recarregar: carregarSessoes,
    }),
    ...ferramentasDeEntidade({ campanha: campanhaDaChamada, entidades: entidadesDoBanco, criar: (t, n) => criarEntidade(t, n, false), alterar: alterarEntidade, ligar: ligarRefs }),
    ...ferramentasDeCena({
      campanha: campanhaDaChamada, entidades: entidadesDoBanco, ligacoes: ligacoesDoBanco,
      vincularMapa: vincularMapaNaCena, vincularTrilha: vincularTrilhaNaCena, vincularParticipante: vincularParticipanteNaCena, vincularPista: vincularPistaNaCena,
      alternarEncontro: alternarEncontroDaCena, definirMomento: definirMomentoDaCena, abrirApp: app => abrirAplicativo(app),
    }),
    ...ferramentasDeElenco({
      campanha: async () => { const c = await campanhaDaChamada(); return c ? (await obterRepositorio().obterCampanha(c.id)) ?? null : null; },
      entidades: entidadesDoBanco,
      salvarElenco: salvarElencoDaCampanha,
    }),
    {
      nome: 'mesa_campanha_atual',
      descricao: 'A campanha selecionada no hub da Mesa (id, nome e sistema), ou "nenhuma".',
      esquema: { type: 'object', properties: {}, required: [], additionalProperties: false },
      async executar() {
        const c = campanhaAtiva.value;
        return [json(c ? { id: c.id, nome: c.nome, sistema: c.sistema } : 'nenhuma')];
      },
    },
    {
      nome: 'mesa_o_que_vejo',
      descricao: 'O que o mestre tem na tela da Mesa agora: a campanha, a tela atual (coleção, sessão, campanhas, aplicativos) e o item aberto (a entidade selecionada). Use para entender "esta sessão", "este personagem".',
      esquema: { type: 'object', properties: {}, required: [], additionalProperties: false },
      async executar() { return [json(oQueVejo())]; },
    },
  ],
});

estadoDaPonte.value = cliente.estado();
cliente.aoMudarEstado(e => { estadoDaPonte.value = e; });
seloDoAssistente.value = SeloDoAssistente;

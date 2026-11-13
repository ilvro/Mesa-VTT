// A lista de ferramentas da Mesa, montada a partir de um contexto: sem DOM, signals nem banco, para poder ser importada em Node
// (o gerador do catálogo base do Atlas a monta com contexto falso). `ponte.ts` entrega o contexto real e liga a ponte.
import { ferramentasDaCampanha, json, type FerramentaDaPonte } from '#mesa/ponte';
import {
  ferramentasDeCampanhas, ferramentasDeCena, ferramentasDeElenco, ferramentasDeEntidade, ferramentasDeSessao,
  type ContextoDeCampanhas, type ContextoDeCenas, type ContextoDeElenco, type ContextoDeEntidades, type ContextoDeSessoes
} from './ponte-escrita.ts';

export interface ContextoDaMesa {
  repositorio: Parameters<typeof ferramentasDaCampanha>[0];
  sessoes: ContextoDeSessoes;
  entidades: ContextoDeEntidades;
  campanhas: ContextoDeCampanhas;
  cenas: ContextoDeCenas;
  elenco: ContextoDeElenco;
  /** A campanha selecionada no hub, ou null. */
  campanhaAtual: () => { id: string; nome: string; sistema: string } | null;
  oQueVejo: () => Record<string, unknown>;
}

export function ferramentasDaMesa(ctx: ContextoDaMesa): FerramentaDaPonte[] {
  return [
    ...ferramentasDaCampanha(ctx.repositorio),
    ...ferramentasDeSessao(ctx.sessoes),
    ...ferramentasDeEntidade(ctx.entidades),
    ...ferramentasDeCampanhas(ctx.campanhas),
    ...ferramentasDeCena(ctx.cenas),
    ...ferramentasDeElenco(ctx.elenco),
    {
      nome: 'mesa_campanha_atual',
      descricao: 'A campanha selecionada no hub da Mesa (id, nome e sistema), ou "nenhuma".',
      esquema: { type: 'object', properties: {}, required: [], additionalProperties: false },
      anotacoes: { leitura: true },
      async executar() {
        const c = ctx.campanhaAtual();
        return [json(c ? { id: c.id, nome: c.nome, sistema: c.sistema } : 'nenhuma')];
      },
    },
    {
      nome: 'mesa_o_que_vejo',
      descricao: 'O que o mestre tem na tela da Mesa: campanha, tela atual e item aberto. Use para entender "esta sessão", "este personagem".',
      esquema: { type: 'object', properties: {}, required: [], additionalProperties: false },
      anotacoes: { leitura: true },
      async executar() { return [json(ctx.oQueVejo())]; },
    },
  ];
}

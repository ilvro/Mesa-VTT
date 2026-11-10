// Só em desenvolvimento: importado por `main.tsx` dentro de `if (import.meta.env.DEV)`; o Vite elimina o chunk do build.
import { conectarPonte, ferramentasDaCampanha, json } from '#mesa/ponte';
import { SeloDoAssistente, estadoDaPonte } from '../ui/SeloDoAssistente.tsx';
import { seloDoAssistente } from './assistente-slot.ts';
import { campanhaAtiva, obterRepositorio } from './campanha.ts';
import { ferramentasDeSessao } from './ponte-escrita.ts';
import { oQueVejo } from './o-que-vejo.ts';
import { alterarSessaoPorId, planejarSessao, sessoes } from './registro.ts';

const cliente = conectarPonte({
  app: 'mesa', titulo: 'Mesa',
  ferramentas: [
    ...ferramentasDaCampanha(async () => obterRepositorio()),
    ...ferramentasDeSessao({ campanha: () => campanhaAtiva.value, sessoes: () => sessoes.value, planejar: planejarSessao, alterar: alterarSessaoPorId }),
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

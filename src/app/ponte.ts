// Só em desenvolvimento: importado por `main.tsx` dentro de `if (import.meta.env.DEV)`; o Vite elimina o chunk do build.
import { conectarPonte, ferramentasDaCampanha, json } from '#mesa/ponte';
import { campanhaAtiva, obterRepositorio } from './campanha.ts';

conectarPonte({
  app: 'mesa', titulo: 'Mesa',
  ferramentas: [
    ...ferramentasDaCampanha(async () => obterRepositorio()),
    {
      nome: 'mesa_campanha_atual',
      descricao: 'A campanha selecionada no hub da Mesa (id, nome e sistema), ou "nenhuma".',
      esquema: { type: 'object', properties: {}, required: [], additionalProperties: false },
      async executar() {
        const c = campanhaAtiva.value;
        return [json(c ? { id: c.id, nome: c.nome, sistema: c.sistema } : 'nenhuma')];
      },
    },
  ],
});

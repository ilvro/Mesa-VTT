// Só entra pelo `ponte.ts` (desenvolvimento): o que o mestre tem na tela da Mesa, para a ferramenta `mesa_o_que_vejo`.
import { campanhaAtiva, selecionada } from './campanha.ts';
import { tela, type Tela } from './rotas.ts';
import { mapaAtual } from './sessao.ts';

const ROTULO: Record<Tela, string> = { entidades: 'Campanha (coleção)', sessao: 'Sessão (modo sessão)', campanhas: 'Campanhas', aplicativos: 'Aplicativos' };

export function oQueVejo(): Record<string, unknown> {
  const c = campanhaAtiva.value, e = selecionada.value, t = tela.value, m = mapaAtual.value;
  return {
    campanha: c ? { id: c.id, nome: c.nome, sistema: c.sistema } : null,
    tela: { id: t, nome: ROTULO[t] },
    itemAberto: e ? { id: e.id, tipo: e.tipo, nome: e.nome, tags: e.tags } : null,
    sessaoAberta: t === 'sessao' || e?.tipo === 'sessao',
    ...(t === 'sessao' ? { mapaDaSessao: m ? { id: m.mapaId, nome: m.nome } : null } : {}),
  };
}

// Só em desenvolvimento (entra pela ponte). Ferramentas de escrita da Mesa; o contexto é injetável para testar sem DOM.
import { chaveDaRef, formatarRef, lerRef, type Ref, type Sessao } from '#mesa';
import { json, type FerramentaDaPonte } from '#mesa/ponte';
import { adicionar, MAXIMO_DO_ROTEIRO, podarNotas, removerItem } from '../dominio/roteiro.ts';

export interface ContextoDeSessoes {
  campanha(): { id: string; nome: string } | null;
  sessoes(): Sessao[];
  planejar(nome: string, data?: number): Promise<Sessao | null>;
  alterar(id: string, mudancas: Partial<Pick<Sessao, 'roteiro' | 'roteiroNotas' | 'nome' | 'data'>>): Promise<Sessao | null>;
}

const SEM_CAMPANHA = 'Nenhuma campanha selecionada na Mesa. Peça ao mestre para abrir uma campanha no hub e tente de novo.';
const refEsquema = { description: 'Referência: objeto {app, tipo, id} ou texto "mesa:app/tipo/id" (ex.: "mesa:atlas/mapa/abc123").', anyOf: [{ type: 'string' }, { type: 'object', properties: { app: { type: 'string' }, tipo: { type: 'string' }, id: { type: 'string' } }, required: ['app', 'tipo', 'id'] }] };
const listaDeRefs = (descricao: string) => ({ type: 'array', description: descricao, items: refEsquema });

/** Aceita `{app,tipo,id}` ou `mesa:app/tipo/id`; lança com mensagem legível. */
export function lerRefDoClaude(v: unknown): Ref {
  if (typeof v === 'string') {
    const r = lerRef(v.trim());
    if (!r) throw new Error(`Referência inválida: "${v}". Use "mesa:app/tipo/id", por exemplo "mesa:atlas/mapa/abc123".`);
    return r;
  }
  if (v && typeof v === 'object') {
    const { app, tipo, id } = v as Record<string, unknown>;
    if (typeof app === 'string' && typeof tipo === 'string' && typeof id === 'string') {
      const r = lerRef(`mesa:${app}/${tipo}/${id}`);
      if (r) return r;
    }
  }
  throw new Error(`Referência inválida: ${JSON.stringify(v)}. Use {app, tipo, id} ou "mesa:app/tipo/id".`);
}
const lerRefs = (v: unknown, campo: string): Ref[] => {
  if (v === undefined) return [];
  if (!Array.isArray(v)) throw new Error(`"${campo}" deve ser uma lista de referências.`);
  return v.map(lerRefDoClaude);
};

/** "2026-11-14", ISO ou milissegundos. Data sem hora vale ao meio-dia, no fuso local. */
export function lerData(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.trim());
    const t = m ? new Date(+m[1]!, +m[2]! - 1, +m[3]!, 12).getTime() : Date.parse(v);
    if (Number.isFinite(t)) return t;
  }
  throw new Error(`Data inválida: ${JSON.stringify(v)}. Use "AAAA-MM-DD".`);
}

const resumo = (s: Sessao) => ({
  id: s.id, nome: s.nome, data: new Date(s.data).toISOString().slice(0, 10),
  roteiro: s.roteiro.map(r => ({ ref: formatarRef(r), nota: s.roteiroNotas?.[chaveDaRef(r)] ?? '' })),
  temRegistro: s.registro.trim().length > 0,
});

export function ferramentasDeSessao(ctx: ContextoDeSessoes): FerramentaDaPonte[] {
  const exigirCampanha = () => { const c = ctx.campanha(); if (!c) throw new Error(SEM_CAMPANHA); return c; };
  return [
    {
      nome: 'mesa_sessoes_listar',
      descricao: 'Lista as sessões da campanha ativa (mais recente primeiro): id, nome, data, roteiro com notas e se já tem registro.',
      esquema: { type: 'object', properties: {}, required: [], additionalProperties: false },
      async executar() { exigirCampanha(); return [json(ctx.sessoes().map(resumo))]; },
    },
    {
      nome: 'mesa_sessao_criar',
      descricao: 'Planeja uma sessão da campanha ativa para a próxima mesa. NÃO abre nem começa a gravar o registro; ela aparece no Diário da Mesa. Devolve o id para usar em mesa_sessao_editar.',
      esquema: { type: 'object', properties: { nome: { type: 'string', description: 'Ex.: "Sessão 12".' }, data: { type: 'string', description: 'Data prevista, "AAAA-MM-DD". Omitida, vale hoje.' } }, required: ['nome'], additionalProperties: false },
      async executar(args) {
        exigirCampanha();
        if (typeof args.nome !== 'string' || !args.nome.trim()) throw new Error('"nome" é obrigatório.');
        const s = await ctx.planejar(args.nome, args.data === undefined ? undefined : lerData(args.data));
        if (!s) throw new Error('Não consegui criar a sessão (veja o aviso na Mesa).');
        return [json(resumo(s))];
      },
    },
    {
      nome: 'mesa_sessao_editar',
      descricao: `Edita uma sessão (qualquer uma, aberta ou não): renomeia, monta o roteiro e anota itens. Ordem de aplicação: remover, acrescentar, ordem, notas. O roteiro tem no máximo ${MAXIMO_DO_ROTEIRO} itens e não repete; o que não coube vem em "ignorados". Nota de item que não está no roteiro é ignorada; texto vazio apaga a nota.`,
      esquema: {
        type: 'object', required: ['id'], additionalProperties: false,
        properties: {
          id: { type: 'string', description: 'Id da sessão (de mesa_sessoes_listar ou mesa_sessao_criar).' },
          nome: { type: 'string' },
          roteiro: { type: 'object', additionalProperties: false, properties: { acrescentar: listaDeRefs('Itens a pôr no fim do roteiro (mapas, cenas sonoras, documentos, fichas).'), remover: listaDeRefs('Itens a tirar (a nota deles sai junto).'), ordem: listaDeRefs('Nova ordem: estes itens vão para o começo, nesta ordem; os demais ficam depois.') } },
          notas: { type: 'array', description: 'Nota por item do roteiro.', items: { type: 'object', required: ['ref', 'texto'], properties: { ref: refEsquema, texto: { type: 'string' } } } },
        },
      },
      async executar(args) {
        exigirCampanha();
        const id = String(args.id ?? '');
        const sessao = ctx.sessoes().find(s => s.id === id);
        if (!sessao) throw new Error(`Não há sessão com id "${id}" nesta campanha. Use mesa_sessoes_listar.`);
        const rot = (args.roteiro ?? {}) as Record<string, unknown>;
        const acrescentar = lerRefs(rot.acrescentar, 'roteiro.acrescentar'), remover = lerRefs(rot.remover, 'roteiro.remover'), ordem = lerRefs(rot.ordem, 'roteiro.ordem');
        const notasPedidas = (args.notas === undefined ? [] : Array.isArray(args.notas) ? args.notas : (() => { throw new Error('"notas" deve ser uma lista de {ref, texto}.'); })())
          .map((n: unknown) => { const o = (n ?? {}) as Record<string, unknown>; if (typeof o.texto !== 'string') throw new Error('Cada nota precisa de "texto".'); return { ref: lerRefDoClaude(o.ref), texto: o.texto }; });
        if (args.nome !== undefined && (typeof args.nome !== 'string' || !args.nome.trim())) throw new Error('"nome" não pode ser vazio.');

        const ignorados: string[] = [];
        let roteiro = [...sessao.roteiro];
        for (const r of remover) { const i = roteiro.findIndex(x => chaveDaRef(x) === chaveDaRef(r)); if (i < 0) ignorados.push(`${formatarRef(r)} (não estava no roteiro)`); else roteiro = removerItem(roteiro, i); }
        for (const r of acrescentar) { const n = adicionar(roteiro, r); if (n.length === roteiro.length) ignorados.push(`${formatarRef(r)} (${roteiro.length >= MAXIMO_DO_ROTEIRO ? 'roteiro cheio' : 'já estava no roteiro'})`); roteiro = n; }
        if (ordem.length) {
          const chaves = new Set<string>(), frente: Ref[] = [];
          for (const r of ordem) { const x = roteiro.find(y => chaveDaRef(y) === chaveDaRef(r)); if (!x) ignorados.push(`${formatarRef(r)} (ordem: não está no roteiro)`); else if (!chaves.has(chaveDaRef(x))) { chaves.add(chaveDaRef(x)); frente.push(x); } }
          roteiro = [...frente, ...roteiro.filter(x => !chaves.has(chaveDaRef(x)))];
        }
        let notas: Record<string, string> = { ...(sessao.roteiroNotas ?? {}) };
        for (const n of notasPedidas) {
          if (!roteiro.some(x => chaveDaRef(x) === chaveDaRef(n.ref))) { ignorados.push(`${formatarRef(n.ref)} (nota: não está no roteiro)`); continue; }
          notas[chaveDaRef(n.ref)] = n.texto;
        }
        notas = podarNotas(notas, roteiro);
        const nova = await ctx.alterar(id, { roteiro, roteiroNotas: notas, ...(typeof args.nome === 'string' ? { nome: args.nome.trim() } : {}) });
        if (!nova) throw new Error('Não consegui gravar a sessão (veja o aviso na Mesa).');
        return [json({ ...resumo(nova), ignorados })];
      },
    },
  ];
}

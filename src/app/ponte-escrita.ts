// Só em desenvolvimento (entra pela ponte). Ferramentas de escrita da Mesa; o contexto é injetável para testar sem DOM.
import { chaveDaRef, formatarRef, lerRef, TIPOS_LIGACAO, type Entidade, type Ligacao, type Ref, type Sessao, type TipoEntidade, type TipoLigacao } from '#mesa';
import { json, type FerramentaDaPonte } from '#mesa/ponte';
import { NOME_DO_APP, TIPOS_CRIAVEIS, ehEncontro, podeEditar } from '../dominio/entidades.ts';
import { candidatosDeTrilha, entidadePorRef, extrairPacoteDeCena, type PacoteDeCena } from '../dominio/cenas.ts';
import { adicionar, MAXIMO_DO_ROTEIRO, podarNotas, removerItem } from '../dominio/roteiro.ts';

export interface ContextoDeSessoes {
  campanha(): Promise<{ id: string; nome: string } | null>;
  /** Lê do banco na hora da chamada (os signals da tela podem estar vazios). */
  sessoes(): Promise<Sessao[]>;
  planejar(nome: string, data?: number): Promise<Sessao | null>;
  alterar(id: string, mudancas: Partial<Pick<Sessao, 'roteiro' | 'roteiroNotas' | 'nome' | 'data'>>): Promise<Sessao | null>;
  /** Depois de escrever: a tela recarrega os signals (se a campanha da chamada é a dela). */
  recarregar?(): Promise<void>;
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
  const exigirCampanha = async () => { const c = await ctx.campanha(); if (!c) throw new Error(SEM_CAMPANHA); return c; };
  return [
    {
      nome: 'mesa_sessoes_listar',
      descricao: 'Lista as sessões da campanha ativa (mais recente primeiro): id, nome, data, roteiro com notas e se já tem registro.',
      esquema: { type: 'object', properties: {}, required: [], additionalProperties: false },
      async executar() { await exigirCampanha(); return [json((await ctx.sessoes()).map(resumo))]; },
    },
    {
      nome: 'mesa_sessao_criar',
      descricao: 'Planeja uma sessão da campanha ativa para a próxima mesa. NÃO abre nem começa a gravar o registro; ela aparece no Diário da Mesa. Devolve o id para usar em mesa_sessao_editar.',
      esquema: { type: 'object', properties: { nome: { type: 'string', description: 'Ex.: "Sessão 12".' }, data: { type: 'string', description: 'Data prevista, "AAAA-MM-DD". Omitida, vale hoje.' } }, required: ['nome'], additionalProperties: false },
      async executar(args) {
        await exigirCampanha();
        if (typeof args.nome !== 'string' || !args.nome.trim()) throw new Error('"nome" é obrigatório.');
        const s = await ctx.planejar(args.nome, args.data === undefined ? undefined : lerData(args.data));
        await ctx.recarregar?.();
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
        await exigirCampanha();
        const id = String(args.id ?? '');
        const sessao = (await ctx.sessoes()).find(s => s.id === id);
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
        await ctx.recarregar?.();
        if (!nova) throw new Error('Não consegui gravar a sessão (veja o aviso na Mesa).');
        return [json({ ...resumo(nova), ignorados })];
      },
    },
  ];
}

export interface ContextoDeEntidades {
  campanha(): Promise<{ id: string; nome: string } | null>;
  entidades(): Promise<Entidade[]>;
  /** Cria sem mudar a seleção da Mesa. */
  criar(tipo: TipoEntidade, nome: string): Promise<Entidade | null>;
  /** Grava (e sincroniza as `[[ligações]]` quando há notas). */
  alterar(e: Entidade, mudancas: Partial<Pick<Entidade, 'nome' | 'tags' | 'notas'>>): Promise<boolean>;
  ligar(de: Ref, para: Ref, tipo: TipoLigacao): Promise<Ligacao>;
}

export const TIPOS_DO_ASSISTENTE: readonly TipoEntidade[] = [...TIPOS_CRIAVEIS, 'cena', 'ameaca'];
const REF_DA_MESA = 'As entidades da Mesa têm a referência "mesa:mesa/entidade/<id>" (o id vem de mesa_entidade_criar, de campanha_ler (que lista as entidades) ou de campanha_entidade_ler).';

const lerTagsDoClaude = (v: unknown): string[] => {
  if (!Array.isArray(v) || v.some(t => typeof t !== 'string')) throw new Error('"tags" deve ser uma lista de textos.');
  return [...new Set((v as string[]).map(t => t.trim().replace(/^#/, '')).filter(Boolean))];
};
const textoOpcional = (v: unknown, campo: string): string | undefined => {
  if (v === undefined) return undefined;
  if (typeof v !== 'string') throw new Error(`"${campo}" deve ser texto.`);
  return v;
};
const resumoDaEntidade = (e: Entidade) => ({ id: e.id, ref: `mesa:mesa/entidade/${e.id}`, tipo: e.tipo, nome: e.nome, tags: e.tags, notas: e.notas, criadaPor: e.criadaPor });

export function ferramentasDeEntidade(ctx: ContextoDeEntidades): FerramentaDaPonte[] {
  const exigirCampanha = async () => { const c = await ctx.campanha(); if (!c) throw new Error(SEM_CAMPANHA); return c; };
  return [
    {
      nome: 'mesa_entidade_criar',
      descricao: `Cria uma entidade na campanha ativa (aparece na coleção da Mesa, sem mudar o que o mestre está vendo). Tipos: ${TIPOS_DO_ASSISTENTE.join(', ')}. As notas aceitam [[Nome]] para citar outra entidade (cria a ligação "menciona"; o nome tem de existir). ${REF_DA_MESA}`,
      esquema: {
        type: 'object', required: ['tipo', 'nome'], additionalProperties: false,
        properties: {
          tipo: { type: 'string', enum: [...TIPOS_DO_ASSISTENTE] },
          nome: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' }, description: 'Etiquetas sem "#" (ex.: ["ferreiro"]). Use "encontro" em cenas de combate.' },
          notas: { type: 'string', description: 'Texto livre; [[Nome]] liga a outra entidade.' },
        },
      },
      async executar(args) {
        await exigirCampanha();
        const tipo = String(args.tipo ?? '');
        if (!(TIPOS_DO_ASSISTENTE as readonly string[]).includes(tipo)) throw new Error(`Tipo inválido: "${tipo}". Tipos aceitos: ${TIPOS_DO_ASSISTENTE.join(', ')}.`);
        if (typeof args.nome !== 'string' || !args.nome.trim()) throw new Error('"nome" é obrigatório.');
        const tags = args.tags === undefined ? undefined : lerTagsDoClaude(args.tags);
        const notas = textoOpcional(args.notas, 'notas');
        const criada = await ctx.criar(tipo as TipoEntidade, args.nome);
        if (!criada) throw new Error('Não consegui criar a entidade (veja o aviso na Mesa).');
        if ((tags && tags.length) || notas) {
          if (!(await ctx.alterar(criada, { ...(tags?.length ? { tags } : {}), ...(notas ? { notas } : {}) }))) throw new Error(`A entidade "${criada.nome}" foi criada (id ${criada.id}), mas não consegui gravar tags/notas (veja o aviso na Mesa). Use mesa_entidade_editar.`);
        }
        return [json(resumoDaEntidade((await ctx.entidades()).find(e => e.id === criada.id) ?? criada))];
      },
    },
    {
      nome: 'mesa_entidade_editar',
      descricao: `Edita uma entidade criada pela Mesa (nome, tags, notas). As de outros aplicativos (ex.: fichas do Dossiê) são recusadas. "notas" troca o texto; "acrescentarNotas" soma ao fim (se os dois vierem, troca e depois soma). As [[ligações]] das notas são refeitas. Não remove entidades. ${REF_DA_MESA}`,
      esquema: {
        type: 'object', required: ['id'], additionalProperties: false,
        properties: {
          id: { type: 'string', description: 'Id da entidade (sem o prefixo "mesa:mesa/entidade/").' },
          nome: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' }, description: 'Troca todas as etiquetas.' },
          notas: { type: 'string', description: 'Troca o texto das notas.' },
          acrescentarNotas: { type: 'string', description: 'Texto somado ao fim das notas.' },
        },
      },
      async executar(args) {
        await exigirCampanha();
        const id = String(args.id ?? '').replace(/^mesa:mesa\/entidade\//, '');
        const e = (await ctx.entidades()).find(x => x.id === id);
        if (!e) throw new Error(`Não há entidade com id "${id}" nesta campanha. Use campanha_ler para ver as entidades, ou mesa_entidade_criar.`);
        if (!podeEditar(e)) throw new Error(`"${e.nome}" é do ${NOME_DO_APP[e.criadaPor] ?? e.criadaPor} (criada por ele); a Mesa só edita o que criou. Peça ao mestre para alterar no ${NOME_DO_APP[e.criadaPor] ?? e.criadaPor}.`);
        const mudancas: Partial<Pick<Entidade, 'nome' | 'tags' | 'notas'>> = {};
        if (args.nome !== undefined) { if (typeof args.nome !== 'string' || !args.nome.trim()) throw new Error('"nome" não pode ser vazio.'); mudancas.nome = args.nome.trim(); }
        if (args.tags !== undefined) mudancas.tags = lerTagsDoClaude(args.tags);
        const notas = textoOpcional(args.notas, 'notas'), mais = textoOpcional(args.acrescentarNotas, 'acrescentarNotas');
        if (notas !== undefined || mais) {
          const base = notas ?? e.notas;
          mudancas.notas = mais ? (base.trim() ? `${base.replace(/\s+$/, '')}\n\n${mais}` : mais) : base;
        }
        if (!Object.keys(mudancas).length) throw new Error('Nada a mudar: informe nome, tags, notas ou acrescentarNotas.');
        if (!(await ctx.alterar(e, mudancas))) throw new Error('Não consegui gravar (veja o aviso na Mesa).');
        return [json(resumoDaEntidade((await ctx.entidades()).find(x => x.id === id) ?? { ...e, ...mudancas }))];
      },
    },
    {
      nome: 'mesa_ligar',
      descricao: `Liga duas coisas da campanha (ex.: um NPC a um lugar). "de" e "para" são referências: objeto {app, tipo, id} ou texto "mesa:app/tipo/id". ${REF_DA_MESA} Tipos de ligação: ${TIPOS_LIGACAO.join(', ')}. Ex.: personagem "esta-em" lugar; pista "revela" personagem.`,
      esquema: { type: 'object', required: ['de', 'para', 'tipo'], additionalProperties: false, properties: { de: refEsquema, para: refEsquema, tipo: { type: 'string', enum: [...TIPOS_LIGACAO] } } },
      async executar(args) {
        await exigirCampanha();
        const tipo = String(args.tipo ?? '');
        if (!(TIPOS_LIGACAO as readonly string[]).includes(tipo)) throw new Error(`Tipo de ligação inválido: "${tipo}". Tipos aceitos: ${TIPOS_LIGACAO.join(', ')}.`);
        const de = lerRefDoClaude(args.de), para = lerRefDoClaude(args.para);
        const l = await ctx.ligar(de, para, tipo as TipoLigacao);
        return [json({ id: l.id, de: formatarRef(l.de), para: formatarRef(l.para), tipo: l.tipo })];
      },
    },
  ];
}

export type EstadoDeAbrirApp = 'aberto' | 'bloqueado' | 'indisponivel';
export interface ContextoDeCenas {
  campanha(): Promise<{ id: string; nome: string } | null>;
  entidades(): Promise<Entidade[]>;
  ligacoes(): Promise<Ligacao[]>;
  vincularMapa(cena: Entidade, mapa: Entidade): Promise<boolean>;
  vincularTrilha(cena: Entidade, trilha: Entidade): Promise<boolean>;
  vincularParticipante(cena: Entidade, p: Entidade): Promise<boolean>;
  vincularPista(cena: Entidade, pista: Entidade): Promise<boolean>;
  alternarEncontro(cena: Entidade): Promise<boolean>;
  definirMomento(cena: Entidade, momento: string | null): Promise<boolean>;
  /** Abre o app pelo manifesto. `bloqueado`: o navegador recusou a janela e a Mesa já mostrou o aviso com o botão "Abrir". */
  abrirApp(app: AppAbrivel): Promise<EstadoDeAbrirApp>;
}

export const APPS_ABRIVEIS = ['atlas', 'ficha', 'atelie', 'jukebox'] as const;
export type AppAbrivel = (typeof APPS_ABRIVEIS)[number];

const nomeDe = (e: Entidade | undefined): string | null => e?.nome ?? null;
const itemComNome = (i: { ref: Ref; entidade?: Entidade } | null) => (i ? { ref: formatarRef(i.ref), entidadeId: i.entidade?.id ?? null, nome: nomeDe(i.entidade) } : null);
export function pacoteComNomes(p: PacoteDeCena, cena: Entidade) {
  return {
    cenaId: p.cenaId, cena: cena.nome, encontro: ehEncontro(cena),
    mapa: itemComNome(p.mapa), trilha: itemComNome(p.trilha),
    participantes: p.participantes.map(x => ({ ...itemComNome(x)!, tipo: x.ehAmeaca ? 'ameaca' : 'personagem' })),
    pistas: p.pistas.map(itemComNome),
    momento: p.momento ?? null,
  };
}

const MOMENTO = 'Nome (ou id) de um momento do mapa da cena, criado no Atlas (atlas_momento). Vira a etiqueta "momento:<texto>"; ao ativar a cena a Mesa pede ao Atlas que toque esse momento NO MAPA vinculado (o Atlas procura por id ou nome, sem diferenciar maiúsculas). Só funciona com mapa vinculado. Texto vazio remove o momento.';

export function ferramentasDeCena(ctx: ContextoDeCenas): FerramentaDaPonte[] {
  const exigirCampanha = async () => { const c = await ctx.campanha(); if (!c) throw new Error(SEM_CAMPANHA); return c; };
  const achar = (v: unknown, campo: string, todas: Entidade[]): Entidade => {
    if (typeof v !== 'string' || !v.trim()) throw new Error(`"${campo}" deve ser o id de uma entidade da campanha.`);
    const bruto = v.trim();
    const porId = todas.find(e => e.id === bruto.replace(/^mesa:mesa\/entidade\//, ''));
    if (porId) return porId;
    const ref = lerRef(bruto);
    const porRef = ref ? entidadePorRef(ref, todas) : undefined;
    if (porRef) return porRef;
    throw new Error(`"${campo}": não há entidade com id "${bruto}" nesta campanha. Use campanha_ler para ver as entidades (o mapa, a trilha, as fichas e as pistas aparecem como entidades de seus apps).`);
  };
  const exigir = (e: Entidade, campo: string, ok: boolean, esperado: string) => {
    if (!ok) throw new Error(`"${campo}": "${e.nome}" é ${e.tipo} (do ${NOME_DO_APP[e.criadaPor] ?? e.criadaPor}), mas aqui se espera ${esperado}.`);
    return e;
  };
  const lerLista = (v: unknown, campo: string): string[] => { if (v === undefined) return []; if (!Array.isArray(v)) throw new Error(`"${campo}" deve ser uma lista de ids de entidades.`); return v as string[]; };
  const cenaDe = (v: unknown, todas: Entidade[]): Entidade => {
    const e = achar(v, 'cenaId', todas);
    if (e.tipo !== 'cena') throw new Error(`"${e.nome}" é ${e.tipo}, não uma cena. Crie a cena com mesa_entidade_criar { tipo: "cena" }.`);
    return e;
  };
  const atual = async (id: string) => (await ctx.entidades()).find(e => e.id === id)!;
  const pacote = (cena: Entidade, todas: Entidade[], ligs: Ligacao[]) => pacoteComNomes(extrairPacoteDeCena(cena, todas, ligs), cena);
  const falha = (o: string) => new Error(`Não consegui ${o} (veja o aviso na Mesa).`);

  return [
    {
      nome: 'mesa_cena_montar',
      descricao: `Monta uma cena da campanha (entidade do tipo "cena"): mapa, trilha sonora, participantes, pistas, momento de abertura e marca de encontro. Todos os ids são de ENTIDADES da campanha (campanha_ler lista as entidades; mapas e cômodos do Atlas aparecem como "lugar", cenas sonoras do Jukebox como cena/efeito do Jukebox, fichas como personagem/ameaça, documentos do Ateliê como pista). "mapa" e "trilha" trocam o anterior; participantes e pistas acrescentam. Tudo é conferido antes de gravar. Devolve o pacote resultante com nomes. O ativar da cena (Modo Sessão) usa esse pacote.`,
      esquema: {
        type: 'object', required: ['cenaId'], additionalProperties: false,
        properties: {
          cenaId: { type: 'string', description: 'Id da entidade cena.' },
          mapa: { type: 'string', description: 'Id da entidade lugar (mapa ou cômodo do Atlas).' },
          trilha: { type: 'string', description: 'Id da entidade da cena sonora/efeito do Jukebox.' },
          participantes: { type: 'array', items: { type: 'string' }, description: 'Ids de personagens e ameaças.' },
          pistas: { type: 'array', items: { type: 'string' }, description: 'Ids de pistas (documentos do Ateliê).' },
          momento: { type: 'string', description: MOMENTO },
          encontro: { type: 'boolean', description: 'true marca a cena como encontro de combate (etiqueta "encontro"); false desmarca.' },
        },
      },
      async executar(args) {
        await exigirCampanha();
        const todas = await ctx.entidades();
        const cena = cenaDe(args.cenaId, todas);
        const um = (v: unknown, campo: string, ok: (e: Entidade) => boolean, esperado: string) => (v === undefined ? null : (e => exigir(e, campo, ok(e), esperado))(achar(v, campo, todas)));
        const mapa = um(args.mapa, 'mapa', e => e.tipo === 'lugar' || e.refs.some(r => r.app === 'atlas'), 'um lugar do Atlas (mapa ou cômodo)');
        const trilha = um(args.trilha, 'trilha', e => candidatosDeTrilha([e]).length > 0, 'uma cena sonora ou efeito do Jukebox');
        const parts = lerLista(args.participantes, 'participantes').map(v => { const e = achar(v, 'participantes', todas); return exigir(e, 'participantes', e.tipo === 'personagem' || e.tipo === 'ameaca', 'um personagem ou ameaça'); });
        const pistas = lerLista(args.pistas, 'pistas').map(v => { const e = achar(v, 'pistas', todas); return exigir(e, 'pistas', e.tipo === 'pista' || e.refs.some(r => r.app === 'atelie'), 'uma pista (documento do Ateliê)'); });
        if (args.momento !== undefined && typeof args.momento !== 'string') throw new Error('"momento" deve ser texto (nome ou id do momento).');
        if (args.encontro !== undefined && typeof args.encontro !== 'boolean') throw new Error('"encontro" deve ser verdadeiro ou falso.');
        const momento = typeof args.momento === 'string' ? args.momento.trim().replace(/^momento:/i, '').trim() : undefined;
        if (!(mapa || trilha || parts.length || pistas.length || momento !== undefined || args.encontro !== undefined)) throw new Error('Nada a montar: informe mapa, trilha, participantes, pistas, momento ou encontro.');

        if (mapa && !(await ctx.vincularMapa(await atual(cena.id), mapa))) throw falha(`vincular o mapa "${mapa.nome}"`);
        if (trilha && !(await ctx.vincularTrilha(await atual(cena.id), trilha))) throw falha(`vincular a trilha "${trilha.nome}"`);
        for (const p of parts) if (!(await ctx.vincularParticipante(await atual(cena.id), p))) throw falha(`pôr "${p.nome}" na cena`);
        for (const p of pistas) if (!(await ctx.vincularPista(await atual(cena.id), p))) throw falha(`vincular a pista "${p.nome}"`);
        if (typeof args.encontro === 'boolean' && ehEncontro(await atual(cena.id)) !== args.encontro && !(await ctx.alternarEncontro(await atual(cena.id)))) throw falha('mudar a marca de encontro');
        if (momento !== undefined && !(await ctx.definirMomento(await atual(cena.id), momento || null))) throw falha('definir o momento');
        const final = await atual(cena.id);
        return [json(pacote(final, await ctx.entidades(), await ctx.ligacoes()))];
      },
    },
    {
      nome: 'mesa_cena_ler',
      descricao: 'Lê o que está montado numa cena: mapa, trilha, participantes (personagens e ameaças), pistas, momento de abertura e se é encontro, com os nomes.',
      esquema: { type: 'object', required: ['cenaId'], additionalProperties: false, properties: { cenaId: { type: 'string', description: 'Id da entidade cena.' } } },
      async executar(args) { await exigirCampanha(); const todas = await ctx.entidades(); return [json(pacote(cenaDe(args.cenaId, todas), todas, await ctx.ligacoes()))]; },
    },
    {
      nome: 'mesa_abrir_apps',
      descricao: 'Abre outros aplicativos da plataforma em abas novas (pelo manifesto de cada um, ao lado da Mesa). O navegador pode bloquear a aba quando o mestre não clicou; nesse caso a Mesa mostra um aviso com o botão "Abrir" e a resposta diz que ficou pendente do clique do mestre.',
      esquema: { type: 'object', required: ['apps'], additionalProperties: false, properties: { apps: { type: 'array', items: { type: 'string', enum: [...APPS_ABRIVEIS] } } } },
      async executar(args) {
        if (!Array.isArray(args.apps) || !args.apps.length) throw new Error(`"apps" deve ser uma lista com ${APPS_ABRIVEIS.join(', ')}.`);
        const invalidos = args.apps.filter(a => !(APPS_ABRIVEIS as readonly unknown[]).includes(a));
        if (invalidos.length) throw new Error(`Apps inválidos: ${invalidos.map(String).join(', ')}. Aceitos: ${APPS_ABRIVEIS.join(', ')}.`);
        const resultado: Record<string, EstadoDeAbrirApp> = {};
        for (const app of [...new Set(args.apps as AppAbrivel[])]) resultado[app] = await ctx.abrirApp(app);
        const bloq = Object.keys(resultado).filter(a => resultado[a] === 'bloqueado'), indis = Object.keys(resultado).filter(a => resultado[a] === 'indisponivel');
        const aviso = [
          bloq.length ? `O navegador bloqueou a abertura de ${bloq.join(', ')}: a Mesa mostrou um aviso com o botão "Abrir"; peça ao mestre para clicar.` : '',
          indis.length ? `Não achei ${indis.join(', ')} ao lado da Mesa (sem mesa.json); peça ao mestre para abrir ou subir o app.` : '',
        ].filter(Boolean).join(' ');
        return [json({ apps: resultado, ...(aviso ? { aviso } : {}) })];
      },
    },
  ];
}

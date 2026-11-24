// Só em desenvolvimento (entra pela ponte). Ferramentas de leitura dos quadros, em camadas (mapa → busca → seção → imagem).
// O contexto é injetável: sem DOM, signals nem banco, para testar e para o gerador do catálogo do Atlas importar em Node.
import { imagem, json, texto, type FerramentaDaPonte } from '#mesa/ponte';
import { semAcento } from '../dominio/entidades.ts';
import { textoBuscavel } from '../dominio/busca-quadro.ts';
import { mapaDoQuadro } from '../dominio/mapa-do-quadro.ts';
import type { Item, Quadro } from '../dominio/quadro.ts';
import { secoesDoQuadro, type Secao } from '../dominio/secoes-do-quadro.ts';
import { LIMITE_TOKENS_PADRAO, textoDaSecao } from '../dominio/texto-da-secao.ts';

export interface ContextoDeQuadros {
  campanha(): Promise<{ id: string; nome: string } | null>;
  /** Lê do banco na hora da chamada. */
  quadros(campanhaId: string): Promise<Quadro[]>;
  itens(quadroId: string): Promise<Item[]>;
  /** O quadro aberto na tela (memória, com o que ainda não foi gravado), ou null. */
  aberto(): { quadro: Quadro; itens: Item[] } | null;
  /** Nome e tipo das entidades da campanha, por id, para os cartões de entidade. */
  entidades?(): Promise<ReadonlyMap<string, { nome: string; tipo: string }>>;
  /** A imagem reduzida (lado maior ≤ `lado`, JPEG 0,8) como data URL, ou null se não há arquivo. */
  imagem(imagemId: string, lado: number): Promise<string | null>;
}

export const LADO_PADRAO_IMAGEM = 768;
export const LADO_MAXIMO_IMAGEM = 1568;
export const MAX_OCORRENCIAS_BUSCA = 20;
export const MAX_CARACTERES_TRECHO = 120;

const SEM_CAMPANHA = 'Nenhuma campanha selecionada na Mesa. Peça ao mestre para abrir uma campanha no hub e tente de novo.';

interface QuadroCarregado { quadro: Quadro; itens: Item[]; secoes: Secao[] }

function textoDe(v: unknown): string { return typeof v === 'string' ? v.trim() : ''; }

function escolher<T>(lista: readonly T[], chave: string, ids: (x: T) => string, nomes: (x: T) => string, rotulo: string, existentes: () => string): T {
  const q = semAcento(chave).trim();
  const porId = lista.find(x => ids(x) === chave.trim());
  if (porId) return porId;
  const exatos = lista.filter(x => semAcento(nomes(x)).trim() === q);
  if (exatos.length === 1) return exatos[0]!;
  const parciais = exatos.length > 1 ? exatos : lista.filter(x => semAcento(nomes(x)).includes(q) || ids(x).startsWith(chave.trim()));
  if (parciais.length === 1 && q) return parciais[0]!;
  if (parciais.length > 1) throw new Error(`${rotulo} \"${chave}\" é ambíguo: ${parciais.slice(0, 8).map(x => `\"${nomes(x)}\" (${ids(x)})`).join(', ')}. Use o id.`);
  throw new Error(`${rotulo} \"${chave}\" ${rotulo === 'Seção' ? 'não encontrada' : 'não encontrado'}. ${existentes()}`);
}

export function ferramentasDeQuadros(ctx: ContextoDeQuadros): FerramentaDaPonte[] {
  async function todos(): Promise<Quadro[]> {
    const c = await ctx.campanha();
    if (!c) throw new Error(SEM_CAMPANHA);
    const lista = await ctx.quadros(c.id);
    const aberto = ctx.aberto();
    if (aberto && aberto.quadro.campanhaId === c.id) return lista.some(q => q.id === aberto.quadro.id) ? lista.map(q => (q.id === aberto.quadro.id ? aberto.quadro : q)) : [...lista, aberto.quadro];
    return lista;
  }
  async function carregar(q: Quadro): Promise<QuadroCarregado> {
    const aberto = ctx.aberto();
    const itens = aberto && aberto.quadro.id === q.id ? aberto.itens : await ctx.itens(q.id);
    return { quadro: q, itens, secoes: secoesDoQuadro(itens) };
  }
  async function quadroPor(chave: unknown): Promise<QuadroCarregado> {
    const k = textoDe(chave);
    if (!k) throw new Error('Informe o quadro (nome ou id). Use quadros_listar para ver os quadros da campanha.');
    const lista = await todos();
    if (lista.length === 0) throw new Error('A campanha não tem quadros.');
    const q = escolher(lista, k, x => x.id, x => x.nome, 'Quadro', () => `Quadros: ${lista.slice(0, 10).map(x => `\"${x.nome}\"`).join(', ')}.`);
    return carregar(q);
  }
  function secaoPor(c: QuadroCarregado, chave: unknown): Secao {
    const k = textoDe(chave);
    if (!k) throw new Error('Informe a seção (id ou título). Use quadro_mapa para ver as seções.');
    return escolher(c.secoes, k, s => s.id, s => s.titulo, 'Seção', () => `Veja os ids no quadro_mapa (${c.secoes.length} seções).`);
  }
  const quadroEsquema = { type: 'string', description: 'Nome ou id do quadro.' };

  return [
    {
      nome: 'quadros_listar',
      descricao: 'Os quadros da campanha ativa, cada um com id, nome, total de seções, de itens e tokens estimados para lê-lo inteiro. Comece por aqui; depois quadro_mapa.',
      esquema: { type: 'object', properties: {}, required: [], additionalProperties: false },
      anotacoes: { leitura: true, idempotente: true },
      async executar() {
        const lista = await todos();
        const saida = [];
        for (const q of lista) {
          const c = await carregar(q);
          let tokens = 0;
          for (const s of c.secoes) tokens += textoDaSecao(s, c.itens, { secoes: c.secoes, limiteTokens: Number.MAX_SAFE_INTEGER }).tokensTotais;
          saida.push({ id: q.id, nome: q.nome, secoes: c.secoes.length, itens: c.itens.length, tokens });
        }
        return [json(saida)];
      },
    },
    {
      nome: 'quadro_mapa',
      descricao: 'O mapa do quadro: uma linha por seção (id, título, itens por tipo, tokens, vizinhas, setas), em ordem de leitura. Barato (poucas centenas a 6 mil tokens). Leia antes de abrir qualquer seção.',
      esquema: { type: 'object', properties: { quadro: quadroEsquema }, required: ['quadro'], additionalProperties: false },
      anotacoes: { leitura: true, idempotente: true },
      async executar(args) {
        const c = await quadroPor(args.quadro);
        return [texto(mapaDoQuadro(c.quadro, c.itens).texto)];
      },
    },
    {
      nome: 'quadro_secao',
      descricao: 'O texto compacto de uma seção do quadro, paginado (~2,5 mil tokens por página). nivel \"titulos\" (padrão) traz só a primeira linha de cada item; \"completo\" traz tudo. Cite itens pelo #id curto.',
      esquema: {
        type: 'object',
        properties: {
          quadro: quadroEsquema,
          secao: { type: 'string', description: 'Id da seção (do quadro_mapa) ou o título.' },
          nivel: { type: 'string', enum: ['titulos', 'completo'], description: 'Padrão: titulos.' },
          pagina: { type: 'integer', minimum: 1, description: 'Padrão: 1.' },
        },
        required: ['quadro', 'secao'],
        additionalProperties: false,
      },
      anotacoes: { leitura: true, idempotente: true },
      async executar(args) {
        const c = await quadroPor(args.quadro);
        const s = secaoPor(c, args.secao);
        const nivel = args.nivel === 'completo' ? 'completo' : args.nivel === undefined || args.nivel === 'titulos' ? 'titulos' : null;
        if (!nivel) throw new Error('nivel deve ser \"titulos\" ou \"completo\".');
        const pagina = args.pagina === undefined ? 1 : Number(args.pagina);
        if (!Number.isInteger(pagina) || pagina < 1) throw new Error('pagina deve ser um inteiro a partir de 1.');
        const entidades = ctx.entidades ? await ctx.entidades() : undefined;
        const r = textoDaSecao(s, c.itens, { nivel, pagina, limiteTokens: LIMITE_TOKENS_PADRAO, secoes: c.secoes, ...(entidades ? { entidades } : {}) });
        return [texto(r.texto)];
      },
    },
    {
      nome: 'quadro_buscar',
      descricao: 'Procura um termo (sem acento, sem diferenciar maiúsculas) nos textos dos quadros. Devolve até 20 ocorrências com o quadro, a seção, o #id curto do item e um trecho de até 120 caracteres. Sem quadro, busca em todos.',
      esquema: {
        type: 'object',
        properties: { termo: { type: 'string' }, quadro: { type: 'string', description: 'Nome ou id; omita para buscar em todos os quadros.' } },
        required: ['termo'],
        additionalProperties: false,
      },
      anotacoes: { leitura: true, idempotente: true },
      async executar(args) {
        const termo = textoDe(args.termo);
        if (!termo) throw new Error('Informe o termo da busca.');
        const q = semAcento(termo);
        const alvos = textoDe(args.quadro) ? [await quadroPor(args.quadro)] : await Promise.all((await todos()).map(carregar));
        const ocorrencias: { quadro: string; secao: string; titulo: string; item: string; trecho: string }[] = [];
        let total = 0;
        for (const c of alvos) {
          const secaoDe = new Map<string, Secao>();
          for (const s of c.secoes) {
            for (const id of s.itemIds) secaoDe.set(id, s);
            if (s.tipo === 'moldura') secaoDe.set(s.id, s);
          }
          const achados = c.itens
            .filter(i => i.tipo !== 'imagem')
            .map(i => ({ i, bruto: textoBuscavel(i).replace(/\s+/g, ' ').trim() }))
            .filter(({ bruto }) => bruto && semAcento(bruto).includes(q))
            .sort((a, b) => a.i.y - b.i.y || a.i.x - b.i.x);
          for (const { i, bruto } of achados) {
            total++;
            if (ocorrencias.length >= MAX_OCORRENCIAS_BUSCA) continue;
            const s = secaoDe.get(i.id);
            ocorrencias.push({ quadro: c.quadro.nome, secao: s?.id ?? '', titulo: s?.titulo ?? '', item: i.id.slice(0, 6), trecho: trechoDe(bruto, q) });
          }
        }
        return [json({ total, mostradas: ocorrencias.length, ocorrencias })];
      },
    },
    {
      nome: 'quadro_imagem',
      descricao: 'Vê uma imagem do quadro (reduzida, JPEG), com a legenda em texto. Cara em tokens: peça só a que precisar (handouts, mapas). O item é o #id curto que aparece em quadro_secao.',
      esquema: {
        type: 'object',
        properties: {
          quadro: quadroEsquema,
          item: { type: 'string', description: 'O #id curto (ou id completo) da imagem.' },
          lado: { type: 'integer', minimum: 64, maximum: LADO_MAXIMO_IMAGEM, description: `Lado maior em px. Padrão ${LADO_PADRAO_IMAGEM}, máximo ${LADO_MAXIMO_IMAGEM}.` },
        },
        required: ['quadro', 'item'],
        additionalProperties: false,
      },
      anotacoes: { leitura: true, idempotente: true },
      async executar(args) {
        const c = await quadroPor(args.quadro);
        const id = textoDe(args.item).replace(/^#/, '');
        if (!id) throw new Error('Informe o item (o #id curto da imagem).');
        const lado = args.lado === undefined ? LADO_PADRAO_IMAGEM : Number(args.lado);
        if (!Number.isFinite(lado) || lado < 64) throw new Error('lado deve ser um número a partir de 64.');
        const imagens = c.itens.filter((i): i is Extract<Item, { tipo: 'imagem' }> => i.tipo === 'imagem');
        const achadas = imagens.filter(i => i.id.startsWith(id));
        if (achadas.length === 0) {
          const outro = c.itens.find(i => i.id.startsWith(id));
          throw new Error(outro ? `O item #${id} não é uma imagem (é ${outro.tipo}).` : `Imagem #${id} não encontrada em \"${c.quadro.nome}\". Veja os ids em quadro_secao.`);
        }
        if (achadas.length > 1) throw new Error(`#${id} é ambíguo: ${achadas.slice(0, 8).map(i => i.id.slice(0, 10)).join(', ')}. Use mais caracteres do id.`);
        const item = achadas[0]!;
        const dataUrl = await ctx.imagem(item.imagemId, Math.min(LADO_MAXIMO_IMAGEM, Math.round(lado)));
        if (!dataUrl) throw new Error(`A imagem #${id} não tem arquivo guardado na Mesa${item.imagemId.startsWith('miro-img-') ? ' (veio do Miro sem o arquivo)' : ''}.`);
        const legenda = item.legenda?.trim() || 'sem legenda';
        return [imagem(dataUrl), texto(`[imagem #${item.id.slice(0, 6)}: ${legenda}, ${Math.round(item.larguraOriginal)}x${Math.round(item.alturaOriginal)}]`)];
      },
    },
  ];
}

/** Até 120 caracteres em volta da primeira ocorrência (a busca é sem acento; os índices valem porque `semAcento` mantém o tamanho). */
function trechoDe(bruto: string, q: string): string {
  if (bruto.length <= MAX_CARACTERES_TRECHO) return bruto;
  const sem = semAcento(bruto);
  const pos = sem.length === bruto.length ? Math.max(0, sem.indexOf(q)) : 0;
  const ini = Math.max(0, Math.min(pos - 30, bruto.length - MAX_CARACTERES_TRECHO));
  const fim = ini + MAX_CARACTERES_TRECHO;
  return `${ini > 0 ? '…' : ''}${bruto.slice(ini, fim)}${fim < bruto.length ? '…' : ''}`.slice(0, MAX_CARACTERES_TRECHO + 2);
}

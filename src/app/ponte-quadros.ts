// Só em desenvolvimento (entra pela ponte). Ferramentas de leitura dos quadros, em camadas (mapa → busca → seção → imagem).
// O contexto é injetável: sem DOM, signals nem banco, para testar e para o gerador do catálogo do Atlas importar em Node.
import { imagem, json, texto, type FerramentaDaPonte } from '#mesa/ponte';
import { semAcento } from '../dominio/entidades.ts';
import { textoBuscavel } from '../dominio/busca-quadro.ts';
import { mapaDoQuadro } from '../dominio/mapa-do-quadro.ts';
import type { PaletaDaCampanha } from '../dominio/paleta.ts';
import { MAX_NOTAS_POR_PROPOSTA, MAX_TEXTO_DA_NOTA, montarProposta, posicaoLivre, tamanhoDaProposta } from '../dominio/proposta-quadro.ts';
import { TIPOS_SEMANTICOS, type Item, type Quadro } from '../dominio/quadro.ts';
import {
  alvoDaImagem,
  assinaturaDaImagem,
  MAX_DESCRICAO_DA_IMAGEM,
  MAX_RESUMO_DA_SECAO,
  resumosParaOMapa,
  type RegistroResumo,
} from '../dominio/resumos-do-quadro.ts';
import { assinaturaDaSecao, secoesDoQuadro, type Secao } from '../dominio/secoes-do-quadro.ts';
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
  /** Resumos e descrições gravados do quadro (lê do banco na hora). */
  resumos(quadroId: string): Promise<RegistroResumo[]>;
  salvarResumo(resumo: RegistroResumo): Promise<void>;
  /** Cria os itens no quadro: no aberto, num único passo de desfazer; nos outros, direto no banco. */
  criarItens(quadroId: string, itens: Item[], rotulo: string): Promise<void>;
  /** Paleta da campanha (cores por tipo); padrão se ausente. */
  paleta?(): PaletaDaCampanha;
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
  /** O item de imagem pelo #id curto (ou id completo); erro legível se não for imagem. */
  function imagemPor(c: QuadroCarregado, chave: unknown): Extract<Item, { tipo: 'imagem' }> {
    const id = textoDe(chave).replace(/^#/, '');
    if (!id) throw new Error('Informe o item (o #id curto da imagem).');
    const imagens = c.itens.filter((i): i is Extract<Item, { tipo: 'imagem' }> => i.tipo === 'imagem');
    const achadas = imagens.filter(i => i.id.startsWith(id));
    if (achadas.length === 0) {
      const outro = c.itens.find(i => i.id.startsWith(id));
      throw new Error(outro ? `O item #${id} não é uma imagem (é ${outro.tipo}).` : `Imagem #${id} não encontrada em \"${c.quadro.nome}\". Veja os ids em quadro_secao.`);
    }
    if (achadas.length > 1) throw new Error(`#${id} é ambíguo: ${achadas.slice(0, 8).map(i => i.id.slice(0, 10)).join(', ')}. Use mais caracteres do id.`);
    return achadas[0]!;
  }
  /** Grava (sem sobrescrever o que o mestre escreveu); o texto passa do limite → erro legível. */
  async function gravar(c: QuadroCarregado, alvo: string, textoBruto: unknown, limite: number, assinatura: string, rotulo: string): Promise<RegistroResumo> {
    const t = textoDe(textoBruto);
    if (!t) throw new Error(`Informe o texto ${rotulo}.`);
    if (t.length > limite) throw new Error(`O texto ${rotulo} tem ${t.length} caracteres; o máximo é ${limite}. Encurte e tente de novo.`);
    const anterior = (await ctx.resumos(c.quadro.id)).find(r => r.alvo === alvo);
    if (anterior?.autor === 'mestre') throw new Error(`Este texto foi escrito pelo mestre e não pode ser trocado sem pedido. Peça ao mestre para liberar (ele pode apagar ou editar no navegador de molduras) e tente de novo.`);
    const registro: RegistroResumo = { quadroId: c.quadro.id, alvo, texto: t, assinatura, autor: 'assistente', em: Date.now() };
    await ctx.salvarResumo(registro);
    return registro;
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
        const { resumos } = resumosParaOMapa(await ctx.resumos(c.quadro.id), c.secoes, c.itens);
        return [texto(mapaDoQuadro(c.quadro, c.itens, { resumos }).texto)];
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
        const { resumos, descricoes } = resumosParaOMapa(await ctx.resumos(c.quadro.id), c.secoes, c.itens);
        const r = textoDaSecao(s, c.itens, { nivel, pagina, limiteTokens: LIMITE_TOKENS_PADRAO, secoes: c.secoes, descricoes, ...(entidades ? { entidades } : {}) });
        const resumo = resumos.get(s.id);
        const topo = resumo ? `Resumo${resumo.desatualizado ? ' (desatualizado)' : ''}${resumo.autor === 'mestre' ? ' (escrito pelo mestre)' : ''}: ${resumo.texto}\n\n` : '';
        return [texto(topo + r.texto)];
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
        const item = imagemPor(c, args.item);
        const id = item.id.slice(0, 6);
        const lado = args.lado === undefined ? LADO_PADRAO_IMAGEM : Number(args.lado);
        if (!Number.isFinite(lado) || lado < 64) throw new Error('lado deve ser um número a partir de 64.');
        const dataUrl = await ctx.imagem(item.imagemId, Math.min(LADO_MAXIMO_IMAGEM, Math.round(lado)));
        if (!dataUrl) throw new Error(`A imagem #${id} não tem arquivo guardado na Mesa${item.imagemId.startsWith('miro-img-') ? ' (veio do Miro sem o arquivo)' : ''}.`);
        const descricao = (await ctx.resumos(c.quadro.id)).find(r => r.alvo === alvoDaImagem(item.id))?.texto;
        const legenda = descricao || item.legenda?.trim() || 'sem legenda';
        return [imagem(dataUrl), texto(`[imagem #${item.id.slice(0, 6)}: ${legenda}, ${Math.round(item.larguraOriginal)}x${Math.round(item.alturaOriginal)}]`)];
      },
    },
    {
      nome: 'quadro_resumir',
      descricao: `Grava o resumo de uma seção (até ${MAX_RESUMO_DA_SECAO} caracteres, duas ou três linhas) depois de lê-la a fundo. Aparece no quadro_mapa nas próximas conversas e é marcado como desatualizado se a seção mudar. Não troca um resumo escrito pelo mestre.`,
      esquema: {
        type: 'object',
        properties: {
          quadro: quadroEsquema,
          secao: { type: 'string', description: 'Id da seção (do quadro_mapa) ou o título.' },
          texto: { type: 'string', description: `O resumo, até ${MAX_RESUMO_DA_SECAO} caracteres.` },
        },
        required: ['quadro', 'secao', 'texto'],
        additionalProperties: false,
      },
      anotacoes: { destrutiva: false, idempotente: true },
      async executar(args) {
        const c = await quadroPor(args.quadro);
        const s = secaoPor(c, args.secao);
        await gravar(c, s.id, args.texto, MAX_RESUMO_DA_SECAO, assinaturaDaSecao(s, c.itens), 'do resumo');
        return [texto(`Resumo da seção "${s.titulo}" (${s.id}) gravado.`)];
      },
    },
    {
      nome: 'quadro_descrever_imagem',
      descricao: `Grava a descrição em texto de uma imagem do quadro (até ${MAX_DESCRICAO_DA_IMAGEM} caracteres), depois de vê-la com quadro_imagem. Passa a aparecer no lugar da legenda em quadro_secao. Só aceita item que seja imagem; não troca uma descrição escrita pelo mestre.`,
      esquema: {
        type: 'object',
        properties: {
          quadro: quadroEsquema,
          item: { type: 'string', description: 'O #id curto (ou id completo) da imagem.' },
          texto: { type: 'string', description: `A descrição, até ${MAX_DESCRICAO_DA_IMAGEM} caracteres.` },
        },
        required: ['quadro', 'item', 'texto'],
        additionalProperties: false,
      },
      anotacoes: { destrutiva: false, idempotente: true },
      async executar(args) {
        const c = await quadroPor(args.quadro);
        const item = imagemPor(c, args.item);
        await gravar(c, alvoDaImagem(item.id), args.texto, MAX_DESCRICAO_DA_IMAGEM, assinaturaDaImagem(item), 'da descrição');
        return [texto(`Descrição da imagem #${item.id.slice(0, 6)} gravada.`)];
      },
    },
    {
      nome: 'quadro_propor',
      descricao: `Propõe notas num quadro: cria a moldura "✦ <titulo>" num espaço livre ao lado da seção "perto", com até ${MAX_NOTAS_POR_PROPOSTA} notas {texto, tipo?} (tipo semântico opcional). Tudo entra na fila de revisão do mestre como do assistente. No quadro aberto, um Ctrl+Z desfaz; em outro, grava direto, sem histórico. Devolve o id da moldura e o total de notas.`,
      esquema: {
        type: 'object',
        properties: {
          quadro: quadroEsquema,
          titulo: { type: 'string', description: 'Título da moldura (o "✦ " é acrescentado).' },
          notas: {
            type: 'array',
            minItems: 1,
            maxItems: MAX_NOTAS_POR_PROPOSTA,
            items: {
              type: 'object',
              properties: { texto: { type: 'string' }, tipo: { type: 'string', enum: [...TIPOS_SEMANTICOS], description: 'Tipo semântico (cor); opcional.' } },
              required: ['texto'],
              additionalProperties: false,
            },
          },
          perto: { type: 'string', description: 'Seção (id ou título) ao lado da qual propor; sem ela, à direita de tudo.' },
        },
        required: ['quadro', 'titulo', 'notas'],
        additionalProperties: false,
      },
      anotacoes: { destrutiva: false, idempotente: false },
      async executar(args) {
        const c = await quadroPor(args.quadro);
        const perto = textoDe(args.perto) ? secaoPor(c, args.perto) : null;
        const lista = Array.isArray(args.notas) ? (args.notas as { texto: string; tipo?: string | null }[]) : [];
        const tam = tamanhoDaProposta(Math.max(1, lista.length));
        const pos = posicaoLivre(tam, c.itens, perto ? perto.caixa : null);
        const paleta = ctx.paleta?.();
        const proposta = montarProposta(String(args.titulo ?? ''), lista, {
          quadroId: c.quadro.id,
          x: pos.x,
          y: pos.y,
          agora: Date.now(),
          novoId: () => crypto.randomUUID(),
          ...(paleta ? { paleta } : {}),
        });
        await ctx.criarItens(c.quadro.id, proposta.itens, `Proposta do assistente: ${proposta.moldura.titulo}`);
        const naTela = ctx.aberto()?.quadro.id === c.quadro.id;
        return [json({ moldura: proposta.moldura.id, notas: proposta.notas.length, quadro: c.quadro.nome, ondeFicou: { x: Math.round(pos.x), y: Math.round(pos.y) }, desfazer: naTela ? 'Ctrl+Z na tela do quadro' : 'sem histórico (quadro fechado); o mestre apaga pela fila de revisão' })];
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

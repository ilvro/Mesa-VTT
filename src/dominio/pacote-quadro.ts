import { secoesDoQuadro } from './secoes-do-quadro.ts';
import { colar, copiar } from './area-de-transferencia.ts';
import { assinaturaDoAlvo, type ResumoGuardado, type RegistroResumo, lerResumosDoPacote } from './resumos-do-quadro.ts';
import { validarItem, validarQuadro, type Item, type Quadro } from './quadro.ts';

export const FORMATO_PACOTE = 'mesa-quadro' as const;
export const VERSAO_PACOTE = 1 as const;
export const SUFIXO_PACOTE = '.mesa-quadro.zip';

export interface PacoteQuadro {
  formato: typeof FORMATO_PACOTE;
  versao: typeof VERSAO_PACOTE;
  quadro: Quadro;
  itens: Item[];
  /** Opcional: pacotes antigos não têm. */
  resumos?: ResumoGuardado[];
}

/** O JSON do `quadro.json` do pacote. */
export function montarPacote(quadro: Quadro, itens: readonly Item[], resumos: readonly ResumoGuardado[] = []): string {
  const pacote: PacoteQuadro = { formato: FORMATO_PACOTE, versao: VERSAO_PACOTE, quadro, itens: [...itens] };
  if (resumos.length > 0) pacote.resumos = resumos.map(({ alvo, texto, assinatura, autor, em }) => ({ alvo, texto, assinatura, autor, em }));
  return JSON.stringify(pacote);
}

/** Ids das imagens usadas pelos itens (sem repetição). */
export function imagensDoPacote(itens: readonly Item[]): string[] {
  const ids = new Set<string>();
  for (const it of itens) if (it.tipo === 'imagem') ids.add(it.imagemId);
  return [...ids];
}

/** Nome de arquivo seguro: `<nome>.mesa-quadro.zip`. */
export function nomeDoArquivo(nomeDoQuadro: string): string {
  const limpo = nomeDoQuadro
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .slice(0, 80)
    .trim();
  return `${limpo || 'quadro'}${SUFIXO_PACOTE}`;
}

/** Lê e valida o texto do `quadro.json`; lança `Error` com mensagem clara se o pacote não serve. */
export function lerPacote(texto: string): PacoteQuadro {
  let bruto: unknown;
  try {
    bruto = JSON.parse(texto);
  } catch {
    throw new Error('Pacote de quadro inválido: quadro.json malformado.');
  }
  if (!bruto || typeof bruto !== 'object' || (bruto as { formato?: unknown }).formato !== FORMATO_PACOTE) {
    throw new Error('Este arquivo não é um pacote de quadro da Mesa.');
  }
  const p = bruto as { versao?: unknown; quadro?: unknown; itens?: unknown; resumos?: unknown };
  if (p.versao !== VERSAO_PACOTE) {
    throw new Error(`Versão de pacote não suportada (${String(p.versao)}); esta Mesa lê a versão ${VERSAO_PACOTE}.`);
  }
  try {
    validarQuadro(p.quadro);
  } catch (e) {
    throw new Error(`Pacote de quadro inválido: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!Array.isArray(p.itens)) throw new Error('Pacote de quadro inválido: faltam os itens.');
  p.itens.forEach((it, i) => {
    try {
      validarItem(it, `itens[${i}]`);
    } catch (e) {
      throw new Error(`Pacote de quadro inválido: ${e instanceof Error ? e.message : String(e)}`);
    }
  });
  const resumos = lerResumosDoPacote(p.resumos);
  return {
    formato: FORMATO_PACOTE,
    versao: VERSAO_PACOTE,
    quadro: p.quadro,
    itens: p.itens as Item[],
    ...(resumos.length > 0 ? { resumos } : {}),
  };
}

/** Nome do quadro importado: ganha " (cópia)" se a campanha já tem um quadro com esse nome. */
export function nomeParaImportar(nome: string, existentes: readonly string[]): string {
  const chave = (s: string) => s.trim().toLocaleLowerCase('pt-BR');
  const usados = new Set(existentes.map(chave));
  return usados.has(chave(nome)) ? `${nome.trim()} (cópia)` : nome.trim();
}

/**
 * Quadro e itens novos para a campanha de destino: ids novos (via `colar`, que religa
 * setas, molduras e grupos), mesmas posições, `origem` do Miro mantida.
 */
export function prepararImportacao(
  pacote: PacoteQuadro,
  destino: { campanhaId: string; nomesExistentes: readonly string[]; novoId: () => string; agora: number },
): { quadro: Quadro; itens: Item[]; resumos: RegistroResumo[] } {
  const quadroId = destino.novoId();
  let itens: Item[] = [];
  if (pacote.itens.length > 0) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const it of pacote.itens) {
      minX = Math.min(minX, it.x);
      minY = Math.min(minY, it.y);
      maxX = Math.max(maxX, it.x + it.largura);
      maxY = Math.max(maxY, it.y + it.altura);
    }
    // Centro igual ao dos originais: deslocamento zero.
    const colados = colar(
      copiar(pacote.itens),
      destino.novoId,
      { quadroId, centro: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 } },
      destino.agora,
    );
    if (!colados) throw new Error('Pacote de quadro inválido: itens recusados.');
    itens = colados;
  }
  const quadro: Quadro = {
    ...pacote.quadro,
    id: quadroId,
    campanhaId: destino.campanhaId,
    nome: nomeParaImportar(pacote.quadro.nome, destino.nomesExistentes),
    criadoEm: destino.agora,
    atualizadoEm: destino.agora,
  };
  validarQuadro(quadro);
  const novosIds = new Map<string, string>();
  pacote.itens.forEach((it, i) => novosIds.set(it.id, itens[i]!.id));
  const resumos = remapearResumos(pacote.resumos ?? [], pacote.itens, itens, novosIds, quadroId);
  return { quadro, itens, resumos };
}

/**
 * Resumos do pacote para o quadro novo: os alvos (`item:<id>`, id da moldura, `ilha:<id>`)
 * ganham os ids novos. Um resumo que estava em dia no pacote continua em dia (a assinatura
 * é recalculada com os ids novos); um que já estava velho continua velho.
 */
function remapearResumos(
  resumos: readonly ResumoGuardado[],
  antigos: readonly Item[],
  novos: readonly Item[],
  novosIds: ReadonlyMap<string, string>,
  quadroId: string,
): RegistroResumo[] {
  const saida: RegistroResumo[] = [];
  const secoesAntigas = secoesDoQuadro(antigos);
  const secoesNovas = secoesDoQuadro(novos);
  for (const r of resumos) {
    const m = /^(item:|ilha:)?([\s\S]*)$/.exec(r.alvo)!;
    const prefixo = m[1] ?? '';
    let alvo = r.alvo;
    if (prefixo) {
      const novo = novosIds.get(m[2]!);
      if (novo === undefined) continue; // o item não está no pacote: o resumo não tem a quem servir
      alvo = `${prefixo}${novo}`;
    } else if (novosIds.has(r.alvo)) {
      alvo = novosIds.get(r.alvo)!;
    }
    const emDia = assinaturaDoAlvo(r.alvo, secoesAntigas, antigos) === r.assinatura;
    const nova = emDia ? assinaturaDoAlvo(alvo, secoesNovas, novos) : null;
    saida.push({ quadroId, alvo, texto: r.texto, assinatura: nova ?? r.assinatura, autor: r.autor, em: r.em });
  }
  return saida;
}

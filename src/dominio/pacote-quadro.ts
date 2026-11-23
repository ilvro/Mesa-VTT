import { colar, copiar } from './area-de-transferencia.ts';
import { validarItem, validarQuadro, type Item, type Quadro } from './quadro.ts';

export const FORMATO_PACOTE = 'mesa-quadro' as const;
export const VERSAO_PACOTE = 1 as const;
export const SUFIXO_PACOTE = '.mesa-quadro.zip';

export interface PacoteQuadro {
  formato: typeof FORMATO_PACOTE;
  versao: typeof VERSAO_PACOTE;
  quadro: Quadro;
  itens: Item[];
}

/** O JSON do `quadro.json` do pacote. */
export function montarPacote(quadro: Quadro, itens: readonly Item[]): string {
  const pacote: PacoteQuadro = { formato: FORMATO_PACOTE, versao: VERSAO_PACOTE, quadro, itens: [...itens] };
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
  const p = bruto as { versao?: unknown; quadro?: unknown; itens?: unknown };
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
  return { formato: FORMATO_PACOTE, versao: VERSAO_PACOTE, quadro: p.quadro, itens: p.itens as Item[] };
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
): { quadro: Quadro; itens: Item[] } {
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
  return { quadro, itens };
}

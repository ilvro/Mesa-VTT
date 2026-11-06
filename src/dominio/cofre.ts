import {
  APPS,
  formatarRef,
  lerRef,
  TIPOS_ENTIDADE,
  validarCampanha,
  validarEntidade,
  validarLigacao,
  validarSessao,
  type AppId,
  type Campanha,
  type Entidade,
  type Ligacao,
  type Ref,
  type Sessao,
  type TipoEntidade,
} from '#mesa';
import { lerTags, semAcento } from './entidades.ts';

export interface ManifestoCofre {
  versao: number;
  campanha: Campanha;
  ligacoes: Ligacao[];
  sessoes: Sessao[];
}

/** Transforma um texto em slug seguro para caminhos de arquivo (sem acentos e apenas letras/números/hífens). */
export function criarSlug(texto: string): string {
  const limpo = semAcento(texto)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return limpo || 'item';
}

/** Extrai os primeiros 8 caracteres alfanuméricos do identificador para evitar nomes longos demais em disco. */
export function idCurto(id: string): string {
  const limpo = id.replace(/[^a-zA-Z0-9_-]/g, '');
  return (limpo || 'id').slice(0, 8);
}

/** Determina o caminho relativo seguro onde a entidade é salva dentro do cofre (`entidades/<tipo>/<slug>-<idCurto>.md`). */
export function caminhoDaEntidade(e: Pick<Entidade, 'tipo' | 'nome' | 'id'>): string {
  const slug = criarSlug(e.nome);
  const curto = idCurto(e.id);
  return `entidades/${e.tipo}/${slug}-${curto}.md`;
}

/**
 * Converte uma `Entidade` em um arquivo Markdown (.md) com cabeçalho YAML frontmatter,
 * compatível com Obsidian e com o armazenamento de cofre em disco da Mesa.
 */
export function entidadeParaMarkdown(e: Entidade): { caminho: string; conteudo: string } {
  const caminho = caminhoDaEntidade(e);
  const linhasYaml: string[] = [
    '---',
    `id: ${JSON.stringify(e.id)}`,
    `tipo: ${e.tipo}`,
    `nome: ${JSON.stringify(e.nome)}`,
  ];

  if (e.tags.length === 0) {
    linhasYaml.push('tags: []');
  } else {
    linhasYaml.push('tags:');
    for (const tag of e.tags) {
      linhasYaml.push(`  - ${JSON.stringify(tag)}`);
    }
  }

  if (e.refs.length === 0) {
    linhasYaml.push('refs: []');
  } else {
    linhasYaml.push('refs:');
    for (const ref of e.refs) {
      linhasYaml.push(`  - ${JSON.stringify(formatarRef(ref))}`);
    }
  }

  const agora = Date.now();
  linhasYaml.push(`criadaPor: ${e.criadaPor}`);
  linhasYaml.push(`criadaEm: ${e.criadaEm || agora}`);
  linhasYaml.push(`atualizadaEm: ${e.atualizadaEm || agora}`);
  linhasYaml.push('---');

  const cabecalho = linhasYaml.join('\n');
  const conteudo = e.notas ? `${cabecalho}\n\n${e.notas}\n` : `${cabecalho}\n`;

  return { caminho, conteudo };
}

function parseValorYaml(val: string): unknown {
  const trim = val.trim();
  if (trim === '[]') return [];
  if (trim === '{}') return {};
  if (trim === 'true') return true;
  if (trim === 'false') return false;
  if (trim === 'null') return null;
  if (/^-?\d+(\.\d+)?$/.test(trim)) return Number(trim);
  if ((trim.startsWith('"') && trim.endsWith('"')) || (trim.startsWith("'") && trim.endsWith("'"))) {
    try {
      return JSON.parse(trim);
    } catch {
      return trim.slice(1, -1);
    }
  }
  return trim;
}

function parseInlineArray(str: string): unknown[] {
  const inner = str.slice(1, -1).trim();
  if (!inner) return [];
  const items: unknown[] = [];
  let atual = '';
  let dentroAspas: '"' | "'" | null = null;
  for (let i = 0; i < inner.length; i++) {
    const char = inner[i];
    if (dentroAspas) {
      if (char === dentroAspas && inner[i - 1] !== '\\') {
        dentroAspas = null;
      }
      atual += char;
    } else if (char === '"' || char === "'") {
      dentroAspas = char;
      atual += char;
    } else if (char === ',') {
      if (atual.trim()) items.push(parseValorYaml(atual.trim()));
      atual = '';
    } else {
      atual += char;
    }
  }
  if (atual.trim()) items.push(parseValorYaml(atual.trim()));
  return items;
}

function extrairYamlFrontmatter(bloco: string): Record<string, unknown> | null {
  const linhas = bloco.split(/\r?\n/);
  const resultado: Record<string, unknown> = {};
  let chaveListaAtiva: string | null = null;

  for (const linha of linhas) {
    const semEspacos = linha.trim();
    if (!semEspacos || semEspacos.startsWith('#')) continue;

    const matchItem = linha.match(/^\s*-\s+(.*)$/);
    if (matchItem && chaveListaAtiva) {
      const valorItem = parseValorYaml(matchItem[1] ?? '');
      const arr = resultado[chaveListaAtiva];
      if (Array.isArray(arr)) {
        arr.push(valorItem);
      }
      continue;
    }

    const matchChave = linha.match(/^([a-zA-Z0-9_-]+):\s*(.*)$/);
    if (matchChave) {
      const chave = matchChave[1];
      if (!chave) continue;
      const resto = (matchChave[2] ?? '').trim();

      if (!resto) {
        resultado[chave] = [];
        chaveListaAtiva = chave;
      } else if (resto.startsWith('[') && resto.endsWith(']')) {
        resultado[chave] = parseInlineArray(resto);
        chaveListaAtiva = null;
      } else {
        resultado[chave] = parseValorYaml(resto);
        chaveListaAtiva = null;
      }
      continue;
    }
  }

  return resultado;
}

/**
 * Reconstrói uma `Entidade` a partir do conteúdo de um arquivo Markdown com cabeçalho YAML frontmatter.
 * Retorna `null` se a estrutura for inválida ou não atender às regras de validação da Plataforma da Mesa.
 */
export function markdownParaEntidade(conteudo: string, campanhaId: string): Entidade | null {
  if (typeof conteudo !== 'string' || !conteudo.trim()) return null;

  const match = conteudo.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match || match[1] === undefined || match[2] === undefined) return null;

  const yamlBloco = match[1];
  let notasBrutas = match[2];

  if (notasBrutas.startsWith('\r\n')) notasBrutas = notasBrutas.slice(2);
  else if (notasBrutas.startsWith('\n')) notasBrutas = notasBrutas.slice(1);
  if (notasBrutas.endsWith('\r\n')) notasBrutas = notasBrutas.slice(0, -2);
  else if (notasBrutas.endsWith('\n')) notasBrutas = notasBrutas.slice(0, -1);

  const dados = extrairYamlFrontmatter(yamlBloco);
  if (!dados) return null;

  const id = typeof dados.id === 'string' && dados.id.trim() ? dados.id.trim() : null;
  const tipo = typeof dados.tipo === 'string' && TIPOS_ENTIDADE.includes(dados.tipo as TipoEntidade)
    ? (dados.tipo as TipoEntidade)
    : null;
  const nome = typeof dados.nome === 'string' && dados.nome.trim() ? dados.nome.trim() : null;

  if (!id || !tipo || !nome) return null;

  let tags: string[] = [];
  if (Array.isArray(dados.tags)) {
    tags = lerTags(dados.tags.map(String).join(', '));
  } else if (typeof dados.tags === 'string') {
    tags = lerTags(dados.tags);
  }

  const refs: Ref[] = [];
  if (Array.isArray(dados.refs)) {
    for (const item of dados.refs) {
      if (typeof item === 'string') {
        const refParsed = lerRef(item.trim()) ?? lerRef(`mesa:${item.trim()}`);
        if (refParsed) refs.push(refParsed);
      }
    }
  }

  const criadaPor: AppId = typeof dados.criadaPor === 'string' && APPS.includes(dados.criadaPor as AppId)
    ? (dados.criadaPor as AppId)
    : 'mesa';

  const agora = Date.now();
  const criadaEm = typeof dados.criadaEm === 'number' && Number.isFinite(dados.criadaEm) && dados.criadaEm > 0
    ? dados.criadaEm
    : agora;
  const atualizadaEm = typeof dados.atualizadaEm === 'number' && Number.isFinite(dados.atualizadaEm) && dados.atualizadaEm > 0
    ? dados.atualizadaEm
    : criadaEm;

  const entidade: Entidade = {
    id,
    campanhaId,
    tipo,
    nome,
    refs,
    tags,
    notas: notasBrutas,
    criadaPor,
    criadaEm,
    atualizadaEm,
  };

  try {
    validarEntidade(entidade);
    return entidade;
  } catch {
    return null;
  }
}

/**
 * Serializa a campanha, suas ligações e sessões como um arquivo `campanha.json`.
 */
export function manifestoDoCofre(
  campanha: Campanha,
  ligacoes: readonly Ligacao[] = [],
  sessoes: readonly Sessao[] = [],
): string {
  const doc: ManifestoCofre = {
    versao: 1,
    campanha,
    ligacoes: [...ligacoes],
    sessoes: [...sessoes],
  };
  return JSON.stringify(doc, null, 2);
}

/**
 * Lê e valida um manifesto `campanha.json` do cofre. Retorna `null` caso esteja corrompido ou inválido.
 */
export function lerManifestoDoCofre(
  json: string,
): { campanha: Campanha; ligacoes: Ligacao[]; sessoes: Sessao[] } | null {
  if (typeof json !== 'string' || !json.trim()) return null;
  try {
    const obj = JSON.parse(json) as unknown;
    if (!obj || typeof obj !== 'object') return null;

    const raiz = obj as Record<string, unknown>;
    const dadosCampanha = raiz.campanha && typeof raiz.campanha === 'object' ? raiz.campanha : raiz;
    validarCampanha(dadosCampanha);

    const ligacoes: Ligacao[] = [];
    if (Array.isArray(raiz.ligacoes)) {
      for (const l of raiz.ligacoes) {
        validarLigacao(l);
        ligacoes.push(l);
      }
    }

    const sessoes: Sessao[] = [];
    if (Array.isArray(raiz.sessoes)) {
      for (const s of raiz.sessoes) {
        validarSessao(s);
        sessoes.push(s);
      }
    }

    return {
      campanha: dadosCampanha as Campanha,
      ligacoes,
      sessoes,
    };
  } catch {
    return null;
  }
}

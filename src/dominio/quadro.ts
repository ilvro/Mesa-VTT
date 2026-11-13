import { ehRef, type Ref } from '#mesa';

export const VERSAO_QUADRO = 1 as const;

export const GRADES = ['nenhuma', 'pontos', 'linhas'] as const;
export type Grade = (typeof GRADES)[number];

export interface Quadro {
  id: string;
  campanhaId: string;
  nome: string;
  fundo: { cor: string; grade: Grade; passo: number; encaixar: boolean };
  versao: 1;
  criadoEm: number;
  atualizadoEm: number;
}

export const TIPOS_SEMANTICOS = [
  'leitura',
  'teste',
  'segredo',
  'loot',
  'evento',
  'fala',
  'tarefa',
  'rever',
  'titulo',
] as const;
export type TipoSemantico = (typeof TIPOS_SEMANTICOS)[number];

export const IDS_FONTE = [
  'open-sans',
  'pt-serif',
  'hanken',
  'cinzel',
  'caveat',
  'jetbrains-mono',
] as const;
export type IdFonte = (typeof IDS_FONTE)[number];

export const ALINHAMENTOS_TEXTO = ['esquerda', 'centro', 'direita', 'justificado'] as const;
export const ALINHAMENTOS_VERTICAIS = ['topo', 'meio', 'base'] as const;
export const TRACEJADOS = ['solido', 'tracejado', 'pontilhado'] as const;
export const FORMAS = [
  'retangulo',
  'arredondado',
  'elipse',
  'losango',
  'triangulo',
  'paralelogramo',
  'hexagono',
  'estrela',
  'nuvem',
] as const;
export const LADOS_PONTA = ['auto', 'cima', 'baixo', 'esquerda', 'direita'] as const;
export const ROTAS_SETA = ['reta', 'curva', 'cotovelo'] as const;
export const CABECAS_SETA = ['nenhuma', 'seta', 'triangulo', 'circulo', 'losango'] as const;
export const FERRAMENTAS_TRACO = ['caneta', 'marca-texto'] as const;
export const APARENCIAS_REF = ['cartao', 'icone'] as const;

export interface EstiloDeTexto {
  fonte: IdFonte;
  tamanho: number;
  cor: string;
  alinhamento: (typeof ALINHAMENTOS_TEXTO)[number];
  vertical: (typeof ALINHAMENTOS_VERTICAIS)[number];
}

export interface EstiloDeCaixa {
  fundo: string | null;
  opacidade: number;
  borda: string | null;
  espessuraBorda: number;
  tracejado: (typeof TRACEJADOS)[number];
  raio: number;
  sombra: boolean;
  padding: number;
}

/**
 * JSON do TipTap. Nós aceitos: doc, paragraph{textAlign}, heading{level 1..3},
 * bulletList, orderedList, listItem, hardBreak, text.
 * Marcas aceitas: bold, italic, underline, strike, link{href},
 * textStyle{color, backgroundColor, fontFamily, fontSize}.
 */
export interface NoRico {
  type: string;
  attrs?: Record<string, unknown>;
  content?: NoRico[];
  text?: string;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
}

export interface DocRico {
  type: 'doc';
  content: NoRico[];
}

export interface Revisao {
  tipoSugerido: TipoSemantico | null;
  motivos: string[];
  origem: 'miro';
}

interface Base {
  id: string;
  quadroId: string;
  x: number;
  y: number;
  largura: number;
  altura: number;
  rotacao: number;
  z: number;
  travado: boolean;
  soMestre: boolean;
  molduraId: string | null;
  grupoId: string | null;
  revisao?: Revisao;
  feito?: { em: number; sessaoId: string | null };
  criadoEm: number;
  atualizadoEm: number;
}

export type Forma = (typeof FORMAS)[number];
export type Ponta =
  | { itemId: string; lado: (typeof LADOS_PONTA)[number] }
  | { ponto: [number, number] };
export type Cabeca = (typeof CABECAS_SETA)[number];

export interface AoFocar {
  cena: Ref | null;
  fatos: Record<string, string | boolean>;
}

export type Item =
  | (Base & {
      tipo: 'texto';
      doc: DocRico;
      texto: EstiloDeTexto;
      caixa: EstiloDeCaixa;
      alturaAuto: boolean;
      semantica: TipoSemantico | null;
    })
  | (Base & {
      tipo: 'forma';
      forma: Forma;
      doc: DocRico;
      texto: EstiloDeTexto;
      caixa: EstiloDeCaixa;
      semantica: TipoSemantico | null;
    })
  | (Base & {
      tipo: 'imagem';
      imagemId: string;
      larguraOriginal: number;
      alturaOriginal: number;
      caixa: EstiloDeCaixa;
    })
  | (Base & {
      tipo: 'traco';
      ferramenta: (typeof FERRAMENTAS_TRACO)[number];
      pontos: [number, number, number][];
      cor: string;
      espessura: number;
      opacidade: number;
    })
  | (Base & {
      tipo: 'seta';
      de: Ponta;
      para: Ponta;
      rota: (typeof ROTAS_SETA)[number];
      cor: string;
      espessura: number;
      tracejado: (typeof TRACEJADOS)[number];
      inicio: Cabeca;
      fim: Cabeca;
      rotulo: string;
    })
  | (Base & {
      tipo: 'moldura';
      titulo: string;
      caixa: EstiloDeCaixa;
      aoFocar?: AoFocar;
    })
  | (Base & {
      tipo: 'ref';
      ref: Ref;
      rotulo: string | null;
      aparencia: (typeof APARENCIAS_REF)[number];
    });

// ---------------------------------------------------------------------------
// Documento rico (texto puro / sanitização)
// ---------------------------------------------------------------------------

export const DOC_VAZIO: DocRico = {
  type: 'doc',
  content: [{ type: 'paragraph' }],
};

const NOS_ACEITOS = new Set([
  'paragraph',
  'heading',
  'bulletList',
  'orderedList',
  'listItem',
  'hardBreak',
  'text',
]);

const MARCAS_ACEITAS = new Set([
  'bold',
  'italic',
  'underline',
  'strike',
  'link',
  'textStyle',
]);

function limparAttrsNo(tipo: string, attrs: unknown): Record<string, unknown> | undefined {
  if (!attrs || typeof attrs !== 'object' || Array.isArray(attrs)) return undefined;
  const reg = attrs as Record<string, unknown>;
  if (tipo === 'paragraph') {
    if (typeof reg.textAlign === 'string') return { textAlign: reg.textAlign };
    return undefined;
  }
  if (tipo === 'heading') {
    const out: Record<string, unknown> = {};
    if (reg.level === 1 || reg.level === 2 || reg.level === 3) out.level = reg.level;
    else out.level = 1;
    if (typeof reg.textAlign === 'string') out.textAlign = reg.textAlign;
    return out;
  }
  return undefined;
}

function limparAttrsMarca(tipo: string, attrs: unknown): Record<string, unknown> | undefined {
  if (!attrs || typeof attrs !== 'object' || Array.isArray(attrs)) return undefined;
  const reg = attrs as Record<string, unknown>;
  if (tipo === 'link') {
    if (typeof reg.href === 'string') return { href: reg.href };
    return undefined;
  }
  if (tipo === 'textStyle') {
    const out: Record<string, unknown> = {};
    for (const k of ['color', 'backgroundColor', 'fontFamily', 'fontSize'] as const) {
      if (typeof reg[k] === 'string' && reg[k] !== '') out[k] = reg[k];
    }
    return Object.keys(out).length > 0 ? out : undefined;
  }
  return undefined;
}

function limparNo(v: unknown, caminho: string): NoRico | null {
  if (!ehObjeto(v)) falhar(caminho, 'nó deve ser um objeto');
  if (typeof v.type !== 'string') falhar(`${caminho}.type`, 'deve ser texto');
  if (!NOS_ACEITOS.has(v.type)) return null;

  const no: NoRico = { type: v.type };
  const attrs = limparAttrsNo(v.type, v.attrs);
  if (attrs) no.attrs = attrs;

  if (v.type === 'text') {
    if (typeof v.text !== 'string') falhar(`${caminho}.text`, 'deve ser texto');
    no.text = v.text;
    if (v.marks !== undefined) {
      if (!Array.isArray(v.marks)) falhar(`${caminho}.marks`, 'deve ser lista');
      const marks: { type: string; attrs?: Record<string, unknown> }[] = [];
      for (let i = 0; i < v.marks.length; i++) {
        const m = v.marks[i];
        if (!ehObjeto(m) || typeof m.type !== 'string') {
          falhar(`${caminho}.marks[${i}]`, 'marca inválida');
        }
        if (!MARCAS_ACEITAS.has(m.type)) continue;
        const mAttrs = limparAttrsMarca(m.type, m.attrs);
        marks.push(mAttrs ? { type: m.type, attrs: mAttrs } : { type: m.type });
      }
      if (marks.length > 0) no.marks = marks;
    }
    return no;
  }

  if (v.content !== undefined) {
    if (!Array.isArray(v.content)) falhar(`${caminho}.content`, 'deve ser lista');
    const filhos: NoRico[] = [];
    for (let i = 0; i < v.content.length; i++) {
      const limpo = limparNo(v.content[i], `${caminho}.content[${i}]`);
      if (limpo) filhos.push(limpo);
    }
    no.content = filhos;
  }
  return no;
}

export function normalizarDoc(v: unknown, caminho = 'doc'): DocRico {
  if (!ehObjeto(v)) falhar(caminho, 'deve ser um objeto');
  if (v.type !== 'doc') falhar(`${caminho}.type`, 'deve ser "doc"');
  if (!Array.isArray(v.content)) falhar(`${caminho}.content`, 'deve ser lista');
  const content: NoRico[] = [];
  for (let i = 0; i < v.content.length; i++) {
    const limpo = limparNo(v.content[i], `${caminho}.content[${i}]`);
    if (limpo) content.push(limpo);
  }
  return { type: 'doc', content };
}

function textoDeNo(no: NoRico): string {
  if (no.type === 'text') return no.text ?? '';
  if (no.type === 'hardBreak') return '\n';
  if (!no.content || no.content.length === 0) return '';
  if (no.type === 'bulletList' || no.type === 'orderedList') {
    return no.content.map(textoDeNo).join('\n');
  }
  return no.content.map(textoDeNo).join('');
}

export function textoPuro(doc: DocRico): string {
  if (!doc.content || doc.content.length === 0) return '';
  return doc.content.map(textoDeNo).join('\n');
}

export function docDeTexto(s: string): DocRico {
  const linhas = s.split('\n');
  return {
    type: 'doc',
    content: linhas.map((linha) =>
      linha.length > 0
        ? { type: 'paragraph', content: [{ type: 'text', text: linha }] }
        : { type: 'paragraph' },
    ),
  };
}

// ---------------------------------------------------------------------------
// Validação
// ---------------------------------------------------------------------------

function falhar(caminho: string, msg: string): never {
  throw new Error(`${caminho}: ${msg}`);
}

function ehObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function exigirChavesPermitidas(
  obj: Record<string, unknown>,
  permitidas: ReadonlySet<string>,
  caminho: string,
): void {
  for (const chave of Object.keys(obj)) {
    if (!permitidas.has(chave)) {
      falhar(`${caminho}.${chave}`, 'campo desconhecido');
    }
  }
}

function exigirTexto(v: unknown, caminho: string, naoVazio = false): string {
  if (typeof v !== 'string') falhar(caminho, 'deve ser texto');
  if (naoVazio && v.length === 0) falhar(caminho, 'não pode ser vazio');
  return v;
}

function exigirNumero(v: unknown, caminho: string, min?: number, max?: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) falhar(caminho, 'deve ser número finito');
  if (min !== undefined && v < min) falhar(caminho, `deve ser >= ${min}`);
  if (max !== undefined && v > max) falhar(caminho, `deve ser <= ${max}`);
  return v;
}

function exigirBooleano(v: unknown, caminho: string): boolean {
  if (typeof v !== 'boolean') falhar(caminho, 'deve ser booleano');
  return v;
}

function exigirUmDe<T extends string>(
  v: unknown,
  opcoes: readonly T[],
  caminho: string,
): T {
  if (typeof v !== 'string' || !(opcoes as readonly string[]).includes(v)) {
    falhar(caminho, `valor inválido (${String(v)})`);
  }
  return v as T;
}

function exigirTextoOuNulo(v: unknown, caminho: string): string | null {
  if (v === null) return null;
  return exigirTexto(v, caminho);
}

const CHAVES_QUADRO = new Set([
  'id',
  'campanhaId',
  'nome',
  'fundo',
  'versao',
  'criadoEm',
  'atualizadoEm',
]);
const CHAVES_FUNDO = new Set(['cor', 'grade', 'passo', 'encaixar']);

export function validarQuadro(v: unknown, caminho = 'quadro'): asserts v is Quadro {
  if (!ehObjeto(v)) falhar(caminho, 'deve ser um objeto');
  exigirChavesPermitidas(v, CHAVES_QUADRO, caminho);

  exigirTexto(v.id, `${caminho}.id`, true);
  exigirTexto(v.campanhaId, `${caminho}.campanhaId`, true);
  exigirTexto(v.nome, `${caminho}.nome`);
  if (v.versao !== VERSAO_QUADRO) falhar(`${caminho}.versao`, `deve ser ${VERSAO_QUADRO}`);
  exigirNumero(v.criadoEm, `${caminho}.criadoEm`);
  exigirNumero(v.atualizadoEm, `${caminho}.atualizadoEm`);

  if (!ehObjeto(v.fundo)) falhar(`${caminho}.fundo`, 'deve ser um objeto');
  exigirChavesPermitidas(v.fundo, CHAVES_FUNDO, `${caminho}.fundo`);
  exigirTexto(v.fundo.cor, `${caminho}.fundo.cor`, true);
  exigirUmDe(v.fundo.grade, GRADES, `${caminho}.fundo.grade`);
  exigirNumero(v.fundo.passo, `${caminho}.fundo.passo`, 1);
  exigirBooleano(v.fundo.encaixar, `${caminho}.fundo.encaixar`);
}

const CHAVES_ESTILO_TEXTO = new Set(['fonte', 'tamanho', 'cor', 'alinhamento', 'vertical']);
const CHAVES_ESTILO_CAIXA = new Set([
  'fundo',
  'opacidade',
  'borda',
  'espessuraBorda',
  'tracejado',
  'raio',
  'sombra',
  'padding',
]);
const CHAVES_REVISAO = new Set(['tipoSugerido', 'motivos', 'origem']);
const CHAVES_FEITO = new Set(['em', 'sessaoId']);
const CHAVES_AO_FOCAR = new Set(['cena', 'fatos']);

function validarEstiloTexto(v: unknown, caminho: string): void {
  if (!ehObjeto(v)) falhar(caminho, 'deve ser um objeto');
  exigirChavesPermitidas(v, CHAVES_ESTILO_TEXTO, caminho);
  exigirUmDe(v.fonte, IDS_FONTE, `${caminho}.fonte`);
  exigirNumero(v.tamanho, `${caminho}.tamanho`, 1);
  exigirTexto(v.cor, `${caminho}.cor`, true);
  exigirUmDe(v.alinhamento, ALINHAMENTOS_TEXTO, `${caminho}.alinhamento`);
  exigirUmDe(v.vertical, ALINHAMENTOS_VERTICAIS, `${caminho}.vertical`);
}

function validarEstiloCaixa(v: unknown, caminho: string): void {
  if (!ehObjeto(v)) falhar(caminho, 'deve ser um objeto');
  exigirChavesPermitidas(v, CHAVES_ESTILO_CAIXA, caminho);
  exigirTextoOuNulo(v.fundo, `${caminho}.fundo`);
  exigirNumero(v.opacidade, `${caminho}.opacidade`, 0, 1);
  exigirTextoOuNulo(v.borda, `${caminho}.borda`);
  exigirNumero(v.espessuraBorda, `${caminho}.espessuraBorda`, 0);
  exigirUmDe(v.tracejado, TRACEJADOS, `${caminho}.tracejado`);
  exigirNumero(v.raio, `${caminho}.raio`, 0);
  exigirBooleano(v.sombra, `${caminho}.sombra`);
  exigirNumero(v.padding, `${caminho}.padding`, 0);
}

function validarPonta(v: unknown, caminho: string): void {
  if (!ehObjeto(v)) falhar(caminho, 'deve ser um objeto');
  if ('itemId' in v) {
    exigirChavesPermitidas(v, new Set(['itemId', 'lado']), caminho);
    exigirTexto(v.itemId, `${caminho}.itemId`, true);
    exigirUmDe(v.lado, LADOS_PONTA, `${caminho}.lado`);
    return;
  }
  if ('ponto' in v) {
    exigirChavesPermitidas(v, new Set(['ponto']), caminho);
    if (!Array.isArray(v.ponto) || v.ponto.length !== 2) {
      falhar(`${caminho}.ponto`, 'deve ter [x, y]');
    }
    exigirNumero(v.ponto[0], `${caminho}.ponto[0]`);
    exigirNumero(v.ponto[1], `${caminho}.ponto[1]`);
    return;
  }
  falhar(caminho, 'ponta deve ter itemId ou ponto');
}

const CHAVES_BASE = [
  'id',
  'quadroId',
  'tipo',
  'x',
  'y',
  'largura',
  'altura',
  'rotacao',
  'z',
  'travado',
  'soMestre',
  'molduraId',
  'grupoId',
  'revisao',
  'feito',
  'criadoEm',
  'atualizadoEm',
] as const;

const CHAVES_POR_TIPO: Record<Item['tipo'], ReadonlySet<string>> = {
  texto: new Set([...CHAVES_BASE, 'doc', 'texto', 'caixa', 'alturaAuto', 'semantica']),
  forma: new Set([...CHAVES_BASE, 'forma', 'doc', 'texto', 'caixa', 'semantica']),
  imagem: new Set([
    ...CHAVES_BASE,
    'imagemId',
    'larguraOriginal',
    'alturaOriginal',
    'caixa',
  ]),
  traco: new Set([
    ...CHAVES_BASE,
    'ferramenta',
    'pontos',
    'cor',
    'espessura',
    'opacidade',
  ]),
  seta: new Set([
    ...CHAVES_BASE,
    'de',
    'para',
    'rota',
    'cor',
    'espessura',
    'tracejado',
    'inicio',
    'fim',
    'rotulo',
  ]),
  moldura: new Set([...CHAVES_BASE, 'titulo', 'caixa', 'aoFocar']),
  ref: new Set([...CHAVES_BASE, 'ref', 'rotulo', 'aparencia']),
};

export function validarItem(v: unknown, caminho = 'item'): asserts v is Item {
  if (!ehObjeto(v)) falhar(caminho, 'deve ser um objeto');
  const tipo = exigirTexto(v.tipo, `${caminho}.tipo`) as Item['tipo'];
  const permitidas = CHAVES_POR_TIPO[tipo];
  if (!permitidas) falhar(`${caminho}.tipo`, `tipo desconhecido (${String(v.tipo)})`);
  exigirChavesPermitidas(v, permitidas, caminho);

  exigirTexto(v.id, `${caminho}.id`, true);
  exigirTexto(v.quadroId, `${caminho}.quadroId`, true);
  exigirNumero(v.x, `${caminho}.x`);
  exigirNumero(v.y, `${caminho}.y`);
  exigirNumero(v.largura, `${caminho}.largura`, 0);
  exigirNumero(v.altura, `${caminho}.altura`, 0);
  exigirNumero(v.rotacao, `${caminho}.rotacao`);
  exigirNumero(v.z, `${caminho}.z`);
  exigirBooleano(v.travado, `${caminho}.travado`);
  exigirBooleano(v.soMestre, `${caminho}.soMestre`);
  exigirTextoOuNulo(v.molduraId, `${caminho}.molduraId`);
  exigirTextoOuNulo(v.grupoId, `${caminho}.grupoId`);
  exigirNumero(v.criadoEm, `${caminho}.criadoEm`);
  exigirNumero(v.atualizadoEm, `${caminho}.atualizadoEm`);

  if (v.revisao !== undefined) {
    if (!ehObjeto(v.revisao)) falhar(`${caminho}.revisao`, 'deve ser um objeto');
    exigirChavesPermitidas(v.revisao, CHAVES_REVISAO, `${caminho}.revisao`);
    if (v.revisao.tipoSugerido !== null) {
      exigirUmDe(v.revisao.tipoSugerido, TIPOS_SEMANTICOS, `${caminho}.revisao.tipoSugerido`);
    }
    if (!Array.isArray(v.revisao.motivos)) {
      falhar(`${caminho}.revisao.motivos`, 'deve ser lista');
    }
    for (let i = 0; i < v.revisao.motivos.length; i++) {
      exigirTexto(v.revisao.motivos[i], `${caminho}.revisao.motivos[${i}]`);
    }
    if (v.revisao.origem !== 'miro') falhar(`${caminho}.revisao.origem`, 'deve ser "miro"');
  }

  if (v.feito !== undefined) {
    if (!ehObjeto(v.feito)) falhar(`${caminho}.feito`, 'deve ser um objeto');
    exigirChavesPermitidas(v.feito, CHAVES_FEITO, `${caminho}.feito`);
    exigirNumero(v.feito.em, `${caminho}.feito.em`);
    exigirTextoOuNulo(v.feito.sessaoId, `${caminho}.feito.sessaoId`);
  }

  switch (tipo) {
    case 'texto': {
      v.doc = normalizarDoc(v.doc, `${caminho}.doc`);
      validarEstiloTexto(v.texto, `${caminho}.texto`);
      validarEstiloCaixa(v.caixa, `${caminho}.caixa`);
      exigirBooleano(v.alturaAuto, `${caminho}.alturaAuto`);
      if (v.semantica !== null) {
        exigirUmDe(v.semantica, TIPOS_SEMANTICOS, `${caminho}.semantica`);
      }
      break;
    }
    case 'forma': {
      exigirUmDe(v.forma, FORMAS, `${caminho}.forma`);
      v.doc = normalizarDoc(v.doc, `${caminho}.doc`);
      validarEstiloTexto(v.texto, `${caminho}.texto`);
      validarEstiloCaixa(v.caixa, `${caminho}.caixa`);
      if (v.semantica !== null) {
        exigirUmDe(v.semantica, TIPOS_SEMANTICOS, `${caminho}.semantica`);
      }
      break;
    }
    case 'imagem': {
      exigirTexto(v.imagemId, `${caminho}.imagemId`, true);
      exigirNumero(v.larguraOriginal, `${caminho}.larguraOriginal`, 1);
      exigirNumero(v.alturaOriginal, `${caminho}.alturaOriginal`, 1);
      validarEstiloCaixa(v.caixa, `${caminho}.caixa`);
      break;
    }
    case 'traco': {
      exigirUmDe(v.ferramenta, FERRAMENTAS_TRACO, `${caminho}.ferramenta`);
      if (!Array.isArray(v.pontos)) falhar(`${caminho}.pontos`, 'deve ser lista');
      for (let i = 0; i < v.pontos.length; i++) {
        const pt = v.pontos[i];
        if (!Array.isArray(pt) || pt.length !== 3) {
          falhar(`${caminho}.pontos[${i}]`, 'deve ter [x, y, pressao]');
        }
        exigirNumero(pt[0], `${caminho}.pontos[${i}][0]`);
        exigirNumero(pt[1], `${caminho}.pontos[${i}][1]`);
        exigirNumero(pt[2], `${caminho}.pontos[${i}][2]`, 0, 1);
      }
      exigirTexto(v.cor, `${caminho}.cor`, true);
      exigirNumero(v.espessura, `${caminho}.espessura`, 0.1);
      exigirNumero(v.opacidade, `${caminho}.opacidade`, 0, 1);
      break;
    }
    case 'seta': {
      validarPonta(v.de, `${caminho}.de`);
      validarPonta(v.para, `${caminho}.para`);
      exigirUmDe(v.rota, ROTAS_SETA, `${caminho}.rota`);
      exigirTexto(v.cor, `${caminho}.cor`, true);
      exigirNumero(v.espessura, `${caminho}.espessura`, 0);
      exigirUmDe(v.tracejado, TRACEJADOS, `${caminho}.tracejado`);
      exigirUmDe(v.inicio, CABECAS_SETA, `${caminho}.inicio`);
      exigirUmDe(v.fim, CABECAS_SETA, `${caminho}.fim`);
      exigirTexto(v.rotulo, `${caminho}.rotulo`);
      break;
    }
    case 'moldura': {
      exigirTexto(v.titulo, `${caminho}.titulo`);
      validarEstiloCaixa(v.caixa, `${caminho}.caixa`);
      if (v.aoFocar !== undefined) {
        if (!ehObjeto(v.aoFocar)) falhar(`${caminho}.aoFocar`, 'deve ser um objeto');
        exigirChavesPermitidas(v.aoFocar, CHAVES_AO_FOCAR, `${caminho}.aoFocar`);
        if (v.aoFocar.cena !== null && !ehRef(v.aoFocar.cena)) {
          falhar(`${caminho}.aoFocar.cena`, 'Ref inválido');
        }
        if (!ehObjeto(v.aoFocar.fatos)) {
          falhar(`${caminho}.aoFocar.fatos`, 'deve ser um objeto');
        }
        for (const [k, val] of Object.entries(v.aoFocar.fatos)) {
          if (typeof val !== 'string' && typeof val !== 'boolean') {
            falhar(`${caminho}.aoFocar.fatos.${k}`, 'deve ser texto ou booleano');
          }
        }
      }
      break;
    }
    case 'ref': {
      if (!ehRef(v.ref)) falhar(`${caminho}.ref`, 'Ref inválido');
      exigirTextoOuNulo(v.rotulo, `${caminho}.rotulo`);
      exigirUmDe(v.aparencia, APARENCIAS_REF, `${caminho}.aparencia`);
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// Fábricas com padrões
// ---------------------------------------------------------------------------

export function estiloDeTextoPadrao(parcial?: Partial<EstiloDeTexto>): EstiloDeTexto {
  return {
    fonte: 'open-sans',
    tamanho: 16,
    cor: '#e8efe9',
    alinhamento: 'esquerda',
    vertical: 'topo',
    ...parcial,
  };
}

export function estiloDeCaixaPadrao(parcial?: Partial<EstiloDeCaixa>): EstiloDeCaixa {
  return {
    fundo: null,
    opacidade: 1,
    borda: null,
    espessuraBorda: 0,
    tracejado: 'solido',
    raio: 0,
    sombra: false,
    padding: 8,
    ...parcial,
  };
}

function basePadrao(
  opts: {
    quadroId: string;
    x: number;
    y: number;
    largura: number;
    altura: number;
    z?: number;
  },
  agora: number,
  id: string,
): Base {
  return {
    id,
    quadroId: opts.quadroId,
    x: opts.x,
    y: opts.y,
    largura: opts.largura,
    altura: opts.altura,
    rotacao: 0,
    z: opts.z ?? 1,
    travado: false,
    soMestre: false,
    molduraId: null,
    grupoId: null,
    criadoEm: agora,
    atualizadoEm: agora,
  };
}

export function novoQuadro(
  campanhaId: string,
  nome: string,
  agora: number,
  id: string,
): Quadro {
  return {
    id,
    campanhaId,
    nome,
    fundo: { cor: '#101412', grade: 'pontos', passo: 24, encaixar: false },
    versao: VERSAO_QUADRO,
    criadoEm: agora,
    atualizadoEm: agora,
  };
}

export function novoTexto(
  opts: {
    quadroId: string;
    x: number;
    y: number;
    largura?: number;
    altura?: number;
    z?: number;
    doc?: DocRico;
    semantica?: TipoSemantico | null;
  },
  agora: number,
  id: string,
): Extract<Item, { tipo: 'texto' }> {
  return {
    ...basePadrao(
      {
        quadroId: opts.quadroId,
        x: opts.x,
        y: opts.y,
        largura: opts.largura ?? 240,
        altura: opts.altura ?? 40,
        z: opts.z,
      },
      agora,
      id,
    ),
    tipo: 'texto',
    doc: opts.doc ?? DOC_VAZIO,
    texto: estiloDeTextoPadrao(),
    caixa: estiloDeCaixaPadrao(),
    alturaAuto: true,
    semantica: opts.semantica ?? null,
  };
}

export function novaNotaAdesiva(
  opts: {
    quadroId: string;
    x: number;
    y: number;
    largura?: number;
    altura?: number;
    z?: number;
    doc?: DocRico;
    fundo?: string;
    semantica?: TipoSemantico | null;
  },
  agora: number,
  id: string,
): Extract<Item, { tipo: 'texto' }> {
  return {
    ...basePadrao(
      {
        quadroId: opts.quadroId,
        x: opts.x,
        y: opts.y,
        largura: opts.largura ?? 240,
        altura: opts.altura ?? 240,
        z: opts.z,
      },
      agora,
      id,
    ),
    tipo: 'texto',
    doc: opts.doc ?? DOC_VAZIO,
    texto: estiloDeTextoPadrao({ cor: '#1b1b1b' }),
    caixa: estiloDeCaixaPadrao({
      fundo: opts.fundo ?? '#f7e48c',
      opacidade: 1,
      raio: 4,
      sombra: true,
      padding: 16,
    }),
    alturaAuto: false,
    semantica: opts.semantica ?? null,
  };
}

export function novaForma(
  opts: {
    quadroId: string;
    x: number;
    y: number;
    forma?: Forma;
    largura?: number;
    altura?: number;
    z?: number;
    doc?: DocRico;
    semantica?: TipoSemantico | null;
  },
  agora: number,
  id: string,
): Extract<Item, { tipo: 'forma' }> {
  return {
    ...basePadrao(
      {
        quadroId: opts.quadroId,
        x: opts.x,
        y: opts.y,
        largura: opts.largura ?? 200,
        altura: opts.altura ?? 120,
        z: opts.z,
      },
      agora,
      id,
    ),
    tipo: 'forma',
    forma: opts.forma ?? 'retangulo',
    doc: opts.doc ?? DOC_VAZIO,
    texto: estiloDeTextoPadrao({ alinhamento: 'centro', vertical: 'meio' }),
    caixa: estiloDeCaixaPadrao({
      fundo: '#1c2420',
      borda: '#4b5e53',
      espessuraBorda: 2,
      raio: 6,
      padding: 12,
    }),
    semantica: opts.semantica ?? null,
  };
}

export function novaImagem(
  opts: {
    quadroId: string;
    x: number;
    y: number;
    imagemId: string;
    larguraOriginal: number;
    alturaOriginal: number;
    largura?: number;
    altura?: number;
    z?: number;
  },
  agora: number,
  id: string,
): Extract<Item, { tipo: 'imagem' }> {
  return {
    ...basePadrao(
      {
        quadroId: opts.quadroId,
        x: opts.x,
        y: opts.y,
        largura: opts.largura ?? opts.larguraOriginal,
        altura: opts.altura ?? opts.alturaOriginal,
        z: opts.z,
      },
      agora,
      id,
    ),
    tipo: 'imagem',
    imagemId: opts.imagemId,
    larguraOriginal: opts.larguraOriginal,
    alturaOriginal: opts.alturaOriginal,
    caixa: estiloDeCaixaPadrao({ padding: 0 }),
  };
}

export function novoTraco(
  opts: {
    quadroId: string;
    x: number;
    y: number;
    largura: number;
    altura: number;
    pontos: [number, number, number][];
    ferramenta?: (typeof FERRAMENTAS_TRACO)[number];
    cor?: string;
    espessura?: number;
    opacidade?: number;
    z?: number;
  },
  agora: number,
  id: string,
): Extract<Item, { tipo: 'traco' }> {
  const ferramenta = opts.ferramenta ?? 'caneta';
  return {
    ...basePadrao(
      {
        quadroId: opts.quadroId,
        x: opts.x,
        y: opts.y,
        largura: opts.largura,
        altura: opts.altura,
        z: opts.z,
      },
      agora,
      id,
    ),
    tipo: 'traco',
    ferramenta,
    pontos: opts.pontos,
    cor: opts.cor ?? (ferramenta === 'marca-texto' ? '#f7e48c' : '#e8efe9'),
    espessura: opts.espessura ?? (ferramenta === 'marca-texto' ? 16 : 4),
    opacidade: opts.opacidade ?? (ferramenta === 'marca-texto' ? 0.45 : 1),
  };
}

export function novaSeta(
  opts: {
    quadroId: string;
    de: Ponta;
    para: Ponta;
    x?: number;
    y?: number;
    largura?: number;
    altura?: number;
    z?: number;
    rota?: (typeof ROTAS_SETA)[number];
    cor?: string;
    rotulo?: string;
  },
  agora: number,
  id: string,
): Extract<Item, { tipo: 'seta' }> {
  return {
    ...basePadrao(
      {
        quadroId: opts.quadroId,
        x: opts.x ?? 0,
        y: opts.y ?? 0,
        largura: opts.largura ?? 0,
        altura: opts.altura ?? 0,
        z: opts.z,
      },
      agora,
      id,
    ),
    tipo: 'seta',
    de: opts.de,
    para: opts.para,
    rota: opts.rota ?? 'curva',
    cor: opts.cor ?? '#a8b8ad',
    espessura: 2,
    tracejado: 'solido',
    inicio: 'nenhuma',
    fim: 'seta',
    rotulo: opts.rotulo ?? '',
  };
}

export function novaMoldura(
  opts: {
    quadroId: string;
    x: number;
    y: number;
    largura?: number;
    altura?: number;
    titulo?: string;
    z?: number;
  },
  agora: number,
  id: string,
): Extract<Item, { tipo: 'moldura' }> {
  return {
    ...basePadrao(
      {
        quadroId: opts.quadroId,
        x: opts.x,
        y: opts.y,
        largura: opts.largura ?? 640,
        altura: opts.altura ?? 420,
        z: opts.z ?? 0,
      },
      agora,
      id,
    ),
    tipo: 'moldura',
    titulo: opts.titulo ?? 'Moldura',
    caixa: estiloDeCaixaPadrao({
      fundo: '#161d19',
      opacidade: 0.65,
      borda: '#35443b',
      espessuraBorda: 1,
      raio: 8,
      padding: 16,
    }),
  };
}

export function novaRef(
  opts: {
    quadroId: string;
    x: number;
    y: number;
    ref: Ref;
    rotulo?: string | null;
    aparencia?: (typeof APARENCIAS_REF)[number];
    largura?: number;
    altura?: number;
    z?: number;
  },
  agora: number,
  id: string,
): Extract<Item, { tipo: 'ref' }> {
  return {
    ...basePadrao(
      {
        quadroId: opts.quadroId,
        x: opts.x,
        y: opts.y,
        largura: opts.largura ?? 220,
        altura: opts.altura ?? 72,
        z: opts.z,
      },
      agora,
      id,
    ),
    tipo: 'ref',
    ref: opts.ref,
    rotulo: opts.rotulo ?? null,
    aparencia: opts.aparencia ?? 'cartao',
  };
}

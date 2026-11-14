import { APPS, type AppId, type Entidade, type TipoEntidade } from '#mesa';

/** O aplicativo que esta tela representa: decide quem pode alterar o quê no banco da campanha. */
export const APP_DA_MESA: AppId = 'mesa';

export const ROTULO_DO_TIPO: Readonly<Record<TipoEntidade, { singular: string; plural: string }>> = {
  personagem: { singular: 'Personagem', plural: 'Personagens' },
  ameaca: { singular: 'Ameaça', plural: 'Ameaças' },
  lugar: { singular: 'Lugar', plural: 'Lugares' },
  pista: { singular: 'Pista', plural: 'Pistas' },
  cena: { singular: 'Cena', plural: 'Cenas' },
  efeito: { singular: 'Efeito', plural: 'Efeitos' },
  sessao: { singular: 'Sessão', plural: 'Sessões' },
  faccao: { singular: 'Facção', plural: 'Facções' },
  nota: { singular: 'Nota', plural: 'Notas' },
};

/** Os tipos que a pessoa cria à mão na Mesa. `cena` e `efeito` vêm do Jukebox. */
export const TIPOS_CRIAVEIS: readonly TipoEntidade[] = ['personagem', 'lugar', 'pista', 'faccao', 'sessao', 'nota'];

export const NOME_DO_APP: Readonly<Record<AppId, string>> = {
  atlas: 'Atlas', ficha: 'Dossiê', atelie: 'Ateliê', jukebox: 'Jukebox', tabletop: 'Tabletop', mesa: 'Mesa',
};

/** O que cada aplicativo mostra da entidade, em palavras. */
export const NOME_DO_TIPO_DE_REF: Readonly<Record<string, string>> = {
  mapa: 'mapa', comodo: 'cômodo', ficha: 'ficha', documento: 'documento', 'cena-sonora': 'cena sonora', efeito: 'efeito sonoro', entidade: 'entidade',
};

/** Pasta de cada aplicativo ao lado da Mesa (mesma origem, como no GitHub Pages e no `mesa-dev`). */
export const PASTA_DO_APP: Readonly<Record<AppId, string>> = {
  atlas: 'Atlas', ficha: 'Dossie', atelie: 'Atelie', jukebox: 'Jukebox', tabletop: 'Tabletop', mesa: 'Mesa',
};

/** Minúsculas e sem acento: “Ateliê” casa com “atelie”. */
export const semAcento = (texto: string): string => texto.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('pt-BR');

export type CategoriaFiltro = TipoEntidade | 'encontro';

export interface FiltroDeEntidades {
  tipo?: CategoriaFiltro | null;
  busca?: string;
  tag?: string | null;
  /** Quando verdadeiro e `elenco` está definido, filtra entidades `personagem` para mostrar só o elenco. */
  soElenco?: boolean;
  elenco?: readonly string[];
}

export type OrdemColecao = 'nome-asc' | 'nome-desc' | 'recentes';

export interface ContagemTag {
  tag: string;
  chave: string;
  contagem: number;
}

/** Agrupa etiquetas sem diferenciar caixa/acento (`chave`), preservando a grafia mais usada (`tag`), ordenando por maior contagem e depois alfabeticamente. */
export function contarPorTag(entidades: readonly Entidade[]): ContagemTag[] {
  const grupos = new Map<string, { contagem: number; grafias: Map<string, number> }>();

  for (const e of entidades) {
    const vistasNaEntidade = new Set<string>();
    for (const t of e.tags) {
      const limpa = t.trim().replace(/^#/, '');
      if (!limpa) continue;
      const chave = semAcento(limpa);
      if (vistasNaEntidade.has(chave)) continue;
      vistasNaEntidade.add(chave);

      let g = grupos.get(chave);
      if (!g) {
        g = { contagem: 0, grafias: new Map() };
        grupos.set(chave, g);
      }
      g.contagem++;
      g.grafias.set(limpa, (g.grafias.get(limpa) ?? 0) + 1);
    }
  }

  const resultado: ContagemTag[] = [];
  for (const [chave, g] of grupos) {
    let melhorTag = '';
    let maiorFreq = -1;
    for (const [grafia, freq] of g.grafias) {
      if (
        freq > maiorFreq ||
        (freq === maiorFreq && (melhorTag === '' || grafia.localeCompare(melhorTag, 'pt-BR') < 0))
      ) {
        maiorFreq = freq;
        melhorTag = grafia;
      }
    }
    resultado.push({ tag: melhorTag, chave, contagem: g.contagem });
  }

  return resultado.sort((a, b) => (b.contagem - a.contagem) || a.chave.localeCompare(b.chave, 'pt-BR'));
}

/** Reconhece cenas que são encontros (etiqueta 'encontro' ou 'combate', ou ligações/refs para ameaça). */
export function ehEncontro(e: Pick<Entidade, 'tipo' | 'tags' | 'refs'>): boolean {
  if (e.tipo !== 'cena') return false;
  if (e.tags.some(t => {
    const chave = semAcento(t.replace(/^#/, '').trim());
    return chave === 'encontro' || chave === 'combate';
  })) {
    return true;
  }
  if (e.refs?.some(r => r.tipo === 'ameaca' || (r.app === 'ficha' && semAcento(r.id).includes('ameaca')))) {
    return true;
  }
  return false;
}

/** Ordena uma lista de entidades conforme a regra de ordenação escolhida. */
export function ordenarEntidades(lista: readonly Entidade[], ordem: OrdemColecao): Entidade[] {
  const copia = [...lista];
  if (ordem === 'nome-desc') {
    return copia.sort((a, b) => semAcento(b.nome).localeCompare(semAcento(a.nome), 'pt-BR') || b.criadaEm - a.criadaEm);
  }
  if (ordem === 'recentes') {
    return copia.sort((a, b) => (b.atualizadaEm || b.criadaEm) - (a.atualizadaEm || a.criadaEm) || b.criadaEm - a.criadaEm || semAcento(a.nome).localeCompare(semAcento(b.nome), 'pt-BR'));
  }
  // 'nome-asc'
  return copia.sort((a, b) => semAcento(a.nome).localeCompare(semAcento(b.nome), 'pt-BR') || a.criadaEm - b.criadaEm);
}

/** Filtra por tipo/categoria, tag e por busca (nome, etiquetas e notas, todos os termos). Permite definir a ordenação. */
export function filtrarEntidades(
  lista: readonly Entidade[],
  filtro: FiltroDeEntidades = {},
  ordem: OrdemColecao = 'nome-asc',
  tagLegada?: string | null,
): Entidade[] {
  const termos = semAcento(filtro.busca ?? '').split(/\s+/).filter(Boolean);
  const tagAlvo = filtro.tag ?? tagLegada;
  const chaveTag = tagAlvo ? semAcento(tagAlvo.replace(/^#/, '').trim()) : null;
  const elencoSet = filtro.soElenco && filtro.elenco !== undefined ? new Set(filtro.elenco) : null;

  const filtradas = lista
    .filter(e => {
      if (elencoSet && (e.tipo !== 'personagem' || !elencoSet.has(e.id))) return false;
      if (!filtro.tipo) return true;
      if (filtro.tipo === 'encontro') return ehEncontro(e);
      return e.tipo === filtro.tipo;
    })
    .filter(e => {
      if (!chaveTag) return true;
      return e.tags.some(t => semAcento(t.replace(/^#/, '').trim()) === chaveTag);
    })
    .filter(e => {
      if (!termos.length) return true;
      const palheiro = semAcento(`${e.nome} ${e.tags.join(' ')} ${e.notas}`);
      return termos.every(t => palheiro.includes(t));
    });

  return ordenarEntidades(filtradas, ordem);
}

export function contarPorTipo(lista: readonly Entidade[]): Record<TipoEntidade, number> {
  const contagem: Record<TipoEntidade, number> = { personagem: 0, ameaca: 0, lugar: 0, pista: 0, cena: 0, efeito: 0, sessao: 0, faccao: 0, nota: 0 };
  for (const e of lista) contagem[e.tipo]++;
  return contagem;
}

export interface SecaoColecao {
  id: string;
  rotulo: string;
  entidades: Entidade[];
}

export type ModoExibicaoColecao = 'grade' | 'lista';

/** Alterna entre os modos de exibição 'grade' e 'lista'. */
export function alternarModoExibicao(atual: ModoExibicaoColecao): ModoExibicaoColecao {
  return atual === 'grade' ? 'lista' : 'grade';
}

/** Alterna se uma seção está colapsada ou expandida, devolvendo um novo Set. */
export function alternarSecaoColapsada(colapsadas: ReadonlySet<string>, chave: string): Set<string> {
  const novo = new Set(colapsadas);
  if (novo.has(chave)) novo.delete(chave);
  else novo.add(chave);
  return novo;
}

/** Agrupa uma lista de entidades por seções lógicas da coleção (Cenas, Lugares/Mapas, Encontros, Personagens, etc.). */
export function agruparPorCategoria(lista: readonly Entidade[]): SecaoColecao[] {
  const grupos = new Map<string, Entidade[]>();

  for (const e of lista) {
    const chave = e.tipo === 'cena' && ehEncontro(e) ? 'encontro' : e.tipo;
    let grupo = grupos.get(chave);
    if (!grupo) {
      grupo = [];
      grupos.set(chave, grupo);
    }
    grupo.push(e);
  }

  const ordemSecoes: readonly { id: string; rotulo: string }[] = [
    { id: 'cena', rotulo: 'Cenas' },
    { id: 'lugar', rotulo: 'Lugares / Mapas' },
    { id: 'encontro', rotulo: '⚔ Encontros' },
    { id: 'personagem', rotulo: 'Personagens' },
    { id: 'ameaca', rotulo: 'Ameaças' },
    { id: 'pista', rotulo: 'Pistas' },
    { id: 'faccao', rotulo: 'Facções' },
    { id: 'nota', rotulo: 'Notas' },
    { id: 'efeito', rotulo: 'Efeitos' },
    { id: 'sessao', rotulo: 'Sessões' },
  ];

  const resultado: SecaoColecao[] = [];
  for (const s of ordemSecoes) {
    const itens = grupos.get(s.id);
    if (itens && itens.length > 0) {
      resultado.push({ id: s.id, rotulo: s.rotulo, entidades: itens });
    }
  }

  for (const [id, itens] of grupos) {
    if (!ordemSecoes.some(s => s.id === id) && itens.length > 0) {
      resultado.push({ id, rotulo: id, entidades: itens });
    }
  }

  return resultado;
}

/** Quem criou a entidade altera tudo; os outros só mexem nas referências do próprio aplicativo (regra do repositório). */
export const podeEditar = (e: Pick<Entidade, 'criadaPor'>, app: AppId = APP_DA_MESA): boolean => e.criadaPor === app;
export const podeRemover = podeEditar;
/** Etiquetas e notas: qualquer app altera (contrato, U1). Nome, retrato e remoção: só o dono (`podeEditar`). */
export const podeEditarConteudo = (_e: Pick<Entidade, 'criadaPor'>): boolean => true;

/** “a, b ,, a” → ['a', 'b']: sem vazias, sem repetidas, até 50 de até 40 caracteres (o limite do contrato). */
export function lerTags(texto: string): string[] {
  const vistas = new Set<string>(), saida: string[] = [];
  for (const bruta of texto.split(/[,;\n]/)) {
    const tag = bruta.trim().slice(0, 40), chave = semAcento(tag);
    if (tag && !vistas.has(chave)) { vistas.add(chave); saida.push(tag); }
  }
  return saida.slice(0, 50);
}

/** Acrescenta ao fim as etiquetas de “a, b” que ainda não existem (sem acento/caixa), respeitando os limites de `lerTags`. */
export function adicionarTags(atuais: readonly string[], texto: string): string[] {
  const vistas = new Set(atuais.map(t => semAcento(t.replace(/^#/, '').trim())));
  const saida = [...atuais];
  for (const tag of lerTags(texto)) {
    const chave = semAcento(tag);
    if (vistas.has(chave) || saida.length >= 50) continue;
    vistas.add(chave); saida.push(tag);
  }
  return saida;
}

/** Tira a etiqueta (comparando sem acento/caixa e sem `#`). */
export function removerTag(atuais: readonly string[], tag: string): string[] {
  const chave = semAcento(tag.replace(/^#/, '').trim());
  return atuais.filter(t => semAcento(t.replace(/^#/, '').trim()) !== chave);
}

/** Troca a etiqueta de chave `chaveDe` (sem acento/caixa e sem `#`) por `para` (trim, até 40), na mesma posição. Se `para` já existe, funde sem duplicar; `para` vazio remove. Ausente: devolve cópia igual. */
export function renomearTag(tags: readonly string[], chaveDe: string, para: string): string[] {
  const chaveDaTag = (t: string) => semAcento(t.replace(/^#/, '').trim());
  const alvo = semAcento(chaveDe.replace(/^#/, '').trim());
  if (!tags.some(t => chaveDaTag(t) === alvo)) return [...tags];
  const novo = para.replace(/^#/, '').trim().slice(0, 40), chaveNova = semAcento(novo);
  const saida: string[] = [];
  const vistas = new Set<string>();
  for (const t of tags) {
    const chave = chaveDaTag(t);
    if (chave === alvo) {
      if (!novo || vistas.has(chaveNova)) continue;
      vistas.add(chaveNova); saida.push(novo);
    } else if (!vistas.has(chave)) { vistas.add(chave); saida.push(t); }
  }
  return saida;
}

export const ehAppConhecido = (valor: string): valor is AppId => (APPS as readonly string[]).includes(valor);

/** Entidade `personagem` que tem ficha no Dossiê (`ref.app === 'ficha' && ref.tipo === 'ficha'`). */
export function temFichaDePersonagem(e: Pick<Entidade, 'tipo' | 'refs'>): boolean {
  return e.tipo === 'personagem' && e.refs.some(r => r.app === 'ficha' && r.tipo === 'ficha');
}

/** Remove do elenco os ids que já não correspondem a uma entidade `personagem` da campanha (e sem repetir), preservando a ordem. */
export function podarElenco(elenco: readonly string[], entidades: readonly Pick<Entidade, 'id' | 'tipo'>[]): string[] {
  const validos = new Set(entidades.filter(e => e.tipo === 'personagem').map(e => e.id));
  const vistos = new Set<string>();
  const resultado: string[] = [];
  for (const id of elenco) {
    if (validos.has(id) && !vistos.has(id)) {
      vistos.add(id);
      resultado.push(id);
    }
  }
  return resultado;
}

/**
 * Personagens que têm ficha no Dossiê, separados entre os que estão no elenco (na ordem do elenco)
 * e os que estão fora (em ordem alfabética). Na tela da campanha, `todos` traz os do elenco primeiro.
 */
export function personagensParaElenco(
  entidades: readonly Entidade[],
  elenco?: readonly string[],
): { noElenco: Entidade[]; foraDoElenco: Entidade[]; todos: Entidade[] } {
  const comFicha = entidades.filter(temFichaDePersonagem);
  if (!elenco) {
    const ordenados = ordenarEntidades(comFicha, 'nome-asc');
    return { noElenco: [], foraDoElenco: ordenados, todos: ordenados };
  }
  const porId = new Map(comFicha.map(e => [e.id, e]));
  const noElenco: Entidade[] = [];
  const idsNoElenco = new Set<string>();
  for (const id of elenco) {
    const e = porId.get(id);
    if (e && !idsNoElenco.has(id)) {
      idsNoElenco.add(id);
      noElenco.push(e);
    }
  }
  const foraDoElenco = ordenarEntidades(comFicha.filter(e => !idsNoElenco.has(e.id)), 'nome-asc');
  return { noElenco, foraDoElenco, todos: [...noElenco, ...foraDoElenco] };
}

/** Aplica entradas e saídas ao elenco (podando ids sem entidade `personagem` na campanha). */
export function alterarListaDeElenco(
  elencoAtual: readonly string[] | undefined,
  entidades: readonly Pick<Entidade, 'id' | 'tipo'>[],
  mudancas: { acrescentar?: readonly string[]; remover?: readonly string[] },
): string[] {
  const removerSet = new Set(mudancas.remover ?? []);
  const base = (elencoAtual ?? []).filter(id => !removerSet.has(id));
  for (const id of mudancas.acrescentar ?? []) {
    if (!removerSet.has(id) && !base.includes(id)) base.push(id);
  }
  return podarElenco(base, entidades);
}

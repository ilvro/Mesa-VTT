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
  atlas: 'Atlas', ficha: 'Ficha', atelie: 'Ateliê', jukebox: 'Jukebox', tabletop: 'Tabletop', mesa: 'Mesa',
};

/** O que cada aplicativo mostra da entidade, em palavras. */
export const NOME_DO_TIPO_DE_REF: Readonly<Record<string, string>> = {
  mapa: 'mapa', comodo: 'cômodo', ficha: 'ficha', documento: 'documento', 'cena-sonora': 'cena sonora', efeito: 'efeito sonoro', entidade: 'entidade',
};

/** Pasta de cada aplicativo ao lado da Mesa (mesma origem, como no GitHub Pages e no `mesa-dev`). */
export const PASTA_DO_APP: Readonly<Record<AppId, string>> = {
  atlas: 'Atlas', ficha: 'Ficha', atelie: 'Atelie', jukebox: 'Jukebox', tabletop: 'Tabletop', mesa: 'Mesa',
};

/** Minúsculas e sem acento: “Ateliê” casa com “atelie”. */
export const semAcento = (texto: string): string => texto.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('pt-BR');

export interface FiltroDeEntidades { tipo?: TipoEntidade | null; busca?: string }

/** Filtra por tipo e por busca (nome, etiquetas e notas, todos os termos). A ordem é alfabética, sem acento. */
export function filtrarEntidades(lista: readonly Entidade[], filtro: FiltroDeEntidades = {}): Entidade[] {
  const termos = semAcento(filtro.busca ?? '').split(/\s+/).filter(Boolean);
  return lista
    .filter(e => !filtro.tipo || e.tipo === filtro.tipo)
    .filter(e => {
      if (!termos.length) return true;
      const palheiro = semAcento(`${e.nome} ${e.tags.join(' ')} ${e.notas}`);
      return termos.every(t => palheiro.includes(t));
    })
    .sort((a, b) => semAcento(a.nome).localeCompare(semAcento(b.nome), 'pt-BR') || a.criadaEm - b.criadaEm);
}

export function contarPorTipo(lista: readonly Entidade[]): Record<TipoEntidade, number> {
  const contagem: Record<TipoEntidade, number> = { personagem: 0, ameaca: 0, lugar: 0, pista: 0, cena: 0, efeito: 0, sessao: 0, faccao: 0, nota: 0 };
  for (const e of lista) contagem[e.tipo]++;
  return contagem;
}

/** Quem criou a entidade altera tudo; os outros só mexem nas referências do próprio aplicativo (regra do repositório). */
export const podeEditar = (e: Pick<Entidade, 'criadaPor'>, app: AppId = APP_DA_MESA): boolean => e.criadaPor === app;
export const podeRemover = podeEditar;

/** “a, b ,, a” → ['a', 'b']: sem vazias, sem repetidas, até 50 de até 40 caracteres (o limite do contrato). */
export function lerTags(texto: string): string[] {
  const vistas = new Set<string>(), saida: string[] = [];
  for (const bruta of texto.split(/[,;\n]/)) {
    const tag = bruta.trim().slice(0, 40), chave = semAcento(tag);
    if (tag && !vistas.has(chave)) { vistas.add(chave); saida.push(tag); }
  }
  return saida.slice(0, 50);
}

export const ehAppConhecido = (valor: string): valor is AppId => (APPS as readonly string[]).includes(valor);

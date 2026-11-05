import { criarRef, lerRef, type Entidade, type Ref } from '#mesa';
import { semAcento } from './entidades.ts';

/**
 * Notas com `[[ligações]]`. Sintaxe:
 *  - `[[Nome da entidade]]` e `[[Nome|rótulo]]`: aponta para uma entidade da campanha pelo nome (sem acento nem caixa);
 *  - `[[mesa:app/tipo/id]]` e `[[mesa:app/tipo/id|rótulo]]`: aponta para uma coisa de um aplicativo (um Ref).
 * Colchetes soltos, vazios ou com quebra de linha são texto comum; em `[[a [[b]] c]]` vale a ligação de dentro (`b`).
 */

export type AlvoBruto = { tipo: 'nome'; nome: string } | { tipo: 'ref'; ref: Ref };

export type Trecho =
  | { tipo: 'texto'; texto: string }
  | { tipo: 'ligacao'; bruto: string; alvo: AlvoBruto; rotulo?: string };

export function analisarNota(texto: string): Trecho[] {
  const trechos: Trecho[] = [];
  let consumido = 0, busca = 0;
  for (;;) {
    const fecha = texto.indexOf(']]', busca);
    if (fecha < 0) break;
    // A abertura mais próxima antes do fechamento: com aninhamento, a de dentro.
    const abre = texto.lastIndexOf('[[', fecha - 2);
    const ligacao = abre >= consumido ? lerLigacao(texto.slice(abre + 2, fecha), texto.slice(abre, fecha + 2)) : null;
    if (!ligacao) { busca = fecha + 2; continue; }
    if (abre > consumido) trechos.push({ tipo: 'texto', texto: texto.slice(consumido, abre) });
    trechos.push(ligacao);
    consumido = busca = fecha + 2;
  }
  if (texto.length > consumido) trechos.push({ tipo: 'texto', texto: texto.slice(consumido) });
  return trechos;
}

function lerLigacao(miolo: string, bruto: string): Trecho | null {
  if (/[\n\r]/.test(miolo)) return null;
  const barra = miolo.indexOf('|');
  const esquerda = (barra < 0 ? miolo : miolo.slice(0, barra)).trim();
  const rotulo = barra < 0 ? '' : miolo.slice(barra + 1).trim();
  if (!esquerda) return null;
  const ref = lerRef(esquerda);
  const alvo: AlvoBruto = ref ? { tipo: 'ref', ref } : { tipo: 'nome', nome: esquerda.replace(/\s+/g, ' ') };
  return { tipo: 'ligacao', bruto, alvo, ...(rotulo ? { rotulo } : {}) };
}

/** O Ref com que a Mesa identifica uma entidade da campanha nas ligações (`mesa:mesa/entidade/<id>`, a rota `entidade` do manifesto). */
export const refDaEntidade = (id: string): Ref => criarRef('mesa', 'entidade', id);
export const ehRefDeEntidadeDaMesa = (r: Ref): boolean => r.app === 'mesa' && r.tipo === 'entidade';

export type Destino =
  | { tipo: 'entidade'; entidade: Entidade }
  | { tipo: 'ref'; ref: Ref }
  | { tipo: 'sem-destino'; nome: string };

/** Acha a entidade pelo nome, ignorando acento, caixa e espaços repetidos. Havendo duas, a mais antiga. */
export function entidadePorNome(entidades: readonly Entidade[], nome: string): Entidade | undefined {
  const chave = semAcento(nome).replace(/\s+/g, ' ').trim();
  return entidades.filter(e => semAcento(e.nome).replace(/\s+/g, ' ').trim() === chave).sort((a, b) => a.criadaEm - b.criadaEm || a.id.localeCompare(b.id))[0];
}

export function resolver(alvo: AlvoBruto, entidades: readonly Entidade[]): Destino {
  if (alvo.tipo === 'ref') {
    // Um Ref da própria Mesa que aponta para uma entidade da campanha abre a entidade.
    if (ehRefDeEntidadeDaMesa(alvo.ref)) { const e = entidades.find(x => x.id === alvo.ref.id); if (e) return { tipo: 'entidade', entidade: e }; }
    return { tipo: 'ref', ref: alvo.ref };
  }
  const e = entidadePorNome(entidades, alvo.nome);
  return e ? { tipo: 'entidade', entidade: e } : { tipo: 'sem-destino', nome: alvo.nome };
}

/**
 * Os Refs que a nota menciona, sem repetir, para virarem `ligacoes` do tipo `menciona`. Ligação a nome sem destino não conta.
 * `de` (a própria nota) nunca aparece: uma coisa não se liga a si mesma.
 */
export function refsMencionados(texto: string, entidades: readonly Entidade[], de: Ref): Ref[] {
  const vistos = new Set<string>([chave(de)]), saida: Ref[] = [];
  for (const t of analisarNota(texto)) {
    if (t.tipo !== 'ligacao') continue;
    const d = resolver(t.alvo, entidades);
    const ref = d.tipo === 'entidade' ? refDaEntidade(d.entidade.id) : d.tipo === 'ref' ? d.ref : null;
    if (ref && !vistos.has(chave(ref))) { vistos.add(chave(ref)); saida.push(ref); }
  }
  return saida;
}

const chave = (r: Ref): string => `${r.app}/${r.tipo}/${r.id}`;

/**
 * O autocompletar: se o cursor está dentro de um `[[` ainda aberto na mesma linha, devolve onde o termo começa e o que já foi digitado
 * (até o `|`, se houver). Fora disso, `null`.
 */
export function autocompletarEm(texto: string, cursor: number): { inicio: number; termo: string } | null {
  const antes = texto.slice(0, cursor);
  const abre = antes.lastIndexOf('[[');
  if (abre < 0) return null;
  const miolo = antes.slice(abre + 2);
  if (/[\]\n\r|]/.test(miolo)) return null;
  return { inicio: abre + 2, termo: miolo };
}

/** Nomes que combinam com o termo (sem acento, qualquer parte do nome), os que começam com ele primeiro. */
export function sugerirEntidades(entidades: readonly Entidade[], termo: string, limite = 6): Entidade[] {
  const t = semAcento(termo).trim();
  const pontuar = (e: Entidade) => { const n = semAcento(e.nome); return n.startsWith(t) ? 0 : n.includes(t) ? 1 : 2; };
  return entidades.filter(e => pontuar(e) < 2).sort((a, b) => pontuar(a) - pontuar(b) || semAcento(a.nome).localeCompare(semAcento(b.nome), 'pt-BR')).slice(0, limite);
}

/** Texto que o autocompletar insere no lugar do termo: o nome e o fechamento. Nomes com `|`, `]` ou quebra de linha não são sugeridos por nome (ligam por Ref). */
export const textoDaSugestao = (e: Pick<Entidade, 'nome'>): string => `${e.nome}]]`;
export const nomeLigavel = (nome: string): boolean => !/[|\]\[\n\r]/.test(nome);

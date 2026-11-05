import { ehRef, type Ref } from '#mesa';

/**
 * O registro da sessão: o texto legível do que aconteceu, uma linha por fato (`[19:42] Muirenn rolou Investigação: 17`), mais as
 * anotações do mestre (`[19:50] > A porta rangeu`). É texto simples, guardado no `registro` da sessão no banco da campanha.
 */
export const LIMITE_DO_REGISTRO = 200_000;

export interface FatoDoBarramento { tipo: string; dados: unknown }
export type ResolverNome = (ref: Ref) => string | undefined;

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});
const texto = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
const ref = (v: unknown): Ref | undefined => (ehRef(v) ? v : undefined);

/** Os fatos do catálogo que entram no registro. `ficha.recursos` fica de fora: muda a cada clique e só faria ruído. */
export const FATOS_REGISTRADOS = ['ficha.rolagem', 'atlas.cena-aberta', 'atlas.regiao-entrou', 'atlas.revelado', 'atelie.documento-salvo', 'jukebox.tocando'] as const;

/** O texto de um fato, ou `null` se não se registra (tipo desconhecido, ou dados que não fazem sentido). `nome` traduz um Ref no nome da entidade da campanha. */
export function textoDoFato(f: FatoDoBarramento, nome: ResolverNome): string | null {
  const d = obj(f.dados);
  switch (f.tipo) {
    case 'ficha.rolagem': {
      const total = typeof d.total === 'number' && Number.isFinite(d.total) ? d.total : undefined, titulo = texto(d.titulo);
      if (total === undefined || !titulo) return null;
      const quem = ref(d.ficha) ? nome(ref(d.ficha)!) : undefined;
      return `${quem ?? 'Uma ficha'} rolou ${titulo}: ${total}`;
    }
    case 'atlas.cena-aberta': { const m = ref(d.mapa); return m ? `Mapa aberto: ${nome(m) ?? 'sem nome'}` : null; }
    case 'atlas.regiao-entrou': {
      if (!ref(d.regiao)) return null;
      const onde = texto(d.nome) ?? 'uma região', mapa = ref(d.mapa) ? nome(ref(d.mapa)!) : undefined;
      return `${texto(d.peca) ?? 'Uma peça'} entrou em ${onde}${mapa ? ` (${mapa})` : ''}`;
    }
    case 'atlas.revelado': { const a = ref(d.alvo); return a ? `Revelado aos jogadores: ${texto(d.nome) ?? ROTULO_DO_ALVO[a.tipo] ?? 'algo'}` : null; }
    case 'atelie.documento-salvo': {
      if (!ref(d.documento)) return null;
      const rev = typeof d.revisao === 'number' && Number.isInteger(d.revisao) ? ` (revisão ${d.revisao})` : '';
      return `${nome(ref(d.documento)!) ?? 'Documento do Ateliê'} salvo no Ateliê${rev}`;
    }
    case 'jukebox.tocando': {
      if (d.cena === null) return 'Música parada';
      const c = ref(d.cena); return c ? `Tocando: ${nome(c) ?? 'uma cena sonora'}` : null;
    }
    default: return null;
  }
}
const ROTULO_DO_ALVO: Readonly<Record<string, string>> = { comodo: 'Cômodo', abertura: 'Porta', objeto: 'Objeto', peca: 'Peça', regiao: 'Região' };

/** HH:MM no horário local. */
export const horaDe = (ms: number): string => { const d = new Date(ms); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

export interface Linha { hora: string; texto: string; nota: boolean }

export const formatarLinha = (l: Linha): string => `[${l.hora}] ${l.nota ? '> ' : ''}${l.texto.replace(/[\r\n]+/g, ' ').trim()}`;

/** Lê o registro de volta em linhas. Linha fora do formato (editada à mão) é mantida como texto, sem hora. Linhas em branco somem. */
export function lerRegistro(registro: string): Linha[] {
  return registro.split('\n').map(l => l.trimEnd()).filter(Boolean).map(l => {
    const m = /^\[(\d{2}:\d{2})\] (> )?(.*)$/.exec(l);
    return m ? { hora: m[1]!, texto: m[3]!, nota: Boolean(m[2]) } : { hora: '', texto: l, nota: false };
  });
}

/** Acrescenta uma linha ao registro. Passando do limite do banco, descarta as mais antigas (o registro recente vale mais). */
export function acrescentar(registro: string, l: Linha, limite = LIMITE_DO_REGISTRO): string {
  const nova = formatarLinha(l);
  if (!l.texto.trim()) return registro;
  let linhas = registro ? registro.split('\n') : [];
  linhas.push(nova);
  while (linhas.length > 1 && linhas.join('\n').length > limite) linhas = linhas.slice(1);
  return linhas.join('\n');
}

/** O mesmo texto outra vez em seguida (o mesmo fato chegando por dois caminhos) não se repete. */
export function ehRepeticao(anterior: { texto: string; em: number } | null, texto: string, em: number, janelaMs = 1500): boolean {
  return !!anterior && anterior.texto === texto && em - anterior.em <= janelaMs;
}

export interface ItemExportado { nome: string; onde: string; nota: string }

/** A sessão em Markdown: título, data, roteiro numerado (com as notas) e o registro. `dataTexto` já vem formatada (a função não depende do idioma do sistema). */
export function exportarMarkdown(s: { nome: string; dataTexto: string; roteiro: readonly ItemExportado[]; registro: string }): string {
  const partes = [`# ${s.nome || 'Sessão'}`, '', `*${s.dataTexto}*`, '', '## Roteiro', ''];
  if (!s.roteiro.length) partes.push('_Sem roteiro._');
  s.roteiro.forEach((i, n) => { partes.push(`${n + 1}. **${i.nome}** — ${i.onde}`); if (i.nota.trim()) partes.push(...i.nota.trim().split('\n').map(l => `   > ${l}`)); });
  partes.push('', '## Registro', '');
  const linhas = lerRegistro(s.registro);
  if (!linhas.length) partes.push('_Nada registrado._');
  for (const l of linhas) partes.push(`- ${l.hora ? `${l.hora} ` : ''}${l.nota ? `**Nota:** ${l.texto}` : l.texto}`);
  return `${partes.join('\n')}\n`;
}

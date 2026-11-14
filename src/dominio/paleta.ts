import type { Entidade } from '#mesa';
import { escaparHtml } from './doc-rico.ts';
import { avaliarCondicao, type EstadoDoMundo } from './estado-do-mundo.ts';
import { analisarMarcadores, type Marcador } from './marcadores.ts';
import { entidadePorNome, resolver } from './notas.ts';
import { TIPOS_SEMANTICOS, type TipoSemantico } from './quadro.ts';

export type PaletaDaCampanha = Record<TipoSemantico, string>;

export const PALETA_PADRAO: PaletaDaCampanha = {
  leitura: '#f7e48c',
  teste: '#7aa7f0',
  segredo: '#f2a7b8',
  loot: '#f0a35e',
  evento: '#f0a35e',
  fala: '#8fe3b0',
  tarefa: '#f0a35e',
  rever: '#ffd84d',
  titulo: '#5fe3a1',
};

export const NOMES_SEMANTICOS: Record<TipoSemantico, string> = {
  leitura: 'Leitura',
  teste: 'Teste',
  segredo: 'Segredo',
  loot: 'Loot',
  evento: 'Evento',
  fala: 'Fala',
  tarefa: 'Tarefa',
  rever: 'Rever',
  titulo: 'Título',
};

const HEX_CURTO = /^#([0-9a-f]{3})$/i;
const HEX_LONGO = /^#([0-9a-f]{6})$/i;

export function parsearHex(cor: string): { r: number; g: number; b: number } | null {
  const limpa = cor.trim();
  const m6 = HEX_LONGO.exec(limpa);
  if (m6) {
    const hex = m6[1]!;
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
    };
  }
  const m3 = HEX_CURTO.exec(limpa);
  if (m3) {
    const hex = m3[1]!;
    return {
      r: parseInt(hex[0]! + hex[0]!, 16),
      g: parseInt(hex[1]! + hex[1]!, 16),
      b: parseInt(hex[2]! + hex[2]!, 16),
    };
  }
  return null;
}

export function resolverPaleta(
  parcial?: Partial<Record<TipoSemantico, string>> | null,
): PaletaDaCampanha {
  const resultado = { ...PALETA_PADRAO };
  if (!parcial) return resultado;
  for (const tipo of TIPOS_SEMANTICOS) {
    const cor = parcial[tipo];
    if (typeof cor === 'string' && parsearHex(cor)) {
      resultado[tipo] = cor.trim();
    }
  }
  return resultado;
}

function canalLinear(v: number): number {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

export function luminanciaRelativa(cor: string): number {
  const rgb = parsearHex(cor);
  if (!rgb) return 0;
  return (
    0.2126 * canalLinear(rgb.r) +
    0.7152 * canalLinear(rgb.g) +
    0.0722 * canalLinear(rgb.b)
  );
}

export function corDoTexto(fundoHex: string): '#111111' | '#ffffff' {
  return luminanciaRelativa(fundoHex) > 0.179 ? '#111111' : '#ffffff';
}

export function tipoMaisProximo(
  cor: string,
  paleta: PaletaDaCampanha = PALETA_PADRAO,
  limite = 65,
): TipoSemantico | null {
  const alvo = parsearHex(cor);
  if (!alvo) return null;

  let melhorTipo: TipoSemantico | null = null;
  let menorDist = Infinity;

  for (const tipo of TIPOS_SEMANTICOS) {
    const ref = parsearHex(paleta[tipo]);
    if (!ref) continue;
    const dr = alvo.r - ref.r;
    const dg = alvo.g - ref.g;
    const db = alvo.b - ref.b;
    const dist = Math.sqrt(dr * dr + dg * dg + db * db);
    if (dist < menorDist) {
      menorDist = dist;
      melhorTipo = tipo;
    }
  }

  return menorDist <= limite ? melhorTipo : null;
}

export function fundoEfetivo(
  item: { caixa: { fundo: string | null }; semantica?: TipoSemantico | null },
  paleta: PaletaDaCampanha,
): string | null {
  if (item.caixa.fundo) return item.caixa.fundo;
  if (item.semantica) return paleta[item.semantica];
  return null;
}

function renderizarMarcador(
  m: Marcador,
  entidades: readonly Entidade[] = [],
  estado?: EstadoDoMundo,
): string {
  const condStr = 'condicao' in m ? m.condicao : undefined;
  const condFalsa = Boolean(condStr && estado && !avaliarCondicao(condStr, estado));
  const condCls = condFalsa ? ' chip-condicao-falsa' : '';
  const condHtml = condStr
    ? ` <em class="chip-condicao chip-clicavel" data-condicao="${escaparHtml(condStr)}">se:${escaparHtml(condStr)}</em>`
    : '';

  switch (m.tipo) {
    case 'teste': {
      const pericias = escaparHtml(m.pericias.join(' / '));
      const nota = m.nota ? ` <span class="chip-nota">${escaparHtml(m.nota)}</span>` : '';
      return `<span class="chip-marcador chip-teste${condCls}">${pericias} <strong class="chip-dt">DT ${escaparHtml(String(m.dificuldade))}</strong>${nota}${condHtml}</span>`;
    }
    case 'loot':
      return `<span class="chip-marcador chip-loot${condCls}">LOOT${condHtml}</span>`;
    case 'evento':
      return `<span class="chip-marcador chip-evento${condCls}">EVENTO${condHtml}</span>`;
    case 'tarefa':
      return `<span class="chip-marcador chip-tarefa${condCls}">TAREFA${condHtml}</span>`;
    case 'rever':
      return `<span class="chip-marcador chip-rever${condCls}">REVER${condHtml}</span>`;
    case 'musica':
      return `<span class="chip-marcador chip-musica${condCls}">♪ ${escaparHtml(m.nome)}${condHtml}</span>`;
    case 'data':
      return `<span class="chip-marcador chip-data${condCls}">DATA ${escaparHtml(m.valor)}${condHtml}</span>`;
    case 'segredo':
      return `<span class="chip-marcador chip-segredo${condCls}">SEGREDO${condHtml}</span>`;
    case 'fala': {
      const texto = m.para ? `${m.quem} → ${m.para}` : m.quem;
      const entidade = entidadePorNome(entidades, m.quem);
      const cls = entidade
        ? `chip-marcador chip-fala chip-clicavel${condCls}`
        : `chip-marcador chip-fala${condCls}`;
      const entAttr = entidade ? ` data-entidade-id="${escaparHtml(entidade.id)}"` : '';
      const attrs = `data-fala-quem="${escaparHtml(m.quem)}"${m.para ? ` data-fala-para="${escaparHtml(m.para)}"` : ''}${entAttr}`;
      return `<span class="${cls}" ${attrs}>${escaparHtml(texto)}${condHtml}</span>`;
    }
    case 'rotulo': {
      const entidade = entidadePorNome(entidades, m.texto);
      if (entidade) {
        return `<span class="chip-marcador chip-fala chip-clicavel${condCls}" data-fala-quem="${escaparHtml(m.texto)}" data-entidade-id="${escaparHtml(entidade.id)}">${escaparHtml(m.texto)}${condHtml}</span>`;
      }
      return `<span class="chip-marcador chip-rotulo${condCls}">${escaparHtml(m.texto)}${condHtml}</span>`;
    }
  }
}

export function decorarMarcadores(
  texto: string,
  entidades: readonly Entidade[] = [],
  estado?: EstadoDoMundo,
): string {
  if (!texto.includes('[') && !texto.includes('Tarefa:')) {
    return escaparHtml(texto);
  }
  const trechos = analisarMarcadores(texto);
  let html = '';
  for (const t of trechos) {
    if (t.tipo === 'texto') {
      html += escaparHtml(t.texto);
    } else if (t.tipo === 'ligacao') {
      if (entidades.length === 0) {
        html += escaparHtml(t.bruto);
      } else {
        const dest = resolver(t.alvo, entidades);
        if (dest.tipo === 'entidade') {
          html += `<a href="#/entidade/${encodeURIComponent(dest.entidade.id)}" class="quadro-ligacao" data-entidade-id="${escaparHtml(dest.entidade.id)}">${escaparHtml(t.rotulo ?? dest.entidade.nome)}</a>`;
        } else if (dest.tipo === 'ref') {
          html += `<button type="button" class="quadro-ligacao quadro-ligacao-ref" data-ref-app="${escaparHtml(dest.ref.app)}" data-ref-tipo="${escaparHtml(dest.ref.tipo)}" data-ref-id="${escaparHtml(dest.ref.id)}">${escaparHtml(t.rotulo ?? `${dest.ref.app}:${dest.ref.tipo}`)}</button>`;
        } else {
          html += `<span class="quadro-ligacao-orfa">${escaparHtml(t.rotulo ?? dest.nome)}</span>`;
        }
      }
    } else {
      html += renderizarMarcador(t.marcador, entidades, estado);
    }
  }
  return html;
}

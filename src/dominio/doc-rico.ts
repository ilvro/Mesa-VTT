import { FONTES, familiaCss } from './fontes.ts';
import { normalizarDoc, type DocRico, type NoRico } from './quadro.ts';

export { normalizarDoc };

export interface OpcoesDocParaHtml {
  decorar?: (texto: string) => string | null;
}

const COR_SEGURA =
  /^(?:#[0-9a-fA-F]{3}|#[0-9a-fA-F]{6}|rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)|rgba\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*(?:0|1|0?\.\d+)\s*\))$/;

const ALINHAMENTOS_ACEITOS = new Set(['left', 'center', 'right', 'justify']);

const FONTES_CATALOGO = new Map<string, string>([
  ...(Object.keys(FONTES) as (keyof typeof FONTES)[]).flatMap((id) => {
    const css = familiaCss(id);
    return [
      [id, css] as [string, string],
      [FONTES[id].nome.toLowerCase(), css] as [string, string],
    ];
  }),
  ['hanken grotesk variable', familiaCss('hanken')],
]);

export function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function sanitizarCor(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpa = valor.trim();
  return COR_SEGURA.test(limpa) ? limpa : null;
}

export function sanitizarTamanhoPx(valor: unknown): string | null {
  if (typeof valor === 'number' && Number.isFinite(valor)) {
    if (valor >= 6 && valor <= 400) return `${valor}px`;
    return null;
  }
  if (typeof valor !== 'string') return null;
  const m = /^\s*(\d+(?:\.\d+)?)\s*px\s*$/i.exec(valor);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n < 6 || n > 400) return null;
  return `${n}px`;
}

export function sanitizarFonte(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const primeira = valor.split(',')[0]?.trim().replace(/^['"]|['"]$/g, '').toLowerCase();
  if (!primeira) return null;
  return FONTES_CATALOGO.get(primeira) ?? null;
}

export function sanitizarUrl(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpa = valor.trim();
  if (/^https?:\/\//i.test(limpa) || /^mesa:/i.test(limpa)) {
    return limpa;
  }
  return null;
}

function renderizarTexto(no: NoRico, opcoes?: OpcoesDocParaHtml): string {
  const bruto = no.text ?? '';
  let html = opcoes?.decorar?.(bruto) ?? escaparHtml(bruto);
  if (!no.marks || no.marks.length === 0) return html;

  for (const marca of no.marks) {
    switch (marca.type) {
      case 'bold':
        html = `<strong>${html}</strong>`;
        break;
      case 'italic':
        html = `<em>${html}</em>`;
        break;
      case 'underline':
        html = `<u>${html}</u>`;
        break;
      case 'strike':
        html = `<s>${html}</s>`;
        break;
      case 'link': {
        const href = sanitizarUrl(marca.attrs?.href);
        if (href) {
          const ehMesa = /^mesa:/i.test(href);
          html = ehMesa
            ? `<a href="${escaparHtml(href)}" data-mesa-ref="${escaparHtml(href)}">${html}</a>`
            : `<a href="${escaparHtml(href)}" target="_blank" rel="noopener noreferrer">${html}</a>`;
        }
        break;
      }
      case 'textStyle': {
        const estilos: string[] = [];
        const cor = sanitizarCor(marca.attrs?.color);
        if (cor) estilos.push(`color:${cor}`);
        const fundo = sanitizarCor(marca.attrs?.backgroundColor);
        if (fundo) estilos.push(`background-color:${fundo}`);
        const fonte = sanitizarFonte(marca.attrs?.fontFamily);
        if (fonte) estilos.push(`font-family:${fonte}`);
        const tamanho = sanitizarTamanhoPx(marca.attrs?.fontSize);
        if (tamanho) estilos.push(`font-size:${tamanho}`);
        if (estilos.length > 0) {
          html = `<span style="${escaparHtml(estilos.join(';'))}">${html}</span>`;
        }
        break;
      }
    }
  }
  return html;
}

function attrAlinhamento(attrs?: Record<string, unknown>): string {
  const align = attrs?.textAlign;
  if (typeof align === 'string' && ALINHAMENTOS_ACEITOS.has(align)) {
    return ` style="text-align:${align}"`;
  }
  return '';
}

function renderizarNo(no: NoRico, opcoes?: OpcoesDocParaHtml): string {
  const filhos = (no.content ?? []).map((f) => renderizarNo(f, opcoes)).join('');

  switch (no.type) {
    case 'text':
      return renderizarTexto(no, opcoes);
    case 'hardBreak':
      return '<br>';
    case 'paragraph':
      return `<p${attrAlinhamento(no.attrs)}>${filhos || '<br>'}</p>`;
    case 'heading': {
      const nivel = no.attrs?.level === 1 || no.attrs?.level === 2 || no.attrs?.level === 3 ? no.attrs.level : 1;
      return `<h${nivel}${attrAlinhamento(no.attrs)}>${filhos || '<br>'}</h${nivel}>`;
    }
    case 'bulletList':
      return `<ul>${filhos}</ul>`;
    case 'orderedList':
      return `<ol>${filhos}</ol>`;
    case 'listItem':
      return `<li>${filhos}</li>`;
    default:
      return '';
  }
}

export function docParaHtml(doc: DocRico, opcoes?: OpcoesDocParaHtml): string {
  const limpo = normalizarDoc(doc);
  return limpo.content.map((n) => renderizarNo(n, opcoes)).join('');
}

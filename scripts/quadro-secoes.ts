import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { strFromU8, unzipSync } from 'fflate';
import { converterMiro, type PacoteMiroBruto } from '../src/dominio/miro.ts';
import { mapaDoQuadro } from '../src/dominio/mapa-do-quadro.ts';
import { lerPacote } from '../src/dominio/pacote-quadro.ts';
import type { Item } from '../src/dominio/quadro.ts';
import { OPCOES_PADRAO_SECOES, secoesDoQuadro, type OpcoesSecoes, type Secao } from '../src/dominio/secoes-do-quadro.ts';
import { estimarTokens, textoDaSecao } from '../src/dominio/texto-da-secao.ts';

/**
 * Mostra como a Mesa divide um quadro exportado em seções, para calibrar o agrupamento.
 * Uso: npm run quadro:secoes -- <arquivo.mesa-quadro.zip | arquivo.miro.zip> [opções]
 */

export interface ArgumentosQuadroSecoes {
  arquivo: string;
  vao: number | null;
  fator: number | null;
  razaoTitulo: number | null;
  secao: string | null;
  pagina: number;
  html: string | null;
  limite: number | null;
  ajuda: boolean;
}

export const USO = `Uso: npm run quadro:secoes -- <arquivo.mesa-quadro.zip | arquivo.miro.zip> [opções]

  --vao <px>            vão fixo do agrupamento (padrão: automático)
  --fator <n>           fator do vão automático (padrão ${OPCOES_PADRAO_SECOES.fatorVao})
  --razao-titulo <n>    razão de fonte para detectar título (padrão ${OPCOES_PADRAO_SECOES.razaoTitulo})
  --secao <id>          imprime o texto completo da seção (com --pagina <n>)
  --pagina <n>          página do texto da seção (padrão 1)
  --html <arquivo>      grava uma página com o desenho do quadro por seções
  --limite <tokens>     limite de tokens do mapa (padrão 6000)`;

function numero(nome: string, valor: string | undefined, positivo: boolean): number {
  const n = valor === undefined ? NaN : Number(valor);
  if (!Number.isFinite(n) || (positivo && n <= 0)) {
    throw new Error(`Valor inválido para ${nome}: ${valor ?? '(faltando)'}`);
  }
  return n;
}

export function lerArgumentos(argv: readonly string[]): ArgumentosQuadroSecoes {
  const r: ArgumentosQuadroSecoes = {
    arquivo: '', vao: null, fator: null, razaoTitulo: null, secao: null, pagina: 1, html: null, limite: null, ajuda: false,
  };
  const texto = (nome: string, v: string | undefined): string => {
    if (v === undefined || v === '') throw new Error(`Falta o valor de ${nome}`);
    return v;
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    const v = argv[i + 1];
    switch (a) {
      case '--ajuda':
      case '-h':
        r.ajuda = true;
        break;
      case '--vao': r.vao = numero(a, v, true); i++; break;
      case '--fator': r.fator = numero(a, v, true); i++; break;
      case '--razao-titulo': r.razaoTitulo = numero(a, v, true); i++; break;
      case '--limite': r.limite = Math.floor(numero(a, v, true)); i++; break;
      case '--pagina': r.pagina = Math.max(1, Math.floor(numero(a, v, true))); i++; break;
      case '--secao': r.secao = texto(a, v); i++; break;
      case '--html': r.html = texto(a, v); i++; break;
      default:
        if (a.startsWith('--')) throw new Error(`Opção desconhecida: ${a}`);
        if (r.arquivo) throw new Error(`Argumento a mais: ${a}`);
        r.arquivo = a;
    }
  }
  if (!r.arquivo && !r.ajuda) throw new Error('Falta o arquivo do quadro (.mesa-quadro.zip ou .miro.zip).');
  return r;
}

export function opcoesDeSecoes(a: ArgumentosQuadroSecoes): Partial<OpcoesSecoes> {
  const o: Partial<OpcoesSecoes> = {};
  if (a.vao !== null) o.vao = a.vao;
  if (a.fator !== null) o.fatorVao = a.fator;
  if (a.razaoTitulo !== null) o.razaoTitulo = a.razaoTitulo;
  return o;
}

/** Linha com os parâmetros usados, para o mestre repetir. */
export function linhaDeParametros(a: ArgumentosQuadroSecoes): string {
  const o = { ...OPCOES_PADRAO_SECOES, ...opcoesDeSecoes(a) };
  const vao = o.vao === null ? 'automático' : `${o.vao} px`;
  return `Parâmetros: vão ${vao}, fator ${o.fatorVao}, razão de título ${o.razaoTitulo}, limite do mapa ${a.limite ?? 6000} tokens`;
}

// ---------------------------------------------------------------------------
// Leitura do zip
// ---------------------------------------------------------------------------

export interface QuadroLido {
  nome: string;
  itens: Item[];
  formato: 'mesa-quadro' | 'miro-bruto';
}

export function lerZipDoQuadro(bytes: Uint8Array): QuadroLido {
  const entradas = unzipSync(bytes);
  const arq = entradas['quadro.json'];
  if (!arq) throw new Error('Arquivo inválido: quadro.json não encontrado no zip.');
  const texto = strFromU8(arq);
  let bruto: unknown;
  try {
    bruto = JSON.parse(texto);
  } catch {
    throw new Error('Arquivo inválido: quadro.json malformado.');
  }
  const formato = (bruto as { formato?: unknown } | null)?.formato;
  if (formato === 'mesa-quadro') {
    const p = lerPacote(texto);
    return { nome: p.quadro.nome, itens: p.itens, formato };
  }
  if (formato === 'miro-bruto') {
    let n = 0;
    // Imagens sem arquivo: `converterMiro` cria o item com `imagemId` `miro-img-<id>` e as dimensões do `geometry`.
    const r = converterMiro(bruto as PacoteMiroBruto, {
      quadroId: 'quadro-secoes',
      agora: 0,
      novoId: () => `i${(++n).toString(36)}-${n}`,
    });
    return { nome: r.nomeDoQuadro, itens: r.itens, formato };
  }
  throw new Error(`Formato de quadro não reconhecido: ${String(formato)}`);
}

// ---------------------------------------------------------------------------
// HTML
// ---------------------------------------------------------------------------

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Cor distinta por índice (ângulo áureo; a luminosidade alterna para separar vizinhas). */
export function corDaSecao(i: number): string {
  const h = Math.round((i * 137.508) % 360);
  const l = i % 2 === 0 ? 58 : 42;
  return `hsl(${h} 70% ${l}%)`;
}

export function svgDoQuadro(itens: readonly Item[], secoes: readonly Secao[]): string {
  const porId = new Map(itens.map((i) => [i.id, i]));
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const alcance = (x: number, y: number, l: number, a: number) => {
    minX = Math.min(minX, x); minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + l); maxY = Math.max(maxY, y + a);
  };
  for (const s of secoes) alcance(s.caixa.x, s.caixa.y, s.caixa.largura, s.caixa.altura);
  for (const it of itens) if (it.tipo !== 'seta') alcance(it.x, it.y, it.largura, it.altura);
  if (!Number.isFinite(minX)) { minX = 0; minY = 0; maxX = 100; maxY = 100; }
  const margem = Math.max(maxX - minX, maxY - minY) * 0.02 + 20;
  const vx = minX - margem, vy = minY - margem;
  const vl = maxX - minX + 2 * margem, va = maxY - minY + 2 * margem;
  const maior = Math.max(vl, va);

  const grupos = secoes.map((s, idx) => {
    const cor = corDaSecao(idx);
    const tokens = textoDaSecao(s, itens, { secoes, limiteTokens: Number.MAX_SAFE_INTEGER }).tokensTotais;
    const dica = `${s.id} | ${s.titulo} | ${s.itemIds.length} itens | ~${tokens} tokens`;
    const rects = s.itemIds
      .map((id) => porId.get(id))
      .filter((it): it is Item => !!it && it.tipo !== 'seta')
      .map((it) => `<rect x="${it.x}" y="${it.y}" width="${it.largura}" height="${it.altura}" fill="${cor}" fill-opacity="0.55" stroke="${cor}" stroke-width="1" vector-effect="non-scaling-stroke"/>`)
      .join('');
    const c = s.caixa;
    const contorno = `<rect class="contorno" x="${c.x}" y="${c.y}" width="${c.largura}" height="${c.altura}" fill="none" stroke="${cor}" stroke-width="2" stroke-dasharray="8 5" vector-effect="non-scaling-stroke"/>`;
    const titulo = s.titulo.length > 60 ? `${s.titulo.slice(0, 59)}…` : s.titulo;
    const tam = Math.min(Math.max(c.altura * 0.25, maior / 220), Math.max(maior / 220, (c.largura / Math.max(8, titulo.length)) * 1.6), maior / 40);
    const rotulo = `<text class="titulo" x="${c.x + tam * 0.3}" y="${c.y + tam * 1.05}" font-size="${tam.toFixed(1)}" fill="#fff" stroke="#000" stroke-width="${(tam * 0.18).toFixed(2)}" paint-order="stroke">${esc(titulo)}</text>`;
    return `<g class="secao" id="s${idx}" data-id="${esc(s.id)}"><title>${esc(dica)}</title>${rects}${contorno}${rotulo}</g>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vx} ${vy} ${vl} ${va}" preserveAspectRatio="xMidYMid meet">${grupos.join('')}</svg>`;
}

export function htmlDoQuadro(nome: string, itens: readonly Item[], secoes: readonly Secao[], parametros: string): string {
  const lista = secoes
    .map((s, i) => {
      const tokens = textoDaSecao(s, itens, { secoes, limiteTokens: Number.MAX_SAFE_INTEGER }).tokensTotais;
      return `<li><a href="#s${i}" data-alvo="s${i}"><span class="cor" style="background:${corDaSecao(i)}"></span>${esc(s.titulo)}<small>${s.itemIds.length} itens, ~${tokens} tokens · ${s.tipo}</small></a></li>`;
    })
    .join('');
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Seções: ${esc(nome)}</title>
<style>
html,body{margin:0;height:100%;background:#14171a;color:#dde3df;font:14px system-ui,sans-serif}
body{display:grid;grid-template-columns:300px 1fr;grid-template-rows:auto 1fr}
header{grid-column:1/3;padding:8px 14px;border-bottom:1px solid #2c3236}
header small{color:#8a948e;margin-left:12px}
aside{overflow:auto;border-right:1px solid #2c3236}
ul{list-style:none;margin:0;padding:0}
a{display:block;padding:6px 10px;color:inherit;text-decoration:none;border-bottom:1px solid #20262a}
a:hover,a.ativa{background:#232b30}
a small{display:block;color:#8a948e}
.cor{display:inline-block;width:10px;height:10px;margin-right:6px;border-radius:2px}
main{overflow:hidden;min-height:0;cursor:grab}
main:active{cursor:grabbing}
main svg{display:block;width:100%;height:100%}
.secao .titulo{pointer-events:none;font-family:system-ui,sans-serif;font-weight:700}
.secao.ativa .contorno{stroke:#fff;stroke-width:4}
</style></head><body>
<header><strong>${esc(nome)}</strong><small>${secoes.length} seções, ${secoes.reduce((n, sc) => n + sc.itemIds.length, 0)} itens. ${esc(parametros)}</small></header>
<aside><ul>${lista}</ul></aside>
<main>${svgDoQuadro(itens, secoes)}</main>
<script>
// Navegação: roda = zoom no cursor, arrastar = mover, duplo clique = ver tudo; clicar na lista enquadra a seção.
var svg=document.querySelector('main svg');var inicial=svg.getAttribute('viewBox').split(' ').map(Number);var vb=inicial.slice();
function aplicar(){svg.setAttribute('viewBox',vb.join(' '));}
function pontoNoQuadro(ev){var r=svg.getBoundingClientRect();var e=Math.max(vb[2]/r.width,vb[3]/r.height);var ox=(r.width*e-vb[2])/2,oy=(r.height*e-vb[3])/2;return [vb[0]-ox+(ev.clientX-r.left)*e,vb[1]-oy+(ev.clientY-r.top)*e];}
svg.addEventListener('wheel',function(ev){ev.preventDefault();var p=pontoNoQuadro(ev);var f=Math.exp(ev.deltaY*0.0015);vb=[p[0]-(p[0]-vb[0])*f,p[1]-(p[1]-vb[1])*f,vb[2]*f,vb[3]*f];aplicar();},{passive:false});
var arr=null;svg.addEventListener('pointerdown',function(ev){arr={x:ev.clientX,y:ev.clientY,vb:vb.slice()};svg.setPointerCapture(ev.pointerId);});
svg.addEventListener('pointermove',function(ev){if(!arr)return;var r=svg.getBoundingClientRect();var e=Math.max(arr.vb[2]/r.width,arr.vb[3]/r.height);vb=[arr.vb[0]-(ev.clientX-arr.x)*e,arr.vb[1]-(ev.clientY-arr.y)*e,arr.vb[2],arr.vb[3]];aplicar();});
svg.addEventListener('pointerup',function(){arr=null;});
svg.addEventListener('dblclick',function(){vb=inicial.slice();aplicar();});
document.querySelectorAll('aside a').forEach(function(a){a.addEventListener('click',function(e){
e.preventDefault();document.querySelectorAll('.ativa').forEach(function(n){n.classList.remove('ativa')});
var g=document.getElementById(a.dataset.alvo);if(!g)return;g.classList.add('ativa');a.classList.add('ativa');
var c=g.getBBox();var m=Math.max(c.width,c.height)*0.15;vb=[c.x-m,c.y-m,c.width+2*m,c.height+2*m];aplicar();});});
</script></body></html>
`;
}

// ---------------------------------------------------------------------------

export function executar(a: ArgumentosQuadroSecoes, lido: QuadroLido): { saida: string; html: string | null } {
  const opcoesSecoes = opcoesDeSecoes(a);
  const secoes = secoesDoQuadro(lido.itens, opcoesSecoes);
  const html = a.html ? htmlDoQuadro(lido.nome, lido.itens, secoes, linhaDeParametros(a)) : null;
  if (a.secao) {
    const s = secoes.find((x) => x.id === a.secao);
    if (!s) {
      const dicas = secoes.slice(0, 10).map((x) => `  ${x.id}  "${x.titulo}"`).join('\n');
      throw new Error(`Seção não encontrada: ${a.secao}\nAlgumas seções:\n${dicas}`);
    }
    const t = textoDaSecao(s, lido.itens, { pagina: a.pagina, secoes });
    return { saida: `${t.texto}\n\n(~${t.tokens} tokens nesta página; ${t.tokensTotais} na seção inteira; ${t.paginas} páginas)`, html };
  }
  const mapa = mapaDoQuadro({ nome: lido.nome }, lido.itens, {
    opcoesSecoes,
    ...(a.limite !== null ? { limiteTokens: a.limite } : {}),
  });
  return { saida: `${mapa.texto}\n\n(mapa: ~${mapa.tokens} tokens, ${estimarTokens(mapa.texto)} pela estimativa)\n${linhaDeParametros(a)}`, html };
}

export function main(argv: readonly string[] = process.argv.slice(2)): number {
  let a: ArgumentosQuadroSecoes;
  try {
    a = lerArgumentos(argv);
  } catch (e) {
    console.error(`${e instanceof Error ? e.message : String(e)}\n\n${USO}`);
    return 1;
  }
  if (a.ajuda) {
    console.log(USO);
    return 0;
  }
  try {
    const lido = lerZipDoQuadro(readFileSync(a.arquivo));
    const r = executar(a, lido);
    console.log(r.saida);
    if (r.html !== null && a.html) {
      writeFileSync(a.html, r.html);
      console.log(`HTML gravado em ${a.html}`);
    }
    return 0;
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main();
}

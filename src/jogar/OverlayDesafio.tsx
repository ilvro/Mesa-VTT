/**
 * Overlays visuais imersivos dos Desafios de Ordem Paranormal 2 (A Vigília).
 * Usados na Casca do jogador online (`modo="jogador"`), preview do mestre (`modo="mestre"`)
 * e telão local presencial (`modo="telao"`).
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import {
  LADOS_VALIDOS,
  rolarDado,
  totaisEquilibrio,
  type AcaoDesafio,
  type DadoEquilibrioJogado,
  type DesafioAtivo,
  type DesafioEquilibrio,
  type DesafioEscalada,
  type DesafioEsconderijo,
  type DesafioLockpick,
  type DesafioPerseguicao,
  type LadosDado,
  type ParticipanteDesafio,
  type ResultadoPino,
} from '../dominio/desafios.ts';
import type { SugestoesDaFicha } from '../dominio/desafios-ficha.ts';
import { tocarEfeitoDesafio, type EfeitoDesafio } from './som-desafios.ts';
import './overlay-desafio.css';

export interface OverlayDesafioProps {
  desafio: DesafioAtivo | null;
  /** Papel de quem está vendo: `'jogador'` na Casca, `'mestre'` no preview/espectador, `'telao'` no projetor presencial (somente visualização, sem botões de controle do jogador se não interativo). */
  modo: 'jogador' | 'mestre' | 'telao';
  /** Discord ID do jogador atual (quando online). */
  meuDiscordId?: string | null;
  /** ID da ficha ativa do jogador atual (para destacar seu cartão e autorizar ações). */
  minhaFichaId?: string | null;
  /** Sugestões extraídas da ficha ativa do jogador (dados de Físico, Atletismo, etc.). */
  minhaFicha?: SugestoesDaFicha | null;
  /** Nome do autor para registrar em tentativas de lockpick. */
  meuNome?: string;
  /** Mapa opcional `fichaId -> dataUrl/url` de retratos já carregados na Casca. */
  retratos?: Record<string, string>;
  /** Callback para disparar uma ação do desafio (quando interativo). */
  aoAgir?: (acao: AcaoDesafio) => void;
}

type VarianteDado = 'osso' | 'sombra' | 'acerto' | 'alto' | 'baixo' | 'perigo' | 'trancado';

function normalizarLados(n: number): LadosDado {
  if (!Number.isFinite(n) || n <= 4) return 4;
  for (const l of LADOS_VALIDOS) {
    if (n <= l) return l;
  }
  return 20;
}

function subirPassoDado(lados: LadosDado): LadosDado {
  const idx = LADOS_VALIDOS.indexOf(lados);
  if (idx < 0 || idx >= LADOS_VALIDOS.length - 1) return 20;
  return LADOS_VALIDOS[idx + 1]!;
}

function prefereMovimentoReduzido(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function ehMeuParticipante(
  p: ParticipanteDesafio,
  meuDiscordId?: string | null,
  minhaFichaId?: string | null,
): boolean {
  if (minhaFichaId && p.fichaId && p.fichaId === minhaFichaId) return true;
  if (meuDiscordId && p.donoDiscordId && p.donoDiscordId === meuDiscordId) return true;
  return false;
}

function primeiroNome(nome: string): string {
  const limpo = nome.trim();
  if (!limpo) return '?';
  const partes = limpo.split(/\s+/);
  return partes[0] ?? limpo;
}

/** Polígonos SVG reais de dados: d4, d6, d8, d10, d12, d20 — estética limpa de A Vigília. */
function DadoPoligono({
  lados,
  valor,
  variante = 'osso',
  tamanho = 56,
  interativo = false,
  rotulo,
  classe,
}: {
  lados: LadosDado;
  valor: number | string;
  variante?: VarianteDado;
  tamanho?: number;
  interativo?: boolean;
  rotulo?: string;
  classe?: string;
}) {
  const texto = String(valor);
  const tamanhoFonte =
    variante === 'sombra'
      ? texto.length >= 2
        ? lados === 4
          ? 23
          : 26
        : lados === 4
          ? 28
          : 30
      : texto.length >= 2
        ? lados === 4
          ? 21
          : 24
        : lados === 4
          ? 26
          : 31;
  const textoY = lados === 4 ? 41 : 33;

  let forma: string | null = null;
  switch (lados) {
    case 4:
      forma = '32,5 59,54 5,54';
      break;
    case 6:
      forma = null; // quadrado arredondado fiel às prints
      break;
    case 8:
      forma = '32,3 59,32 32,61 5,32';
      break;
    case 10:
    case 12:
      forma = '32,4 59,24 49,57 15,57 5,24';
      break;
    case 20:
      forma = '32,3 57,17 57,47 32,61 7,47 7,17';
      break;
  }

  const seta = variante === 'alto' ? '▲' : variante === 'baixo' ? '▼' : null;
  const setaY = variante === 'alto' ? 14 : 55;

  return (
    <span
      class={`ovd-dado${interativo ? ' ovd-dado-interativo' : ''}${classe ? ` ${classe}` : ''}`}
      data-variante={variante}
      data-lados={lados}
      style={{ width: `${tamanho}px`, height: `${tamanho}px` }}
      aria-label={rotulo ?? `d${lados}: ${texto}`}
    >
      <svg viewBox="0 0 64 64" aria-hidden="true">
        {forma === null ? (
          <rect
            class="ovd-dado-forma"
            x="6"
            y="6"
            width="52"
            height="52"
            rx="11"
            ry="11"
            stroke-width="2"
          />
        ) : (
          <polygon
            class="ovd-dado-forma"
            points={forma}
            stroke-width="2"
            stroke-linejoin="round"
          />
        )}
        {seta && lados !== 4 && (
          <text class="ovd-dado-seta" x="32" y={setaY} font-size="9">
            {seta}
          </text>
        )}
        <text class="ovd-dado-valor" x="32" y={textoY} font-size={tamanhoFonte}>
          {texto}
        </text>
      </svg>
    </span>
  );
}

/** Ícone SVG de figura encapuzada branca pura com capuz pontudo, manto estreito e rosto sombreado (Furtividade — prints 4 e 5). */
function IconeSombra({ tamanho = 28 }: { tamanho?: number }) {
  return (
    <svg
      class="ovd-esc-sombra-icone"
      width={tamanho}
      height={tamanho}
      viewBox="0 0 28 28"
      fill="none"
      aria-hidden="true"
    >
      {/* Capuz pontudo e manto estreito em branco puro */}
      <path
        d="M14 1.4L8.6 9.2C7.4 10.9 6.8 13.1 6.5 15.6L5.6 25.4C5.5 26.1 6.1 26.6 6.8 26.6H21.2C21.9 26.6 22.5 26.1 22.4 25.4L21.5 15.6C21.2 13.1 20.6 10.9 19.4 9.2L14 1.4Z"
        fill="currentColor"
      />
      {/* Rosto sombreado em preto com recorte vertical contrastante */}
      <path
        d="M14 6.6C11.5 8 10.3 10.4 10.3 13.3C10.3 16 11.8 18 14 18.8C16.2 18 17.7 16 17.7 13.3C17.7 10.4 16.5 8 14 6.6Z"
        fill="#08090d"
      />
      {/* Recorte vertical central no manto */}
      <path
        d="M14 18.4V26.6"
        stroke="#08090d"
        stroke-width="1.8"
        stroke-linecap="round"
      />
      <path
        d="M10.2 26.6L11.8 19.6M17.8 26.6L16.2 19.6"
        stroke="#08090d"
        stroke-opacity="0.55"
        stroke-width="1.15"
        stroke-linecap="round"
      />
    </svg>
  );
}

/** Silhueta sólida branca de pessoa correndo para a direita (Perseguição — fiel à print 7). */
function IconeCorrendo({ tamanho = 42, classe }: { tamanho?: number; classe?: string }) {
  return (
    <svg
      class={classe}
      width={tamanho}
      height={tamanho}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="20.5" cy="6.2" r="3" fill="currentColor" />
      <path
        d="M16.8 10.2L12.6 11.2L9.2 14.4C8.5 15 8.5 16.1 9.1 16.8C9.8 17.4 10.8 17.4 11.5 16.8L14 14.5L15.4 14.2L13.1 19.2L8.4 21.2L5.5 20.6C4.6 20.4 3.7 21 3.5 21.9C3.3 22.8 3.9 23.7 4.8 23.9L8.9 24.8C9.3 24.9 9.7 24.8 10.1 24.7L15.4 22.4L18.4 24.4L17.4 28.4C17.2 29.3 17.7 30.2 18.6 30.4C19.5 30.6 20.4 30.1 20.6 29.2L22 23.8C22.2 23 21.9 22.1 21.2 21.6L18.3 19.5L20.1 15.6L22.3 17.2C22.7 17.5 23.2 17.6 23.7 17.5L27.4 16.6C28.3 16.4 28.8 15.5 28.6 14.6C28.4 13.7 27.5 13.2 26.6 13.4L23.8 14.1L20.6 11.2C19.6 10.2 18.2 9.8 16.8 10.2Z"
        fill="currentColor"
      />
    </svg>
  );
}

const ROTACOES_FOLEGO = [-10, 5, -4, 7, -6, 4];

/** UM único pulmão orgânico grande desenhado em contorno branco à mão com traqueia no topo direito e dados d6 marfim inclinados dentro (print 6). */
function PulmaoFolego({
  restante,
  total,
  interativo,
  compacto = false,
  aoUsar,
}: {
  restante: number;
  total: number;
  interativo: boolean;
  compacto?: boolean;
  aoUsar: () => void;
}) {
  const slots = Math.max(total, restante, 0);
  const itens = Array.from({ length: slots }, (_, idx) => idx < restante);
  const largura = compacto ? 86 : 118;
  const altura = compacto ? 76 : 104;
  const tamDado = compacto ? 17 : slots > 4 ? 19 : 24;

  return (
    <div class="ovd-pulmao-wrap">
      <button
        type="button"
        class={compacto ? 'ovd-pulmao-btn ovd-pulmao-btn-compacto' : 'ovd-pulmao-btn'}
        style={{ width: `${largura}px`, height: `${altura}px` }}
        data-interativo={interativo && restante > 0 ? '1' : '0'}
        disabled={!interativo || restante <= 0}
        onClick={aoUsar}
        title={interativo && restante > 0 ? 'Clique para gastar 1 dado de Fôlego (d6)' : `Fôlego: ${restante}/${total}`}
        aria-label={`Fôlego: ${restante} de ${total} dados d6`}
      >
        <svg width={largura} height={altura} viewBox="0 0 128 112" fill="none" aria-hidden="true">
          {/* Traqueia saindo no topo direito */}
          <path
            d="M84 36C89 24 96 14 104 7M94 40C99 29 105 21 113 14"
            stroke="#ffffff"
            stroke-width="2.6"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
          {/* Anéis sutis da traqueia */}
          <path
            d="M90 22L97 26M95 15L102 19"
            stroke="rgba(255, 255, 255, 0.72)"
            stroke-width="1.5"
            stroke-linecap="round"
          />
          {/* Ramificações brônquicas internas finas */}
          <path
            d="M86 38C76 47 64 56 50 64M68 52C58 49 48 51 39 56M62 56C59 67 54 76 46 84M74 47C76 59 75 71 70 82M50 64C40 67 32 73 27 81"
            stroke="rgba(255, 255, 255, 0.5)"
            stroke-width="1.4"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
          {/* Contorno único orgânico desenhado à mão do pulmão (sem preenchimento) */}
          <path
            d="M84 34C71 24 51 24 35 37C19 50 10 71 15 88C19 101 34 106 52 103C72 100 92 89 100 72C106 59 102 45 94 38"
            fill="none"
            stroke="#ffffff"
            stroke-width="2.8"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
        <div class="ovd-pulmao-dados">
          {itens.map((ativo, i) => {
            const rot = ROTACOES_FOLEGO[i % ROTACOES_FOLEGO.length] ?? 0;
            return (
              <span
                key={i}
                class={`ovd-pulmao-dado-slot${ativo ? '' : ' ovd-pulmao-gasto'}`}
                style={{ transform: `rotate(${rot}deg)` }}
              >
                <DadoPoligono
                  lados={6}
                  valor={6}
                  variante={ativo ? 'osso' : 'sombra'}
                  tamanho={tamDado}
                  classe="ovd-pulmao-dado"
                />
              </span>
            );
          })}
        </div>
      </button>
    </div>
  );
}

interface PontoConstelacao {
  cx: number;
  cy: number;
  xPct: number;
  yPct: number;
  raioEncaixe: number;
  tamDado: number;
}

/**
 * Calcula coordenadas (viewBox 400x400 e percentuais) para constelações geométricas do Lockpick:
 * - 1..3 dados: null (usa linha horizontal limpa)
 * - 4 dados: medalhão trevo/diamante fiel à print de A Vigília (pino 2 central maior: 88px)
 * - 5 dados: pentágono regular ao redor do selo
 * - 6 dados: hexágono regular ao redor do selo
 * - 7+ dados: anel circular uniforme ao redor do selo
 */
function posicoesConstelacao(qtd: number): PontoConstelacao[] | null {
  if (qtd < 4) return null;

  if (qtd === 4) {
    return [
      { cx: 88, cy: 112, xPct: 22, yPct: 28, raioEncaixe: 44, tamDado: 68 },
      { cx: 200, cy: 162, xPct: 50, yPct: 40.5, raioEncaixe: 54, tamDado: 88 },
      { cx: 312, cy: 112, xPct: 78, yPct: 28, raioEncaixe: 44, tamDado: 68 },
      { cx: 200, cy: 304, xPct: 50, yPct: 76, raioEncaixe: 44, tamDado: 68 },
    ];
  }

  const centro = 200;
  let angulos: number[];
  let raio: number;
  let raioEncaixe: number;
  let tamDado: number;

  if (qtd === 5) {
    angulos = [-90, -18, 54, 126, 198];
    raio = 118;
    raioEncaixe = 42;
    tamDado = 64;
  } else if (qtd === 6) {
    angulos = [-90, -30, 30, 90, 150, 210];
    raio = 124;
    raioEncaixe = 40;
    tamDado = 60;
  } else {
    angulos = Array.from({ length: qtd }, (_, i) => -90 + (i * 360) / qtd);
    raio = qtd >= 8 ? 136 : 132;
    raioEncaixe = qtd >= 9 ? 32 : 36;
    tamDado = qtd >= 9 ? 50 : 56;
  }

  return angulos.map((deg) => {
    const rad = (deg * Math.PI) / 180;
    const cx = Number((centro + raio * Math.cos(rad)).toFixed(1));
    const cy = Number((centro + raio * Math.sin(rad)).toFixed(1));
    return {
      cx,
      cy,
      xPct: Number(((cx / 400) * 100).toFixed(2)),
      yPct: Number(((cy / 400) * 100).toFixed(2)),
      raioEncaixe,
      tamDado,
    };
  });
}

/** Medalhão circular de pedra/ferro gótico esculpido com encaixes circulares atrás dos dados (print 1). */
function SeloPedraSvg({
  angulo,
  status,
  qtdDados,
}: {
  angulo: number;
  status: DesafioLockpick['status'];
  qtdDados: number;
}) {
  const corAcento =
    status === 'aberto'
      ? 'rgba(232, 185, 90, 0.85)'
      : status === 'travado'
        ? 'rgba(255, 92, 108, 0.78)'
        : 'rgba(233, 230, 223, 0.42)';
  const marcas = Array.from({ length: 32 }, (_, i) => i * 11.25);
  const encaixes = posicoesConstelacao(qtdDados);
  const caminhoCanais =
    encaixes && encaixes.length === 4
      ? `M${encaixes[0]!.cx} ${encaixes[0]!.cy} L${encaixes[1]!.cx} ${encaixes[1]!.cy} L${encaixes[2]!.cx} ${encaixes[2]!.cy} M${encaixes[1]!.cx} ${encaixes[1]!.cy} L${encaixes[3]!.cx} ${encaixes[3]!.cy}`
      : encaixes && encaixes.length >= 5
        ? `${encaixes.map((e, i) => `${i === 0 ? 'M' : 'L'}${e.cx} ${e.cy}`).join(' ')} Z`
        : null;

  return (
    <svg class="ovd-lock-selo-svg" viewBox="0 0 400 400" fill="none" aria-hidden="true">
      <defs>
        <radialGradient id="ovd-pedra-corpo" cx="46%" cy="42%" r="56%">
          <stop offset="0%" stop-color="#2c2934" stop-opacity="0.72" />
          <stop offset="58%" stop-color="#19171f" stop-opacity="0.62" />
          <stop offset="86%" stop-color="#0f0e14" stop-opacity="0.46" />
          <stop offset="100%" stop-color="#08070b" stop-opacity="0" />
        </radialGradient>
        <radialGradient id="ovd-encaixe-grad" cx="50%" cy="45%" r="50%">
          <stop offset="0%" stop-color="#08070c" stop-opacity="0.78" />
          <stop offset="78%" stop-color="#12101a" stop-opacity="0.62" />
          <stop offset="100%" stop-color="#2a2733" stop-opacity="0.4" />
        </radialGradient>
      </defs>

      {/* Corpo esculpido de pedra */}
      <circle cx="200" cy="200" r="190" fill="url(#ovd-pedra-corpo)" />
      <circle cx="200" cy="200" r="184" stroke="rgba(233, 230, 223, 0.24)" stroke-width="2.2" />
      <circle cx="200" cy="200" r="176" stroke="rgba(10, 9, 14, 0.72)" stroke-width="4" />

      {/* Anel externo rotativo de ferro/pedra gótica */}
      <g class="ovd-selo-anel-ext" style={{ transform: `rotate(${angulo}deg)` }}>
        <circle cx="200" cy="200" r="170" stroke={corAcento} stroke-width="2" stroke-dasharray="22 7 5 7" />
        <circle cx="200" cy="200" r="154" stroke="rgba(233, 230, 223, 0.16)" stroke-width="1.3" />
        {marcas.map((deg) => (
          <line
            key={deg}
            x1="200"
            y1="26"
            x2="200"
            y2={deg % 45 === 0 ? '44' : '35'}
            stroke={deg % 90 === 0 ? corAcento : 'rgba(233, 230, 223, 0.2)'}
            stroke-width={deg % 90 === 0 ? '2.2' : '1'}
            transform={`rotate(${deg} 200 200)`}
          />
        ))}
        {/* Pontas góticas cardeais */}
        {[0, 90, 180, 270].map((deg) => (
          <polygon
            key={deg}
            points="200,8 207,22 200,32 193,22"
            fill={corAcento}
            transform={`rotate(${deg} 200 200)`}
          />
        ))}
        {/* Rebites diagonais */}
        {[45, 135, 225, 315].map((deg) => (
          <circle
            key={deg}
            cx="200"
            cy="24"
            r="3"
            fill="rgba(233, 230, 223, 0.45)"
            transform={`rotate(${deg} 200 200)`}
          />
        ))}
      </g>

      {/* Anel interno contra-rotativo */}
      <g class="ovd-selo-anel-int" style={{ transform: `rotate(${-angulo * 1.35}deg)` }}>
        <circle cx="200" cy="200" r="126" stroke={corAcento} stroke-width="1.4" stroke-dasharray="7 6" />
        <circle cx="200" cy="200" r="82" stroke="rgba(233, 230, 223, 0.14)" stroke-width="1.1" />
        <polygon
          points="200,78 306,262 94,262"
          stroke="rgba(233, 230, 223, 0.14)"
          stroke-width="1.2"
          fill="none"
        />
        <polygon
          points="200,322 306,138 94,138"
          stroke="rgba(233, 230, 223, 0.12)"
          stroke-width="1.1"
          fill="none"
        />
      </g>

      {/* Encaixes circulares esculpidos exatamente atrás das constelações de 4, 5, 6+ dados */}
      {encaixes && (
        <g class="ovd-selo-encaixes">
          {caminhoCanais && (
            <path d={caminhoCanais} stroke="rgba(233, 230, 223, 0.2)" stroke-width="2" />
          )}
          {encaixes.map((e, i) => (
            <g key={i}>
              <circle
                cx={e.cx}
                cy={e.cy}
                r={e.raioEncaixe}
                fill="url(#ovd-encaixe-grad)"
                stroke="rgba(233, 230, 223, 0.34)"
                stroke-width="1.8"
              />
              <circle
                cx={e.cx}
                cy={e.cy}
                r={Math.max(12, e.raioEncaixe - 6)}
                stroke="rgba(10, 9, 14, 0.8)"
                stroke-width="2"
              />
            </g>
          ))}
        </g>
      )}
    </svg>
  );
}

/** Pequeno dado polígono SVG posicionado diretamente dentro do prato da balança (print 2). */
function DadoNoPratoSvg({
  lados,
  valor,
  cx,
  cy,
  tamanho,
  perigo,
}: {
  lados: 4 | 10;
  valor: number;
  cx: number;
  cy: number;
  tamanho: number;
  perigo: boolean;
}) {
  const half = tamanho / 2;
  const fill = perigo ? '#ff99a4' : '#e9e6df';
  const stroke = perigo ? '#5c111a' : '#2c2924';
  const textoCor = '#141416';
  const fonte = String(valor).length >= 2 ? tamanho * 0.44 : tamanho * 0.52;

  if (lados === 4) {
    const pts = `${cx},${cy - half} ${cx + half * 0.96},${cy + half * 0.82} ${cx - half * 0.96},${cy + half * 0.82}`;
    return (
      <g>
        <polygon points={pts} fill={fill} stroke={stroke} stroke-width="1.6" stroke-linejoin="round" />
        <text
          x={cx}
          y={cy + half * 0.36}
          text-anchor="middle"
          dominant-baseline="central"
          fill={textoCor}
          font-size={fonte}
          font-weight="900"
          font-family="var(--ovd-fonte-titulo)"
        >
          {valor}
        </text>
      </g>
    );
  }

  // d10 pentágono limpo
  const pts = [
    `${cx},${cy - half}`,
    `${cx + half * 0.95},${cy - half * 0.22}`,
    `${cx + half * 0.6},${cy + half * 0.88}`,
    `${cx - half * 0.6},${cy + half * 0.88}`,
    `${cx - half * 0.95},${cy - half * 0.22}`,
  ].join(' ');

  return (
    <g>
      <polygon points={pts} fill={fill} stroke={stroke} stroke-width="1.6" stroke-linejoin="round" />
      <text
        x={cx}
        y={cy + 1}
        text-anchor="middle"
        dominant-baseline="central"
        fill={textoCor}
        font-size={fonte}
        font-weight="900"
        font-family="var(--ovd-fonte-titulo)"
      >
        {valor}
      </text>
    </g>
  );
}

function renderizarDadosNoPrato(
  cx: number,
  pratoY: number,
  dadoInicial: number | null,
  dadosD4: DadoEquilibrioJogado[],
  perigo: boolean,
) {
  const lista: Array<{ key: string; lados: 4 | 10; valor: number }> = [];
  if (dadoInicial !== null) {
    lista.push({ key: 'd10', lados: 10, valor: dadoInicial });
  }
  for (const d of dadosD4) {
    lista.push({ key: d.id, lados: 4, valor: d.valor });
  }
  if (lista.length === 0) return null;

  const posicoes: Array<{ x: number; y: number; tam: number }> = [];
  if (lista.length === 1) {
    posicoes.push({ x: cx, y: pratoY - 21, tam: 38 });
  } else if (lista.length === 2) {
    posicoes.push({ x: cx - 19, y: pratoY - 20, tam: 36 });
    posicoes.push({ x: cx + 19, y: pratoY - 17, tam: 32 });
  } else if (lista.length === 3) {
    // Empilhamento piramidal fiel à print 2 (dois na base + um no topo)
    posicoes.push({ x: cx - 19, y: pratoY - 19, tam: 35 });
    posicoes.push({ x: cx + 19, y: pratoY - 17, tam: 31 });
    posicoes.push({ x: cx, y: pratoY - 45, tam: 31 });
  } else {
    // Base com até 3 dados + segunda camada empilhada acima
    const base = Math.min(3, lista.length);
    const passo = 28;
    const inicioBase = cx - ((base - 1) * passo) / 2;
    for (let i = 0; i < base; i++) {
      posicoes.push({ x: inicioBase + i * passo, y: pratoY - 17, tam: i === 0 ? 33 : 29 });
    }
    const topo = lista.length - base;
    const inicioTopo = cx - ((topo - 1) * 26) / 2;
    for (let i = 0; i < topo; i++) {
      posicoes.push({ x: inicioTopo + i * 26, y: pratoY - 43, tam: 28 });
    }
  }

  return lista.map((item, idx) => {
    const pos = posicoes[idx] ?? { x: cx, y: pratoY - 46, tam: 26 };
    return (
      <DadoNoPratoSvg
        key={item.key}
        lados={item.lados}
        valor={item.valor}
        cx={pos.x}
        cy={pos.y}
        tamanho={pos.tam}
        perigo={perigo}
      />
    );
  });
}

/** Balança ilustrada em branco/osso puro com dados polígonos reais apoiados nos pratos (print 2). */
function BalancaSvg({
  dadoEsq,
  dadoDir,
  dadosEsq,
  dadosDir,
  esq,
  dir,
  status,
  compacto = false,
}: {
  dadoEsq: number | null;
  dadoDir: number | null;
  dadosEsq: DadoEquilibrioJogado[];
  dadosDir: DadoEquilibrioJogado[];
  esq: number;
  dir: number;
  status: DesafioEquilibrio['status'];
  compacto?: boolean;
}) {
  const angulo = Math.max(-20, Math.min(20, (dir - esq) * 4.2));
  const corTraco =
    status === 'equilibrado'
      ? '#6df0b4'
      : status === 'caiu'
        ? '#ff6b7a'
        : '#f4f1ea';
  const perigo = status === 'caiu';

  return (
    <svg
      class={compacto ? 'ovd-balanca-svg ovd-eq-compacto-svg' : 'ovd-balanca-svg'}
      viewBox="0 0 440 218"
      fill="none"
      aria-label={`Balança: esquerda ${esq}, direita ${dir}`}
    >
      {/* Base limpa + coluna central */}
      <path
        d="M168 206H272M186 198H254L244 206H196L186 198Z"
        stroke={corTraco}
        stroke-width="2.4"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <line x1="220" y1="52" x2="220" y2="198" stroke={corTraco} stroke-width="3.2" stroke-linecap="round" />
      <polygon
        points="220,26 227,40 220,52 213,40"
        fill="none"
        stroke={corTraco}
        stroke-width="2.2"
        stroke-linejoin="round"
      />

      {/* Haste inclinável */}
      <g class="ovd-balanca-haste" style={{ transform: `rotate(${angulo}deg)` }}>
        <path
          d="M78 58C124 52 174 56 220 58C266 56 316 52 362 58"
          stroke={corTraco}
          stroke-width="3.2"
          stroke-linecap="round"
        />
        <circle cx="88" cy="58" r="3.6" fill={corTraco} />
        <circle cx="352" cy="58" r="3.6" fill={corTraco} />

        {/* Prato esquerdo (contra-rotacionado) com dados reais apoiados */}
        <g class="ovd-balanca-prato-esq" style={{ transform: `rotate(${-angulo}deg)` }}>
          <line x1="88" y1="61" x2="46" y2="148" stroke={corTraco} stroke-opacity="0.78" stroke-width="1.6" />
          <line x1="88" y1="61" x2="130" y2="148" stroke={corTraco} stroke-opacity="0.78" stroke-width="1.6" />
          <line x1="88" y1="61" x2="88" y2="148" stroke={corTraco} stroke-opacity="0.32" stroke-width="1.2" />
          {renderizarDadosNoPrato(88, 148, dadoEsq, dadosEsq, perigo)}
          <line x1="36" y1="148" x2="140" y2="148" stroke={corTraco} stroke-width="2.8" stroke-linecap="round" />
          <path
            d="M44 148C50 158 68 162 88 162C108 162 126 158 132 148"
            stroke={corTraco}
            stroke-width="2"
            stroke-linecap="round"
          />
        </g>

        {/* Prato direito (contra-rotacionado) com dados reais apoiados */}
        <g class="ovd-balanca-prato-dir" style={{ transform: `rotate(${-angulo}deg)` }}>
          <line x1="352" y1="61" x2="310" y2="148" stroke={corTraco} stroke-opacity="0.78" stroke-width="1.6" />
          <line x1="352" y1="61" x2="394" y2="148" stroke={corTraco} stroke-opacity="0.78" stroke-width="1.6" />
          <line x1="352" y1="61" x2="352" y2="148" stroke={corTraco} stroke-opacity="0.32" stroke-width="1.2" />
          {renderizarDadosNoPrato(352, 148, dadoDir, dadosDir, perigo)}
          <line x1="300" y1="148" x2="404" y2="148" stroke={corTraco} stroke-width="2.8" stroke-linecap="round" />
          <path
            d="M308 148C314 158 332 162 352 162C372 162 390 158 396 148"
            stroke={corTraco}
            stroke-width="2"
            stroke-linecap="round"
          />
        </g>
      </g>

      {/* Pivô central */}
      <circle cx="220" cy="58" r="5" fill="#121118" stroke={corTraco} stroke-width="2.2" />
    </svg>
  );
}

/** SVG de paredão de pedra recortado + corda de escalada + silhueta branca subindo (Escalada). */
function EscaladaSvg({
  pontos,
  metaPontos,
  status,
  compacto = false,
}: {
  pontos: number;
  metaPontos: number;
  status: 'escalando' | 'topo' | 'caiu';
  compacto?: boolean;
}) {
  const progresso = Math.max(0, Math.min(1, pontos / Math.max(1, metaPontos)));
  const yBase = 104;
  const yTopo = 18;
  const yEscalador = yBase - progresso * (yBase - yTopo);
  const corEscalador =
    status === 'caiu' ? '#ff6b7a' : status === 'topo' ? '#6df0b4' : '#ffffff';

  const degraus = Math.min(Math.max(metaPontos, 2), 12);
  const marcas = Array.from({ length: degraus + 1 }, (_, i) => {
    const frac = i / degraus;
    return yBase - frac * (yBase - yTopo);
  });

  const w = compacto ? 44 : 58;
  const h = compacto ? 86 : 114;

  return (
    <svg
      class="ovd-escalada-svg"
      width={w}
      height={h}
      viewBox="0 0 64 122"
      fill="none"
      aria-label={`Altura ${pontos} de ${metaPontos}`}
    >
      {/* Paredão de pedra recortado à esquerda */}
      <path
        d="M4 116L6 96L15 84L10 68L19 52L13 36L21 20L17 8H4V116Z"
        fill="rgba(14, 13, 20, 0.42)"
        stroke="rgba(244, 241, 234, 0.85)"
        stroke-width="1.8"
        stroke-linejoin="round"
      />
      {/* Fissuras sutis na rocha */}
      <path
        d="M8 28L13 32M7 60L12 63M8 92L12 90"
        stroke="rgba(244, 241, 234, 0.3)"
        stroke-width="1.1"
        stroke-linecap="round"
      />
      {/* Marcas de degraus (0 até metaPontos) */}
      {marcas.map((y, idx) => (
        <line
          key={idx}
          x1="21"
          y1={y}
          x2={idx === 0 || idx === degraus ? '29' : '25'}
          y2={y}
          stroke={idx === degraus ? '#6df0b4' : 'rgba(244, 241, 234, 0.42)'}
          stroke-width={idx === 0 || idx === degraus ? '1.6' : '1.1'}
          stroke-linecap="round"
        />
      ))}

      {/* Pitão e corda de escalada */}
      <circle cx="38" cy="11" r="2.6" stroke="rgba(244, 241, 234, 0.9)" stroke-width="1.6" />
      <line
        x1="38"
        y1="14"
        x2="38"
        y2="114"
        stroke="rgba(244, 241, 234, 0.58)"
        stroke-width="1.5"
        stroke-dasharray="4 3"
        stroke-linecap="round"
      />

      {/* Silhueta branca de escalador subindo ao longo do paredão */}
      <g
        class="ovd-escalador-silhueta"
        style={{
          transform: `translate(36px, ${yEscalador}px)${status === 'caiu' ? ' rotate(28deg)' : ''}`,
        }}
      >
        <circle cx="2" cy="-9" r="3" fill={corEscalador} />
        <path
          d="M2 -5L-5 -9M2 -5L5 -12M2 -5L1 2M1 2L-5 5L-4 10M1 2L6 6L4 11"
          stroke={corEscalador}
          stroke-width="2.4"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </g>
    </svg>
  );
}

/** Ícone de queda/impacto para Escalada. */
function IconeQueda({ tamanho = 14 }: { tamanho?: number }) {
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path
        d="M9 2.5V12.5M9 12.5L5.2 8.7M9 12.5L12.8 8.7M3 15.5H15"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   1. ABRIR FECHADURAS (LOCKPICK)
   ═══════════════════════════════════════════════════════════════════════════ */

interface LinhaHarpa {
  chave: string;
  tom: 'acerto' | 'alto' | 'baixo' | 'trancado';
  texto: string;
  som: EfeitoDesafio;
}

function fraseEmbaralhada(tipo: 'corretos' | 'altos' | 'baixos' | 'trancados', qtd: number): string {
  if (tipo === 'corretos') return qtd === 1 ? 'ALGUM ESTÁ CORRETO' : `${qtd} ESTÃO CORRETOS`;
  if (tipo === 'altos') return qtd === 1 ? 'ALGUM ESTÁ ALTO' : `${qtd} ESTÃO ALTOS`;
  if (tipo === 'baixos') return qtd === 1 ? 'ALGUM ESTÁ BAIXO' : `${qtd} ESTÃO BAIXOS`;
  return qtd === 1 ? 'ALGUM ESTÁ TRANCADO' : `${qtd} ESTÃO TRANCADOS`;
}

function montarLinhasHarpa(
  fb: { corretos: number; altos: number; baixos: number; trancados?: number } | undefined,
): LinhaHarpa[] {
  if (!fb) return [];
  const linhas: LinhaHarpa[] = [];
  if (fb.corretos > 0) {
    linhas.push({
      chave: 'corretos',
      tom: 'acerto',
      texto: fraseEmbaralhada('corretos', fb.corretos),
      som: 'pino-exato',
    });
  }
  if (fb.altos > 0) {
    linhas.push({
      chave: 'altos',
      tom: 'alto',
      texto: fraseEmbaralhada('altos', fb.altos),
      som: 'pino-erro',
    });
  }
  if (fb.baixos > 0) {
    linhas.push({
      chave: 'baixos',
      tom: 'baixo',
      texto: fraseEmbaralhada('baixos', fb.baixos),
      som: 'pino-erro',
    });
  }
  if ((fb.trancados ?? 0) > 0) {
    linhas.push({
      chave: 'trancados',
      tom: 'trancado',
      texto: fraseEmbaralhada('trancados', fb.trancados ?? 0),
      som: 'pino-trancado',
    });
  }
  return linhas;
}

function somParaResultadoPino(res: ResultadoPino | undefined): EfeitoDesafio {
  if (res === 'exato') return 'pino-exato';
  if (res === 'trancado') return 'pino-trancado';
  return 'pino-erro';
}

function rotuloPino(res: ResultadoPino): string {
  if (res === 'exato') return '✓ EXATO';
  if (res === 'alto') return '▲ ALTO';
  if (res === 'baixo') return '▼ BAIXO';
  return '🔒 TRANCADO';
}

function variantePino(res: ResultadoPino | undefined, status: DesafioLockpick['status']): VarianteDado {
  if (status === 'aberto') return 'acerto';
  if (status === 'travado') return 'perigo';
  if (res === 'exato') return 'acerto';
  if (res === 'alto') return 'alto';
  if (res === 'baixo') return 'baixo';
  if (res === 'trancado') return 'trancado';
  return 'osso';
}

function OverlayLockpick({
  desafio,
  modo,
  meuDiscordId,
  minhaFichaId,
  meuNome,
  aoAgir,
  aoRecolher,
}: {
  desafio: DesafioLockpick;
  modo: OverlayDesafioProps['modo'];
  meuDiscordId?: string | null;
  minhaFichaId?: string | null;
  meuNome?: string;
  aoAgir?: (acao: AcaoDesafio) => void;
  aoRecolher: () => void;
}) {
  const ultimaTentativa = desafio.tentativas[desafio.tentativas.length - 1];
  const linhasHarpa = montarLinhasHarpa(ultimaTentativa?.feedbackEmbaralhado);
  const totalRevelar =
    desafio.modoDica === 'posicional' ? desafio.dados.length : linhasHarpa.length;

  const [valores, setValores] = useState<number[]>(() =>
    desafio.dados.map((_, i) => ultimaTentativa?.valores[i] ?? 1),
  );
  const [revelandoAte, setRevelandoAte] = useState<number>(totalRevelar);
  const [bannerPronto, setBannerPronto] = useState<boolean>(true);
  const [animandoSequencia, setAnimandoSequencia] = useState<boolean>(false);

  const idRef = useRef(desafio.id);
  const tentativasPrevRef = useRef(desafio.tentativas.length);
  const timersRef = useRef<number[]>([]);

  const limparTimers = () => {
    for (const t of timersRef.current) {
      window.clearTimeout(t);
    }
    timersRef.current = [];
  };

  useEffect(() => () => limparTimers(), []);

  // Sincroniza quando troca de desafio ou tamanho de dados
  useEffect(() => {
    if (idRef.current !== desafio.id || valores.length !== desafio.dados.length) {
      limparTimers();
      idRef.current = desafio.id;
      tentativasPrevRef.current = desafio.tentativas.length;
      const ult = desafio.tentativas[desafio.tentativas.length - 1];
      setValores(desafio.dados.map((_, i) => ult?.valores[i] ?? 1));
      const linhas = montarLinhasHarpa(ult?.feedbackEmbaralhado);
      setRevelandoAte(desafio.modoDica === 'posicional' ? desafio.dados.length : linhas.length);
      setBannerPronto(true);
      setAnimandoSequencia(false);
    }
  }, [desafio.id, desafio.dados, desafio.tentativas, desafio.modoDica, valores.length]);

  // Revelação sequencial dramática quando chega uma nova tentativa
  useEffect(() => {
    const qtdAtual = desafio.tentativas.length;
    const qtdPrev = tentativasPrevRef.current;
    if (idRef.current !== desafio.id) return;

    if (qtdAtual < qtdPrev) {
      limparTimers();
      tentativasPrevRef.current = qtdAtual;
      setRevelandoAte(0);
      setBannerPronto(true);
      setAnimandoSequencia(false);
      return;
    }

    if (qtdAtual <= qtdPrev) return;
    tentativasPrevRef.current = qtdAtual;
    limparTimers();

    const ult = desafio.tentativas[qtdAtual - 1];
    const linhas = montarLinhasHarpa(ult?.feedbackEmbaralhado);
    const total = desafio.modoDica === 'posicional' ? desafio.dados.length : linhas.length;

    if (prefereMovimentoReduzido() || total === 0) {
      setRevelandoAte(total);
      setBannerPronto(true);
      setAnimandoSequencia(false);
      if (desafio.status === 'aberto') {
        tocarEfeitoDesafio('lockpick-aberto');
      } else if (desafio.status === 'travado') {
        tocarEfeitoDesafio('lockpick-travado');
      } else {
        tocarEfeitoDesafio('pino-tentar');
      }
      return;
    }

    setRevelandoAte(0);
    setBannerPronto(false);
    setAnimandoSequencia(true);

    const passoMs = desafio.modoDica === 'posicional' ? 660 : 650;
    for (let i = 0; i < total; i++) {
      const id = window.setTimeout(() => {
        setRevelandoAte(i + 1);
        if (desafio.modoDica === 'posicional') {
          const res = ult?.feedbackPosicional?.[i];
          tocarEfeitoDesafio(somParaResultadoPino(res));
        } else {
          const linha = linhas[i];
          tocarEfeitoDesafio(linha?.som ?? 'pino-erro');
        }
      }, (i + 1) * passoMs);
      timersRef.current.push(id);
    }

    const idFinal = window.setTimeout(() => {
      setBannerPronto(true);
      setAnimandoSequencia(false);
      if (desafio.status === 'aberto') {
        tocarEfeitoDesafio('lockpick-aberto');
      } else if (desafio.status === 'travado') {
        tocarEfeitoDesafio('lockpick-travado');
      }
    }, total * passoMs + 380);
    timersRef.current.push(idFinal);
  }, [desafio]);

  const autorizado =
    !desafio.jogadorAutorizadoId ||
    desafio.jogadorAutorizadoId === meuDiscordId ||
    desafio.jogadorAutorizadoId === minhaFichaId;
  const podeAgir = modo === 'jogador' && Boolean(aoAgir) && desafio.status === 'ativo' && autorizado;
  const revelando = animandoSequencia || !bannerPronto;

  const ajustar = (idx: number, delta: number) => {
    if (!podeAgir || revelando) return;
    const lados = desafio.dados[idx] ?? 6;
    setValores((atual) =>
      atual.map((v, i) => {
        if (i !== idx) return v;
        return (((v - 1 + delta) % lados) + lados) % lados + 1;
      }),
    );
    tocarEfeitoDesafio('pino-girar');
  };

  const tentar = () => {
    if (!podeAgir || revelando || !aoAgir) return;
    aoAgir({
      tipo: 'lockpick.tentar',
      valores: desafio.dados.map((_, i) => valores[i] ?? 1),
      autorNome: meuNome?.trim() || 'Investigador',
    });
  };

  const tentativasUsadas = desafio.tentativas.length;
  const restantes = Math.max(0, desafio.maxTentativas - tentativasUsadas);
  const anguloSelo = tentativasUsadas * 28 + (bannerPronto && desafio.status === 'aberto' ? 90 : 0);
  const constelacao = posicoesConstelacao(desafio.dados.length);

  return (
    <div class="ovd-palco-backdrop" data-testid="overlay-lockpick">
      <button type="button" class="ovd-btn-recolher ovd-palco-espiar" onClick={aoRecolher}>
        Espiar mapa
      </button>

      <section
        class="ovd-palco ovd-palco-lockpick"
        data-status={bannerPronto ? desafio.status : 'ativo'}
        aria-label={desafio.titulo}
      >
        <header class="ovd-palco-topo">
          <div class="ovd-palco-titulos">
            <span class="ovd-eyebrow">Abrir Fechaduras</span>
            <h2 class="ovd-titulo">{desafio.titulo}</h2>
            {desafio.jogadorAutorizadoNome && (
              <p class="ovd-subtitulo">
                Na fechadura: <strong>{desafio.jogadorAutorizadoNome}</strong>
              </p>
            )}
          </div>
        </header>

        <div
          class="ovd-lock-arena"
          data-qtd={desafio.dados.length}
          data-constelacao={constelacao ? '1' : '0'}
        >
          <div class="ovd-lock-selo-bg">
            <SeloPedraSvg
              angulo={anguloSelo}
              status={bannerPronto ? desafio.status : 'ativo'}
              qtdDados={desafio.dados.length}
            />
          </div>

          <div
            class="ovd-lock-pinos"
            data-qtd={desafio.dados.length}
            data-constelacao={constelacao ? '1' : '0'}
          >
            {desafio.dados.map((lados, idx) => {
              const ponto = constelacao?.[idx];
              const valorExibido =
                bannerPronto && desafio.status === 'aberto' && desafio.senha?.[idx] !== undefined
                  ? desafio.senha[idx]!
                  : podeAgir
                    ? (valores[idx] ?? 1)
                    : (ultimaTentativa?.valores[idx] ?? valores[idx] ?? 1);

              const estaAguardando =
                desafio.modoDica === 'posicional' && revelando && idx >= revelandoAte;
              const recemRevelado =
                desafio.modoDica === 'posicional' &&
                animandoSequencia &&
                idx === revelandoAte - 1;

              const dicaPosicional =
                desafio.modoDica === 'posicional' && !estaAguardando
                  ? ultimaTentativa?.feedbackPosicional?.[idx]
                  : undefined;

              const dep = desafio.dependencias?.[idx] ?? null;
              const depDestrancada =
                dep === null ||
                (bannerPronto && desafio.status === 'aberto') ||
                (dicaPosicional !== undefined && dicaPosicional !== 'trancado');

              let variante: VarianteDado;
              if (estaAguardando) {
                variante = 'osso';
              } else if (dicaPosicional === undefined && dep !== null && desafio.status === 'ativo') {
                variante = 'trancado';
              } else {
                variante = variantePino(dicaPosicional, bannerPronto ? desafio.status : 'ativo');
              }

              const classeAnimacao = estaAguardando
                ? 'ovd-pino-aguardando'
                : recemRevelado
                  ? 'ovd-pino-revelado'
                  : undefined;

              return (
                <div
                  key={idx}
                  class={`ovd-lock-pino${classeAnimacao ? ` ${classeAnimacao}` : ''}`}
                  data-slot={idx + 1}
                  style={
                    ponto
                      ? { left: `${ponto.xPct}%`, top: `${ponto.yPct}%` }
                      : undefined
                  }
                  onWheel={(e) => {
                    if (!podeAgir || revelando) return;
                    e.preventDefault();
                    ajustar(idx, e.deltaY < 0 ? 1 : -1);
                  }}
                >
                  {dep !== null && (
                    <span class="ovd-lock-pino-dep" data-aberto={depDestrancada ? '1' : '0'}>
                      {depDestrancada ? `🔓 Pino ${dep + 1}` : `🔒 Pino ${dep + 1}`}
                    </span>
                  )}

                  {podeAgir && (
                    <button
                      type="button"
                      class="ovd-lock-controle"
                      disabled={revelando}
                      aria-label={`Aumentar pino ${idx + 1}`}
                      onClick={() => ajustar(idx, 1)}
                    >
                      +
                    </button>
                  )}

                  <DadoPoligono
                    lados={lados}
                    valor={valorExibido}
                    variante={variante}
                    tamanho={ponto ? ponto.tamDado : 74}
                    interativo={podeAgir && !revelando}
                    rotulo={`Pino ${idx + 1} (d${lados}): ${valorExibido}`}
                  />

                  {podeAgir && (
                    <button
                      type="button"
                      class="ovd-lock-controle"
                      disabled={revelando}
                      aria-label={`Diminuir pino ${idx + 1}`}
                      onClick={() => ajustar(idx, -1)}
                    >
                      −
                    </button>
                  )}

                  {desafio.modoDica === 'posicional' && dicaPosicional && (
                    <span class="ovd-lock-dica-pino" data-res={dicaPosicional}>
                      {rotuloPino(dicaPosicional)}
                    </span>
                  )}

                  <span class="ovd-lock-pino-tipo" aria-hidden="true">
                    d{lados}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Feedback embaralhado (Harpa — tipografia branca serifada grande sem caixa, revelada linha por linha) */}
        {desafio.modoDica === 'embaralhado' &&
          ultimaTentativa?.feedbackEmbaralhado &&
          linhasHarpa.length > 0 && (
            <div class="ovd-lock-harpa" aria-live="polite">
              {linhasHarpa.slice(0, revelandoAte).map((linha) => (
                <p key={linha.chave} class="ovd-lock-harpa-linha" data-tom={linha.tom}>
                  {linha.texto}
                </p>
              ))}
            </div>
          )}

        {/* Banners finais flutuantes (só após revelar o último pino/linha + 320ms) */}
        {bannerPronto && desafio.status === 'aberto' && (
          <div class="ovd-lock-banner" data-status="aberto" role="status">
            FECHADURA DESTRANCADA
          </div>
        )}
        {bannerPronto && desafio.status === 'travado' && (
          <div class="ovd-lock-banner" data-status="travado" role="status">
            FECHADURA DANIFICADA
          </div>
        )}

        <footer class="ovd-lock-rodape">
          {podeAgir && (
            <button
              type="button"
              class="ovd-btn ovd-btn-primario"
              disabled={revelando}
              onClick={tentar}
            >
              {revelando ? 'Testando…' : 'Testar Combinação'}
            </button>
          )}

          <div class="ovd-lock-pips-wrap">
            <span class="ovd-lock-pips-rotulo">
              Tentativas: {restantes}/{desafio.maxTentativas}
            </span>
            <span class="ovd-lock-pips" aria-hidden="true">
              {Array.from({ length: desafio.maxTentativas }, (_, i) => (
                <span key={i} class="ovd-lock-pip" data-gasto={i < tentativasUsadas ? '1' : '0'} />
              ))}
            </span>
          </div>

          {desafio.tentativas.length > 0 && (
            <div class="ovd-lock-historico" aria-label="Tentativas anteriores">
              {desafio.tentativas.map((t) => (
                <span key={t.numero} class="ovd-lock-hist-item" data-acertou={t.acertou ? '1' : '0'}>
                  <span>#{t.numero}</span>
                  <strong>{t.valores.join(' · ')}</strong>
                  <span>{t.autorNome}</span>
                </span>
              ))}
            </div>
          )}
        </footer>
      </section>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   2. EQUILÍBRIO (BALANÇA — CANTO INFERIOR DIREITO, PRINT 2)
   ═══════════════════════════════════════════════════════════════════════════ */

function textoStatusEquilibrio(status: DesafioEquilibrio['status'], diferenca: number): string {
  switch (status) {
    case 'aguardando':
      return 'AGUARDANDO ROLAGEM';
    case 'equilibrado':
      return 'EQUILIBRADO';
    case 'desequilibrado':
      return `EM RISCO — DIF. ${diferenca}`;
    case 'caiu':
      return 'CAIU!';
  }
}

function OverlayEquilibrio({
  desafio,
  modo,
  meuDiscordId,
  minhaFichaId,
  aoAgir,
  aoRecolher,
}: {
  desafio: DesafioEquilibrio;
  modo: OverlayDesafioProps['modo'];
  meuDiscordId?: string | null;
  minhaFichaId?: string | null;
  retratos?: Record<string, string>;
  aoAgir?: (acao: AcaoDesafio) => void;
  aoRecolher: () => void;
}) {
  const { esq, dir, diferenca, restantes } = totaisEquilibrio(desafio);
  const temRestricao = Boolean(desafio.personagem.fichaId || desafio.personagem.donoDiscordId);
  const souEu = ehMeuParticipante(desafio.personagem, meuDiscordId, minhaFichaId);
  const podeAgir = modo === 'jogador' && Boolean(aoAgir) && (!temRestricao || souEu);

  const dadosEsq = desafio.dadosUsados.filter((d) => d.lado === 'esq');
  const dadosDir = desafio.dadosUsados.filter((d) => d.lado === 'dir');
  const statusTexto = textoStatusEquilibrio(desafio.status, diferenca);

  const [rolando, setRolando] = useState<'inicial' | 'd4' | null>(null);
  const [facesAnimadas, setFacesAnimadas] = useState<[number, number]>([5, 6]);
  const intervaloRolagemRef = useRef<number | null>(null);
  const timeoutRolagemRef = useRef<number | null>(null);

  const limparRolagem = () => {
    if (intervaloRolagemRef.current !== null) {
      window.clearInterval(intervaloRolagemRef.current);
      intervaloRolagemRef.current = null;
    }
    if (timeoutRolagemRef.current !== null) {
      window.clearTimeout(timeoutRolagemRef.current);
      timeoutRolagemRef.current = null;
    }
  };

  useEffect(() => {
    return () => limparRolagem();
  }, []);

  useEffect(() => {
    limparRolagem();
    setRolando(null);
  }, [desafio.id]);

  const iniciarRolagem = (tipo: 'inicial' | 'd4') => {
    if (!aoAgir || rolando !== null) return;
    const acao: AcaoDesafio =
      tipo === 'inicial' ? { tipo: 'equilibrio.rolar-inicial' } : { tipo: 'equilibrio.rolar-d4' };

    if (prefereMovimentoReduzido()) {
      aoAgir(acao);
      return;
    }

    limparRolagem();
    setRolando(tipo);
    const sortear = () => {
      if (tipo === 'inicial') {
        setFacesAnimadas([
          Math.floor(Math.random() * 10) + 1,
          Math.floor(Math.random() * 10) + 1,
        ]);
      } else {
        setFacesAnimadas([Math.floor(Math.random() * 4) + 1, 1]);
      }
      tocarEfeitoDesafio('pino-girar');
    };
    sortear();
    intervaloRolagemRef.current = window.setInterval(sortear, 75);
    timeoutRolagemRef.current = window.setTimeout(() => {
      limparRolagem();
      setRolando(null);
      aoAgir(acao);
    }, 620);
  };

  const ehCompacto = desafio.exibicao === 'compacto';
  const acoes = podeAgir && aoAgir && (
    <div class="ovd-eq-acoes">
      {rolando === 'inicial' ? (
        <div class="ovd-eq-rolando" aria-live="polite">
          <DadoPoligono
            lados={10}
            valor={facesAnimadas[0]}
            variante="osso"
            tamanho={ehCompacto ? 32 : 40}
            classe="ovd-dado-rolando"
          />
          <DadoPoligono
            lados={10}
            valor={facesAnimadas[1]}
            variante="osso"
            tamanho={ehCompacto ? 32 : 40}
            classe="ovd-dado-rolando ovd-dado-rolando-atraso"
          />
          <span class="ovd-eq-rolando-texto">Rolando 2d10…</span>
        </div>
      ) : rolando === 'd4' ? (
        <div class="ovd-eq-rolando" aria-live="polite">
          <DadoPoligono
            lados={4}
            valor={facesAnimadas[0]}
            variante="alto"
            tamanho={ehCompacto ? 34 : 42}
            classe="ovd-dado-rolando"
          />
          <span class="ovd-eq-rolando-texto">Rolando d4…</span>
        </div>
      ) : desafio.dadoEsq === null || desafio.dadoDir === null ? (
        <button
          type="button"
          class="ovd-eq-btn"
          onClick={() => iniciarRolagem('inicial')}
        >
          🎲 Rolar 2d10
        </button>
      ) : desafio.d4Pendente !== null ? (
        <div class="ovd-eq-pendente">
          <DadoPoligono lados={4} valor={desafio.d4Pendente} variante="alto" tamanho={32} />
          <button
            type="button"
            class="ovd-eq-btn ovd-eq-btn-lado"
            onClick={() => aoAgir({ tipo: 'equilibrio.aplicar-d4', lado: 'esq' })}
          >
            ← Esquerda
          </button>
          <button
            type="button"
            class="ovd-eq-btn ovd-eq-btn-lado"
            onClick={() => aoAgir({ tipo: 'equilibrio.aplicar-d4', lado: 'dir' })}
          >
            Direita →
          </button>
        </div>
      ) : desafio.status === 'desequilibrado' && restantes > 0 ? (
        <button
          type="button"
          class="ovd-eq-btn"
          onClick={() => iniciarRolagem('d4')}
        >
          {ehCompacto
            ? `🎲 Rolar d4 (${restantes} ${restantes === 1 ? 'restante' : 'restantes'})`
            : `🎲 Rolar d4 de Equilíbrio (${restantes} ${restantes === 1 ? 'restante' : 'restantes'})`}
        </button>
      ) : null}
    </div>
  );

  if (desafio.exibicao === 'compacto') {
    return (
      <div class="ovd-eq-compacto-wrap" data-testid="overlay-equilibrio-compacto">
        <section class="ovd-eq-compacto-card" data-status={desafio.status} aria-label={desafio.titulo}>
          <div class="ovd-eq-compacto-topo">
            <span class="ovd-eq-compacto-nome">{desafio.personagem.nome}</span>
            <button type="button" class="ovd-btn-recolher ovd-btn-x" onClick={aoRecolher} title="Recolher balança">
              ×
            </button>
          </div>

          <BalancaSvg
            dadoEsq={desafio.dadoEsq}
            dadoDir={desafio.dadoDir}
            dadosEsq={dadosEsq}
            dadosDir={dadosDir}
            esq={esq}
            dir={dir}
            status={desafio.status}
            compacto
          />

          {(desafio.status === 'equilibrado' || desafio.status === 'caiu') && (
            <span class="ovd-eq-status ovd-eq-compacto-status" data-status={desafio.status}>
              {statusTexto}
            </span>
          )}

          {acoes}
        </section>
      </div>
    );
  }

  return (
    <div class="ovd-palco-backdrop" data-testid="overlay-equilibrio-destaque">
      <button type="button" class="ovd-btn-recolher ovd-palco-espiar" onClick={aoRecolher}>
        Espiar mapa
      </button>

      <section class="ovd-palco" aria-label={desafio.titulo}>
        <header class="ovd-palco-topo">
          <div class="ovd-palco-titulos">
            <span class="ovd-eyebrow">Desafio de Equilíbrio</span>
            <h2 class="ovd-titulo">{desafio.titulo}</h2>
            <p class="ovd-subtitulo">
              {desafio.personagem.nome} • d4 restantes: <strong>{restantes}</strong>/{desafio.dadosEquilibrioTotal}
            </p>
          </div>
        </header>

        <div class="ovd-balanca-wrap">
          <BalancaSvg
            dadoEsq={desafio.dadoEsq}
            dadoDir={desafio.dadoDir}
            dadosEsq={dadosEsq}
            dadosDir={dadosDir}
            esq={esq}
            dir={dir}
            status={desafio.status}
          />

          <span class="ovd-eq-status" data-status={desafio.status} role="status">
            {statusTexto}
          </span>
        </div>

        {acoes}
      </section>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   3. CENA DE FURTIVIDADE (ESCONDERIJO — CANTO SUPERIOR DIREITO, PRINTS 4 e 5)
   ═══════════════════════════════════════════════════════════════════════════ */

function OverlayEsconderijo({
  desafio,
  modo,
  meuDiscordId,
  minhaFichaId,
  aoAgir,
  aoRecolher,
}: {
  desafio: DesafioEsconderijo;
  modo: OverlayDesafioProps['modo'];
  meuDiscordId?: string | null;
  minhaFichaId?: string | null;
  retratos?: Record<string, string>;
  aoAgir?: (acao: AcaoDesafio) => void;
  aoRecolher: () => void;
}) {
  const [abertoId, setAbertoId] = useState<string | null>(null);
  const [ladosRolar, setLadosRolar] = useState<LadosDado>(6);
  const [ladosEsconder, setLadosEsconder] = useState<LadosDado>(6);
  const [ladosDistrair, setLadosDistrair] = useState<LadosDado>(6);
  const [aliadoDistrairId, setAliadoDistrairId] = useState<string>('');
  const [aliadoChamarId, setAliadoChamarId] = useState<string>('');
  const [dadoTransferirId, setDadoTransferirId] = useState<string>('');
  const [dadoDescartarId, setDadoDescartarId] = useState<string>('');
  const [buscaOcultaId, setBuscaOcultaId] = useState<string | null>(null);

  const mostrarBusca = Boolean(desafio.ultimaBusca && desafio.ultimaBusca.id !== buscaOcultaId);

  return (
    <div class="ovd-esc-raiz" data-testid="overlay-esconderijo">
      {/* Banner discreto de Busca da Criatura no canto superior esquerdo */}
      {mostrarBusca && desafio.ultimaBusca && (
        <div class="ovd-busca-banner" role="alert">
          <div class="ovd-busca-esquerda">
            <span class="ovd-busca-rotulo">Busca da Criatura</span>
            <div class="ovd-busca-dados">
              {desafio.ultimaBusca.dados.map((d, i) => (
                <DadoPoligono key={i} lados={d.lados} valor={d.valor} variante="perigo" tamanho={26} />
              ))}
            </div>
            <span class="ovd-busca-atingidos">
              {desafio.ultimaBusca.atingidos.length === 0
                ? 'Ninguém foi atingido.'
                : desafio.ultimaBusca.atingidos
                    .map((a) =>
                      a.ficouEncontrado
                        ? `${a.nome} perdeu [${a.valores.join(', ')}] — ENCONTRADO!`
                        : `${a.nome} perdeu [${a.valores.join(', ')}]`,
                    )
                    .join(' • ')}
            </span>
          </div>
          <button
            type="button"
            class="ovd-btn-recolher ovd-btn-x"
            onClick={() => setBuscaOcultaId(desafio.ultimaBusca?.id ?? null)}
            title="Dispensar alerta"
          >
            ×
          </button>
        </div>
      )}

      {/* Lista minimalista empilhada no CANTO SUPERIOR DIREITO */}
      <aside class="ovd-esc-canto" aria-label={desafio.titulo}>
        <div class="ovd-canto-meta ovd-canto-meta-dir">
          <span class="ovd-canto-rotulo">
            R{desafio.rodada} • {desafio.fase === 'criaturas' ? 'Criaturas' : 'Furtividade'}
          </span>
          <button type="button" class="ovd-btn-recolher ovd-btn-x" onClick={aoRecolher} title="Recolher furtividade">
            ×
          </button>
        </div>

        <div class="ovd-esc-lista">
          {desafio.participantes.map((p) => {
            const souEu = ehMeuParticipante(p, meuDiscordId, minhaFichaId);
            const podeAgir = modo === 'jogador' && Boolean(aoAgir) && souEu;
            const expandido = podeAgir && abertoId === p.id;
            const aliados = desafio.participantes.filter((outro) => outro.id !== p.id);
            const alvoDistrair =
              aliados.some((a) => a.id === aliadoDistrairId) ? aliadoDistrairId : (aliados[0]?.id ?? '');
            const alvoChamar =
              aliados.some((a) => a.id === aliadoChamarId) ? aliadoChamarId : (aliados[0]?.id ?? '');
            const transferirAtual =
              p.dados.some((d) => d.id === dadoTransferirId) ? dadoTransferirId : (p.dados[0]?.id ?? '');
            const descartarAtual =
              p.dados.some((d) => d.id === dadoDescartarId && d.id !== transferirAtual)
                ? dadoDescartarId
                : (p.dados.find((d) => d.id !== transferirAtual)?.id ?? '');

            return (
              <div
                key={p.id}
                class="ovd-esc-item"
                data-meu={souEu ? '1' : '0'}
                data-encontrado={p.encontrado ? '1' : '0'}
                title={`${p.nome} • Esconder-se DT ${p.dtEsconderSe}`}
              >
                {podeAgir && aoAgir && (
                  <>
                    <button
                      type="button"
                      class="ovd-esc-btn-mais"
                      aria-expanded={expandido}
                      title="Ações de furtividade"
                      onClick={() => setAbertoId(expandido ? null : p.id)}
                    >
                      {expandido ? '×' : '+'}
                    </button>

                    {expandido && (
                      <div class="ovd-esc-popover">
                        {/* Rolar Esconderijo */}
                        <div class="ovd-esc-bloco">
                          <span class="ovd-esc-bloco-titulo">Rolar Esconderijo</span>
                          <div class="ovd-esc-linha">
                            <select
                              class="ovd-select"
                              aria-label="Lados do dado de esconderijo"
                              value={ladosRolar}
                              onChange={(e) => setLadosRolar(Number(e.currentTarget.value) as LadosDado)}
                            >
                              {LADOS_VALIDOS.map((l) => (
                                <option key={l} value={l}>
                                  d{l}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              class="ovd-btn ovd-btn-pequeno ovd-btn-primario"
                              onClick={() =>
                                aoAgir({
                                  tipo: 'esconderijo.adicionar-dado',
                                  participanteId: p.id,
                                  lados: ladosRolar,
                                })
                              }
                            >
                              + Rolar d{ladosRolar}
                            </button>
                          </div>
                        </div>

                        {/* Esconder-se */}
                        <div class="ovd-esc-bloco">
                          <span class="ovd-esc-bloco-titulo">Esconder-se (DT {p.dtEsconderSe})</span>
                          <div class="ovd-esc-linha">
                            <select
                              class="ovd-select"
                              aria-label="Dado de Esconder-se"
                              value={ladosEsconder}
                              onChange={(e) => setLadosEsconder(Number(e.currentTarget.value) as LadosDado)}
                            >
                              {LADOS_VALIDOS.map((l) => (
                                <option key={l} value={l}>
                                  d{l}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              class="ovd-btn ovd-btn-pequeno ovd-btn-esmeralda"
                              onClick={() =>
                                aoAgir({
                                  tipo: 'esconderijo.esconder-se',
                                  participanteId: p.id,
                                  passou: true,
                                  lados: ladosEsconder,
                                })
                              }
                            >
                              Passou
                            </button>
                            <button
                              type="button"
                              class="ovd-btn ovd-btn-pequeno ovd-btn-carmesim"
                              onClick={() =>
                                aoAgir({
                                  tipo: 'esconderijo.esconder-se',
                                  participanteId: p.id,
                                  passou: false,
                                })
                              }
                            >
                              Falhou
                            </button>
                          </div>
                        </div>

                        {/* Distrair */}
                        {aliados.length > 0 && (
                          <div class="ovd-esc-bloco">
                            <span class="ovd-esc-bloco-titulo">Distrair (DT {desafio.dtDistrair})</span>
                            <div class="ovd-esc-linha">
                              <select
                                class="ovd-select"
                                aria-label="Aliado para Distrair"
                                value={alvoDistrair}
                                onChange={(e) => setAliadoDistrairId(e.currentTarget.value)}
                              >
                                {aliados.map((a) => (
                                  <option key={a.id} value={a.id}>
                                    {a.nome}
                                  </option>
                                ))}
                              </select>
                              <select
                                class="ovd-select"
                                aria-label="Dado de Distrair"
                                value={ladosDistrair}
                                onChange={(e) => setLadosDistrair(Number(e.currentTarget.value) as LadosDado)}
                              >
                                {LADOS_VALIDOS.map((l) => (
                                  <option key={l} value={l}>
                                    d{l}
                                  </option>
                                ))}
                              </select>
                              <button
                                type="button"
                                class="ovd-btn ovd-btn-pequeno ovd-btn-esmeralda"
                                disabled={!alvoDistrair}
                                onClick={() =>
                                  aoAgir({
                                    tipo: 'esconderijo.distrair',
                                    alvoParticipanteId: alvoDistrair,
                                    passou: true,
                                    lados: ladosDistrair,
                                  })
                                }
                              >
                                Passou
                              </button>
                              <button
                                type="button"
                                class="ovd-btn ovd-btn-pequeno ovd-btn-carmesim"
                                disabled={!alvoDistrair}
                                onClick={() =>
                                  aoAgir({
                                    tipo: 'esconderijo.distrair',
                                    alvoParticipanteId: alvoDistrair,
                                    passou: false,
                                  })
                                }
                              >
                                Falhou
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Chamar Atenção */}
                        {aliados.length > 0 && p.dados.length >= 2 && (
                          <div class="ovd-esc-bloco">
                            <span class="ovd-esc-bloco-titulo">Chamar Atenção (dá 1 + descarta 1)</span>
                            <div class="ovd-esc-linha">
                              <select
                                class="ovd-select"
                                aria-label="Aliado destino"
                                value={alvoChamar}
                                onChange={(e) => setAliadoChamarId(e.currentTarget.value)}
                              >
                                {aliados.map((a) => (
                                  <option key={a.id} value={a.id}>
                                    {a.nome}
                                  </option>
                                ))}
                              </select>
                              <select
                                class="ovd-select"
                                aria-label="Dado a transferir"
                                value={transferirAtual}
                                onChange={(e) => setDadoTransferirId(e.currentTarget.value)}
                              >
                                {p.dados.map((d) => (
                                  <option key={d.id} value={d.id}>
                                    Dar d{d.lados} ({d.valor || '?'})
                                  </option>
                                ))}
                              </select>
                              <select
                                class="ovd-select"
                                aria-label="Dado a descartar"
                                value={descartarAtual}
                                onChange={(e) => setDadoDescartarId(e.currentTarget.value)}
                              >
                                {p.dados
                                  .filter((d) => d.id !== transferirAtual)
                                  .map((d) => (
                                    <option key={d.id} value={d.id}>
                                      Desc. d{d.lados} ({d.valor || '?'})
                                    </option>
                                  ))}
                              </select>
                              <button
                                type="button"
                                class="ovd-btn ovd-btn-pequeno"
                                disabled={!alvoChamar || !transferirAtual || !descartarAtual}
                                onClick={() =>
                                  aoAgir({
                                    tipo: 'esconderijo.chamar-atencao',
                                    origemId: p.id,
                                    destinoId: alvoChamar,
                                    dadoTransferirId: transferirAtual,
                                    dadoDescartarId: descartarAtual,
                                  })
                                }
                              >
                                Executar
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Ação Chamativa */}
                        {p.dados.length > 0 && (
                          <div class="ovd-esc-bloco">
                            <span class="ovd-esc-bloco-titulo">Ação Chamativa (descartar 1 dado)</span>
                            <div class="ovd-esc-linha">
                              {p.dados.map((d) => (
                                <button
                                  key={d.id}
                                  type="button"
                                  class="ovd-btn ovd-btn-pequeno ovd-btn-carmesim"
                                  onClick={() =>
                                    aoAgir({
                                      tipo: 'esconderijo.descartar-dado',
                                      participanteId: p.id,
                                      dadoId: d.id,
                                    })
                                  }
                                >
                                  × d{d.lados} ({d.valor || '?'})
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}

                <span class="ovd-esc-nome">{primeiroNome(p.nome)}</span>
                <div class="ovd-esc-par">
                  <IconeSombra tamanho={28} />

                  <div class="ovd-esc-dados">
                    {p.encontrado ? (
                      <span class="ovd-selo-encontrado">ENCONTRADO</span>
                    ) : p.dados.length === 0 ? (
                      <span class="ovd-esc-vazio">—</span>
                    ) : (
                      p.dados.map((d) => (
                        <DadoPoligono
                          key={d.id}
                          lados={d.lados}
                          valor={d.valor === 0 ? '?' : d.valor}
                          variante="sombra"
                          tamanho={30}
                        />
                      ))
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </aside>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   4. PERSEGUIÇÃO (CANTO SUPERIOR ESQUERDO — PRINTS 6 e 7)
   ═══════════════════════════════════════════════════════════════════════════ */

function OverlayPerseguicao({
  desafio,
  modo,
  meuDiscordId,
  minhaFichaId,
  minhaFicha,
  aoAgir,
  aoRecolher,
}: {
  desafio: DesafioPerseguicao;
  modo: OverlayDesafioProps['modo'];
  meuDiscordId?: string | null;
  minhaFichaId?: string | null;
  minhaFicha?: SugestoesDaFicha | null;
  retratos?: Record<string, string>;
  aoAgir?: (acao: AcaoDesafio) => void;
  aoRecolher: () => void;
}) {
  const mostrarPa = desafio.mostrarPaJogadores || modo === 'mestre';
  const limiarAtual = desafio.limiaresPorRodada[desafio.rodada];

  const [usarFolegoToggle, setUsarFolegoToggle] = useState(false);
  const [usarEsforcoToggle, setUsarEsforcoToggle] = useState(false);
  const [rolandoPers, setRolandoPers] = useState<{
    participanteId: string;
    dados: Array<{ lados: LadosDado; valor: number; folego?: boolean }>;
  } | null>(null);
  const [resumoPers, setResumoPers] = useState<{
    participanteId: string;
    tom: 'acerto' | 'ouro';
    texto: string;
  } | null>(null);

  const intervaloRef = useRef<number | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const resumoTimerRef = useRef<number | null>(null);

  const limparRolagem = () => {
    if (intervaloRef.current !== null) {
      window.clearInterval(intervaloRef.current);
      intervaloRef.current = null;
    }
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  const limparResumo = () => {
    if (resumoTimerRef.current !== null) {
      window.clearTimeout(resumoTimerRef.current);
      resumoTimerRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      limparRolagem();
      limparResumo();
    };
  }, []);

  useEffect(() => {
    limparRolagem();
    limparResumo();
    setRolandoPers(null);
    setResumoPers(null);
    setUsarFolegoToggle(false);
    setUsarEsforcoToggle(false);
  }, [desafio.id]);

  const dFisicoBase = normalizarLados(minhaFicha?.fisicoDado ?? 6);
  const dAtletismoBase = normalizarLados(minhaFicha?.atletismoDado ?? 4);

  const calcularDadosTeste = (comEsforco: boolean): [LadosDado, LadosDado] => {
    let dado1 = dFisicoBase;
    let dado2 = dAtletismoBase;
    if (comEsforco) {
      if (dado2 <= dado1) {
        dado2 = subirPassoDado(dado2);
      } else {
        dado1 = subirPassoDado(dado1);
      }
    }
    return [dado1, dado2];
  };

  const mostrarResumo = (participanteId: string, tom: 'acerto' | 'ouro', texto: string) => {
    limparResumo();
    setResumoPers({ participanteId, tom, texto });
    resumoTimerRef.current = window.setTimeout(() => {
      resumoTimerRef.current = null;
      setResumoPers(null);
    }, 4000);
  };

  const iniciarAvanco = (participanteId: string, folegoDisponivel: number) => {
    if (!aoAgir || rolandoPers !== null) return;
    const comFolego = usarFolegoToggle && folegoDisponivel > 0;
    const comEsforco = usarEsforcoToggle;
    const [l1, l2] = calcularDadosTeste(comEsforco);

    const finalizar = () => {
      const v1 = rolarDado(l1);
      const v2 = rolarDado(l2);
      const vFolego = comFolego ? rolarDado(6) : null;
      const todos = vFolego !== null ? [v1, v2, vFolego] : [v1, v2];
      const soma = todos.reduce((a, b) => a + b, 0);
      const pontos = soma >= 10 ? Math.max(...todos) : Math.min(...todos);

      if (comFolego) {
        aoAgir({ tipo: 'perseguicao.gastar-folego', participanteId, quantidade: 1 });
        setUsarFolegoToggle(false);
      }
      aoAgir({ tipo: 'perseguicao.avancar', participanteId, pontos, esforcoExtra: comEsforco });
      setUsarEsforcoToggle(false);
      mostrarResumo(
        participanteId,
        soma >= 10 ? 'acerto' : 'ouro',
        `${todos.join(' + ')} = ${soma} (DT 10) → +${pontos} PA`,
      );
    };

    if (prefereMovimentoReduzido()) {
      finalizar();
      return;
    }

    limparRolagem();
    const sortear = () => {
      const dados: Array<{ lados: LadosDado; valor: number; folego?: boolean }> = [
        { lados: l1, valor: rolarDado(l1) },
        { lados: l2, valor: rolarDado(l2) },
      ];
      if (comFolego) {
        dados.push({ lados: 6, valor: rolarDado(6), folego: true });
      }
      setRolandoPers({ participanteId, dados });
      tocarEfeitoDesafio('pino-girar');
    };
    sortear();
    intervaloRef.current = window.setInterval(sortear, 75);
    timeoutRef.current = window.setTimeout(() => {
      limparRolagem();
      setRolandoPers(null);
      finalizar();
    }, 620);
  };

  // Destaca o próprio personagem primeiro no canto superior esquerdo
  const ordenados = [...desafio.participantes].sort((a, b) => {
    const aMeu = ehMeuParticipante(a, meuDiscordId, minhaFichaId) ? 0 : 1;
    const bMeu = ehMeuParticipante(b, meuDiscordId, minhaFichaId) ? 0 : 1;
    return aMeu - bMeu;
  });

  const temMeu = ordenados.some((p) => ehMeuParticipante(p, meuDiscordId, minhaFichaId));

  return (
    <aside class="ovd-pers-canto" data-testid="overlay-perseguicao" aria-label={desafio.titulo}>
      <div class="ovd-canto-meta">
        <span class="ovd-pers-rodada-pilula">
          Rodada {desafio.rodada}/{desafio.totalRodadas}
        </span>
        <button type="button" class="ovd-btn-recolher ovd-btn-x" onClick={aoRecolher} title="Recolher perseguição">
          ×
        </button>
      </div>

      <div class="ovd-pers-lista">
        {ordenados.map((p, idx) => {
          const souEu = ehMeuParticipante(p, meuDiscordId, minhaFichaId);
          const secundario = ordenados.length > 1 && (temMeu ? !souEu : idx > 0);
          const podeAgir = modo === 'jogador' && Boolean(aoAgir) && souEu && p.status === 'correndo';
          const podeGastarFolego = podeAgir && p.folegoRestante > 0;
          const alvoNumero =
            limiarAtual !== undefined && p.pa < limiarAtual ? limiarAtual : desafio.metaPa;
          const folegoAtivo = usarFolegoToggle && p.folegoRestante > 0;
          const [dado1, dado2] = calcularDadosTeste(usarEsforcoToggle);
          const estaRolandoEste = rolandoPers?.participanteId === p.id;
          const resumoEste = resumoPers?.participanteId === p.id ? resumoPers : null;

          const usarFolego = () => {
            if (!podeGastarFolego || !aoAgir) return;
            tocarEfeitoDesafio('folego-gastar');
            aoAgir({ tipo: 'perseguicao.gastar-folego', participanteId: p.id, quantidade: 1 });
          };

          return (
            <div
              key={p.id}
              class={`ovd-pers-item${secundario ? ' ovd-pers-item-sec' : ''}`}
              data-meu={souEu ? '1' : '0'}
              data-status={p.status}
            >
              {(ordenados.length > 1 || p.status !== 'correndo' || p.esforcoExtraUsos > 0) && (
                <div class="ovd-pers-cab">
                  {ordenados.length > 1 && <span class="ovd-pers-nome">{primeiroNome(p.nome)}</span>}
                  {p.status !== 'correndo' && (
                    <span class="ovd-hud-chip" data-tom={p.status === 'seguro' ? 'esmeralda' : 'carmesim'}>
                      {p.status === 'seguro' ? 'SEGURO' : 'DERRUBADO'}
                    </span>
                  )}
                  {p.esforcoExtraUsos > 0 && (
                    <span class="ovd-hud-chip" data-tom="ouro">
                      ×{p.esforcoExtraUsos}
                    </span>
                  )}
                </div>
              )}

              <div class="ovd-pers-linha">
                <PulmaoFolego
                  restante={p.folegoRestante}
                  total={p.folegoTotal}
                  interativo={podeGastarFolego}
                  compacto={secundario}
                  aoUsar={usarFolego}
                />

                {mostrarPa && (
                  <div class="ovd-avanco-topo">
                    <IconeCorrendo tamanho={secundario ? 28 : 42} classe="ovd-avanco-icone" />
                    <span class="ovd-avanco-numero">
                      {p.pa} <span class="ovd-avanco-barra">/</span> {alvoNumero}
                    </span>
                  </div>
                )}
              </div>

              {podeAgir && (
                <div class="ovd-roll-acoes">
                  {estaRolandoEste && rolandoPers ? (
                    <div class="ovd-eq-rolando ovd-roll-anim" aria-live="polite">
                      {rolandoPers.dados.map((d, i) => (
                        <DadoPoligono
                          key={i}
                          lados={d.lados}
                          valor={d.valor}
                          variante={d.folego ? 'alto' : 'osso'}
                          tamanho={30}
                          classe={`ovd-dado-rolando${i % 2 === 1 ? ' ovd-dado-rolando-atraso' : ''}`}
                        />
                      ))}
                      <span class="ovd-eq-rolando-texto">Rolando…</span>
                    </div>
                  ) : (
                    <>
                      <button
                        type="button"
                        class="ovd-eq-btn ovd-roll-btn"
                        disabled={rolandoPers !== null}
                        title={`Rolar d${dado1} + d${dado2}${folegoAtivo ? ' + d6' : ''} contra DT 10`}
                        onClick={() => iniciarAvanco(p.id, p.folegoRestante)}
                      >
                        <span>🎲 Avançar (DT 10)</span>
                        <span class="ovd-roll-sub">
                          d{dado1}+d{dado2}
                          {folegoAtivo ? '+d6' : ''}
                        </span>
                      </button>

                      <div class="ovd-roll-toggles">
                        {p.folegoRestante > 0 && (
                          <button
                            type="button"
                            class="ovd-roll-toggle"
                            aria-pressed={folegoAtivo}
                            data-ativo={folegoAtivo ? '1' : '0'}
                            disabled={rolandoPers !== null}
                            onClick={() => setUsarFolegoToggle((v) => !v)}
                          >
                            +d6 Fôlego
                          </button>
                        )}
                        <button
                          type="button"
                          class="ovd-roll-toggle"
                          aria-pressed={usarEsforcoToggle}
                          data-ativo={usarEsforcoToggle ? '1' : '0'}
                          disabled={rolandoPers !== null}
                          onClick={() => setUsarEsforcoToggle((v) => !v)}
                        >
                          Esforço Extra (+passo, −{p.esforcoExtraUsos + 1}d4 PV)
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {resumoEste && (
                <div class="ovd-roll-resumo" data-tom={resumoEste.tom} role="status" aria-live="polite">
                  {resumoEste.texto}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   5. ESCALAR (CANTO INFERIOR ESQUERDO — PAREDÃO + CORDA + SILHUETA)
   ═══════════════════════════════════════════════════════════════════════════ */

function OverlayEscalada({
  desafio,
  modo,
  meuDiscordId,
  minhaFichaId,
  minhaFicha,
  aoAgir,
  aoRecolher,
}: {
  desafio: DesafioEscalada;
  modo: OverlayDesafioProps['modo'];
  meuDiscordId?: string | null;
  minhaFichaId?: string | null;
  minhaFicha?: SugestoesDaFicha | null;
  retratos?: Record<string, string>;
  aoAgir?: (acao: AcaoDesafio) => void;
  aoRecolher: () => void;
}) {
  const [rolandoEsc, setRolandoEsc] = useState<{
    participanteId: string;
    estilo: 'rapida' | 'cautelosa';
    faces: [number, number];
  } | null>(null);
  const [resumoEsc, setResumoEsc] = useState<{
    participanteId: string;
    tom: 'acerto' | 'perigo';
    texto: string;
  } | null>(null);

  const intervaloRef = useRef<number | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const resumoTimerRef = useRef<number | null>(null);

  const limparRolagem = () => {
    if (intervaloRef.current !== null) {
      window.clearInterval(intervaloRef.current);
      intervaloRef.current = null;
    }
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  const limparResumo = () => {
    if (resumoTimerRef.current !== null) {
      window.clearTimeout(resumoTimerRef.current);
      resumoTimerRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      limparRolagem();
      limparResumo();
    };
  }, []);

  useEffect(() => {
    limparRolagem();
    limparResumo();
    setRolandoEsc(null);
    setResumoEsc(null);
  }, [desafio.id]);

  const dFisico = normalizarLados(minhaFicha?.fisicoDado ?? 6);
  const dAtletismo = normalizarLados(minhaFicha?.atletismoDado ?? 4);

  const mostrarResumo = (participanteId: string, tom: 'acerto' | 'perigo', texto: string) => {
    limparResumo();
    setResumoEsc({ participanteId, tom, texto });
    resumoTimerRef.current = window.setTimeout(() => {
      resumoTimerRef.current = null;
      setResumoEsc(null);
    }, 4000);
  };

  const iniciarEscalada = (participanteId: string, estilo: 'rapida' | 'cautelosa') => {
    if (!aoAgir || rolandoEsc !== null) return;
    const dt = estilo === 'rapida' ? desafio.dtRapida : desafio.dtCautelosa;

    const finalizar = () => {
      const v1 = rolarDado(dFisico);
      const v2 = rolarDado(dAtletismo);
      const soma = v1 + v2;
      const ra = Math.max(v1, v2);
      const rb = Math.min(v1, v2);
      if (soma >= dt) {
        const pontos = estilo === 'rapida' ? ra : rb;
        aoAgir({ tipo: 'escalada.registrar', participanteId, passou: true, pontos });
        mostrarResumo(
          participanteId,
          'acerto',
          `${v1} + ${v2} = ${soma} (DT ${dt}) → +${pontos} pts!`,
        );
      } else {
        aoAgir({ tipo: 'escalada.registrar', participanteId, passou: false });
        mostrarResumo(
          participanteId,
          'perigo',
          `${v1} + ${v2} = ${soma} (DT ${dt}) → Caiu!`,
        );
      }
    };

    if (prefereMovimentoReduzido()) {
      finalizar();
      return;
    }

    limparRolagem();
    const sortear = () => {
      setRolandoEsc({
        participanteId,
        estilo,
        faces: [rolarDado(dFisico), rolarDado(dAtletismo)],
      });
      tocarEfeitoDesafio('pino-girar');
    };
    sortear();
    intervaloRef.current = window.setInterval(sortear, 75);
    timeoutRef.current = window.setTimeout(() => {
      limparRolagem();
      setRolandoEsc(null);
      finalizar();
    }, 620);
  };

  const ordenados = [...desafio.participantes].sort((a, b) => {
    const aMeu = ehMeuParticipante(a, meuDiscordId, minhaFichaId) ? 0 : 1;
    const bMeu = ehMeuParticipante(b, meuDiscordId, minhaFichaId) ? 0 : 1;
    return aMeu - bMeu;
  });

  const temMeu = ordenados.some((p) => ehMeuParticipante(p, meuDiscordId, minhaFichaId));

  return (
    <aside class="ovd-escalada-wrap" data-testid="overlay-escalada" aria-label={desafio.titulo}>
      <div class="ovd-canto-meta">
        <span class="ovd-canto-rotulo">{desafio.titulo}</span>
        <button type="button" class="ovd-btn-recolher ovd-btn-x" onClick={aoRecolher} title="Recolher escalada">
          ×
        </button>
      </div>

      <div class="ovd-escalada-lista">
        {ordenados.map((p, idx) => {
          const souEu = ehMeuParticipante(p, meuDiscordId, minhaFichaId);
          const secundario = ordenados.length > 1 && (temMeu ? !souEu : idx > 0);
          const danoQueda = p.status === 'caiu' ? (p.ultimoDanoQueda ?? p.pontos) : p.pontos;
          const podeAgir = modo === 'jogador' && Boolean(aoAgir) && souEu && p.status !== 'topo';
          const estaRolandoEste = rolandoEsc?.participanteId === p.id;
          const resumoEste = resumoEsc?.participanteId === p.id ? resumoEsc : null;

          return (
            <div
              key={p.id}
              class={`ovd-escalada-item${secundario ? ' ovd-escalada-item-sec' : ''}`}
              data-meu={souEu ? '1' : '0'}
              data-status={p.status}
            >
              <div class="ovd-escalada-linha">
                <EscaladaSvg
                  pontos={p.pontos}
                  metaPontos={desafio.metaPontos}
                  status={p.status}
                  compacto={secundario}
                />

                <div class="ovd-escalada-info">
                  {(ordenados.length > 1 || p.status !== 'escalando') && (
                    <div class="ovd-escalada-cab">
                      {ordenados.length > 1 && (
                        <span class="ovd-escalada-nome" title={p.nome}>
                          {primeiroNome(p.nome)}
                        </span>
                      )}
                      {p.status !== 'escalando' && (
                        <span
                          class="ovd-hud-chip"
                          data-tom={p.status === 'topo' ? 'esmeralda' : 'carmesim'}
                        >
                          {p.status === 'topo' ? 'TOPO' : 'CAIU'}
                        </span>
                      )}
                    </div>
                  )}

                  <div class="ovd-escalada-placar">
                    <span class="ovd-escalada-num">{p.pontos}</span>
                    <span class="ovd-escalada-meta">/ {desafio.metaPontos}</span>
                  </div>

                  <div class="ovd-escalada-queda">
                    <IconeQueda tamanho={13} />
                    <span>QUEDA: {danoQueda}</span>
                  </div>
                </div>
              </div>

              {podeAgir && (
                <div class="ovd-roll-acoes">
                  {estaRolandoEste && rolandoEsc ? (
                    <div class="ovd-eq-rolando ovd-roll-anim" aria-live="polite">
                      <DadoPoligono
                        lados={dFisico}
                        valor={rolandoEsc.faces[0]}
                        variante="osso"
                        tamanho={30}
                        classe="ovd-dado-rolando"
                      />
                      <DadoPoligono
                        lados={dAtletismo}
                        valor={rolandoEsc.faces[1]}
                        variante="osso"
                        tamanho={30}
                        classe="ovd-dado-rolando ovd-dado-rolando-atraso"
                      />
                      <span class="ovd-eq-rolando-texto">
                        {rolandoEsc.estilo === 'rapida' ? 'Rápida…' : 'Cautelosa…'}
                      </span>
                    </div>
                  ) : (
                    <div class="ovd-roll-botoes">
                      <button
                        type="button"
                        class="ovd-eq-btn ovd-roll-btn"
                        disabled={rolandoEsc !== null}
                        title={`d${dFisico} + d${dAtletismo} → +RA`}
                        onClick={() => iniciarEscalada(p.id, 'rapida')}
                      >
                        <span>🎲 Rápida (DT {desafio.dtRapida})</span>
                        <span class="ovd-roll-sub">d{dFisico}+d{dAtletismo} → +RA</span>
                      </button>
                      <button
                        type="button"
                        class="ovd-eq-btn ovd-roll-btn"
                        disabled={rolandoEsc !== null}
                        title={`d${dFisico} + d${dAtletismo} → +RB`}
                        onClick={() => iniciarEscalada(p.id, 'cautelosa')}
                      >
                        <span>🎲 Cautelosa (DT {desafio.dtCautelosa})</span>
                        <span class="ovd-roll-sub">d{dFisico}+d{dAtletismo} → +RB</span>
                      </button>
                    </div>
                  )}
                </div>
              )}

              {resumoEste && (
                <div class="ovd-roll-resumo" data-tom={resumoEste.tom} role="status" aria-live="polite">
                  {resumoEste.texto}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div class="ovd-escalada-dica">
        DT {desafio.dtRapida} (RA) • DT {desafio.dtCautelosa} (RB)
      </div>
    </aside>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   EFEITOS SONOROS AUTOMÁTICOS + PÍLULA RECOLHIDA
   ═══════════════════════════════════════════════════════════════════════════ */

function resumoPilula(desafio: DesafioAtivo): { icone: string; titulo: string; detalhe: string } {
  switch (desafio.tipo) {
    case 'lockpick':
      return {
        icone: '🔒',
        titulo: desafio.titulo,
        detalhe: `${desafio.tentativas.length}/${desafio.maxTentativas}`,
      };
    case 'equilibrio': {
      const { esq, dir } = totaisEquilibrio(desafio);
      return {
        icone: '⚖',
        titulo: desafio.titulo,
        detalhe: `${esq} × ${dir}`,
      };
    }
    case 'esconderijo':
      return {
        icone: '👁',
        titulo: desafio.titulo,
        detalhe: `R${desafio.rodada}`,
      };
    case 'perseguicao':
      return {
        icone: '🏃',
        titulo: desafio.titulo,
        detalhe: `R${desafio.rodada}/${desafio.totalRodadas}`,
      };
    case 'escalada':
      return {
        icone: '⛰',
        titulo: desafio.titulo,
        detalhe: `Meta ${desafio.metaPontos}`,
      };
  }
}

function useSonsDeDesafio(desafio: DesafioAtivo | null, recolhido: boolean): void {
  const anteriorRef = useRef<DesafioAtivo | null>(null);

  useEffect(() => {
    const prev = anteriorRef.current;
    anteriorRef.current = desafio;
    if (!desafio || !prev || prev.id !== desafio.id || prev.tipo !== desafio.tipo) {
      return;
    }

    switch (desafio.tipo) {
      case 'lockpick': {
        // Quando visível, OverlayLockpick já dispara os sons pino-a-pino e o som final na revelação sequencial.
        if (!recolhido) return;
        const p = prev as DesafioLockpick;
        if (p.status !== 'aberto' && desafio.status === 'aberto') {
          tocarEfeitoDesafio('lockpick-aberto');
        } else if (p.status !== 'travado' && desafio.status === 'travado') {
          tocarEfeitoDesafio('lockpick-travado');
        } else if (desafio.tentativas.length > p.tentativas.length) {
          tocarEfeitoDesafio('pino-tentar');
        }
        return;
      }

      case 'equilibrio': {
        const p = prev as DesafioEquilibrio;
        if (p.status !== 'caiu' && desafio.status === 'caiu') {
          tocarEfeitoDesafio('balanca-queda');
        } else if (p.status !== 'equilibrado' && desafio.status === 'equilibrado') {
          tocarEfeitoDesafio('balanca-estavel');
        } else if (
          desafio.dadoEsq !== p.dadoEsq ||
          desafio.dadoDir !== p.dadoDir ||
          desafio.dadosUsados.length !== p.dadosUsados.length ||
          desafio.d4Pendente !== p.d4Pendente
        ) {
          tocarEfeitoDesafio('balanca-inclinar');
        }
        return;
      }

      case 'esconderijo': {
        const p = prev as DesafioEsconderijo;
        if (desafio.ultimaBusca && desafio.ultimaBusca.id !== p.ultimaBusca?.id) {
          const alguemEncontrado = desafio.ultimaBusca.atingidos.some((a) => a.ficouEncontrado);
          tocarEfeitoDesafio(alguemEncontrado ? 'esconderijo-descoberto' : 'esconderijo-busca');
          return;
        }
        const novoEncontrado = desafio.participantes.some((cur) => {
          const ant = p.participantes.find((x) => x.id === cur.id);
          return cur.encontrado && (!ant || !ant.encontrado);
        });
        if (novoEncontrado) {
          tocarEfeitoDesafio('esconderijo-descoberto');
          return;
        }
        const totalAntes = p.participantes.reduce((s, x) => s + x.dados.length, 0);
        const totalAgora = desafio.participantes.reduce((s, x) => s + x.dados.length, 0);
        if (totalAgora !== totalAntes) {
          tocarEfeitoDesafio('esconderijo-dado');
        }
        return;
      }

      case 'perseguicao': {
        const p = prev as DesafioPerseguicao;
        const derrubou = desafio.participantes.some((cur) => {
          const ant = p.participantes.find((x) => x.id === cur.id);
          return cur.status === 'derrubado' && ant?.status !== 'derrubado';
        });
        if (derrubou) {
          tocarEfeitoDesafio('perseguicao-derrubado');
          return;
        }
        const gastouFolego = desafio.participantes.some((cur) => {
          const ant = p.participantes.find((x) => x.id === cur.id);
          return ant !== undefined && cur.folegoRestante < ant.folegoRestante;
        });
        if (gastouFolego) {
          tocarEfeitoDesafio('folego-gastar');
          return;
        }
        const avancou = desafio.participantes.some((cur) => {
          const ant = p.participantes.find((x) => x.id === cur.id);
          return ant !== undefined && cur.pa > ant.pa;
        });
        if (avancou) {
          tocarEfeitoDesafio('perseguicao-avanco');
        }
        return;
      }

      case 'escalada': {
        const p = prev as DesafioEscalada;
        const caiu = desafio.participantes.some((cur) => {
          const ant = p.participantes.find((x) => x.id === cur.id);
          return cur.status === 'caiu' && ant?.status !== 'caiu';
        });
        if (caiu) {
          tocarEfeitoDesafio('escalada-queda');
          return;
        }
        const subiu = desafio.participantes.some((cur) => {
          const ant = p.participantes.find((x) => x.id === cur.id);
          return ant !== undefined && cur.pontos > ant.pontos;
        });
        if (subiu) {
          tocarEfeitoDesafio('escalada-subir');
        }
        return;
      }
    }
  }, [desafio, recolhido]);
}

/* ═══════════════════════════════════════════════════════════════════════════
   COMPONENTE PRINCIPAL
   ═══════════════════════════════════════════════════════════════════════════ */

export function OverlayDesafio({
  desafio,
  modo,
  meuDiscordId,
  minhaFichaId,
  minhaFicha,
  meuNome,
  retratos,
  aoAgir,
}: OverlayDesafioProps) {
  const [faseVisivel, setFaseVisivel] = useState<'aberto' | 'saindo' | 'recolhido'>('aberto');
  const timerFadeRef = useRef<number | null>(null);

  const limparTimerFade = () => {
    if (timerFadeRef.current !== null) {
      window.clearTimeout(timerFadeRef.current);
      timerFadeRef.current = null;
    }
  };

  useEffect(() => () => limparTimerFade(), []);

  useEffect(() => {
    limparTimerFade();
    setFaseVisivel('aberto');
  }, [desafio?.id]);

  const recolhido = faseVisivel === 'recolhido';
  useSonsDeDesafio(desafio, recolhido);

  if (!desafio) return null;

  const recolher = () => {
    if (faseVisivel !== 'aberto') return;
    limparTimerFade();
    if (prefereMovimentoReduzido()) {
      setFaseVisivel('recolhido');
      return;
    }
    setFaseVisivel('saindo');
    timerFadeRef.current = window.setTimeout(() => {
      timerFadeRef.current = null;
      setFaseVisivel('recolhido');
    }, 240);
  };

  const reabrir = () => {
    limparTimerFade();
    setFaseVisivel('aberto');
  };

  if (faseVisivel === 'recolhido') {
    const { icone, titulo, detalhe } = resumoPilula(desafio);
    return (
      <div key="pilula" class="ovd-raiz" data-modo={modo} data-recolhido="1">
        <div class="ovd-pilula-wrap">
          <button
            type="button"
            class="ovd-pilula"
            data-testid="overlay-desafio-pilula"
            onClick={reabrir}
          >
            <span class="ovd-pilula-icone" aria-hidden="true">
              {icone}
            </span>
            <span>{titulo}</span>
            <span class="ovd-pilula-detalhe">({detalhe})</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      key="aberto"
      class="ovd-raiz ovd-raiz-aberta"
      data-modo={modo}
      data-tipo={desafio.tipo}
      data-saindo={faseVisivel === 'saindo' ? '1' : '0'}
    >
      {desafio.tipo === 'lockpick' && (
        <OverlayLockpick
          desafio={desafio}
          modo={modo}
          meuDiscordId={meuDiscordId}
          minhaFichaId={minhaFichaId}
          meuNome={meuNome}
          aoAgir={aoAgir}
          aoRecolher={recolher}
        />
      )}
      {desafio.tipo === 'equilibrio' && (
        <OverlayEquilibrio
          desafio={desafio}
          modo={modo}
          meuDiscordId={meuDiscordId}
          minhaFichaId={minhaFichaId}
          retratos={retratos}
          aoAgir={aoAgir}
          aoRecolher={recolher}
        />
      )}
      {desafio.tipo === 'esconderijo' && (
        <OverlayEsconderijo
          desafio={desafio}
          modo={modo}
          meuDiscordId={meuDiscordId}
          minhaFichaId={minhaFichaId}
          retratos={retratos}
          aoAgir={aoAgir}
          aoRecolher={recolher}
        />
      )}
      {desafio.tipo === 'perseguicao' && (
        <OverlayPerseguicao
          desafio={desafio}
          modo={modo}
          meuDiscordId={meuDiscordId}
          minhaFichaId={minhaFichaId}
          minhaFicha={minhaFicha}
          retratos={retratos}
          aoAgir={aoAgir}
          aoRecolher={recolher}
        />
      )}
      {desafio.tipo === 'escalada' && (
        <OverlayEscalada
          desafio={desafio}
          modo={modo}
          meuDiscordId={meuDiscordId}
          minhaFichaId={minhaFichaId}
          minhaFicha={minhaFicha}
          retratos={retratos}
          aoAgir={aoAgir}
          aoRecolher={recolher}
        />
      )}
    </div>
  );
}

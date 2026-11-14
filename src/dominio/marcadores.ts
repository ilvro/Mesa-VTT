import { analisarNota, type AlvoBruto } from './notas.ts';

export type Marcador =
  | {
      tipo: 'teste';
      pericias: string[];
      dificuldade: number;
      nota?: string;
      condicao?: string;
    }
  | { tipo: 'loot'; rotulo?: string; condicao?: string }
  | { tipo: 'evento'; condicao?: string }
  | { tipo: 'tarefa'; condicao?: string }
  | { tipo: 'rever'; condicao?: string }
  | { tipo: 'musica'; nome: string; condicao?: string }
  | { tipo: 'data'; valor: string; condicao?: string }
  | { tipo: 'segredo'; condicao?: string }
  | { tipo: 'fala'; quem: string; para?: string; condicao?: string }
  | { tipo: 'rotulo'; texto: string; condicao?: string };

export type TrechoMarcado =
  | { tipo: 'texto'; texto: string }
  | { tipo: 'ligacao'; bruto: string; alvo: AlvoBruto; rotulo?: string }
  | { tipo: 'marcador'; bruto: string; marcador: Marcador };

function extrairCondicao(miolo: string): { corpo: string; condicao?: string } {
  const m = miolo.match(/^(.*?)\s+se:(!?[^\s\]]+(?:=[^\s\]]+)?)\s*$/i);
  if (!m) return { corpo: miolo.trim() };
  return { corpo: m[1]!.trim(), condicao: m[2]!.trim() };
}

function dividirPericias(bruto: string): string[] {
  return bruto
    .split(/[/,\-]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function interpretarColchete(mioloBruto: string, restoLinha: string): Marcador | null {
  if (!mioloBruto || /[\n\r]/.test(mioloBruto)) return null;
  const { corpo, condicao } = extrairCondicao(mioloBruto);
  if (!corpo) return null;

  const extra = condicao ? { condicao } : {};
  const upper = corpo.toUpperCase();

  if (upper === 'LOOT') {
    const rotulo = restoLinha.trim();
    return { tipo: 'loot', ...(rotulo ? { rotulo } : {}), ...extra };
  }
  if (upper === 'EVENTO') return { tipo: 'evento', ...extra };
  if (upper === 'TAREFA') return { tipo: 'tarefa', ...extra };
  if (upper === 'REVER') return { tipo: 'rever', ...extra };
  if (upper === 'SEGREDO') return { tipo: 'segredo', ...extra };

  const musica = corpo.match(/^M[UÚ]SICA\s+(.+)$/i);
  if (musica) {
    return { tipo: 'musica', nome: musica[1]!.trim(), ...extra };
  }

  const data = corpo.match(/^DATA\s+(.+)$/i);
  if (data) {
    return { tipo: 'data', valor: data[1]!.trim(), ...extra };
  }

  const teste = corpo.match(
    /^([\p{Lu}][\p{Lu}\s/,-]*?)\s+(?:DT\s+)?(\d+)(?:\s*[-–,]\s*(.+)|\s+(\(.+\))|\s+(.+))?$/u,
  );
  if (teste) {
    const pericias = dividirPericias(teste[1]!);
    const dificuldade = Number(teste[2]);
    const notaBruta = (teste[3] ?? teste[4] ?? teste[5] ?? '').trim();
    if (pericias.length > 0 && Number.isFinite(dificuldade)) {
      return {
        tipo: 'teste',
        pericias,
        dificuldade,
        ...(notaBruta ? { nota: notaBruta } : {}),
        ...extra,
      };
    }
  }

  // Maiúsculas sem número (acentos e ç contam como maiúsculas; rejeita [1], [x], etc.)
  if (corpo.length >= 2 && /\p{Lu}/u.test(corpo) && !/\p{Ll}/u.test(corpo)) {
    const falaPara = corpo.match(/^(.+?)\s+PARA\s+(.+)$/u);
    if (falaPara) {
      return {
        tipo: 'fala',
        quem: falaPara[1]!.trim(),
        para: falaPara[2]!.trim(),
        ...extra,
      };
    }
    const palavras = corpo.split(/\s+/);
    if (palavras.length <= 2 && !/[-:]/.test(corpo)) {
      return { tipo: 'fala', quem: corpo, ...extra };
    }
    return { tipo: 'rotulo', texto: corpo, ...extra };
  }

  return null;
}

function analisarTextoComMarcadores(texto: string): TrechoMarcado[] {
  const saida: TrechoMarcado[] = [];
  let cursor = 0;

  while (cursor < texto.length) {
    // Verifica "Tarefa:" no início de uma linha
    const inicioDeLinha = cursor === 0 || texto[cursor - 1] === '\n';
    if (inicioDeLinha) {
      const mTarefa = texto.slice(cursor).match(/^[ \t]*(Tarefa:)/);
      if (mTarefa) {
        const prefixoLen = mTarefa[0].length - mTarefa[1]!.length;
        if (prefixoLen > 0) {
          saida.push({ tipo: 'texto', texto: texto.slice(cursor, cursor + prefixoLen) });
        }
        saida.push({
          tipo: 'marcador',
          bruto: mTarefa[1]!,
          marcador: { tipo: 'tarefa' },
        });
        cursor += mTarefa[0].length;
        continue;
      }
    }

    const abre = texto.indexOf('[', cursor);
    if (abre < 0) {
      saida.push({ tipo: 'texto', texto: texto.slice(cursor) });
      break;
    }

    // Se houver quebra de linha antes de '[', avança até a próxima linha para checar "Tarefa:"
    const proxQuebra = texto.indexOf('\n', cursor);
    if (proxQuebra >= 0 && proxQuebra < abre) {
      saida.push({ tipo: 'texto', texto: texto.slice(cursor, proxQuebra + 1) });
      cursor = proxQuebra + 1;
      continue;
    }

    const fecha = texto.indexOf(']', abre + 1);
    if (fecha < 0) {
      saida.push({ tipo: 'texto', texto: texto.slice(cursor) });
      break;
    }

    const miolo = texto.slice(abre + 1, fecha);
    const fimLinha = texto.indexOf('\n', fecha + 1);
    const restoLinha = fimLinha < 0 ? texto.slice(fecha + 1) : texto.slice(fecha + 1, fimLinha);
    const marcador = interpretarColchete(miolo, restoLinha);

    if (!marcador) {
      saida.push({ tipo: 'texto', texto: texto.slice(cursor, abre + 1) });
      cursor = abre + 1;
      continue;
    }

    if (abre > cursor) {
      saida.push({ tipo: 'texto', texto: texto.slice(cursor, abre) });
    }
    saida.push({
      tipo: 'marcador',
      bruto: texto.slice(abre, fecha + 1),
      marcador,
    });
    cursor = fecha + 1;
  }

  return saida;
}

export function analisarMarcadores(texto: string): TrechoMarcado[] {
  const daNota = analisarNota(texto);
  const resultado: TrechoMarcado[] = [];
  const empurrar = (trecho: TrechoMarcado) => {
    const ultimo = resultado.at(-1);
    if (trecho.tipo === 'texto' && ultimo?.tipo === 'texto') {
      ultimo.texto += trecho.texto;
    } else {
      resultado.push(trecho);
    }
  };
  for (const trecho of daNota) {
    if (trecho.tipo === 'ligacao') {
      empurrar(trecho);
    } else {
      for (const parte of analisarTextoComMarcadores(trecho.texto)) {
        empurrar(parte);
      }
    }
  }
  return resultado;
}

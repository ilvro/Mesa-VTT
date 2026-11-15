import path from 'node:path';

export const ARQUIVO_DO_CARIMBO = '.carimbo';

export const ENTRADAS_DO_BUILD = {
  Mesa: ['src', 'public', 'index.html', 'package.json', 'vite.config.ts', 'vendor'],
  Atlas: ['src', 'public', 'index.html', 'package.json', 'vite.config.ts', 'mesa-core/src'],
  Atelie: ['src', 'public', 'index.html', 'package.json', 'vite.config.js', 'vendor', 'scripts/library/lib'],
  Dossie: [
    'src',
    'public',
    'index.html',
    'package.json',
    'vite.config.js',
    'vendor',
    'scripts/gen-default-sheets.js',
    'sheets.json',
  ],
  Jukebox: ['.'],
};

function filtroCopiaJukeboxBasename(nome) {
  if (nome === 'tests' || nome === '.git' || nome === 'node_modules' || nome === '.vscode') return false;
  if (nome.endsWith('.md')) return false;
  return true;
}

/**
 * Verifica se um caminho relativo dentro de `app` deve ser ignorado pelo observador.
 */
export function deveIgnorarEvento(app, caminhoRelativo) {
  const normalizado = String(caminhoRelativo ?? '').split(path.sep).join('/');
  if (!normalizado || normalizado === '.') return false;
  if (normalizado === 'src/default-sheets.js') return true;

  const partes = normalizado.split('/').filter(Boolean);
  for (const parte of partes) {
    if (
      parte === 'node_modules' ||
      parte === '.git' ||
      parte === 'dist' ||
      parte.startsWith('dist-') ||
      parte === 'test-results' ||
      parte === '.ponte' ||
      parte === ARQUIVO_DO_CARIMBO
    ) {
      return true;
    }
  }

  if (app === 'Jukebox') {
    if (partes.some(parte => !filtroCopiaJukeboxBasename(parte))) {
      return true;
    }
  }

  return false;
}

/**
 * Formata a linha JSON enviada ao processo Python ao fim de uma montagem.
 */
export function mensagemDeTermino(app, ok) {
  if (app === '__ponte') {
    return JSON.stringify({ tipo: 'ponte' });
  }
  return JSON.stringify({ tipo: ok ? 'atualizado' : 'falhou', app });
}

/**
 * Cria uma fila de montagem com debounce por aplicativo, execução sequencial (um build por vez)
 * e reenfileiramento único caso o aplicativo suje novamente durante o próprio build.
 */
export function criarFila({
  montar,
  esperaMs = 4000,
  agendar = setTimeout,
  cancelar = clearTimeout,
  aoTerminar = () => {},
}) {
  const esperas = new Map();
  const fila = [];
  let montandoAtual = null;
  let sujouDuranteMontagem = false;
  let parado = false;

  const processarProximo = () => {
    if (parado || montandoAtual !== null || fila.length === 0) return;

    const app = fila.shift();
    montandoAtual = app;
    sujouDuranteMontagem = false;

    Promise.resolve()
      .then(() => montar(app))
      .then(
        res => Boolean(res),
        () => false
      )
      .then(ok => {
        if (parado) return;

        // Se ainda havia um cronômetro de debounce pendente para o mesmo app que estava montando,
        // cancela-o e garante que o app volte à fila uma vez no fim.
        if (esperas.has(app)) {
          cancelar(esperas.get(app));
          esperas.delete(app);
          sujouDuranteMontagem = true;
        }

        const deveVoltar = sujouDuranteMontagem;
        montandoAtual = null;
        sujouDuranteMontagem = false;

        aoTerminar(app, ok);

        if (deveVoltar && !fila.includes(app)) {
          fila.push(app);
        }

        processarProximo();
      });
  };

  const enfileirar = app => {
    if (parado) return;
    if (montandoAtual === app) {
      sujouDuranteMontagem = true;
      return;
    }
    if (!fila.includes(app)) {
      fila.push(app);
    }
    processarProximo();
  };

  const sujar = app => {
    if (parado) return;
    if (esperas.has(app)) {
      cancelar(esperas.get(app));
      esperas.delete(app);
    }
    const id = agendar(() => {
      esperas.delete(app);
      enfileirar(app);
    }, esperaMs);
    esperas.set(app, id);
  };

  const parar = () => {
    parado = true;
    for (const id of esperas.values()) {
      cancelar(id);
    }
    esperas.clear();
    fila.length = 0;
    montandoAtual = null;
    sujouDuranteMontagem = false;
  };

  return { sujar, parar };
}

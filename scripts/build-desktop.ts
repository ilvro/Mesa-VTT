import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface AppMontagemDesktop {
  id: string;
  pastaDestino: string;
  origemEscolhida: string;
  tipo: 'dist' | 'dist-pages' | 'desktop-app' | 'estatico';
  /** Comandos que geram a origem (build com a ponte do assistente), rodados em ordem antes da cópia. */
  compilar?: ComandoBuildDesktop[];
}

export interface ComandoBuildDesktop {
  cwd: string;
  comando: string;
  args: string[];
}

/** Pasta de saída do build `desktop` (com a ponte do assistente) dentro de cada projeto; fica fora do git. */
export const SAIDA_BUILD_DESKTOP = 'dist-desktop-app';

export interface PlanoDeMontagemDesktop {
  raizProjetos: string;
  distDesktop: string;
  apps: AppMontagemDesktop[];
  redirecionador: {
    caminho: string;
    conteudo: string;
  };
}

/**
 * Gera o documento index.html na raiz do dist-desktop que redireciona imediatamente para a Mesa.
 */
export function gerarIndexRedirecionador(destino: string = './Mesa/'): string {
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta http-equiv="refresh" content="0; url=${destino}">
  <title>Plataforma da Mesa</title>
  <script>location.replace(${JSON.stringify(destino)});</script>
</head>
<body style="background:#0f111a;color:#c3c7db;font-family:sans-serif;display:grid;place-items:center;height:100vh;margin:0;">
  <p>Redirecionando para <a href="${destino}" style="color:#6ea8fe;">a Mesa</a>…</p>
</body>
</html>
`;
}

/**
 * Planeja a montagem dos aplicativos da plataforma para o diretório dist-desktop.
 * Função 100% pura que aceita uma função para checar existência de arquivos/pastas.
 */
export function planejarMontagemDesktop(
  raizProjetos: string,
  distDesktop: string,
  checarExistencia: (caminho: string) => boolean = fs.existsSync
): PlanoDeMontagemDesktop {
  const configs: Array<{
    id: string;
    pastaDestino: string;
    tipo: 'dist' | 'dist-pages' | 'desktop-app' | 'estatico';
    candidatos: string[];
    compilar?: ComandoBuildDesktop[];
  }> = [
    {
      id: 'Mesa',
      pastaDestino: 'Mesa',
      tipo: 'desktop-app',
      candidatos: [path.join(raizProjetos, 'Mesa', SAIDA_BUILD_DESKTOP)],
      compilar: [
        { cwd: path.join(raizProjetos, 'Mesa'), comando: 'npx', args: ['vite', 'build', '--mode', 'desktop', '--outDir', 'dist-desktop-app'] },
      ],
    },
    {
      id: 'Atlas',
      pastaDestino: 'Atlas',
      tipo: 'desktop-app',
      candidatos: [path.join(raizProjetos, 'Atlas', SAIDA_BUILD_DESKTOP)],
      compilar: [
        { cwd: path.join(raizProjetos, 'Atlas'), comando: 'npx', args: ['vite', 'build', '--mode', 'desktop', '--outDir', 'dist-desktop-app'] },
      ],
    },
    {
      id: 'Dossie',
      pastaDestino: 'Dossie',
      tipo: 'desktop-app',
      candidatos: [path.join(raizProjetos, 'Dossie', SAIDA_BUILD_DESKTOP)],
      compilar: [
        { cwd: path.join(raizProjetos, 'Dossie'), comando: 'node', args: ['scripts/gen-default-sheets.js'] },
        { cwd: path.join(raizProjetos, 'Dossie'), comando: 'npx', args: ['vite', 'build', '--mode', 'desktop', '--outDir', 'dist-desktop-app'] },
      ],
    },
    {
      id: 'Atelie',
      pastaDestino: 'Atelie',
      tipo: 'desktop-app',
      candidatos: [path.join(raizProjetos, 'Atelie', SAIDA_BUILD_DESKTOP)],
      compilar: [
        { cwd: path.join(raizProjetos, 'Atelie'), comando: 'npx', args: ['vite', 'build', '--mode', 'desktop', '--outDir', 'dist-desktop-app'] },
      ],
    },
    {
      id: 'Jukebox',
      pastaDestino: 'Jukebox',
      tipo: 'estatico',
      candidatos: [path.join(raizProjetos, 'Jukebox')],
    },
  ];

  // Opcional: Tabletop se existir no workspace
  const caminhoTabletop = path.join(raizProjetos, 'Tabletop');
  if (checarExistencia(caminhoTabletop)) {
    configs.push({
      id: 'Tabletop',
      pastaDestino: 'Tabletop',
      tipo: 'dist-pages',
      candidatos: [
        path.join(raizProjetos, 'Tabletop', 'dist-pages'),
        path.join(raizProjetos, 'Tabletop', 'dist'),
        caminhoTabletop,
      ],
    });
  }

  const apps: AppMontagemDesktop[] = configs.map(c => {
    const origem = c.candidatos.find(p => checarExistencia(p)) ?? c.candidatos[0]!;
    return {
      id: c.id,
      pastaDestino: c.pastaDestino,
      origemEscolhida: origem,
      tipo: c.tipo,
      ...(c.compilar ? { compilar: c.compilar } : {}),
    };
  });

  return {
    raizProjetos,
    distDesktop,
    apps,
    redirecionador: {
      caminho: path.join(distDesktop, 'index.html'),
      conteudo: gerarIndexRedirecionador('./Mesa/'),
    },
  };
}

/** Filtro de cópia do Jukebox: a pasta inteira menos tests, .git, node_modules, .vscode e *.md (sample é mantido para o preset sample). */
export function filtroCopiaJukebox(src: string): boolean {
  const nome = path.basename(src);
  if (nome === 'tests' || nome === '.git' || nome === 'node_modules' || nome === '.vscode') return false;
  if (nome.endsWith('.md')) return false;
  return true;
}

/**
 * Executa a montagem no sistema de arquivos a partir do plano calculado.
 */
export async function executarMontagemDesktop(
  plano: PlanoDeMontagemDesktop,
  log: (msg: string) => void = console.log,
  rodar: (c: ComandoBuildDesktop) => number = c => spawnSync(c.comando, c.args, { cwd: c.cwd, stdio: 'inherit' }).status ?? 1
): Promise<{ copiados: string[]; indexCriado: boolean }> {
  fs.mkdirSync(plano.distDesktop, { recursive: true });

  const copiados: string[] = [];

  for (const app of plano.apps) {
    const destinoApp = path.join(plano.distDesktop, app.pastaDestino);
    for (const c of app.compilar ?? []) {
      log(`[build-desktop] ${app.id}: ${c.comando} ${c.args.join(' ')}`);
      if (rodar(c) !== 0) throw new Error(`O build desktop de ${app.id} falhou (${c.comando} ${c.args.join(' ')}).`);
    }
    if (app.compilar) fs.rmSync(destinoApp, { recursive: true, force: true });
    fs.mkdirSync(destinoApp, { recursive: true });

    if (!fs.existsSync(app.origemEscolhida)) {
      log(`[build-desktop] Aviso: origem não encontrada para ${app.id} (${app.origemEscolhida})`);
      continue;
    }

    if (app.id === 'Jukebox') {
      // Para o Jukebox, copia a pasta inteira com o filtro (incluindo ponte.js)
      fs.cpSync(app.origemEscolhida, destinoApp, {
        recursive: true,
        filter: filtroCopiaJukebox,
      });
      copiados.push(app.id);
      log(`[build-desktop] Copiado Jukebox (pasta inteira filtrada) -> ${destinoApp}`);
    } else {
      // Para os demais apps (Mesa, Atlas, Dossie, Atelie), copia a saída do build desktop (com a ponte)
      fs.cpSync(app.origemEscolhida, destinoApp, {
        recursive: true,
        filter: src => {
          const nome = path.basename(src);
          return nome !== 'node_modules' && nome !== '.git' && nome !== '.vscode';
        },
      });
      copiados.push(app.id);
      log(`[build-desktop] Copiado ${app.id} (${app.origemEscolhida}) -> ${destinoApp}`);
    }
  }

  // Escreve o index.html redirecionador na raiz
  fs.writeFileSync(plano.redirecionador.caminho, plano.redirecionador.conteudo, 'utf-8');
  log(`[build-desktop] Criado redirecionador: ${plano.redirecionador.caminho}`);

  return { copiados, indexCriado: true };
}

// Execução direta via CLI (node scripts/build-desktop.ts)
const __arquivoAtual = fileURLToPath(import.meta.url);
const ehExecucaoDireta = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__arquivoAtual);

if (ehExecucaoDireta) {
  const raizMesa = path.resolve(path.dirname(__arquivoAtual), '..');
  const raizProjetos = path.resolve(raizMesa, '..');
  const distDesktop = path.resolve(raizMesa, 'dist-desktop');

  console.log(`[build-desktop] Montando plataforma desktop...`);
  console.log(`  Projetos: ${raizProjetos}`);
  console.log(`  Destino:  ${distDesktop}`);

  const plano = planejarMontagemDesktop(raizProjetos, distDesktop);
  executarMontagemDesktop(plano)
    .then(res => {
      console.log(`[build-desktop] Concluído com sucesso! Apps copiados: ${res.copiados.join(', ')}`);
    })
    .catch(err => {
      console.error(`[build-desktop] Erro na montagem:`, err);
      process.exit(1);
    });
}

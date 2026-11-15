import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  escolherMonitorParaProjetor,
  urlDoProjetor,
  opcoesJanelaMonitor,
  type InfoMonitor,
} from '../../src/dominio/desktop.ts';
import {
  ehAmbienteDesktop,
  abrirProjetorNoSegundoMonitor,
} from '../../src/app/desktop.ts';
import {
  planejarMontagemDesktop,
  gerarIndexRedirecionador,
  filtroCopiaJukebox,
  executarMontagemDesktop,
  montarVelhos,
  interpretarArgsBuildDesktop,
  SAIDA_BUILD_DESKTOP,
  type ComandoBuildDesktop,
} from '../../scripts/build-desktop.ts';
import {
  ARQUIVO_DO_CARIMBO,
  ENTRADAS_DO_BUILD,
  carimboDoApp,
  lerCarimboMontado,
} from '../../scripts/carimbo.ts';
// @ts-expect-error módulo mjs sem tipagem
import { iniciarServidorEstatico, atualizarAppsNaAbertura } from '../../scripts/launch-desktop.mjs';

test('escolherMonitorParaProjetor: lista vazia retorna null; 1 monitor retorna o próprio', () => {
  assert.equal(escolherMonitorParaProjetor([]), null);

  const unico: InfoMonitor = { id: 'm1', nome: 'Principal', primario: true };
  assert.deepEqual(escolherMonitorParaProjetor([unico]), unico);
});

test('escolherMonitorParaProjetor: múltiplos monitores prefere monitor diferente do atual', () => {
  const m1: InfoMonitor = { id: 'm1', nome: 'Notebook', primario: true, x: 0, y: 0 };
  const m2: InfoMonitor = { id: 'm2', nome: 'TV Projetor', primario: false, x: 1920, y: 0 };
  const m3: InfoMonitor = { id: 'm3', nome: 'Monitor Lateral', primario: false, x: -1920, y: 0 };

  // Estando no m1, escolhe outro monitor (m2 ou m3)
  const escolhido = escolherMonitorParaProjetor([m1, m2, m3], 'm1');
  assert.notEqual(escolhido?.id, 'm1');
  assert.equal(escolhido?.id, 'm2');

  // Estando no m2, escolhe um diferente de m2
  const escolhido2 = escolherMonitorParaProjetor([m1, m2, m3], 'm2');
  assert.equal(escolhido2?.id, 'm1');
});

test('escolherMonitorParaProjetor: sem monitor atual especificado, prefere o não-primário ou o segundo', () => {
  const m1: InfoMonitor = { id: 'm1', nome: 'Tela 1', primario: true };
  const m2: InfoMonitor = { id: 'm2', nome: 'Tela 2', primario: false };

  assert.equal(escolherMonitorParaProjetor([m1, m2])?.id, 'm2');

  // Se ambos tiverem mesma marcação de primário, escolhe o segundo
  const a: InfoMonitor = { id: 'a', nome: 'A', primario: true };
  const b: InfoMonitor = { id: 'b', nome: 'B', primario: true };
  assert.equal(escolherMonitorParaProjetor([a, b])?.id, 'b');
});

test('urlDoProjetor: formata corretamente com ou sem mapaId e normaliza barras', () => {
  assert.equal(urlDoProjetor('../Atlas', 'castelo-1'), '../Atlas/#/projetor/castelo-1');
  assert.equal(urlDoProjetor('../Atlas/', 'mapa com espaco'), '../Atlas/#/projetor/mapa%20com%20espaco');
  assert.equal(urlDoProjetor('http://127.0.0.1:5100/Atlas/', null), 'http://127.0.0.1:5100/Atlas/#/projetor');
});

test('opcoesJanelaMonitor: monta string de features com coordenadas do monitor alvo', () => {
  const monitor: InfoMonitor = { id: 'tv', x: 1920, y: 0, largura: 1920, altura: 1080 };
  assert.equal(opcoesJanelaMonitor(monitor), 'left=1920,top=0,width=1920,height=1080,popup=yes');

  assert.equal(opcoesJanelaMonitor(null), 'popup,width=1280,height=720');
  assert.equal(opcoesJanelaMonitor({ id: 'sem-coord' }), 'popup,width=1280,height=720');
});

test('gerarIndexRedirecionador: gera HTML com meta refresh e location.replace', () => {
  const padrao = gerarIndexRedirecionador();
  assert.match(padrao, /url=\.\/Mesa\//);
  assert.match(padrao, /location\.replace\("\.\/Mesa\/"\)/);

  const custom = gerarIndexRedirecionador('./Atlas/');
  assert.match(custom, /url=\.\/Atlas\//);
  assert.match(custom, /location\.replace\("\.\/Atlas\/"\)/);
});

test('planejarMontagemDesktop: calcula plano de cópia para cada aplicativo e redirecionador', () => {
  const raiz = '/workspace';
  const dist = '/workspace/Mesa/dist-desktop';

  const mockChecar = (caminho: string) => caminho === '/workspace/Jukebox' || caminho.endsWith('/dist-desktop-app');

  const plano = planejarMontagemDesktop(raiz, dist, mockChecar);

  assert.equal(plano.distDesktop, dist);
  assert.equal(plano.redirecionador.caminho, '/workspace/Mesa/dist-desktop/index.html');
  assert.match(plano.redirecionador.conteudo, /location\.replace\("\.\/Mesa\/"\)/);

  const apps = plano.apps.map(a => `${a.id}:${a.pastaDestino}`);
  assert.ok(apps.includes('Mesa:Mesa'));
  assert.ok(apps.includes('Atlas:Atlas'));
  assert.ok(apps.includes('Dossie:Dossie'));
  assert.ok(apps.includes('Atelie:Atelie'));
  assert.ok(apps.includes('Jukebox:Jukebox'));

  const atelie = plano.apps.find(a => a.id === 'Atelie');
  assert.equal(atelie?.origemEscolhida, '/workspace/Atelie/dist-desktop-app');
  assert.deepEqual(atelie?.compilar, [
    { cwd: '/workspace/Atelie', comando: 'npx', args: ['vite', 'build', '--mode', 'desktop', '--outDir', 'dist-desktop-app'] },
  ]);

  for (const id of ['Mesa', 'Atlas', 'Dossie']) {
    const app = plano.apps.find(a => a.id === id);
    assert.equal(app?.origemEscolhida, `/workspace/${id}/dist-desktop-app`);
    assert.deepEqual(app?.compilar?.at(-1)?.args, ['vite', 'build', '--mode', 'desktop', '--outDir', 'dist-desktop-app']);
  }
  // O Dossiê gera as fichas padrão antes do build; Jukebox segue estático, sem build.
  assert.deepEqual(plano.apps.find(a => a.id === 'Dossie')?.compilar?.[0], { cwd: '/workspace/Dossie', comando: 'node', args: ['scripts/gen-default-sheets.js'] });
  assert.equal(plano.apps.find(a => a.id === 'Jukebox')?.compilar, undefined);
});

test('ehAmbienteDesktop: detecta presença das APIs do Tauri no objeto window', () => {
  const globalAny = globalThis as unknown as { window?: unknown };
  const originalWindow = globalAny.window;

  try {
    globalAny.window = {};
    assert.equal(ehAmbienteDesktop(), false);

    globalAny.window = { __TAURI__: { core: {} } };
    assert.equal(ehAmbienteDesktop(), true);

    globalAny.window = { __TAURI_INTERNALS__: {} };
    assert.equal(ehAmbienteDesktop(), true);
  } finally {
    globalAny.window = originalWindow;
  }
});

test('abrirProjetorNoSegundoMonitor: utiliza Tauri invoke quando em ambiente desktop', async () => {
  const chamadas: Array<{ cmd: string; args?: Record<string, unknown> }> = [];
  const invokeMock = async (cmd: string, args?: Record<string, unknown>) => {
    chamadas.push({ cmd, args });
    return 'ok';
  };

  const res = await abrirProjetorNoSegundoMonitor('mapa-123', {
    baseAtlas: '../Atlas/',
    invoke: invokeMock,
  });

  assert.equal(res.ok, true);
  assert.equal(res.metodo, 'tauri');
  assert.equal(chamadas.length, 1);
  assert.equal(chamadas[0]?.cmd, 'abrir_projetor_segundo_monitor');
  assert.equal(chamadas[0]?.args?.url, '../Atlas/#/projetor/mapa-123');
});

test('abrirProjetorNoSegundoMonitor: utiliza Screen Details API no navegador quando disponível', async () => {
  const janelasAbertas: Array<{ url: string; target: string; features: string }> = [];
  const openMock = (url: string, target: string, features: string) => {
    janelasAbertas.push({ url, target, features });
    return null;
  };

  const getScreenDetailsMock = async () => ({
    screens: [
      { left: 0, top: 0, width: 1920, height: 1080, isPrimary: true, label: 'Principal' },
      { left: 1920, top: 0, width: 1920, height: 1080, isPrimary: false, label: 'TV Sala' },
    ],
    currentScreen: { left: 0, top: 0 },
  });

  const res = await abrirProjetorNoSegundoMonitor('mapa-456', {
    baseAtlas: '../Atlas/',
    getScreenDetails: getScreenDetailsMock,
    openWindow: openMock,
  });

  assert.equal(res.ok, true);
  assert.equal(res.metodo, 'multi-screen');
  assert.equal(janelasAbertas.length, 1);
  assert.equal(janelasAbertas[0]?.url, '../Atlas/#/projetor/mapa-456');
  assert.equal(janelasAbertas[0]?.target, 'atlas-projetor');
  assert.match(janelasAbertas[0]?.features ?? '', /left=1920,top=0/);
});

test('abrirProjetorNoSegundoMonitor: cai em popup padrão se sem multi-screen nem tauri', async () => {
  const janelasAbertas: Array<{ url: string; target: string; features: string }> = [];
  const openMock = (url: string, target: string, features: string) => {
    janelasAbertas.push({ url, target, features });
    return null;
  };

  const res = await abrirProjetorNoSegundoMonitor(null, {
    baseAtlas: 'http://127.0.0.1:5100/Atlas/',
    openWindow: openMock,
  });

  assert.equal(res.ok, true);
  assert.equal(res.metodo, 'popup');
  assert.equal(janelasAbertas.length, 1);
  assert.equal(janelasAbertas[0]?.url, 'http://127.0.0.1:5100/Atlas/#/projetor');
  assert.equal(janelasAbertas[0]?.features, 'popup,width=1280,height=720');
});

test('filtroCopiaJukebox: copia ponte.js, arquivos estáticos e sample, mas exclui testes, git, node_modules e *.md', () => {
  assert.equal(filtroCopiaJukebox('/workspace/Jukebox/ponte.js'), true);
  assert.equal(filtroCopiaJukebox('/workspace/Jukebox/index.html'), true);
  assert.equal(filtroCopiaJukebox('/workspace/Jukebox/mesa.json'), true);
  assert.equal(filtroCopiaJukebox('/workspace/Jukebox/sample'), true);
  assert.equal(filtroCopiaJukebox('/workspace/Jukebox/vendor'), true);

  assert.equal(filtroCopiaJukebox('/workspace/Jukebox/tests'), false);
  assert.equal(filtroCopiaJukebox('/workspace/Jukebox/.git'), false);
  assert.equal(filtroCopiaJukebox('/workspace/Jukebox/node_modules'), false);
  assert.equal(filtroCopiaJukebox('/workspace/Jukebox/.vscode'), false);
  assert.equal(filtroCopiaJukebox('/workspace/Jukebox/README.md'), false);
  assert.equal(filtroCopiaJukebox('/workspace/Jukebox/LEIAME.md'), false);
});

test('servidor estático desktop: 404 para arquivos inexistentes com extensão e fallback SPA para rotas sem extensão', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mesa-srv-test-'));
  const mesaDir = path.join(dir, 'Mesa');
  const jukeboxDir = path.join(dir, 'Jukebox');
  fs.mkdirSync(mesaDir, { recursive: true });
  fs.mkdirSync(jukeboxDir, { recursive: true });
  fs.writeFileSync(path.join(mesaDir, 'index.html'), '<!doctype html><html>Mesa SPA</html>', 'utf8');
  fs.writeFileSync(path.join(jukeboxDir, 'index.html'), '<!doctype html><html>Jukebox SPA</html>', 'utf8');

  const server = await iniciarServidorEstatico(dir, 0, '127.0.0.1');
  const port = (server.address() as { port: number }).port;

  try {
    // 404 para arquivo com extensão que não existe
    const resInexistente = await fetch(`http://127.0.0.1:${port}/Jukebox/naoexiste.js`);
    assert.equal(resInexistente.status, 404);

    // Fallback SPA para rota sem extensão em /Mesa/rota
    const resRota = await fetch(`http://127.0.0.1:${port}/Mesa/rota`);
    assert.equal(resRota.status, 200);
    const html = await resRota.text();
    assert.match(html, /Mesa SPA/);
  } finally {
    server.close();
    server.closeAllConnections?.();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function criarWorkspaceFalso(raiz: string): void {
  for (const app of Object.keys(ENTRADAS_DO_BUILD)) {
    fs.mkdirSync(path.join(raiz, app, 'src'), { recursive: true });
    fs.writeFileSync(path.join(raiz, app, 'src', 'main.ts'), `// ${app}`, 'utf-8');
    fs.writeFileSync(path.join(raiz, app, 'index.html'), `<!doctype html><title>${app}</title>`, 'utf-8');
  }
}

test('executarMontagemDesktop: monta só os apps pedidos, grava .carimbo e faz troca atômica sem deixar .novo', async () => {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'mesa-build-seletivo-'));
  const distDesktop = path.join(raiz, 'Mesa', 'dist-desktop');
  try {
    criarWorkspaceFalso(raiz);

    const comandosRodados: ComandoBuildDesktop[] = [];
    const rodarFalso = (c: ComandoBuildDesktop): number => {
      comandosRodados.push(c);
      const outDir = path.join(c.cwd, SAIDA_BUILD_DESKTOP);
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(path.join(outDir, 'index.html'), `<html>build:${path.basename(c.cwd)}</html>`, 'utf-8');
      return 0;
    };

    const plano = planejarMontagemDesktop(raiz, distDesktop);
    const res = await executarMontagemDesktop(plano, () => {}, rodarFalso, { apps: ['Atlas'] });

    assert.deepEqual(res.copiados, ['Atlas']);
    assert.equal(res.indexCriado, true);
    assert.equal(comandosRodados.length, 1);
    assert.equal(path.basename(comandosRodados[0]!.cwd), 'Atlas');

    // .carimbo gravado no destino e pasta .novo removida após rename
    assert.equal(lerCarimboMontado(path.join(distDesktop, 'Atlas')), carimboDoApp(raiz, 'Atlas'));
    assert.equal(fs.existsSync(path.join(distDesktop, 'Atlas.novo')), false);
    assert.equal(fs.existsSync(path.join(distDesktop, 'Mesa')), false);
    assert.equal(fs.existsSync(path.join(distDesktop, 'index.html')), true);
  } finally {
    fs.rmSync(raiz, { recursive: true, force: true });
  }
});

test('executarMontagemDesktop: falha no build mantém o destino antigo intacto e apaga .novo', async () => {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'mesa-build-falha-'));
  const distDesktop = path.join(raiz, 'Mesa', 'dist-desktop');
  try {
    criarWorkspaceFalso(raiz);

    // Prepara destino antigo do Atlas e um .novo residual
    const destinoAtlas = path.join(distDesktop, 'Atlas');
    const destinoNovo = path.join(distDesktop, 'Atlas.novo');
    fs.mkdirSync(destinoAtlas, { recursive: true });
    fs.writeFileSync(path.join(destinoAtlas, 'index.html'), 'versao-antiga', 'utf-8');
    fs.writeFileSync(path.join(destinoAtlas, ARQUIVO_DO_CARIMBO), 'carimbo-antigo', 'utf-8');
    fs.mkdirSync(destinoNovo, { recursive: true });
    fs.writeFileSync(path.join(destinoNovo, 'lixo.txt'), 'residual', 'utf-8');

    const plano = planejarMontagemDesktop(raiz, distDesktop);
    await assert.rejects(
      () => executarMontagemDesktop(plano, () => {}, () => 1, { apps: ['Atlas'] }),
      /O build desktop de Atlas falhou/
    );

    assert.equal(fs.readFileSync(path.join(destinoAtlas, 'index.html'), 'utf-8'), 'versao-antiga');
    assert.equal(lerCarimboMontado(destinoAtlas), 'carimbo-antigo');
    assert.equal(fs.existsSync(destinoNovo), false);
  } finally {
    fs.rmSync(raiz, { recursive: true, force: true });
  }
});

test('montarVelhos: monta o que está desatualizado e não monta nada quando tudo bate', async () => {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'mesa-montar-velhos-'));
  const distDesktop = path.join(raiz, 'Mesa', 'dist-desktop');
  try {
    criarWorkspaceFalso(raiz);

    let compilarContagem = 0;
    const rodarFalso = (c: ComandoBuildDesktop): number => {
      compilarContagem++;
      const outDir = path.join(c.cwd, SAIDA_BUILD_DESKTOP);
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(path.join(outDir, 'index.html'), `<html>${path.basename(c.cwd)}</html>`, 'utf-8');
      return 0;
    };

    const primeira = await montarVelhos(raiz, distDesktop, () => {}, rodarFalso);
    assert.deepEqual(primeira.sort(), Object.keys(ENTRADAS_DO_BUILD).sort());
    const contagemAposPrimeira = compilarContagem;
    assert.ok(contagemAposPrimeira > 0);

    // Segunda execução sem mudanças: não deve compilar nem copiar nada
    const logs: string[] = [];
    const segunda = await montarVelhos(raiz, distDesktop, msg => logs.push(msg), rodarFalso);
    assert.deepEqual(segunda, []);
    assert.equal(compilarContagem, contagemAposPrimeira);
    assert.ok(logs.some(l => l.includes('tudo em dia')));

    // Tocar um arquivo apenas do Atlas: remonta só o Atlas
    const arqAtlas = path.join(raiz, 'Atlas', 'src', 'main.ts');
    const futuro = new Date(Date.now() + 60_000);
    fs.utimesSync(arqAtlas, futuro, futuro);

    const terceira = await montarVelhos(raiz, distDesktop, () => {}, rodarFalso);
    assert.deepEqual(terceira, ['Atlas']);
    assert.equal(compilarContagem, contagemAposPrimeira + 1);
  } finally {
    fs.rmSync(raiz, { recursive: true, force: true });
  }
});

test('interpretarArgsBuildDesktop: lê --apps e --se-mudou', () => {
  assert.deepEqual(interpretarArgsBuildDesktop([]), { seMudou: false });
  assert.deepEqual(interpretarArgsBuildDesktop(['--se-mudou']), { seMudou: true });
  assert.deepEqual(interpretarArgsBuildDesktop(['--apps', 'Atlas,Mesa']), {
    apps: ['Atlas', 'Mesa'],
    seMudou: false,
  });
  assert.deepEqual(interpretarArgsBuildDesktop(['--apps=Atlas', '--se-mudou']), {
    apps: ['Atlas'],
    seMudou: true,
  });
});

test('atualizarAppsNaAbertura: executa build-desktop.ts --se-mudou e segue sem lançar se o build falhar', () => {
  const notificacoes: string[] = [];
  const comandos: string[] = [];

  const ok = atualizarAppsNaAbertura({
    executar: (cmd: string) => {
      comandos.push(cmd);
    },
    notificar: (msg: string) => {
      notificacoes.push(msg);
    },
    logErro: () => {},
  });

  assert.equal(ok, true);
  assert.deepEqual(comandos, ['node scripts/build-desktop.ts --se-mudou']);
  assert.deepEqual(notificacoes, ['Atualizando os apps…']);

  const notificacoesFalha: string[] = [];
  const okFalha = atualizarAppsNaAbertura({
    executar: () => {
      throw new Error('falha simulada');
    },
    notificar: (msg: string) => {
      notificacoesFalha.push(msg);
    },
    logErro: () => {},
  });

  assert.equal(okFalha, false);
  assert.deepEqual(notificacoesFalha, [
    'Atualizando os apps…',
    'A atualização falhou; abrindo a versão anterior',
  ]);
});

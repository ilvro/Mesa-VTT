import { test } from 'node:test';
import assert from 'node:assert/strict';
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
} from '../../scripts/build-desktop.ts';

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

  // Simula sistema de arquivos onde Atelie usa dist-pages e os demais usam dist
  const mockChecar = (caminho: string) => {
    return (
      caminho.includes('/Mesa/dist') ||
      caminho.includes('/Atlas/dist') ||
      caminho.includes('/Dossie/dist') ||
      caminho.includes('/Atelie/dist-pages') ||
      caminho === '/workspace/Jukebox'
    );
  };

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
  assert.equal(atelie?.origemEscolhida, '/workspace/Atelie/dist-pages');
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

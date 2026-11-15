import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  ENTRADAS_DO_BUILD as ENTRADAS_TS,
  deveIgnorarCaminho,
  ignorarDoApp,
} from '../../scripts/carimbo.ts';
// @ts-expect-error módulo mjs sem tipagem
import { ENTRADAS_DO_BUILD as ENTRADAS_MJS, criarFila, deveIgnorarEvento, mensagemDeTermino } from '../../scripts/fila-de-montagem.mjs';
// @ts-expect-error módulo mjs sem tipagem
import { iniciarObservadorDeFontes } from '../../scripts/launch-desktop.mjs';

function criarRelogioFalso() {
  let proximoId = 1;
  let agora = 0;
  const pendentes = new Map<number, { quando: number; fn: () => void }>();

  const agendar = (fn: () => void, ms: number): number => {
    const id = proximoId++;
    pendentes.set(id, { quando: agora + ms, fn });
    return id;
  };

  const cancelar = (id: number): void => {
    pendentes.delete(id);
  };

  const avancar = (ms: number): void => {
    const alvo = agora + ms;
    while (true) {
      let menorId: number | null = null;
      let menorQuando = Infinity;
      for (const [id, item] of pendentes.entries()) {
        if (item.quando <= alvo && item.quando < menorQuando) {
          menorQuando = item.quando;
          menorId = id;
        }
      }
      if (menorId === null) break;
      const item = pendentes.get(menorId)!;
      pendentes.delete(menorId);
      agora = item.quando;
      item.fn();
    }
    agora = alvo;
  };

  return { agendar, cancelar, avancar, pendentes: () => pendentes.size };
}

test('ENTRADAS_DO_BUILD e filtro de ignorados coincidem entre carimbo.ts e fila-de-montagem.mjs', () => {
  assert.deepEqual(ENTRADAS_MJS, ENTRADAS_TS);

  const amostras = [
    'src/main.ts',
    'src/default-sheets.js',
    'node_modules/pkg/index.js',
    'dist-desktop-app/index.html',
    'tests/foo.test.mjs',
    'README.md',
    'ponte.js',
  ];

  for (const app of Object.keys(ENTRADAS_TS)) {
    const ignorar = ignorarDoApp(app);
    for (const caminho of amostras) {
      assert.equal(
        deveIgnorarEvento(app, caminho),
        deveIgnorarCaminho(caminho, ignorar),
        `divergência em ${app}:${caminho}`
      );
    }
  }
});

test('criarFila: três sujar seguidos montam uma única vez após o debounce', async () => {
  const relogio = criarRelogioFalso();
  const montados: string[] = [];
  const terminados: Array<{ app: string; ok: boolean }> = [];

  const fila = criarFila({
    esperaMs: 4000,
    agendar: relogio.agendar,
    cancelar: relogio.cancelar,
    montar: async (app: string) => {
      montados.push(app);
      return true;
    },
    aoTerminar: (app: string, ok: boolean) => {
      terminados.push({ app, ok });
    },
  });

  fila.sujar('Atlas');
  relogio.avancar(1500);
  fila.sujar('Atlas');
  relogio.avancar(1500);
  fila.sujar('Atlas');
  relogio.avancar(3999);
  assert.deepEqual(montados, []);

  relogio.avancar(1);
  await new Promise(r => setImmediate(r));

  assert.deepEqual(montados, ['Atlas']);
  assert.deepEqual(terminados, [{ app: 'Atlas', ok: true }]);
});

test('criarFila: dois apps montam em sequência, nunca ao mesmo tempo', async () => {
  const relogio = criarRelogioFalso();
  const eventos: string[] = [];
  let emAndamento = 0;
  let maxSimultaneos = 0;
  const resolverPorApp = new Map<string, (ok: boolean) => void>();

  const fila = criarFila({
    esperaMs: 4000,
    agendar: relogio.agendar,
    cancelar: relogio.cancelar,
    montar: (app: string) => {
      emAndamento++;
      if (emAndamento > maxSimultaneos) maxSimultaneos = emAndamento;
      eventos.push(`inicio:${app}`);
      return new Promise<boolean>(resolve => {
        resolverPorApp.set(app, ok => {
          emAndamento--;
          eventos.push(`fim:${app}`);
          resolve(ok);
        });
      });
    },
    aoTerminar: (app: string, ok: boolean) => {
      eventos.push(`terminou:${app}:${ok}`);
    },
  });

  fila.sujar('Atlas');
  fila.sujar('Mesa');
  relogio.avancar(4000);
  await new Promise(r => setImmediate(r));

  // Só o Atlas começou; Mesa aguarda na fila
  assert.deepEqual(eventos, ['inicio:Atlas']);
  assert.equal(maxSimultaneos, 1);

  resolverPorApp.get('Atlas')!(true);
  await new Promise(r => setImmediate(r));

  assert.deepEqual(eventos, ['inicio:Atlas', 'fim:Atlas', 'terminou:Atlas:true', 'inicio:Mesa']);
  assert.equal(maxSimultaneos, 1);

  resolverPorApp.get('Mesa')!(true);
  await new Promise(r => setImmediate(r));

  assert.deepEqual(eventos, [
    'inicio:Atlas',
    'fim:Atlas',
    'terminou:Atlas:true',
    'inicio:Mesa',
    'fim:Mesa',
    'terminou:Mesa:true',
  ]);
});

test('criarFila: sujar durante o próprio build remonta uma vez no fim', async () => {
  const relogio = criarRelogioFalso();
  let contAtlas = 0;
  const resolvers: Array<(ok: boolean) => void> = [];
  const terminados: Array<{ app: string; ok: boolean }> = [];

  const fila = criarFila({
    esperaMs: 4000,
    agendar: relogio.agendar,
    cancelar: relogio.cancelar,
    montar: (app: string) => {
      assert.equal(app, 'Atlas');
      contAtlas++;
      return new Promise<boolean>(resolve => {
        resolvers.push(resolve);
      });
    },
    aoTerminar: (app: string, ok: boolean) => {
      terminados.push({ app, ok });
    },
  });

  fila.sujar('Atlas');
  relogio.avancar(4000);
  await new Promise(r => setImmediate(r));
  assert.equal(contAtlas, 1);

  // Suja 3 vezes enquanto o build 1 ainda está rodando
  fila.sujar('Atlas');
  relogio.avancar(1000);
  fila.sujar('Atlas');
  relogio.avancar(4000);
  fila.sujar('Atlas');

  // Ainda só 1 build em andamento
  assert.equal(contAtlas, 1);

  // Conclui o primeiro build -> deve iniciar exatamente mais 1 build no fim
  resolvers[0]!(true);
  await new Promise(r => setImmediate(r));
  assert.equal(contAtlas, 2);

  // Conclui o segundo build -> não deve haver terceiro build
  resolvers[1]!(true);
  await new Promise(r => setImmediate(r));
  relogio.avancar(10000);
  await new Promise(r => setImmediate(r));

  assert.equal(contAtlas, 2);
  assert.deepEqual(terminados, [
    { app: 'Atlas', ok: true },
    { app: 'Atlas', ok: true },
  ]);
});

test('criarFila: falha no build chama aoTerminar(app, false)', async () => {
  const relogio = criarRelogioFalso();
  const terminados: Array<{ app: string; ok: boolean }> = [];

  const fila = criarFila({
    esperaMs: 4000,
    agendar: relogio.agendar,
    cancelar: relogio.cancelar,
    montar: async (app: string) => {
      if (app === 'Dossie') throw new Error('erro de compilação');
      return false;
    },
    aoTerminar: (app: string, ok: boolean) => {
      terminados.push({ app, ok });
    },
  });

  fila.sujar('Atlas');
  fila.sujar('Dossie');
  relogio.avancar(4000);
  await new Promise(r => setImmediate(r));
  await new Promise(r => setImmediate(r));

  assert.deepEqual(terminados, [
    { app: 'Atlas', ok: false },
    { app: 'Dossie', ok: false },
  ]);
});

test('iniciarObservadorDeFontes e mensagemDeTermino: envia JSON para atualizado, falhou e ponte', async () => {
  assert.equal(mensagemDeTermino('Atlas', true), '{"tipo":"atualizado","app":"Atlas"}');
  assert.equal(mensagemDeTermino('Atlas', false), '{"tipo":"falhou","app":"Atlas"}');
  assert.equal(mensagemDeTermino('__ponte', true), '{"tipo":"ponte"}');

  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'mesa-obs-test-'));
  try {
    fs.mkdirSync(path.join(raiz, 'Atlas', 'src'), { recursive: true });
    fs.mkdirSync(path.join(raiz, 'Atlas', 'scripts', 'ponte'), { recursive: true });

    const relogio = criarRelogioFalso();
    const linhasPython: string[] = [];
    const montados: string[] = [];
    const callbacksPorCaminho = new Map<string, (ev: string, nome: string) => void>();

    const obs = iniciarObservadorDeFontes({
      raizProjetos: raiz,
      esperaMs: 4000,
      agendar: relogio.agendar,
      cancelar: relogio.cancelar,
      enviarParaPython: (linha: string) => linhasPython.push(linha),
      montarApp: async (app: string) => {
        montados.push(app);
        return true;
      },
      observar: (caminho: string, _opcoes: unknown, cb: (ev: string, nome: string) => void) => {
        callbacksPorCaminho.set(caminho, cb);
        return { close() {} };
      },
    });

    const cbAtlasSrc = callbacksPorCaminho.get(path.join(raiz, 'Atlas', 'src'))!;
    const cbPonte = callbacksPorCaminho.get(path.join(raiz, 'Atlas', 'scripts', 'ponte'))!;
    assert.ok(cbAtlasSrc);
    assert.ok(cbPonte);

    // Evento em node_modules é ignorado
    cbAtlasSrc('change', 'node_modules/x.js');
    relogio.avancar(5000);
    await new Promise(r => setImmediate(r));
    assert.deepEqual(montados, []);

    // Evento em arquivo fonte do Atlas e na ponte
    cbAtlasSrc('change', 'main.tsx');
    cbPonte('change', 'servidor.ts');
    relogio.avancar(4000);
    await new Promise(r => setImmediate(r));
    await new Promise(r => setImmediate(r));

    assert.deepEqual(montados, ['Atlas']);
    assert.deepEqual(linhasPython, [
      '{"tipo":"atualizado","app":"Atlas"}\n',
      '{"tipo":"ponte"}\n',
    ]);

    obs.parar();
  } finally {
    fs.rmSync(raiz, { recursive: true, force: true });
  }
});

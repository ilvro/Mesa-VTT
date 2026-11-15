import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  ARQUIVO_DO_CARIMBO,
  ENTRADAS_DO_BUILD,
  appsVelhos,
  carimboDe,
  carimboDoApp,
  lerCarimboMontado,
} from '../../scripts/carimbo.ts';

function comPastaTemp(fn: (dir: string) => void): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mesa-carimbo-test-'));
  try {
    fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('carimboDe: o mesmo conteúdo dá o mesmo carimbo e tocar arquivo (mtime) muda o carimbo', () => {
  comPastaTemp(dir => {
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    const arq = path.join(dir, 'src', 'main.ts');
    fs.writeFileSync(arq, 'console.log(1);\n', 'utf-8');
    fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html>', 'utf-8');

    const c1 = carimboDe(dir, ['src', 'index.html']);
    const c2 = carimboDe(dir, ['index.html', 'src']);
    assert.equal(c1, c2);
    assert.match(c1, /^[0-9a-f]{40}$/);

    // Mudar mtime com utimesSync altera o carimbo
    const futuro = new Date(Date.now() + 60_000);
    fs.utimesSync(arq, futuro, futuro);
    const c3 = carimboDe(dir, ['src', 'index.html']);
    assert.notEqual(c3, c1);
  });
});

test('carimboDe: ignora node_modules, .git, dist, dist-*, test-results, .ponte e entradas inexistentes', () => {
  comPastaTemp(dir => {
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src', 'app.ts'), 'export const x = 1;', 'utf-8');

    const base = carimboDe(dir, ['src', 'public', 'nao-existe.txt']);

    // Criar arquivos em pastas ignoradas não altera o carimbo
    for (const ignorada of [
      'node_modules/pkg',
      '.git/refs',
      'dist/assets',
      'dist-desktop-app/assets',
      'test-results/run',
      '.ponte',
      'src/node_modules/interno',
    ]) {
      const p = path.join(dir, ignorada);
      fs.mkdirSync(p, { recursive: true });
      fs.writeFileSync(path.join(p, 'lixo.js'), 'ignorado', 'utf-8');
    }

    // Dossiê: src/default-sheets.js (gerado no build) também fica fora
    fs.writeFileSync(path.join(dir, 'src', 'default-sheets.js'), 'export const DEFAULT_SHEETS = [];', 'utf-8');

    const depois = carimboDe(dir, ['src', 'public', 'nao-existe.txt', '.']);
    assert.equal(depois, base);

    // Predicado ignorar customizado
    fs.writeFileSync(path.join(dir, 'src', 'ignorar.tmp'), 'temp', 'utf-8');
    const comCustom = carimboDe(dir, ['src'], c => c.endsWith('.tmp'));
    assert.equal(comCustom, base);
  });
});

test('appsVelhos e lerCarimboMontado: acusa app sem .carimbo ou com carimbo divergente e ignora o que bate', () => {
  comPastaTemp(raiz => {
    const distDesktop = path.join(raiz, 'Mesa', 'dist-desktop');

    // Cria estrutura mínima para Atlas e Mesa
    for (const app of ['Mesa', 'Atlas']) {
      fs.mkdirSync(path.join(raiz, app, 'src'), { recursive: true });
      fs.writeFileSync(path.join(raiz, app, 'src', 'index.ts'), `// ${app}`, 'utf-8');
      fs.writeFileSync(path.join(raiz, app, 'index.html'), `<html>${app}</html>`, 'utf-8');
    }

    // Sem dist-desktop: ambos estão velhos; Tabletop é ignorado
    assert.deepEqual(appsVelhos(raiz, distDesktop, ['Mesa', 'Atlas', 'Tabletop']), ['Mesa', 'Atlas']);
    assert.equal(lerCarimboMontado(path.join(distDesktop, 'Mesa')), null);

    // Monta Mesa com o carimbo certo, mas Atlas ainda sem .carimbo
    const pastaMesaMontada = path.join(distDesktop, 'Mesa');
    fs.mkdirSync(pastaMesaMontada, { recursive: true });
    const carimboMesa = carimboDoApp(raiz, 'Mesa');
    fs.writeFileSync(path.join(pastaMesaMontada, ARQUIVO_DO_CARIMBO), `${carimboMesa}\n`, 'utf-8');

    assert.equal(lerCarimboMontado(pastaMesaMontada), carimboMesa);
    assert.deepEqual(appsVelhos(raiz, distDesktop, ['Mesa', 'Atlas']), ['Atlas']);

    // Monta Atlas com o carimbo certo -> nenhum velho
    const pastaAtlasMontada = path.join(distDesktop, 'Atlas');
    fs.mkdirSync(pastaAtlasMontada, { recursive: true });
    fs.writeFileSync(path.join(pastaAtlasMontada, ARQUIVO_DO_CARIMBO), carimboDoApp(raiz, 'Atlas'), 'utf-8');
    assert.deepEqual(appsVelhos(raiz, distDesktop, ['Mesa', 'Atlas']), []);

    // Tocar um arquivo do Atlas -> Atlas volta a acusar velho
    const arqAtlas = path.join(raiz, 'Atlas', 'src', 'index.ts');
    const futuro = new Date(Date.now() + 120_000);
    fs.utimesSync(arqAtlas, futuro, futuro);
    assert.deepEqual(appsVelhos(raiz, distDesktop, ['Mesa', 'Atlas']), ['Atlas']);
  });
});

test('ENTRADAS_DO_BUILD: Jukebox ignora arquivos filtrados por filtroCopiaJukebox', () => {
  comPastaTemp(raiz => {
    const jukebox = path.join(raiz, 'Jukebox');
    fs.mkdirSync(path.join(jukebox, 'tests'), { recursive: true });
    fs.writeFileSync(path.join(jukebox, 'index.html'), '<html>Jukebox</html>', 'utf-8');
    fs.writeFileSync(path.join(jukebox, 'ponte.js'), '// ponte', 'utf-8');

    const c1 = carimboDoApp(raiz, 'Jukebox');

    // Criar README.md ou arquivo em tests/ não deve mudar o carimbo do Jukebox
    fs.writeFileSync(path.join(jukebox, 'README.md'), '# Jukebox', 'utf-8');
    fs.writeFileSync(path.join(jukebox, 'tests', 'foo.test.mjs'), '// teste', 'utf-8');
    const c2 = carimboDoApp(raiz, 'Jukebox');
    assert.equal(c2, c1);

    // Editar ponte.js deve mudar o carimbo
    fs.writeFileSync(path.join(jukebox, 'ponte.js'), '// ponte v2', 'utf-8');
    const c3 = carimboDoApp(raiz, 'Jukebox');
    assert.notEqual(c3, c1);

    assert.ok(Array.isArray(ENTRADAS_DO_BUILD.Dossie));
    assert.ok(ENTRADAS_DO_BUILD.Dossie.includes('sheets.json'));
  });
});

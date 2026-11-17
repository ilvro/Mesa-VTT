import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { test } from 'node:test';

const RAIZ_SRC = new URL('../../src/', import.meta.url).pathname;

function listarArquivos(dir: string): string[] {
  const saida: string[] = [];
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const caminho = join(dir, entrada.name);
    if (entrada.isDirectory()) saida.push(...listarArquivos(caminho));
    else if (/\.(ts|tsx)$/.test(entrada.name)) saida.push(caminho);
  }
  return saida.sort();
}

function extrairImports(codigo: string): string[] {
  const imports: string[] = [];
  const regex = /(?:from\s+|import\s*\(\s*|import\s+)['"]([^'"]+)['"]/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(codigo)) !== null) {
    if (match[1]) imports.push(match[1]);
  }
  return imports;
}

test('fronteira: src/dominio não importa app, ui, preact nem tiptap', () => {
  const proibidos = [
    /^@preact\/signals/,
    /^preact/,
    /^@tiptap/,
    /(?:^|\/)(app|ui)\//,
  ];
  const violacoes: string[] = [];
  for (const arquivo of listarArquivos(join(RAIZ_SRC, 'dominio'))) {
    const rel = relative(RAIZ_SRC, arquivo);
    for (const esp of extrairImports(readFileSync(arquivo, 'utf8'))) {
      if (proibidos.some((re) => re.test(esp))) {
        violacoes.push(`${rel} -> ${esp}`);
      }
    }
  }
  assert.deepEqual(violacoes, [], `Imports proibidos em dominio:\n${violacoes.join('\n')}`);
});

test('fronteira: src/app não importa src/ui', () => {
  const violacoes: string[] = [];
  for (const arquivo of listarArquivos(join(RAIZ_SRC, 'app'))) {
    const rel = relative(RAIZ_SRC, arquivo);
    for (const esp of extrairImports(readFileSync(arquivo, 'utf8'))) {
      if (/(?:^|\/)ui\//.test(esp)) {
        violacoes.push(`${rel} -> ${esp}`);
      }
    }
  }
  assert.deepEqual(violacoes, [], `Imports proibidos em app:\n${violacoes.join('\n')}`);
});

test('fronteira: src/ui não importa quadro-operacoes direto do domínio', () => {
  const violacoes: string[] = [];
  for (const arquivo of listarArquivos(join(RAIZ_SRC, 'ui'))) {
    const rel = relative(RAIZ_SRC, arquivo);
    for (const esp of extrairImports(readFileSync(arquivo, 'utf8'))) {
      if (/quadro-operacoes\.ts$/.test(esp)) {
        violacoes.push(`${rel} -> ${esp}`);
      }
    }
  }
  assert.deepEqual(violacoes, [], `Imports proibidos em ui:\n${violacoes.join('\n')}`);
});

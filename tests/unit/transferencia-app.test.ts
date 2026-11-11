import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { exportarAparelho, importarAparelho } from '../../src/app/transferencia.ts';
import { CHAVE_ARMAZENAMENTO_PONTE } from '../../src/dominio/transferencia.ts';

class ArmazenamentoMock implements Storage {
  private mapa = new Map<string, string>();
  get length() { return this.mapa.size; }
  clear() { this.mapa.clear(); }
  getItem(key: string) { return this.mapa.get(key) ?? null; }
  key(index: number) { return Array.from(this.mapa.keys())[index] ?? null; }
  removeItem(key: string) { this.mapa.delete(key); }
  setItem(key: string, value: string) { this.mapa.set(key, String(value)); }
}

describe('transferencia (app)', () => {
  beforeEach(() => {
    (globalThis as any).localStorage = new ArmazenamentoMock();
  });

  it('exporta e importa com substituir: confere esquema, versão, registros e blob', async () => {
    // 1. Criar banco 1: banco-a (v1) com loja 'itens' e índice 'por-categoria'
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open('banco-a', 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        const store = db.createObjectStore('itens', { keyPath: 'id' });
        store.createIndex('por-categoria', 'categoria', { unique: false });
      };
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction('itens', 'readwrite');
        const blobTeste = new Blob([new Uint8Array([72, 101, 108, 108, 111])], { type: 'text/plain' });
        tx.objectStore('itens').add({
          id: 'item-1',
          categoria: 'armas',
          arquivo: blobTeste,
          nome: 'Espada Longa',
        });
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });

    // 2. Criar banco 2: banco-b (v2) com loja 'notas' (sem keyPath)
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open('banco-b', 2);
      req.onupgradeneeded = () => {
        const db = req.result;
        db.createObjectStore('notas', { autoIncrement: true });
      };
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction('notas', 'readwrite');
        tx.objectStore('notas').add({ texto: 'Anotação secreta' }, 101);
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });

    // localStorage
    localStorage.setItem('tema-preferido', 'escuro');
    localStorage.setItem(CHAVE_ARMAZENAMENTO_PONTE, 'ponte-origem-local');

    // 3. Exportar tudo
    const pacote = await exportarAparelho();
    assert.ok(pacote.size > 0);

    // 4. Apagar bancos para simular outro aparelho vazio
    await new Promise<void>((resolve, reject) => {
      const r1 = indexedDB.deleteDatabase('banco-a');
      r1.onsuccess = () => resolve();
      r1.onerror = () => reject(r1.error);
    });
    await new Promise<void>((resolve, reject) => {
      const r2 = indexedDB.deleteDatabase('banco-b');
      r2.onsuccess = () => resolve();
      r2.onerror = () => reject(r2.error);
    });
    localStorage.clear();
    localStorage.setItem(CHAVE_ARMAZENAMENTO_PONTE, 'ponte-destino-novo');

    // 5. Importar com substituir
    const relatorio = await importarAparelho(pacote, { substituir: true });
    assert.equal(relatorio.bancos.length, 2);
    assert.equal(relatorio.chaves, 1); // tema-preferido (sem ponte)

    // Conferir banco-a
    const dbA = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('banco-a');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    assert.equal(dbA.version, 1);
    assert.ok(dbA.objectStoreNames.contains('itens'));

    const item1 = await new Promise<any>((resolve, reject) => {
      const tx = dbA.transaction('itens', 'readonly');
      const store = tx.objectStore('itens');
      assert.ok(store.indexNames.contains('por-categoria'));
      const q = store.get('item-1');
      q.onsuccess = () => resolve(q.result);
      q.onerror = () => reject(q.error);
    });
    dbA.close();

    assert.ok(item1);
    assert.equal(item1.nome, 'Espada Longa');
    assert.equal(item1.categoria, 'armas');
    assert.ok(item1.arquivo instanceof Blob);
    assert.equal(await item1.arquivo.text(), 'Hello');

    // Conferir banco-b
    const dbB = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('banco-b');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    assert.equal(dbB.version, 2);
    assert.ok(dbB.objectStoreNames.contains('notas'));

    const nota = await new Promise<any>((resolve, reject) => {
      const tx = dbB.transaction('notas', 'readonly');
      const q = tx.objectStore('notas').get(101);
      q.onsuccess = () => resolve(q.result);
      q.onerror = () => reject(q.error);
    });
    dbB.close();

    assert.ok(nota);
    assert.equal(nota.texto, 'Anotação secreta');

    // Conferir localStorage: ponte-destino-novo preservado, tema importado
    assert.equal(localStorage.getItem('tema-preferido'), 'escuro');
    assert.equal(localStorage.getItem(CHAVE_ARMAZENAMENTO_PONTE), 'ponte-destino-novo');
  });

  it('o modo mesclar não apaga o registro que só existe no destino e preserva ponte', async () => {
    // 1. Criar banco 'banco-mescla' com item-1
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open('banco-mescla', 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore('dados', { keyPath: 'id' });
      };
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction('dados', 'readwrite');
        tx.objectStore('dados').add({ id: 'item-1', valor: 'origem' });
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
      };
    });
    localStorage.clear();
    localStorage.setItem('chave-origem', 'valor-1');

    // Exporta pacote com item-1
    const pacote = await exportarAparelho();

    // 2. Modifica o destino: adiciona item-2 que só existe no destino
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open('banco-mescla');
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction('dados', 'readwrite');
        tx.objectStore('dados').add({ id: 'item-2', valor: 'so-no-destino' });
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
      };
    });

    localStorage.setItem('chave-destino-exclusiva', 'fica-aqui');
    localStorage.setItem(CHAVE_ARMAZENAMENTO_PONTE, 'ponte-destino-intocada');

    // 3. Importa com substituir: false (mesclar)
    await importarAparelho(pacote, { substituir: false });

    // Confere que item-1 foi importado e item-2 continuou existindo
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('banco-mescla');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

    const itens = await new Promise<any[]>((resolve, reject) => {
      const tx = db.transaction('dados', 'readonly');
      const req = tx.objectStore('dados').getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    db.close();

    assert.equal(itens.length, 2);
    const id1 = itens.find(i => i.id === 'item-1');
    const id2 = itens.find(i => i.id === 'item-2');
    assert.ok(id1);
    assert.ok(id2);
    assert.equal(id2.valor, 'so-no-destino');

    // Confere localStorage no modo mesclar
    assert.equal(localStorage.getItem('chave-origem'), 'valor-1');
    assert.equal(localStorage.getItem('chave-destino-exclusiva'), 'fica-aqui');
    assert.equal(localStorage.getItem(CHAVE_ARMAZENAMENTO_PONTE), 'ponte-destino-intocada');
  });
});

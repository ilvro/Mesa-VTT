#!/usr/bin/env node
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { execSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const mesaRoot = path.resolve(__dirname, '..');
const distDesktop = path.join(mesaRoot, 'dist-desktop');
const binaryPath = path.join(mesaRoot, 'src-tauri', 'target', 'release', 'mesa-vtt');
const iconPath = path.join(mesaRoot, 'src-tauri', 'icons', '128x128.png');
const PORT = 5100;
const HOST = '127.0.0.1';

// 1. Se o binário nativo Rust/Tauri já estiver compilado, executa diretamente.
if (fs.existsSync(binaryPath)) {
  const child = spawn(binaryPath, process.argv.slice(2), { stdio: 'inherit' });
  child.on('exit', code => process.exit(code ?? 0));
} else {
  iniciarAppDesktop().catch(err => {
    console.error('[Mesa VTT] Falha ao iniciar aplicativo desktop:', err);
    process.exit(1);
  });
}

function portaEmUso(port, host) {
  return new Promise(resolve => {
    const socket = new net.Socket();
    socket.setTimeout(600);
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('timeout', () => { socket.destroy(); resolve(false); });
    socket.once('error', () => { socket.destroy(); resolve(false); });
    socket.connect(port, host);
  });
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wasm': 'application/wasm',
};

function iniciarServidorEstatico(rootDir, port, host) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        const url = new URL(req.url ?? '/', `http://${host}:${port}`);
        let pathname = decodeURIComponent(url.pathname);
        if (pathname === '/' || pathname === '') {
          res.writeHead(302, { Location: '/Mesa/' });
          res.end();
          return;
        }
        let filePath = path.join(rootDir, pathname);
        if (!filePath.startsWith(rootDir)) {
          res.writeHead(403);
          res.end('Forbidden');
          return;
        }
        if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
          if (!pathname.endsWith('/')) {
            res.writeHead(302, { Location: `${pathname}/${url.search}` });
            res.end();
            return;
          }
          filePath = path.join(filePath, 'index.html');
        }
        if (!fs.existsSync(filePath)) {
          // Fallback SPA para sub-aplicativos (/Mesa/*, /Atlas/*, etc.)
          const seg = pathname.split('/').filter(Boolean)[0];
          const spaIndex = seg ? path.join(rootDir, seg, 'index.html') : path.join(rootDir, 'index.html');
          if (fs.existsSync(spaIndex)) {
            filePath = spaIndex;
          } else {
            res.writeHead(404);
            res.end('Not Found');
            return;
          }
        }
        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, {
          'Content-Type': MIME_TYPES[ext] ?? 'application/octet-stream',
          'Cache-Control': 'no-cache',
        });
        fs.createReadStream(filePath).pipe(res);
      } catch (e) {
        res.writeHead(500);
        res.end(String(e));
      }
    });
    server.on('error', reject);
    server.listen(port, host, () => resolve(server));
  });
}

async function iniciarAppDesktop() {
  const jaRodando = await portaEmUso(PORT, HOST);
  let server = null;

  if (!jaRodando) {
    if (!fs.existsSync(path.join(distDesktop, 'Mesa', 'index.html'))) {
      console.log('[Mesa VTT] Preparando pacote desktop (dist-desktop)...');
      execSync('npm run desktop:prep', { cwd: mesaRoot, stdio: 'inherit' });
    }
    server = await iniciarServidorEstatico(distDesktop, PORT, HOST);
  }

  const targetUrl = `http://${HOST}:${PORT}/Mesa/`;
  const dataDir = path.join(os.homedir(), '.local', 'share', 'mesa-vtt');
  fs.mkdirSync(dataDir, { recursive: true });

  const pyScript = `
import sys, os, gi
gi.require_version('Gtk', '3.0')
try:
    gi.require_version('WebKit2', '4.1')
except ValueError:
    gi.require_version('WebKit2', '4.0')
from gi.repository import Gtk, WebKit2, GLib, GdkPixbuf

GLib.set_prgname('mesa-vtt')
GLib.set_application_name('Mesa VTT')

url = sys.argv[1]
icon_path = sys.argv[2]
data_dir = sys.argv[3]

data_manager = WebKit2.WebsiteDataManager(
    base_data_directory=os.path.join(data_dir, 'data'),
    base_cache_directory=os.path.join(data_dir, 'cache')
)
context = WebKit2.WebContext.new_with_website_data_manager(data_manager)
cookie_manager = data_manager.get_cookie_manager()
cookie_manager.set_persistent_storage(
    os.path.join(data_dir, 'cookies.sqlite'),
    WebKit2.CookiePersistentStorage.SQLITE
)

def configurar_webview(wv):
    s = wv.get_settings()
    s.set_enable_webgl(True)
    s.set_enable_webaudio(True)
    s.set_media_playback_requires_user_gesture(False)
    s.set_javascript_can_open_windows_automatically(True)
    s.set_enable_developer_extras(True)
    s.set_hardware_acceleration_policy(WebKit2.HardwareAccelerationPolicy.ALWAYS)

def criar_janela(titulo, w, h, principal=False, relacionada=None):
    win = Gtk.Window(title=titulo)
    win.set_default_size(w, h)
    win.set_wmclass('mesa-vtt', 'Mesa VTT')
    if os.path.exists(icon_path):
        try:
            win.set_icon(GdkPixbuf.Pixbuf.new_from_file(icon_path))
        except Exception:
            pass
    # Janela pedida pela página (window.open): o WebKit exige uma view relacionada à que pediu
    # (mesmo processo e mesmo armazenamento) e carrega o endereço sozinho; sem isso ele aborta.
    wv = WebKit2.WebView(related_view=relacionada) if relacionada else WebKit2.WebView.new_with_context(context)
    configurar_webview(wv)
    # O título da janela acompanha o da página (Atlas, Dossiê, Ateliê…).
    wv.connect('notify::title', lambda v, _p: win.set_title(v.get_title() or titulo))

    def ao_criar_popup(webview, navigation_action):
        filha_win, filha_wv = criar_janela('Mesa VTT', 1280, 800, False, webview)
        filha_wv.connect('ready-to-show', lambda _v: filha_win.show_all())
        return filha_wv

    wv.connect('create', ao_criar_popup)
    wv.connect('close', lambda _v: win.destroy())
    win.add(wv)
    if principal:
        win.connect('destroy', Gtk.main_quit)
    return win, wv

win, wv = criar_janela('Mesa — Plataforma integrada de RPG', 1440, 900, True)
wv.load_uri(url)
win.show_all()
Gtk.main()
`;

  const py = spawn('python3', ['-c', pyScript, targetUrl, iconPath, dataDir], {
    stdio: 'inherit',
  });

  py.on('error', () => {
    spawn('xdg-open', [targetUrl], { stdio: 'ignore', detached: true }).unref();
  });

  py.on('exit', code => {
    if (server) server.close();
    if (code && code !== 0) {
      spawn('xdg-open', [targetUrl], { stdio: 'ignore', detached: true }).unref();
    }
    process.exit(0);
  });
}

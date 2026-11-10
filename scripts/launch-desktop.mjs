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
from gi.repository import Gtk, Gdk, WebKit2, GLib, GdkPixbuf, Pango

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

# Abas como num navegador: cada app aberto pela Mesa vira uma aba; a aba pode ser reordenada, arrastada para fora
# (vira janela) e de volta (todas as janelas compartilham o grupo 'mesa-vtt'). Popups com tamanho e sem barras
# (o projetor do Atlas) continuam em janela própria. A aba da Mesa fica sempre na janela principal.
GRUPO = 'mesa-vtt'
principal = {}

def definir_icone(win):
    win.set_wmclass('mesa-vtt', 'Mesa VTT')
    if os.path.exists(icon_path):
        try:
            win.set_icon(GdkPixbuf.Pixbuf.new_from_file(icon_path))
        except Exception:
            pass

def caminho_do_app(uri):
    # 'http://127.0.0.1:5100/Atlas/?x' -> '/Atlas/'; None se não der para saber.
    try:
        partes = GLib.Uri.parse(uri, GLib.UriFlags.NONE).get_path().split('/')
        return '/' + partes[1] + '/' if len(partes) > 1 and partes[1] else None
    except Exception:
        return None

def todas_as_abas():
    for nb in list(cadernos):
        for i in range(nb.get_n_pages()):
            yield nb, nb.get_nth_page(i)

def focar(nb, wv):
    nb.set_current_page(nb.page_num(wv))
    nb.get_toplevel().present()
    wv.grab_focus()

def rotulo_da_aba(wv, fechavel):
    caixa = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=6)
    texto = Gtk.Label(label='Carregando…')
    texto.set_ellipsize(Pango.EllipsizeMode.END)
    texto.set_max_width_chars(24)
    caixa.pack_start(texto, True, True, 0)
    if fechavel:
        botao = Gtk.Button.new_from_icon_name('window-close-symbolic', Gtk.IconSize.MENU)
        botao.set_relief(Gtk.ReliefStyle.NONE)
        botao.set_focus_on_click(False)
        botao.connect('clicked', lambda _b: fechar_aba(wv))
        caixa.pack_start(botao, False, False, 0)
    caixa.show_all()
    wv.connect('notify::title', lambda v, _p: texto.set_text(v.get_title() or 'Sem título'))
    return caixa

def fechar_aba(wv):
    if wv is principal.get('mesa'):
        return
    nb = wv.get_parent()
    if isinstance(nb, Gtk.Notebook):
        nb.remove_page(nb.page_num(wv))
    wv.destroy()

def atalhos(win, ev):
    nb = win.get_child()
    if not isinstance(nb, Gtk.Notebook) or not (ev.state & Gdk.ModifierType.CONTROL_MASK):
        return False
    n, atual, k = nb.get_n_pages(), nb.get_current_page(), ev.keyval
    if k in (Gdk.KEY_Tab, Gdk.KEY_Page_Down) and n > 1:
        nb.set_current_page((atual + 1) % n); return True
    if k in (Gdk.KEY_ISO_Left_Tab, Gdk.KEY_Page_Up) and n > 1:
        nb.set_current_page((atual - 1) % n); return True
    if k in (Gdk.KEY_w, Gdk.KEY_W):
        fechar_aba(nb.get_nth_page(atual)); return True
    return False

cadernos = []

def nova_janela_com_abas(w, h, eh_principal=False):
    win = Gtk.Window(title='Mesa VTT')
    win.set_default_size(w, h)
    definir_icone(win)
    nb = Gtk.Notebook()
    nb.set_scrollable(True)
    nb.set_group_name(GRUPO)
    cadernos.append(nb)
    nb.connect('switch-page', lambda _n, pag, _i: win.set_title(pag.get_title() or 'Mesa VTT'))
    nb.connect('create-window', ao_soltar_fora)
    if not eh_principal:
        def esvaziou(n, _pag, _i):
            if n.get_n_pages() == 0:
                GLib.idle_add(lambda: (win.destroy(), False)[1])
        nb.connect('page-removed', esvaziou)
    win.connect('destroy', lambda _w: cadernos.remove(nb) if nb in cadernos else None)
    win.connect('key-press-event', atalhos)
    win.add(nb)
    return win, nb

def ao_soltar_fora(_nb, _pag, x, y):
    win, nb = nova_janela_com_abas(1280, 800)
    win.move(x, y)
    win.show_all()
    return nb

def acrescentar_aba(nb, wv, fechavel=True):
    i = nb.append_page(wv, rotulo_da_aba(wv, fechavel))
    nb.set_tab_reorderable(wv, True)
    nb.set_tab_detachable(wv, fechavel)
    wv.connect('notify::title', lambda v, _p: v.get_toplevel().set_title(v.get_title() or 'Mesa VTT') if isinstance(v.get_parent(), Gtk.Notebook) and v.get_parent().get_nth_page(v.get_parent().get_current_page()) is v else None)
    wv.show()
    nb.set_current_page(i)

def preparar_view(wv):
    configurar_webview(wv)
    wv.connect('create', ao_pedir_janela)
    wv.connect('close', lambda v: fechar_aba(v) if isinstance(v.get_parent(), Gtk.Notebook) else v.get_toplevel().destroy())

def ao_pedir_janela(origem, acao):
    req = acao.get_request()
    uri = req.get_uri() if req else ''
    # O app pedido já está aberto numa aba (mesma raiz, sem parâmetros): vai para ela em vez de abrir outra.
    raiz = caminho_do_app(uri)
    if raiz and uri.split('?')[0].split('#')[0].endswith(raiz) and '?' not in uri:
        for nb, wv in todas_as_abas():
            if caminho_do_app(wv.get_uri() or '') == raiz:
                focar(nb, wv)
                return None
    # Popup com tamanho próprio (o projetor: window.open(url, 'atlas-projetor', 'popup,width=…')) fica em janela separada.
    # Um '_blank' comum herda o tamanho da janela de origem: esse vira aba. (O WebKit não informa o nome nem as barras.)
    largura_origem, altura_origem = origem.get_toplevel().get_size()
    nova = WebKit2.WebView(related_view=origem)
    preparar_view(nova)

    def pronta(v):
        geo = v.get_window_properties().get_geometry()
        if geo.width > 0 and geo.height > 0 and (abs(geo.width - largura_origem) > 2 or abs(geo.height - altura_origem) > 2):
            win = Gtk.Window(title='Mesa VTT')
            definir_icone(win)
            win.set_default_size(geo.width if geo.width > 0 else 1280, geo.height if geo.height > 0 else 720)
            if geo.width > 0 and geo.height > 0:
                win.move(geo.x, geo.y)
            v.connect('notify::title', lambda vv, _p: win.set_title(vv.get_title() or 'Mesa VTT'))
            win.add(v)
            win.show_all()
        else:
            nb = origem.get_parent() if isinstance(origem.get_parent(), Gtk.Notebook) else principal['caderno']
            acrescentar_aba(nb, v)
            nb.get_toplevel().present()
    nova.connect('ready-to-show', pronta)
    return nova

win, caderno = nova_janela_com_abas(1440, 900, True)
principal['caderno'] = caderno
win.set_title('Mesa — Plataforma integrada de RPG')
win.connect('destroy', Gtk.main_quit)
mesa = WebKit2.WebView.new_with_context(context)
preparar_view(mesa)
principal['mesa'] = mesa
acrescentar_aba(caderno, mesa, False)
mesa.load_uri(url)
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

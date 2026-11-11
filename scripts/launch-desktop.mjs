#!/usr/bin/env node
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { execSync, spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const mesaRoot = path.resolve(__dirname, '..');
const distDesktop = path.join(mesaRoot, 'dist-desktop');
const binaryPath = path.join(mesaRoot, 'src-tauri', 'target', 'release', 'mesa-vtt');
const iconPath = path.join(mesaRoot, 'src-tauri', 'icons', '128x128.png');
const PORT = 5100;
const HOST = '127.0.0.1';

// 1. Se o binário nativo Rust/Tauri já estiver compilado, executa diretamente.
// (Só quando o arquivo é executado; importá-lo, como nos testes, não tem efeitos.)
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (fs.existsSync(binaryPath)) {
    const child = spawn(binaryPath, process.argv.slice(2), { stdio: 'inherit' });
    child.on('exit', code => process.exit(code ?? 0));
  } else {
    iniciarAppDesktop().catch(err => {
      console.error('[Mesa VTT] Falha ao iniciar aplicativo desktop:', err);
      process.exit(1);
    });
  }
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

export function iniciarServidorEstatico(rootDir, port, host) {
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

/**
 * Sobe o servidor estático e, se o Atlas (irmão da Mesa) estiver disponível, hospeda nele a ponte do assistente
 * (`/__ponte`, token em `Atlas/.ponte`). Sem o Atlas ou sem `node_modules`, avisa no stderr e segue sem a ponte.
 * Com `port` 0 a origem da ponte acompanha a porta sorteada.
 */
export async function iniciarServidorComPonte({ rootDir, port, host, raizAtlas = path.resolve(mesaRoot, '..', 'Atlas'), pastaDoToken = path.join(raizAtlas, '.ponte') }) {
  const server = await iniciarServidorEstatico(rootDir, port, host);
  const porta = server.address().port;
  let ponte = null;
  try {
    const modulo = await import(pathToFileURL(path.join(raizAtlas, 'scripts', 'ponte', 'servidor.ts')).href);
    ponte = modulo.criarPonte({ origem: `http://${host}:${porta}`, pastaDoToken });
    server.on('upgrade', (req, socket, cabeca) => {
      if ((req.url ?? '').split('?')[0] === modulo.CAMINHO_DA_PONTE && ponte.aceitar(req, socket, cabeca)) return;
      socket.destroy();
    });
  } catch (e) {
    ponte = null;
    console.error('[Mesa VTT] Ponte do assistente indisponível (o app abre sem ela):', e instanceof Error ? e.message : e);
    server.on('upgrade', (_req, socket) => socket.destroy());
  }
  return { server, ponte, porta, fechar() { try { ponte?.fechar?.(); } catch {} server.close(); server.closeAllConnections?.(); } };
}

async function iniciarAppDesktop() {
  const jaRodando = await portaEmUso(PORT, HOST);
  let hospedeiro = null;

  if (!jaRodando) {
    if (!fs.existsSync(path.join(distDesktop, 'Mesa', 'index.html'))) {
      console.log('[Mesa VTT] Preparando pacote desktop (dist-desktop)...');
      execSync('npm run desktop:prep', { cwd: mesaRoot, stdio: 'inherit' });
    }
    hospedeiro = await iniciarServidorComPonte({ rootDir: distDesktop, port: PORT, host: HOST });
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

def ao_decidir_destino(download, nome_sugerido):
    pasta_downloads = GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_DOWNLOAD) or os.path.expanduser('~/Downloads')
    os.makedirs(pasta_downloads, exist_ok=True)
    caminho = os.path.join(pasta_downloads, nome_sugerido)
    if os.path.exists(caminho):
        raiz, ext = os.path.splitext(nome_sugerido)
        contador = 2
        while True:
            novo_nome = '%s (%d)%s' % (raiz, contador, ext)
            caminho_teste = os.path.join(pasta_downloads, novo_nome)
            if not os.path.exists(caminho_teste):
                caminho = caminho_teste
                break
            contador += 1
    uri_destino = GLib.filename_to_uri(os.path.abspath(caminho))
    download.set_destination(uri_destino)
    return True

def ao_iniciar_download(_ctx, download):
    download.connect('decide-destination', ao_decidir_destino)

context.connect('download-started', ao_iniciar_download)

# Cada página avisa os parâmetros de window.open antes de abrir: com 'popup' ou tamanho (o projetor) vira janela,
# sem eles vira aba. O WebKit não conta isso ao 'create', e o tamanho que ele informa não é confiável.
pedidos = []
conteudo = WebKit2.UserContentManager()
def ao_pedido(_c, resultado):
    try:
        pedidos.append(resultado.get_js_value().to_string())
    except Exception:
        pedidos.append('')
conteudo.connect('script-message-received::mesaJanela', ao_pedido)
conteudo.register_script_message_handler('mesaJanela')
conteudo.add_script(WebKit2.UserScript.new(
    "(function(){var o=window.open;window.open=function(u,n,f){try{window.webkit.messageHandlers.mesaJanela.postMessage(String(f||''))}catch(e){}return o.apply(window,arguments)}})();",
    WebKit2.UserContentInjectedFrames.TOP_FRAME, WebKit2.UserScriptInjectionTime.START, None, None))

# Escolha de pasta (input webkitdirectory, usado pela Jukebox para carregar presets): o WebKitGTK não a implementa e
# entrega a pasta como se fosse um arquivo. A página avisa antes de abrir o seletor; o atalho mostra um seletor de
# pasta e entrega todos os arquivos dela (com subpastas).
pasta_pedida = [False]
conteudo.connect('script-message-received::mesaPasta', lambda _c, _r: pasta_pedida.__setitem__(0, True))
conteudo.register_script_message_handler('mesaPasta')
conteudo.add_script(WebKit2.UserScript.new(
    "(function(){var c=HTMLElement.prototype.click;HTMLInputElement.prototype.click=function(){try{if(this.type==='file'&&(this.webkitdirectory||this.hasAttribute('webkitdirectory'))){window.webkit.messageHandlers.mesaPasta.postMessage('')}}catch(e){}return c.apply(this,arguments)}})();",
    WebKit2.UserContentInjectedFrames.ALL_FRAMES, WebKit2.UserScriptInjectionTime.START, None, None))

def ao_escolher_arquivo(wv, pedido):
    if not pasta_pedida[0]:
        return False
    pasta_pedida[0] = False
    dialogo = Gtk.FileChooserNative.new('Escolha a pasta', wv.get_toplevel(), Gtk.FileChooserAction.SELECT_FOLDER, 'Escolher', 'Cancelar')
    if dialogo.run() != Gtk.ResponseType.ACCEPT:
        pedido.cancel()
        return True
    raiz = dialogo.get_filename()
    arquivos = []
    for atual, pastas, nomes in os.walk(raiz):
        pastas[:] = [d for d in pastas if not d.startswith('.')]
        arquivos += [os.path.join(atual, n) for n in nomes if not n.startswith('.')]
    if arquivos:
        pedido.select_files(sorted(arquivos))
    else:
        pedido.cancel()
    return True

def configurar_webview(wv):
    s = wv.get_settings()
    s.set_user_agent_with_application_details('MesaVTT', '1')
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
    texto.set_width_chars(10)
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
                # Só depois que o arrastar termina: destruir o caderno de onde a aba saiu, no meio do arrastar, derruba o GTK.
                GLib.timeout_add(400, lambda: (win.destroy() if n.get_n_pages() == 0 else None, False)[1])
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
    wv.connect('decide-policy', ao_decidir)
    wv.connect('run-file-chooser', ao_escolher_arquivo)
    wv.connect('close', lambda v: fechar_aba(v) if isinstance(v.get_parent(), Gtk.Notebook) else v.get_toplevel().destroy())

def aba_existente(uri):
    # O app pedido já está aberto numa aba (mesma raiz, sem parâmetros): devolve (caderno, view).
    raiz = caminho_do_app(uri)
    if raiz and '?' not in uri and uri.split('#')[0].endswith(raiz):
        for nb, wv in todas_as_abas():
            if caminho_do_app(wv.get_uri() or '') == raiz:
                return nb, wv
    return None

def ao_decidir(origem, decisao, tipo):
    # window.open com 'noopener' (e links target=_blank) não passam pelo 'create': chegam aqui. Viram aba nova.
    if tipo != WebKit2.PolicyDecisionType.NEW_WINDOW_ACTION:
        return False
    pedidos.clear()
    req = decisao.get_navigation_action().get_request()
    uri = req.get_uri() if req else ''
    decisao.ignore()
    if not uri:
        return True
    achada = aba_existente(uri)
    if achada:
        focar(*achada)
        return True
    nova = WebKit2.WebView(web_context=context, user_content_manager=conteudo)
    preparar_view(nova)
    nb = origem.get_parent() if isinstance(origem.get_parent(), Gtk.Notebook) else principal['caderno']
    acrescentar_aba(nb, nova)
    nova.load_uri(uri)
    nb.get_toplevel().present()
    return True

def ao_pedir_janela(origem, acao):
    caracteristicas = pedidos[-1] if pedidos else ''
    pedidos.clear()
    req = acao.get_request()
    uri = req.get_uri() if req else ''
    achada = aba_existente(uri)
    if achada:
        focar(*achada)
        return None
    em_janela = 'popup' in caracteristicas or 'width' in caracteristicas
    nova = WebKit2.WebView(related_view=origem, user_content_manager=conteudo)
    preparar_view(nova)

    def pronta(v):
        geo = v.get_window_properties().get_geometry()
        if em_janela:
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
mesa = WebKit2.WebView(web_context=context, user_content_manager=conteudo)
preparar_view(mesa)
principal['mesa'] = mesa
acrescentar_aba(caderno, mesa, False)
mesa.load_uri(url)
win.show_all()
Gtk.main()
`;

  // GTK 3 no Wayland derruba o processo ao arrastar uma aba para fora da janela (gtk_notebook_drag_end);
  // pelo XWayland o arrastar de abas funciona.
  const py = spawn('python3', ['-c', pyScript, targetUrl, iconPath, dataDir], {
    stdio: 'inherit',
    env: { ...process.env, GDK_BACKEND: 'x11' },
  });

  py.on('error', () => {
    spawn('xdg-open', [targetUrl], { stdio: 'ignore', detached: true }).unref();
  });

  py.on('exit', code => {
    if (hospedeiro) hospedeiro.fechar();
    if (code && code !== 0) {
      spawn('xdg-open', [targetUrl], { stdio: 'ignore', detached: true }).unref();
    }
    process.exit(0);
  });
}

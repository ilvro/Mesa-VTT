import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const mesaRoot = path.resolve(__dirname, '..');
const binaryPath = path.join(mesaRoot, 'src-tauri', 'target', 'release', 'mesa-vtt');
const iconSrc = path.join(mesaRoot, 'src-tauri', 'icons', '128x128.png');

const homeDir = os.homedir();
const appsDir = path.join(homeDir, '.local', 'share', 'applications');
const iconsDir = path.join(homeDir, '.local', 'share', 'icons', 'hicolor', '128x128', 'apps');
const desktopFile = path.join(appsDir, 'mesa-vtt.desktop');
const iconDest = path.join(iconsDir, 'mesa-vtt.png');

// Cria diretórios se não existirem
fs.mkdirSync(appsDir, { recursive: true });
fs.mkdirSync(iconsDir, { recursive: true });

// Copia o ícone
if (fs.existsSync(iconSrc)) {
  fs.copyFileSync(iconSrc, iconDest);
  console.log(`[desktop:install] Ícone instalado em: ${iconDest}`);
} else {
  console.warn(`[desktop:install] Aviso: ícone fonte não encontrado em ${iconSrc}`);
}

const hasBinary = fs.existsSync(binaryPath);
let execCommand = binaryPath;

if (!hasBinary) {
  console.log(`[desktop:install] Aviso: o binário nativo ainda não foi compilado em:`);
  console.log(`  ${binaryPath}`);
  console.log(`  Configurando atalho com fallback para 'npm --prefix "${mesaRoot}" run desktop:dev'.`);
  console.log(`  Para compilar o binário nativo final, execute: npm run desktop:build`);
  execCommand = `npm --prefix "${mesaRoot}" run desktop:dev`;
} else {
  console.log(`[desktop:install] Binário nativo encontrado: ${binaryPath}`);
}

const desktopContent = `[Desktop Entry]
Version=1.0
Type=Application
Name=Mesa VTT
Comment=Plataforma integrada de RPG de mesa (Mesa, Atlas, Dossiê, Ateliê, Jukebox, Tabletop)
Exec=${execCommand}
Icon=mesa-vtt
Terminal=false
Categories=Game;RolePlaying;
StartupWMClass=mesa-vtt
`;

fs.writeFileSync(desktopFile, desktopContent, { mode: 0o755 });
console.log(`[desktop:install] Atalho .desktop criado em: ${desktopFile}`);

// Atualiza o banco de dados do desktop se a ferramenta estiver presente
try {
  execSync(`update-desktop-database "${appsDir}" 2>/dev/null`);
  console.log(`[desktop:install] Banco de dados de desktop atualizado com sucesso.`);
} catch {
  // Ignora se update-desktop-database falhar ou não estiver no PATH
}

console.log(`\n🎉 Instalação do atalho concluída!`);
console.log(`Você já pode pesquisar por "Mesa VTT" no menu de aplicativos do sistema e fixá-lo na barra de tarefas.`);

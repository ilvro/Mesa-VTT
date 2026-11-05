import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

// `base: './'` mantém o site funcionando em qualquer caminho (GitHub Pages: https://<conta>.github.io/Mesa/).
// Atrás do `mesa-dev` (todos os projetos numa origem só), o Vite serve sob o prefixo do projeto (`/Mesa/`): `npm run dev:mesa`.
const prefixo = process.env.MESA_DEV_PREFIX;

export default defineConfig({
  base: prefixo ?? './',
  plugins: [preact()],
  build: { target: 'es2023', sourcemap: true },
  server: { host: '127.0.0.1', port: 5195, strictPort: true },
});

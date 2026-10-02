import { resolve } from 'path';
import { cpSync, existsSync } from 'fs';

const root = import.meta.dirname;

export default {
  base: './', // hosted in a subdirectory on the LAMP server
  plugins: [
    {
      // AssetRegistry loads models/textures with runtime URLs (./assets/...).
      // Vite serves the repo-root assets folder during development, but does
      // not copy string-referenced files into dist automatically, so copy the
      // selected theme bundle after every production build.
      name: 'copy-game-assets',
      closeBundle() {
        const from = resolve(root, 'assets');
        const to = resolve(root, 'dist/assets');
        if (existsSync(from)) cpSync(from, to, { recursive: true });
      },
    },
  ],
  build: {
    rollupOptions: {
      input: {
        main: resolve(root, 'index.html'),
        level2: resolve(root, 'level2.html'),
      },
    },
  },
};

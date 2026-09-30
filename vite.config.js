import { resolve } from 'path';
import { cpSync } from 'node:fs';

function copyRuntimeAssets() {
  return {
    name: 'copy-runtime-assets',
    apply: 'build',
    closeBundle() {
      cpSync(
        resolve(import.meta.dirname, 'assets'),
        resolve(import.meta.dirname, 'dist', 'assets'),
        { recursive: true },
      );
    },
  };
}

export default {
  base: './', // CRITICAL: game is hosted in a subdirectory on the LAMP server,
              // not at the domain root. Do not remove this line.
  plugins: [copyRuntimeAssets()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        level2: resolve(import.meta.dirname, 'level2.html'), // 2A: highway/Handler AI demo page
      },
    },
  },
};

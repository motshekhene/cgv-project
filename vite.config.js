import { resolve } from 'path';

export default {
  base: './', // CRITICAL: game is hosted in a subdirectory on the LAMP server,
              // not at the domain root. Do not remove this line.
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        level2: resolve(import.meta.dirname, 'level2.html'), // 2A: highway/Handler AI demo page
      },
    },
  },
};
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// SINGLE=1 genera un único index.html autocontenido (fuentes incluidas) para compartir o abrir sin internet.
const single = process.env.SINGLE === '1';

export default defineConfig({
  plugins: [react(), tailwindcss(), ...(single ? [viteSingleFile()] : [])],
  build: { outDir: single ? 'dist-single' : 'dist', chunkSizeWarningLimit: 2000 },
});

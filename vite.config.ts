import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      // Ignore the telemetry data store: it is rewritten on every capture, and
      // watching it causes an infinite reload loop (write -> reload -> recapture).
      watch: process.env.DISABLE_HMR === 'true'
        ? null
        : { ignored: [
            '**/workspace-sessions.json',
            '**/desktop-briefs.json',
            '**/autopilot-learning.json',
            '**/fleet-projects.json',
            '**/fleet-progress.json',
            '**/android/**'
          ] },
    },
  };
});

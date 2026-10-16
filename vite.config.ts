import { defineConfig, type Plugin } from 'vite';

/** The one runtime script we allow: the CrazyGames SDK. Everything else is bundled. */
const SDK = '<script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>';

function html(): Plugin {
  return {
    name: 'game-html',
    transformIndexHtml: (src) => src.replace('%PLATFORM_SDK%', SDK),
  };
}

export default defineConfig({
  base: './',
  plugins: [html()],
  build: {
    target: 'es2020',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 900,
    modulePreload: { polyfill: false },
    reportCompressedSize: false,
    manifest: true,
  },
});

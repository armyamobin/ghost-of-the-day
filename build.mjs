/**
 * Assembles the single-file playable previews:
 *   public/ghost.css + preview/mock-server.js + the built client bundle.
 *
 * Run from the repo root:  npm run build && node preview/build.mjs
 */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

const read = (...parts) => readFile(resolve(root, ...parts), 'utf8');
// Never let a stray </script> inside a bundle close the inline tag early.
const safe = text => text.replaceAll('</script', '<\\/script');

const [css, mock, gameJs, splashJs] = await Promise.all([
  read('public/ghost.css'),
  read('preview/mock-server.js'),
  read('public/game.js'),
  read('public/splash.js'),
]);

async function build({ shell, app, out, label }) {
  const html = (await read('preview', shell))
    .replace('/*{{CSS}}*/', () => css)
    .replace('/*{{MOCK}}*/', () => safe(mock))
    .replace('/*{{APP}}*/', () => safe(app));
  await writeFile(resolve(here, out), html, 'utf8');
  console.log(`${label}: preview/${out} (${(html.length / 1024).toFixed(1)} kB)`);
}

await build({
  shell: 'shell.html',
  app: gameJs,
  out: 'ghost-of-the-day-preview.html',
  label: 'game',
});
await build({
  shell: 'shell-splash.html',
  app: splashJs,
  out: 'ghost-of-the-day-inline-preview.html',
  label: 'inline post',
});

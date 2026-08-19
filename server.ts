const port = Number(Bun.env.PORT ?? 3000);
const distRoot = `${import.meta.dir}/dist`;

function contentType(pathname: string): string | undefined {
  const extension = pathname.split('.').pop()?.toLowerCase();
  return {
    html: 'text/html; charset=utf-8',
    js: 'text/javascript; charset=utf-8',
    css: 'text/css; charset=utf-8',
    json: 'application/json; charset=utf-8',
    svg: 'image/svg+xml',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    ico: 'image/x-icon',
    map: 'application/json; charset=utf-8',
  }[extension ?? ''];
}

const server = Bun.serve({
  port,
  async fetch(request) {
    const url = new URL(request.url);
    const decodedPath = decodeURIComponent(url.pathname);
    const relativePath = decodedPath === '/' ? 'index.html' : decodedPath.replace(/^\/+/, '');

    if (relativePath.split('/').includes('..')) {
      return new Response('Bad request', { status: 400 });
    }

    const asset = Bun.file(`${distRoot}/${relativePath}`);
    if (await asset.exists()) {
      return new Response(asset, {
        headers: contentType(relativePath) ? { 'Content-Type': contentType(relativePath)! } : undefined,
      });
    }

    const appShell = Bun.file(`${distRoot}/index.html`);
    if (await appShell.exists()) {
      return new Response(appShell, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    return new Response('Build not found. Run `bun run build` first.', { status: 404 });
  },
});

console.log(`Cell-State Adaptive is running at ${server.url}`);

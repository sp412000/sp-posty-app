const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const postsDir = path.join(__dirname, 'posts');

if (!fs.existsSync(postsDir)) {
  fs.mkdirSync(postsDir, { recursive: true });
}

function getPostFiles() {
  return fs.readdirSync(postsDir)
    .filter((file) => file.endsWith('.md'))
    .sort()
    .map((file) => file.replace(/\.md$/, ''));
}

function getPostData(slug) {
  const filePath = path.join(postsDir, `${slug}.md`);
  if (!fs.existsSync(filePath)) {
    return null;
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const titleMatch = content.match(/^#\s+(.+)$/m);
  const title = titleMatch ? titleMatch[1] : slug.replace(/-/g, ' ');

  return {
    slug,
    title,
    content,
    html: renderMarkdown(content)
  };
}

function createSlug(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'new-post';
}

function renderMarkdown(content) {
  return content
    .split(/\n{2,}/)
    .map((block) => {
      const trimmed = block.trim();
      if (!trimmed) return '';

      if (/^#{1,6}\s+/.test(trimmed)) {
        const level = trimmed.match(/^#+/)[0].length;
        const text = trimmed.replace(/^#{1,6}\s+/, '');
        return `<h${level}>${escapeHtml(text)}</h${level}>`;
      }

      if (/^-\s+/.test(trimmed)) {
        const items = trimmed
          .split('\n')
          .filter((line) => line.trim().startsWith('- '))
          .map((line) => `<li>${escapeHtml(line.replace(/^-\s+/, ''))}</li>`)
          .join('');
        return `<ul>${items}</ul>`;
      }

      return `<p>${escapeHtml(trimmed.replace(/\n/g, ' '))}</p>`;
    })
    .filter(Boolean)
    .join('');
}

function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function renderLayout(title, content) {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 0; padding: 2rem; background: #f8fafc; color: #0f172a; }
      main { max-width: 900px; margin: 0 auto; background: white; padding: 2rem; border-radius: 12px; box-shadow: 0 8px 24px rgba(15, 23, 42, 0.08); }
      a { color: #2563eb; text-decoration: none; }
      ul { padding-left: 1.2rem; }
      .meta { color: #64748b; margin-bottom: 1rem; }
      form { display: flex; flex-direction: column; gap: 0.8rem; }
      input, textarea { padding: 0.7rem; border: 1px solid #cbd5e1; border-radius: 8px; font: inherit; }
      button { padding: 0.7rem 1rem; border: 0; border-radius: 8px; background: #2563eb; color: white; cursor: pointer; }
      .hint { color: #64748b; font-size: 0.95rem; }
    </style>
  </head>
  <body>
    <main>
      ${content}
    </main>
  </body>
</html>`;
}

function renderPostList(posts) {
  return posts.map((slug) => `<li><a href="/posts/${slug}">${slug.replace(/-/g, ' ')}</a></li>`).join('');
}

function renderHomePage() {
  const posts = getPostFiles();
  const listItems = posts
    .map((slug) => {
      const post = getPostData(slug);
      return `<li><a href="/posts/${slug}">${post.title}</a></li>`;
    })
    .join('');

  return renderLayout(
    'Markdown Posts',
    `<h1>Markdown Posts</h1><p>Browse the available posts below.</p><p><a href="/new">Create a new markdown post</a></p><ul>${listItems}</ul>`
  );
}

function renderNewPostPage(errorMessage = '') {
  const errorHtml = errorMessage ? `<p style="color: #dc2626;">${escapeHtml(errorMessage)}</p>` : '';
  return renderLayout(
    'New Post',
    `<h1>Create a new markdown post</h1>${errorHtml}<form method="POST" action="/posts">
      <label for="title">Title</label>
      <input id="title" name="title" required placeholder="My new post" />
      <label for="slug">Slug</label>
      <input id="slug" name="slug" placeholder="my-new-post" />
      <p class="hint">Leave slug blank to auto-generate it from the title.</p>
      <label for="content">Content</label>
      <textarea id="content" name="content" rows="10" required placeholder="Write your markdown content here"></textarea>
      <button type="submit">Create post</button>
    </form>`
  );
}

function collectBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
    });
    req.on('end', () => resolve(body));
  });
}

async function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'POST' && url.pathname === '/posts') {
    const body = await collectBody(req);
    const params = new URLSearchParams(body);
    const title = (params.get('title') || '').trim();
    const slugInput = (params.get('slug') || '').trim();
    const content = (params.get('content') || '').trim();

    if (!title || !content) {
      const html = renderNewPostPage('Title and content are required.');
      res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }

    const slug = createSlug(slugInput || title);
    const filePath = path.join(postsDir, `${slug}.md`);

    if (fs.existsSync(filePath)) {
      const html = renderNewPostPage(`A post with the slug "${escapeHtml(slug)}" already exists.`);
      res.writeHead(409, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }

    const markdown = `# ${title}\n\n${content}`;
    fs.writeFileSync(filePath, markdown, 'utf8');

    res.writeHead(302, { Location: `/posts/${slug}` });
    res.end();
    return;
  }

  if (url.pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(renderHomePage());
    return;
  }

  if (url.pathname === '/new') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(renderNewPostPage());
    return;
  }

  if (url.pathname === '/posts') {
    const posts = getPostFiles();
    const html = renderLayout('Posts', `<h1>All Posts</h1><p><a href="/new">Create a new markdown post</a></p><ul>${renderPostList(posts)}</ul>`);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
    return;
  }

  const matches = url.pathname.match(/^\/posts\/([^/]+)$/);
  if (matches) {
    const post = getPostData(matches[1]);

    if (!post) {
      const html = renderLayout('Not Found', '<h1>Post not found</h1><p>The requested markdown post does not exist.</p>');
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }

    const html = renderLayout(post.title, `<h1>${post.title}</h1><div class="meta">Markdown post from the posts folder</div><p><a href="/new">Create another post</a></p>${post.html}`);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
    return;
  }

  const html = renderLayout('Not Found', '<h1>Page not found</h1><p>The page you requested does not exist.</p>');
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(html);
}

const server = http.createServer((req, res) => {
  handleRequest(req, res).catch((error) => {
    console.error(error);
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Internal Server Error');
  });
});

server.listen(PORT, () => {
  console.log(`Markdown posts app is running at http://localhost:${PORT}`);
});

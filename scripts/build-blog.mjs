/**
 * Build the blog from Markdown sources.
 *
 * 1. Write a post: blog/posts/my-slug.md
 * 2. Run:        node scripts/build-blog.mjs
 * 3. Commit the generated HTML + posts.json
 *
 * Frontmatter (YAML-like, simple keys only):
 *   ---
 *   title: My post title
 *   date: 2026-08-10
 *   blurb: One or two sentences for the blog index.
 *   ---
 *
 * Body is Markdown (headings, paragraphs, lists, links, code, blockquotes).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const postsDir = path.join(root, "blog", "posts");
const blogOutDir = path.join(root, "blog");
const postsJsonPath = path.join(blogOutDir, "posts.json");
const blogIndexPath = path.join(root, "blog.html");

function parseFrontmatter(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) {
    throw new Error("Post is missing frontmatter (--- title/date/blurb ---).");
  }
  const meta = {};
  for (const line of match[1].split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!m) continue;
    meta[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return { meta, body: match[2].trim() };
}

function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inlineFormat(text) {
  let s = escapeHtml(text);
  s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  s = s.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2">$1</a>'
  );
  return s;
}

/** Minimal Markdown → HTML for blog posts */
function markdownToHtml(md) {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out = [];
  let i = 0;
  let inUl = false;
  let inOl = false;
  let inCode = false;
  let codeBuf = [];

  function closeLists() {
    if (inUl) {
      out.push("</ul>");
      inUl = false;
    }
    if (inOl) {
      out.push("</ol>");
      inOl = false;
    }
  }

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith("```")) {
      if (inCode) {
        out.push(
          "<pre><code>" + escapeHtml(codeBuf.join("\n")) + "</code></pre>"
        );
        codeBuf = [];
        inCode = false;
      } else {
        closeLists();
        inCode = true;
      }
      i++;
      continue;
    }
    if (inCode) {
      codeBuf.push(line);
      i++;
      continue;
    }

    if (!line.trim()) {
      closeLists();
      i++;
      continue;
    }

    const h = line.match(/^(#{1,3})\s+(.+)$/);
    if (h) {
      closeLists();
      const level = h[1].length;
      out.push(`<h${level}>${inlineFormat(h[2])}</h${level}>`);
      i++;
      continue;
    }

    if (line.startsWith("> ")) {
      closeLists();
      const quote = [line.slice(2)];
      i++;
      while (i < lines.length && lines[i].startsWith("> ")) {
        quote.push(lines[i].slice(2));
        i++;
      }
      out.push(`<blockquote>${inlineFormat(quote.join(" "))}</blockquote>`);
      continue;
    }

    const ul = line.match(/^[-*]\s+(.+)$/);
    if (ul) {
      if (inOl) {
        out.push("</ol>");
        inOl = false;
      }
      if (!inUl) {
        out.push("<ul>");
        inUl = true;
      }
      out.push(`<li>${inlineFormat(ul[1])}</li>`);
      i++;
      continue;
    }

    const ol = line.match(/^\d+\.\s+(.+)$/);
    if (ol) {
      if (inUl) {
        out.push("</ul>");
        inUl = false;
      }
      if (!inOl) {
        out.push("<ol>");
        inOl = true;
      }
      out.push(`<li>${inlineFormat(ol[1])}</li>`);
      i++;
      continue;
    }

    closeLists();
    out.push(`<p>${inlineFormat(line)}</p>`);
    i++;
  }
  closeLists();
  if (inCode) {
    out.push("<pre><code>" + escapeHtml(codeBuf.join("\n")) + "</code></pre>");
  }
  return out.join("\n");
}

function formatDisplayDate(iso) {
  // Accept YYYY-MM-DD
  const d = new Date(iso + "T12:00:00");
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function postPageHtml({ title, date, blurb, bodyHtml }) {
  const displayDate = formatDisplayDate(date);
  const desc = escapeHtml(blurb || title);
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="description" content="${desc}" />
    <title>${escapeHtml(title)} · Caio Miguel</title>
    <link rel="stylesheet" href="../css/style.css" />
  </head>
  <body>
    <div class="bg-grid" aria-hidden="true"></div>

    <header class="site-nav">
      <a class="logo" href="../index.html">Caio <span>Miguel</span></a>
      <button
        class="nav-toggle"
        type="button"
        aria-label="Open menu"
        aria-expanded="false"
      >
        ☰
      </button>
      <ul class="nav-links">
        <li><a href="../index.html">Home</a></li>
        <li><a href="../resume.html">Resume</a></li>
        <li><a href="../projects.html">Projects</a></li>
        <li><a class="active" href="../blog.html">Blog</a></li>
        <li><a href="../contact.html">Contact</a></li>
      </ul>
    </header>

    <main class="page container">
      <article class="article">
        <a class="back-link" href="../blog.html">← All posts</a>

        <header>
          <p class="date">${escapeHtml(displayDate)}</p>
          <h1>${escapeHtml(title)}</h1>
        </header>

        <div class="article-body">
${bodyHtml
  .split("\n")
  .map((l) => "          " + l)
  .join("\n")}
        </div>
      </article>
    </main>

    <footer class="site-footer">
      <p>
        <a href="../index.html">Home</a> ·
        <a href="../contact.html">Contact</a>
      </p>
    </footer>

    <script src="../js/main.js"></script>
  </body>
</html>
`;
}

function blogIndexHtml(posts) {
  const items =
    posts.length === 0
      ? `        <p class="empty-hint">No posts yet. Add a Markdown file under <code>blog/posts/</code> and run <code>node scripts/build-blog.mjs</code>.</p>`
      : posts
          .map(
            (p) => `        <a class="blog-post" href="blog/${p.slug}.html">
          <p class="date">${escapeHtml(formatDisplayDate(p.date))}</p>
          <h2>${escapeHtml(p.title)}</h2>
          <p class="excerpt">${escapeHtml(p.blurb)}</p>
        </a>`
          )
          .join("\n\n");

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta
      name="description"
      content="Blog by Caio Miguel — notes on markets, economics, and quantitative methods."
    />
    <title>Blog · Caio Miguel</title>
    <link rel="stylesheet" href="css/style.css" />
  </head>
  <body>
    <div class="bg-grid" aria-hidden="true"></div>

    <header class="site-nav">
      <a class="logo" href="index.html">Caio <span>Miguel</span></a>
      <button
        class="nav-toggle"
        type="button"
        aria-label="Open menu"
        aria-expanded="false"
      >
        ☰
      </button>
      <ul class="nav-links">
        <li><a href="index.html">Home</a></li>
        <li><a href="resume.html">Resume</a></li>
        <li><a href="projects.html">Projects</a></li>
        <li><a class="active" href="blog.html">Blog</a></li>
        <li><a href="contact.html">Contact</a></li>
      </ul>
    </header>

    <main class="page container">
      <header class="page-header">
        <p class="eyebrow">Writing</p>
        <h1>Blog</h1>
        <p>
          Notes on markets, economics, and quantitative methods.
        </p>
      </header>

      <div class="blog-list">
${items}
      </div>
    </main>

    <footer class="site-footer">
      <p>
        <a href="index.html">Home</a> ·
        <a href="contact.html">Contact</a>
      </p>
    </footer>

    <script src="js/main.js"></script>
  </body>
</html>
`;
}

function main() {
  if (!fs.existsSync(postsDir)) {
    fs.mkdirSync(postsDir, { recursive: true });
  }

  const files = fs
    .readdirSync(postsDir)
    .filter((f) => f.endsWith(".md"))
    .sort();

  const posts = [];

  for (const file of files) {
    const slug = file.replace(/\.md$/i, "");
    const raw = fs.readFileSync(path.join(postsDir, file), "utf8");
    let meta, body;
    try {
      ({ meta, body } = parseFrontmatter(raw));
    } catch (e) {
      console.error(`✗ ${file}: ${e.message}`);
      process.exitCode = 1;
      continue;
    }

    const title = meta.title;
    const date = meta.date;
    const blurb = meta.blurb || meta.description || "";
    if (!title || !date) {
      console.error(`✗ ${file}: frontmatter needs title and date`);
      process.exitCode = 1;
      continue;
    }
    if (!blurb) {
      console.warn(`⚠ ${file}: missing blurb — index card will be empty`);
    }

    const bodyHtml = markdownToHtml(body);
    const html = postPageHtml({ title, date, blurb, bodyHtml });
    const outPath = path.join(blogOutDir, `${slug}.html`);
    fs.writeFileSync(outPath, html, "utf8");

    const order = meta.order != null ? Number(meta.order) : 999;
    posts.push({
      slug,
      title,
      date,
      blurb,
      order: Number.isFinite(order) ? order : 999,
      href: `blog/${slug}.html`,
    });
    console.log(`✓ ${slug}`);
  }

  // Newest first; optional `order` breaks ties (lower = higher on the list)
  posts.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return a.order - b.order;
  });

  fs.writeFileSync(postsJsonPath, JSON.stringify(posts, null, 2) + "\n", "utf8");
  fs.writeFileSync(blogIndexPath, blogIndexHtml(posts), "utf8");

  console.log(`\nBuilt ${posts.length} post(s) → blog.html + blog/posts.json`);
}

main();

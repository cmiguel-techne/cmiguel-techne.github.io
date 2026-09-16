/**
 * Build the blog from Markdown sources.
 *
 * 1. Write a post: blog/posts/my-slug.md
 * 2. Set status: public | draft
 * 3. Run:        node scripts/build-blog.mjs
 * 4. Commit Markdown + generated public HTML / posts.json
 *
 * Frontmatter:
 *   ---
 *   title: My post title
 *   date: 2026-08-10
 *   blurb: One or two sentences for the blog index.
 *   status: public   # or draft
 *   ---
 *
 * Draft posts stay off the public index and get no public HTML page
 * (so they are not reachable by URL on GitHub Pages). Preview drafts
 * locally with: node scripts/build-blog.mjs --with-drafts
 * (writes to blog/drafts/, gitignored).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const postsDir = path.join(root, "blog", "posts");
const blogOutDir = path.join(root, "blog");
const draftsOutDir = path.join(blogOutDir, "drafts");
const postsJsonPath = path.join(blogOutDir, "posts.json");
const blogIndexPath = path.join(root, "blog.html");

const withDrafts = process.argv.includes("--with-drafts");

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

/** Normalize status → "public" | "draft" */
function normalizeStatus(raw) {
  const s = String(raw || "public").toLowerCase().trim();
  if (s === "draft" || s === "private" || s === "wip" || s === "unpublished") {
    return "draft";
  }
  if (s === "public" || s === "published" || s === "live") {
    return "public";
  }
  console.warn(`⚠ Unknown status "${raw}" — treating as public`);
  return "public";
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
  const d = new Date(iso + "T12:00:00");
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function postPageHtml({ title, date, blurb, bodyHtml, isDraft, assetPrefix }) {
  const displayDate = formatDisplayDate(date);
  const desc = escapeHtml(blurb || title);
  const cssHref = assetPrefix + "css/style.css";
  const jsHref = assetPrefix + "js/main.js";
  const homeHref = assetPrefix + "index.html";
  const resumeHref = assetPrefix + "resume.html";
  const projectsHref = assetPrefix + "projects.html";
  const blogHref = isDraft
    ? assetPrefix + "blog/drafts/index.html"
    : assetPrefix + "blog.html";
  const contactHref = assetPrefix + "contact.html";
  const backLabel = isDraft ? "← Drafts" : "← All posts";
  const draftBanner = isDraft
    ? `
        <p class="draft-banner" role="status">
          <strong>Draft</strong> — not listed on the public blog. Local preview only.
        </p>`
    : "";
  const noindex = isDraft
    ? `\n    <meta name="robots" content="noindex, nofollow" />`
    : "";
  const titlePrefix = isDraft ? "[Draft] " : "";

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="description" content="${desc}" />${noindex}
    <title>${titlePrefix}${escapeHtml(title)} · Caio Miguel</title>
    <link rel="stylesheet" href="${cssHref}" />
  </head>
  <body>
    <div class="bg-grid" aria-hidden="true"></div>

    <header class="site-nav">
      <a class="logo" href="${homeHref}">Caio <span>Miguel</span></a>
      <button
        class="nav-toggle"
        type="button"
        aria-label="Open menu"
        aria-expanded="false"
      >
        ☰
      </button>
      <ul class="nav-links">
        <li><a href="${homeHref}">Home</a></li>
        <li><a href="${resumeHref}">Resume</a></li>
        <li><a href="${projectsHref}">Projects</a></li>
        <li><a class="active" href="${assetPrefix}blog.html">Blog</a></li>
        <li><a href="${contactHref}">Contact</a></li>
      </ul>
    </header>

    <main class="page container">
      <article class="article">
        <a class="back-link" href="${blogHref}">${backLabel}</a>
${draftBanner}
        <header>
          <p class="date">${escapeHtml(displayDate)}${isDraft ? ' · <span class="status status-draft">Draft</span>' : ""}</p>
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
        <a href="${homeHref}">Home</a> ·
        <a href="${contactHref}">Contact</a>
      </p>
    </footer>

    <script src="${jsHref}"></script>
  </body>
</html>
`;
}

function blogIndexHtml(posts) {
  const items =
    posts.length === 0
      ? `        <p class="empty-hint">No posts yet. Add a Markdown file under <code>blog/posts/</code> with <code>status: public</code> and run <code>node scripts/build-blog.mjs</code>.</p>`
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

function draftsIndexHtml(drafts) {
  const items =
    drafts.length === 0
      ? `        <p class="empty-hint">No draft posts.</p>`
      : drafts
          .map(
            (p) => `        <a class="blog-post" href="${p.slug}.html">
          <p class="date">${escapeHtml(formatDisplayDate(p.date))} · <span class="status status-draft">Draft</span></p>
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
    <meta name="robots" content="noindex, nofollow" />
    <title>Draft posts · Caio Miguel</title>
    <link rel="stylesheet" href="../../css/style.css" />
  </head>
  <body>
    <div class="bg-grid" aria-hidden="true"></div>
    <main class="page container">
      <header class="page-header">
        <p class="eyebrow">Local only</p>
        <h1>Draft posts</h1>
        <p>
          These pages are generated with <code>--with-drafts</code> and should not
          be committed. Public blog: <a href="../../blog.html">blog.html</a>.
        </p>
      </header>
      <div class="blog-list">
${items}
      </div>
    </main>
    <script src="../../js/main.js"></script>
  </body>
</html>
`;
}

function sortPosts(posts) {
  posts.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return a.order - b.order;
  });
}

function main() {
  if (!fs.existsSync(postsDir)) {
    fs.mkdirSync(postsDir, { recursive: true });
  }

  const files = fs
    .readdirSync(postsDir)
    .filter((f) => f.endsWith(".md") && !f.startsWith("_"))
    .sort();

  const publicPosts = [];
  const draftPosts = [];
  const allSlugs = new Set();

  for (const file of files) {
    const slug = file.replace(/\.md$/i, "");
    allSlugs.add(slug);
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
    const status = normalizeStatus(meta.status);
    if (!title || !date) {
      console.error(`✗ ${file}: frontmatter needs title and date`);
      process.exitCode = 1;
      continue;
    }
    if (!blurb) {
      console.warn(`⚠ ${file}: missing blurb — index card will be empty`);
    }

    const order = meta.order != null ? Number(meta.order) : 999;
    const entry = {
      slug,
      title,
      date,
      blurb,
      status,
      order: Number.isFinite(order) ? order : 999,
      href:
        status === "public"
          ? `blog/${slug}.html`
          : `blog/drafts/${slug}.html`,
    };

    const bodyHtml = markdownToHtml(body);

    if (status === "public") {
      const html = postPageHtml({
        title,
        date,
        blurb,
        bodyHtml,
        isDraft: false,
        assetPrefix: "../",
      });
      fs.writeFileSync(path.join(blogOutDir, `${slug}.html`), html, "utf8");
      publicPosts.push(entry);
      console.log(`✓ ${slug} [public]`);
    } else {
      // Ensure a previously public page is not left live after unpublishing
      const publicPath = path.join(blogOutDir, `${slug}.html`);
      if (fs.existsSync(publicPath)) {
        fs.unlinkSync(publicPath);
        console.log(`  removed public page for draft: ${slug}.html`);
      }
      draftPosts.push(entry);
      console.log(`· ${slug} [draft]`);
    }
  }

  sortPosts(publicPosts);
  sortPosts(draftPosts);

  if (withDrafts) {
    fs.mkdirSync(draftsOutDir, { recursive: true });
    for (const entry of draftPosts) {
      const raw = fs.readFileSync(
        path.join(postsDir, `${entry.slug}.md`),
        "utf8"
      );
      const { meta, body } = parseFrontmatter(raw);
      const bodyHtml = markdownToHtml(body);
      const html = postPageHtml({
        title: meta.title,
        date: meta.date,
        blurb: meta.blurb || meta.description || "",
        bodyHtml,
        isDraft: true,
        assetPrefix: "../../",
      });
      fs.writeFileSync(
        path.join(draftsOutDir, `${entry.slug}.html`),
        html,
        "utf8"
      );
    }
    // Drop stale draft HTML for deleted posts
    for (const name of fs.readdirSync(draftsOutDir)) {
      if (!name.endsWith(".html") || name === "index.html") continue;
      const slug = name.replace(/\.html$/i, "");
      if (!draftPosts.some((p) => p.slug === slug)) {
        fs.unlinkSync(path.join(draftsOutDir, name));
      }
    }
    fs.writeFileSync(
      path.join(draftsOutDir, "index.html"),
      draftsIndexHtml(draftPosts),
      "utf8"
    );
    console.log(
      `\nDraft preview: blog/drafts/index.html (${draftPosts.length} draft(s))`
    );
  } else if (fs.existsSync(draftsOutDir) && !withDrafts) {
    // Leave existing local drafts folder alone; user can delete or rebuild with flag
  }

  // Public index + metadata (public only)
  const publicJson = publicPosts.map(({ slug, title, date, blurb, status, href }) => ({
    slug,
    title,
    date,
    blurb,
    status,
    href,
  }));
  fs.writeFileSync(
    postsJsonPath,
    JSON.stringify(publicJson, null, 2) + "\n",
    "utf8"
  );
  fs.writeFileSync(blogIndexPath, blogIndexHtml(publicPosts), "utf8");

  // Remove orphan public HTML for slugs no longer in posts/ at all
  for (const name of fs.readdirSync(blogOutDir)) {
    if (!name.endsWith(".html")) continue;
    if (name === "posts.json") continue;
    const slug = name.replace(/\.html$/i, "");
    // skip if still a public post
    if (publicPosts.some((p) => p.slug === slug)) continue;
    // only remove if it was a post slug we know about as draft, or leftover
    if (allSlugs.has(slug) || draftPosts.some((p) => p.slug === slug)) {
      // already handled drafts above
      continue;
    }
  }

  console.log(
    `\nBuilt ${publicPosts.length} public post(s) → blog.html + blog/posts.json` +
      (draftPosts.length
        ? ` (${draftPosts.length} draft(s) not published)`
        : "")
  );
  if (draftPosts.length && !withDrafts) {
    console.log(
      "Tip: preview drafts locally with  node scripts/build-blog.mjs --with-drafts"
    );
  }
}

main();

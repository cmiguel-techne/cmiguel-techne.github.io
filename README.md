# Caio Miguel — Personal Site

Static personal website with a landing page plus **Resume**, **Projects**, and **Blog**. Built for [GitHub Pages](https://pages.github.com/).

## Structure

```
├── index.html          # Landing — choose Resume / Projects / Blog / Contact
├── resume.html         # Resume / CV as a webpage
├── projects.html       # Project cards
├── blog.html           # Blog index (generated)
├── contact.html        # Contact form (mailto via obfuscated address)
├── blog/
│   ├── posts/          # Write posts here as Markdown (source of truth)
│   ├── posts.json      # Generated index metadata
│   └── *.html          # Generated post pages
├── projects/           # Screenshots & logos for the projects page
├── scripts/
│   └── build-blog.mjs  # Regenerates blog index + post pages
├── css/style.css
└── js/main.js
```

## Local preview

Open `index.html` in a browser, or serve the folder:

```bash
# Python
python -m http.server 8000

# Node
npx serve .
```

Then visit `http://localhost:8000`.

## Deploy on GitHub Pages

1. Create a new repository on GitHub (e.g. `username.github.io` for a user site, or any name for a project site).
2. Push this project to the repository:

   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
   git add .
   git commit -m "Initial personal site"
   git branch -M main
   git push -u origin main
   ```

3. In the repo: **Settings → Pages**
   - **Source:** Deploy from a branch
   - **Branch:** `main` / `/ (root)`
4. After a minute or two, the site is live at:
   - User site: `https://YOUR_USERNAME.github.io`
   - Project site: `https://YOUR_USERNAME.github.io/YOUR_REPO/`

### Project-site paths

If the site is **not** at the domain root (project Pages URL), asset paths still work because they are relative (`css/style.css`, `../css/style.css` from blog posts). No build step required.

## Customization

| What | Where |
|------|--------|
| Name / tagline | `index.html` |
| Resume content | `resume.html` (webpage only; no PDF) |
| Projects | `projects.html` — copy a `.project-card` |
| Blog posts | `blog/posts/*.md` then run `node scripts/build-blog.mjs` |
| Colors / fonts | `css/style.css` (`:root` variables) |
| Contact form | `contact.html` + `js/main.js` (`resolveInbox`) |

### Adding a blog post

1. Create `blog/posts/my-slug.md` (see `blog/posts/_example.md.template`):

   ```markdown
   ---
   title: My post title
   date: 2026-08-12
   blurb: Short teaser shown on the blog index.
   status: draft
   ---

   Your Markdown body here.
   ```

2. Set **`status`**:
   - `draft` — not on the public blog, no public HTML (safe to commit the Markdown)
   - `public` — listed on `blog.html` and published as `blog/my-slug.html`

3. Build:

   ```bash
   node scripts/build-blog.mjs
   ```

   Preview drafts locally (writes gitignored `blog/drafts/`):

   ```bash
   node scripts/build-blog.mjs --with-drafts
   ```

   Then open `blog/drafts/index.html` via your local server.

4. Commit the Markdown **and** generated public files (`blog.html`, `blog/<public-slug>.html`, `blog/posts.json`). Do **not** commit `blog/drafts/`.

The `blurb` is the short description on the blog list. Posts are ordered by `date` (newest first); optional `order` breaks ties on the same day. Aliases: `published` → public; `private` / `wip` → draft.

The contact form does **not** show an email address. The destination is reconstructed in JavaScript only when the form is submitted (split base64 parts), then a `mailto:` draft opens in the visitor’s email app.

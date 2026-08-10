/* Mobile nav toggle */
(function () {
  const toggle = document.querySelector(".nav-toggle");
  const links = document.querySelector(".nav-links");
  if (!toggle || !links) return;

  toggle.addEventListener("click", () => {
    const open = links.classList.toggle("open");
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
  });

  links.querySelectorAll("a").forEach((a) => {
    a.addEventListener("click", () => {
      links.classList.remove("open");
      toggle.setAttribute("aria-expanded", "false");
    });
  });
})();

/**
 * Reconstruct inbox address only in memory at submit time.
 * Not stored as a contiguous string in the HTML or static assets.
 */
function resolveInbox() {
  // base64 of local-part + domain, split so scrapers cannot match a single token
  const a = atob("Y21pZ3VlbA=="); // local
  const b = atob("bGl2ZS5jYQ=="); // domain
  const sep = String.fromCharCode(64); // @
  return a + sep + b;
}

/* Contact form → opens the visitor's mail client with a drafted message */
(function () {
  const form = document.getElementById("contact-form");
  if (!form) return;

  const status = document.getElementById("contact-status");
  const submitBtn = form.querySelector('[type="submit"]');

  form.addEventListener("submit", (e) => {
    e.preventDefault();

    // Honeypot: bots that fill hidden fields are ignored
    const trap = form.querySelector('[name="website"]');
    if (trap && trap.value) {
      return;
    }

    const name = form.elements.namedItem("name").value.trim();
    const replyTo = form.elements.namedItem("email").value.trim();
    const subject = form.elements.namedItem("subject").value.trim();
    const message = form.elements.namedItem("message").value.trim();

    if (!name || !replyTo || !subject || !message) {
      setStatus("Please fill in all fields.", "error");
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(replyTo)) {
      setStatus("Please enter a valid email so I can reply.", "error");
      return;
    }

    const inbox = resolveInbox();
    const body = [
      message,
      "",
      "---",
      "From: " + name,
      "Reply-to: " + replyTo,
    ].join("\r\n");

    const mailto =
      "mailto:" +
      encodeURIComponent(inbox) +
      "?subject=" +
      encodeURIComponent(subject) +
      "&body=" +
      encodeURIComponent(body);

    // Guard against extremely long mailto URLs in some clients
    if (mailto.length > 1800) {
      setStatus(
        "Message is a bit long for email clients. Please shorten it and try again.",
        "error"
      );
      return;
    }

    setStatus("Opening your email app…", "ok");
    window.location.href = mailto;

    if (submitBtn) {
      submitBtn.disabled = true;
      setTimeout(() => {
        submitBtn.disabled = false;
      }, 2000);
    }
  });

  function setStatus(text, kind) {
    if (!status) return;
    status.textContent = text;
    status.className = "form-status form-status--" + (kind || "ok");
    status.hidden = false;
  }
})();

/* Projects page — open full-page screenshot in a dialog */
(function () {
  const rows = document.querySelectorAll(".project-row[data-screenshot]");
  const dialog = document.getElementById("project-lightbox");
  if (!rows.length || !dialog) return;

  const titleEl = document.getElementById("lightbox-title");
  const captionEl = document.getElementById("lightbox-caption");
  const imageEl = document.getElementById("lightbox-image");
  const closeBtn = document.getElementById("lightbox-close");

  function openProject(row) {
    const src = row.getAttribute("data-screenshot");
    const title = row.getAttribute("data-title") || "Project";
    const caption = row.getAttribute("data-caption") || "";
    if (!src || !imageEl) return;

    if (titleEl) titleEl.textContent = title;
    if (captionEl) captionEl.textContent = caption;
    imageEl.src = src;
    imageEl.alt = title + (caption ? " — " + caption : "");

    if (typeof dialog.showModal === "function") {
      dialog.showModal();
    } else {
      dialog.setAttribute("open", "");
    }
  }

  function closeProject() {
    if (typeof dialog.close === "function") {
      dialog.close();
    } else {
      dialog.removeAttribute("open");
    }
    if (imageEl) {
      imageEl.removeAttribute("src");
      imageEl.alt = "";
    }
  }

  rows.forEach((row) => {
    row.addEventListener("click", (e) => {
      if (e.target.closest("[data-no-lightbox], a, button")) return;
      openProject(row);
    });

    row.addEventListener("keydown", (e) => {
      if (e.target.closest("a, button")) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openProject(row);
      }
    });
  });

  if (closeBtn) closeBtn.addEventListener("click", closeProject);

  dialog.addEventListener("click", (e) => {
    // Click on backdrop (the dialog element itself outside inner content)
    const rect = dialog.getBoundingClientRect();
    const inDialog =
      e.clientX >= rect.left &&
      e.clientX <= rect.right &&
      e.clientY >= rect.top &&
      e.clientY <= rect.bottom;
    if (!inDialog) closeProject();
  });

  dialog.addEventListener("cancel", (e) => {
    e.preventDefault();
    closeProject();
  });
})();

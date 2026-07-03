/* ================================================================
   Notes App – Frontend Logic (Full CRUD)
   ================================================================ */

(() => {
  "use strict";

  // ── Constants ────────────────────────────────────────────────
  const API_BASE = "/notes";
  const MAX_LENGTH = 1000;

  // ── SVG Icons ────────────────────────────────────────────────
  const ICON_EDIT = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
  const ICON_DELETE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>`;

  // ── DOM References ───────────────────────────────────────────
  const noteInput      = document.getElementById("noteInput");
  const charCounter    = document.getElementById("charCounter");
  const saveBtn        = document.getElementById("saveBtn");
  const notesList      = document.getElementById("notesList");
  const emptyState     = document.getElementById("emptyState");
  const toastContainer = document.getElementById("toastContainer");

  // ── Initialise ───────────────────────────────────────────────
  document.addEventListener("DOMContentLoaded", () => {
    loadNotes();
    noteInput.addEventListener("input", updateCharCounter);
    saveBtn.addEventListener("click", saveNote);
  });

  // ── Character Counter ────────────────────────────────────────
  function updateCharCounter() {
    const len = noteInput.value.length;
    charCounter.textContent = `${len} / ${MAX_LENGTH}`;

    charCounter.classList.remove("compose__counter--warn", "compose__counter--max");

    if (len >= MAX_LENGTH) {
      charCounter.classList.add("compose__counter--max");
    } else if (len >= MAX_LENGTH * 0.9) {
      charCounter.classList.add("compose__counter--warn");
    }
  }

  // ── Load Notes (READ) ───────────────────────────────────────
  async function loadNotes() {
    showSkeletons(3);

    try {
      const res = await fetch(API_BASE);
      if (!res.ok) throw new Error(`Server responded with ${res.status}`);

      const notes = await res.json();
      renderNotesList(notes);
    } catch (err) {
      notesList.innerHTML = "";
      showToast("Failed to load notes. Is the server running?", "error");
      toggleEmpty(true);
      console.error("loadNotes error:", err);
    }
  }

  // ── Save Note (CREATE) ──────────────────────────────────────
  async function saveNote() {
    const content = noteInput.value.trim();

    // Client-side validation
    if (!content) {
      showToast("Note cannot be empty.", "error");
      noteInput.focus();
      return;
    }

    if (content.length > MAX_LENGTH) {
      showToast(`Note exceeds ${MAX_LENGTH} characters.`, "error");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch(API_BASE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });

      const data = await res.json();

      if (!res.ok) {
        showToast(data.error || "Failed to save note.", "error");
        return;
      }

      // Success – prepend the new note & clear input
      prependNote(data);
      noteInput.value = "";
      updateCharCounter();
      toggleEmpty(false);
      showToast("Note saved successfully!", "success");
    } catch (err) {
      showToast("Network error. Please check your connection.", "error");
      console.error("saveNote error:", err);
    } finally {
      setLoading(false);
    }
  }

  // ── Edit Note (UPDATE) ──────────────────────────────────────
  function enterEditMode(card, note) {
    // Prevent multiple edit modes on the same card
    if (card.classList.contains("note-card--editing")) return;

    card.classList.add("note-card--editing");

    const contentEl = card.querySelector(".note-card__content");
    const footerEl = card.querySelector(".note-card__footer");

    // Hide original content & footer
    contentEl.style.display = "none";
    footerEl.style.display = "none";

    // Create edit UI
    const editWrapper = document.createElement("div");
    editWrapper.className = "note-card__edit-wrapper";

    const textarea = document.createElement("textarea");
    textarea.className = "note-card__edit-textarea";
    textarea.value = decodeHtmlEntities(note.content);
    textarea.maxLength = MAX_LENGTH;
    textarea.setAttribute("aria-label", "Edit note content");

    const actions = document.createElement("div");
    actions.className = "note-card__edit-actions";

    const saveEditBtn = document.createElement("button");
    saveEditBtn.className = "note-card__edit-btn note-card__edit-btn--save";
    saveEditBtn.textContent = "Save";
    saveEditBtn.type = "button";

    const cancelBtn = document.createElement("button");
    cancelBtn.className = "note-card__edit-btn note-card__edit-btn--cancel";
    cancelBtn.textContent = "Cancel";
    cancelBtn.type = "button";

    actions.appendChild(saveEditBtn);
    actions.appendChild(cancelBtn);
    editWrapper.appendChild(textarea);
    editWrapper.appendChild(actions);
    card.insertBefore(editWrapper, contentEl);

    textarea.focus();
    // Place cursor at end
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);

    // Cancel handler
    cancelBtn.addEventListener("click", () => {
      exitEditMode(card, contentEl, footerEl, editWrapper);
    });

    // Escape key to cancel
    textarea.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        exitEditMode(card, contentEl, footerEl, editWrapper);
      }
    });

    // Save handler
    saveEditBtn.addEventListener("click", async () => {
      const newContent = textarea.value.trim();

      if (!newContent) {
        showToast("Note cannot be empty.", "error");
        textarea.focus();
        return;
      }

      if (newContent.length > MAX_LENGTH) {
        showToast(`Note exceeds ${MAX_LENGTH} characters.`, "error");
        return;
      }

      saveEditBtn.disabled = true;
      saveEditBtn.textContent = "Saving…";

      try {
        const res = await fetch(`${API_BASE}/${note.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: newContent }),
        });

        const data = await res.json();

        if (!res.ok) {
          showToast(data.error || "Failed to update note.", "error");
          saveEditBtn.disabled = false;
          saveEditBtn.textContent = "Save";
          return;
        }

        // Update note object in-place
        note.content = data.content;
        note.updated_at = data.updated_at;

        // Refresh display
        contentEl.textContent = decodeHtmlEntities(data.content);
        const timeEl = card.querySelector(".note-card__time");
        timeEl.textContent = formatTimeDisplay(data);
        if (data.updated_at) {
          timeEl.classList.add("note-card__time--edited");
        }

        exitEditMode(card, contentEl, footerEl, editWrapper);
        showToast("Note updated!", "success");
      } catch (err) {
        showToast("Network error. Please check your connection.", "error");
        saveEditBtn.disabled = false;
        saveEditBtn.textContent = "Save";
        console.error("updateNote error:", err);
      }
    });
  }

  function exitEditMode(card, contentEl, footerEl, editWrapper) {
    card.classList.remove("note-card--editing");
    contentEl.style.display = "";
    footerEl.style.display = "";
    editWrapper.remove();
  }

  // ── Delete Note (DELETE) ─────────────────────────────────────
  function confirmDelete(card, noteId) {
    // Create modal overlay
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";

    const modal = document.createElement("div");
    modal.className = "modal";

    modal.innerHTML = `
      <h3 class="modal__title">Delete Note</h3>
      <p class="modal__body">Are you sure you want to delete this note? This action cannot be undone.</p>
      <div class="modal__actions">
        <button class="modal__btn modal__btn--cancel" type="button">Cancel</button>
        <button class="modal__btn modal__btn--delete" type="button">Delete</button>
      </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const cancelBtn = modal.querySelector(".modal__btn--cancel");
    const deleteBtn = modal.querySelector(".modal__btn--delete");

    // Close modal
    function closeModal() {
      overlay.remove();
    }

    cancelBtn.addEventListener("click", closeModal);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeModal();
    });

    // Escape key to close
    function onEscape(e) {
      if (e.key === "Escape") {
        closeModal();
        document.removeEventListener("keydown", onEscape);
      }
    }
    document.addEventListener("keydown", onEscape);

    // Confirm delete
    deleteBtn.addEventListener("click", async () => {
      deleteBtn.disabled = true;
      deleteBtn.textContent = "Deleting…";

      try {
        const res = await fetch(`${API_BASE}/${noteId}`, {
          method: "DELETE",
        });

        const data = await res.json();

        if (!res.ok) {
          showToast(data.error || "Failed to delete note.", "error");
          deleteBtn.disabled = false;
          deleteBtn.textContent = "Delete";
          return;
        }

        closeModal();

        // Animate removal
        card.classList.add("note-card--removing");
        card.addEventListener("animationend", () => {
          card.remove();
          // Check if list is now empty
          if (!notesList.querySelector(".note-card")) {
            toggleEmpty(true);
          }
        });

        showToast("Note deleted.", "success");
      } catch (err) {
        showToast("Network error. Please check your connection.", "error");
        deleteBtn.disabled = false;
        deleteBtn.textContent = "Delete";
        console.error("deleteNote error:", err);
      }
    });
  }

  // ── Render Helpers ───────────────────────────────────────────

  function renderNotesList(notes) {
    notesList.innerHTML = "";

    if (!notes.length) {
      toggleEmpty(true);
      return;
    }

    toggleEmpty(false);
    notes.forEach((note) => {
      notesList.appendChild(createNoteCard(note));
    });
  }

  function prependNote(note) {
    const card = createNoteCard(note);
    notesList.prepend(card);
  }

  function createNoteCard(note) {
    const card = document.createElement("article");
    card.className = "note-card";
    card.setAttribute("data-id", note.id);

    // Note content
    const content = document.createElement("p");
    content.className = "note-card__content";
    content.textContent = decodeHtmlEntities(note.content);

    // Footer: timestamp + action buttons
    const footer = document.createElement("div");
    footer.className = "note-card__footer";

    const time = document.createElement("time");
    time.className = "note-card__time";
    time.textContent = formatTimeDisplay(note);
    if (note.created_at) {
      time.setAttribute("datetime", note.updated_at || note.created_at);
    }
    if (note.updated_at) {
      time.classList.add("note-card__time--edited");
    }

    // Action buttons
    const actions = document.createElement("div");
    actions.className = "note-card__actions";

    const editBtn = document.createElement("button");
    editBtn.className = "note-card__action-btn note-card__action-btn--edit";
    editBtn.type = "button";
    editBtn.title = "Edit note";
    editBtn.setAttribute("aria-label", "Edit note");
    editBtn.innerHTML = ICON_EDIT;

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "note-card__action-btn note-card__action-btn--delete";
    deleteBtn.type = "button";
    deleteBtn.title = "Delete note";
    deleteBtn.setAttribute("aria-label", "Delete note");
    deleteBtn.innerHTML = ICON_DELETE;

    // Event listeners — use a closure over the note object
    editBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      enterEditMode(card, note);
    });

    deleteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      confirmDelete(card, note.id);
    });

    actions.appendChild(editBtn);
    actions.appendChild(deleteBtn);

    footer.appendChild(time);
    footer.appendChild(actions);

    card.appendChild(content);
    card.appendChild(footer);
    return card;
  }

  // ── Skeletons ────────────────────────────────────────────────
  function showSkeletons(count) {
    notesList.innerHTML = "";
    for (let i = 0; i < count; i++) {
      const sk = document.createElement("div");
      sk.className = "skeleton-card";
      sk.setAttribute("aria-hidden", "true");
      notesList.appendChild(sk);
    }
    toggleEmpty(false);
  }

  // ── Empty State ──────────────────────────────────────────────
  function toggleEmpty(show) {
    emptyState.classList.toggle("hidden", !show);
  }

  // ── Loading State ────────────────────────────────────────────
  function setLoading(loading) {
    saveBtn.disabled = loading;
    saveBtn.classList.toggle("compose__save-btn--loading", loading);
  }

  // ── Toast Notifications ──────────────────────────────────────
  function showToast(message, type = "success") {
    const toast = document.createElement("div");
    toast.className = `toast toast--${type}`;

    // Icon
    const icon = type === "success" ? "✓" : "✕";
    toast.innerHTML = `<span aria-hidden="true">${icon}</span> ${escapeHtml(message)}`;

    toastContainer.appendChild(toast);

    // Auto-dismiss after 3.5 seconds
    setTimeout(() => {
      toast.classList.add("toast--exit");
      toast.addEventListener("animationend", () => toast.remove());
    }, 3500);
  }

  // ── Utilities ────────────────────────────────────────────────

  /**
   * Build the display string for the timestamp area.
   * Shows "Edited: <date>" if updated, otherwise "Created: <date>".
   */
  function formatTimeDisplay(note) {
    if (note.updated_at) {
      return `Edited: ${formatTimestamp(note.updated_at)}`;
    }
    return `Created: ${formatTimestamp(note.created_at)}`;
  }

  /**
   * Format an ISO timestamp into a human-readable string.
   */
  function formatTimestamp(isoString) {
    if (!isoString) return "";
    try {
      const date = new Date(isoString);
      if (isNaN(date.getTime())) return "";

      return new Intl.DateTimeFormat("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      }).format(date);
    } catch {
      return "";
    }
  }

  /**
   * Escape HTML special characters to prevent XSS when inserting into
   * innerHTML contexts (e.g. toast messages).
   */
  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  /**
   * Decode HTML entities that the backend may have encoded (e.g. &amp;).
   * We use textContent for rendering, so this is safe.
   */
  function decodeHtmlEntities(str) {
    const txt = document.createElement("textarea");
    txt.innerHTML = str;
    return txt.value;
  }
})();

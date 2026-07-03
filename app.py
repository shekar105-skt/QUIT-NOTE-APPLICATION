import os
import sqlite3
import html
from datetime import datetime, timezone

from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS

# ---------------------------------------------------------------------------
# App Configuration
# ---------------------------------------------------------------------------

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATABASE = os.path.join(BASE_DIR, "notes.db")

app = Flask(__name__, static_folder="static", static_url_path="")
CORS(app)

MAX_NOTE_LENGTH = 1000

# ---------------------------------------------------------------------------
# Database Helpers
# ---------------------------------------------------------------------------


def get_db():
    """Return a new database connection with Row factory."""
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """Create the notes table if it doesn't already exist."""
    conn = get_db()
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS notes (
            id         INTEGER   PRIMARY KEY AUTOINCREMENT,
            content    TEXT      NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT NULL
        )
        """
    )
    conn.commit()
    conn.close()


def _format_timestamp(value):
    """Try to convert a SQLite timestamp string to ISO-8601."""
    if not value:
        return None
    try:
        dt = datetime.strptime(value, "%Y-%m-%d %H:%M:%S")
        return dt.replace(tzinfo=timezone.utc).isoformat()
    except (ValueError, TypeError):
        return value  # already in a usable format


def row_to_dict(row):
    """Convert a sqlite3.Row to a plain dictionary with ISO timestamps."""
    d = dict(row)
    d["created_at"] = _format_timestamp(d.get("created_at"))
    d["updated_at"] = _format_timestamp(d.get("updated_at"))
    return d


def _validate_content(data):
    """Shared validation & sanitisation for create / update.

    Returns (clean_content, error_response) – one of the two will be None.
    """
    if not data:
        return None, (jsonify({"error": "Request body must be valid JSON."}), 400)

    content = data.get("content", "")

    if not isinstance(content, str) or not content.strip():
        return None, (jsonify({"error": "Note content cannot be empty."}), 400)

    content = content.strip()

    if len(content) > MAX_NOTE_LENGTH:
        return None, (
            jsonify(
                {"error": f"Note exceeds the maximum length of {MAX_NOTE_LENGTH} characters."}
            ),
            400,
        )

    # Escape HTML to prevent stored XSS
    content = html.escape(content)
    return content, None


# ---------------------------------------------------------------------------
# Routes – Frontend
# ---------------------------------------------------------------------------


@app.route("/")
def serve_index():
    """Serve the single-page application."""
    return send_from_directory(app.static_folder, "index.html")


# ---------------------------------------------------------------------------
# Routes – API
# ---------------------------------------------------------------------------

SELECT_COLS = "id, content, created_at, updated_at"


@app.route("/notes", methods=["GET"])
def get_notes():
    """Return all notes ordered by newest first."""
    try:
        conn = get_db()
        rows = conn.execute(
            f"SELECT {SELECT_COLS} FROM notes ORDER BY created_at DESC"
        ).fetchall()
        conn.close()
        return jsonify([row_to_dict(r) for r in rows]), 200
    except Exception as exc:
        return jsonify({"error": "Failed to retrieve notes.", "details": str(exc)}), 500


@app.route("/notes", methods=["POST"])
def create_note():
    """Validate, sanitize, and save a new note."""
    data = request.get_json(silent=True)
    content, err = _validate_content(data)
    if err:
        return err

    try:
        conn = get_db()
        cursor = conn.execute("INSERT INTO notes (content) VALUES (?)", (content,))
        conn.commit()
        row = conn.execute(
            f"SELECT {SELECT_COLS} FROM notes WHERE id = ?", (cursor.lastrowid,)
        ).fetchone()
        conn.close()
        return jsonify(row_to_dict(row)), 201
    except Exception as exc:
        return jsonify({"error": "Failed to save note.", "details": str(exc)}), 500


@app.route("/notes/<int:note_id>", methods=["PUT"])
def update_note(note_id):
    """Validate, sanitize, and update an existing note."""
    data = request.get_json(silent=True)
    content, err = _validate_content(data)
    if err:
        return err

    try:
        conn = get_db()
        # Check the note exists
        existing = conn.execute("SELECT id FROM notes WHERE id = ?", (note_id,)).fetchone()
        if not existing:
            conn.close()
            return jsonify({"error": "Note not found."}), 404

        conn.execute(
            "UPDATE notes SET content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (content, note_id),
        )
        conn.commit()
        row = conn.execute(
            f"SELECT {SELECT_COLS} FROM notes WHERE id = ?", (note_id,)
        ).fetchone()
        conn.close()
        return jsonify(row_to_dict(row)), 200
    except Exception as exc:
        return jsonify({"error": "Failed to update note.", "details": str(exc)}), 500


@app.route("/notes/<int:note_id>", methods=["DELETE"])
def delete_note(note_id):
    """Delete a note by its ID."""
    try:
        conn = get_db()
        existing = conn.execute("SELECT id FROM notes WHERE id = ?", (note_id,)).fetchone()
        if not existing:
            conn.close()
            return jsonify({"error": "Note not found."}), 404

        conn.execute("DELETE FROM notes WHERE id = ?", (note_id,))
        conn.commit()
        conn.close()
        return jsonify({"message": "Note deleted."}), 200
    except Exception as exc:
        return jsonify({"error": "Failed to delete note.", "details": str(exc)}), 500


# ---------------------------------------------------------------------------
# Entry Point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    init_db()
    print("  Notes App running at http://localhost:5000")
    app.run(debug=True, host="0.0.0.0", port=5000)

#!/usr/bin/env python
"""Study-tutor knowledge base worker.

Builds and queries a local hybrid index (SQLite FTS5 + dense vectors) over the
chunks the Host derived from the student's material.

One JSON request on stdin, one JSON reply on stdout. Every reply is ASCII JSON
so any console code page can carry it.

Operations
  probe   report the available embedders
  build   replace the index of one session (or merge per source)
  search  hybrid retrieval with filters and MMR
  status  index statistics

Embedders, best first:
  bge-small-zh-v1.5   ONNX quantised model, 512-d, strong on Chinese
  minilm-l6           ONNX, 384-d, English / cross-lingual
  lsa-192             pure numpy: BM25 weights -> truncated SVD, no downloads
  bm25-only           no vectors at all; lexical retrieval still works
"""

from __future__ import annotations

import json
import math
import os
import re
import sqlite3
import sys
import time
from collections import Counter
from typing import Any

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
TOOLS = os.path.normpath(os.path.join(HERE, "..", "tools"))
sys.path.insert(0, os.path.join(TOOLS, "pylib"))

DEFAULT_MODEL_DIR = os.path.join(TOOLS, "model", "bge-small-zh")
DIM_CAP = 256

# ---------------------------------------------------------------------------
# Tokenisation. Chinese has no spaces, so the lexical side uses character
# bigrams (good recall, no extra dependency); ASCII words stay whole.
# ---------------------------------------------------------------------------

ASCII_WORD = re.compile(r"[a-z0-9_]+")
CJK = re.compile(r"[\u3400-\u9fff\uf900-\ufaff\u3040-\u30ff]")


def tokenize(text: str) -> list[str]:
    lowered = (text or "").lower()
    tokens: list[str] = list(ASCII_WORD.findall(lowered))
    cjk_chars = CJK.findall(lowered)
    run: list[str] = []
    for char in lowered:
        if CJK.match(char):
            run.append(char)
        else:
            if len(run) >= 2:
                tokens.extend("".join(run[i:i + 2]) for i in range(len(run) - 1))
            run = []
    if len(run) >= 2:
        tokens.extend("".join(run[i:i + 2]) for i in range(len(run) - 1))
    if len(cjk_chars) == 1 and not tokens:
        tokens = cjk_chars
    return tokens


def fts_query(text: str) -> str:
    tokens = [token for token in tokenize(text) if len(token) > 1 or token.isascii()]
    if not tokens:
        tokens = [token for token in tokenize(text)] or ["x"]
    unique: list[str] = []
    for token in tokens:
        if token not in unique:
            unique.append(token)
    return " OR ".join('"' + token.replace('"', '""') + '"' for token in unique[:48])


# ---------------------------------------------------------------------------
# Embedders
# ---------------------------------------------------------------------------

class NeuralEmbedder:
    """ONNX sentence encoder driven by an HF tokenizer.json."""

    def __init__(self, model_dir: str, name: str, quantised: bool = True):
        import onnxruntime as ort  # type: ignore
        from tokenizers import Tokenizer  # type: ignore

        self.name = name
        self.tokenizer = Tokenizer.from_file(os.path.join(model_dir, "tokenizer.json"))
        self.tokenizer.enable_truncation(max_length=512)
        self.tokenizer.enable_padding()
        candidates = [
            os.path.join(model_dir, "onnx", "model_quantized.onnx"),
            os.path.join(model_dir, "onnx", "model_q4f16.onnx"),
            os.path.join(model_dir, "onnx", "model.onnx"),
        ]
        path = next((item for item in candidates if os.path.exists(item)), None)
        if path is None:
            raise FileNotFoundError("no onnx model in " + model_dir)
        self.session = ort.InferenceSession(path, providers=["CPUExecutionProvider"])
        self.inputs = {item.name for item in self.session.get_inputs()}

    def encode(self, texts: list[str]) -> np.ndarray:
        if not texts:
            return np.zeros((0, 1), dtype=np.float32)
        batch = self.tokenizer.encode_batch([text or " " for text in texts])
        ids = np.array([item.ids for item in batch], dtype=np.int64)
        mask = np.array([item.attention_mask for item in batch], dtype=np.int64)
        feed: dict[str, np.ndarray] = {"input_ids": ids, "attention_mask": mask}
        if "token_type_ids" in self.inputs:
            feed["token_type_ids"] = np.array([item.type_ids for item in batch], dtype=np.int64)
        hidden = self.session.run(None, feed)[0]
        vectors = hidden[:, 0, :].astype(np.float32)
        return normalise(vectors)


class LsaEmbedder:
    """Pure-numpy fallback: TF-IDF-ish weights projected by a trained SVD."""

    name = "lsa-192"

    def __init__(self, vocab: dict[str, int], idf: np.ndarray, basis: np.ndarray, dim: int):
        self.vocab = vocab
        self.idf = idf
        self.basis = basis  # (V, dim)
        self.dim = dim

    def encode(self, texts: list[str]) -> np.ndarray:
        out = np.zeros((len(texts), self.dim), dtype=np.float32)
        for row, text in enumerate(texts):
            counts = Counter(token for token in tokenize(text) if token in self.vocab)
            if not counts:
                continue
            vector = np.zeros(len(self.vocab), dtype=np.float32)
            for token, count in counts.items():
                index = self.vocab[token]
                vector[index] = count * float(self.idf[index])
            out[row] = vector @ self.basis
        return normalise(out)


def normalise(vectors: np.ndarray) -> np.ndarray:
    if vectors.size == 0:
        return vectors
    norms = np.linalg.norm(vectors, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    return vectors / norms


def load_neural(model_dir: str) -> NeuralEmbedder | None:
    for name, directory in (("bge-small-zh-v1.5", model_dir), ("minilm-l6", os.path.join(TOOLS, "model", "minilm-l6"))):
        try:
            if directory and os.path.isdir(directory) and os.path.exists(os.path.join(directory, "tokenizer.json")):
                return NeuralEmbedder(directory, name)
        except Exception:
            continue
    return None


def train_lsa(texts: list[str], dim: int = 192) -> LsaEmbedder:
    docs = [[token for token in tokenize(text) if len(token) > 1] or ["_"] for text in texts]
    df: Counter = Counter()
    for tokens in docs:
        df.update(set(tokens))
    vocab = {token: index for index, token in enumerate(sorted(df))}
    count = len(docs)
    idf = np.array([math.log((count + 1) / (df[token] + 1)) + 1.0 for token in vocab], dtype=np.float32)
    matrix = np.zeros((count, len(vocab)), dtype=np.float32)
    for row, tokens in enumerate(docs):
        length = max(1, len(tokens))
        for token, hits in Counter(tokens).items():
            index = vocab[token]
            matrix[row, index] = (hits / length) * idf[index]
    if matrix.shape[0] < 2 or matrix.shape[1] < 2:
        basis = np.zeros((len(vocab), 1), dtype=np.float32)
        return LsaEmbedder(vocab, idf, basis, 1)
    keep = min(dim, min(matrix.shape) - 1) or 1
    _, _, vt = np.linalg.svd(matrix, full_matrices=False)
    basis = vt[:keep].T.astype(np.float32)
    return LsaEmbedder(vocab, idf, basis, keep)


# ---------------------------------------------------------------------------
# Store
# ---------------------------------------------------------------------------

SCHEMA = """
CREATE TABLE IF NOT EXISTS chunks(
  id TEXT PRIMARY KEY,
  source_id TEXT,
  source_title TEXT,
  kind TEXT,
  ordinal INTEGER,
  text TEXT,
  concepts TEXT,
  meta TEXT,
  ts_start REAL,
  ts_end REAL,
  vec BLOB
);
CREATE TABLE IF NOT EXISTS embedder(
  key TEXT PRIMARY KEY,
  name TEXT,
  dim INTEGER,
  blob BLOB,
  built_at REAL
);
CREATE INDEX IF NOT EXISTS chunks_source ON chunks(source_id);
"""

FTS_SCHEMA = """
CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
  id UNINDEXED, text, tokenize = 'trigram'
);
"""


def open_store(path: str) -> sqlite3.Connection:
    connection = sqlite3.connect(path)
    connection.execute("PRAGMA journal_mode=WAL")
    connection.executescript(SCHEMA)
    try:
        connection.executescript(FTS_SCHEMA)
    except sqlite3.OperationalError:
        connection.executescript(
            "CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(id UNINDEXED, text, tokenize='unicode61');"
        )
    return connection


def save_embedder(connection: sqlite3.Connection, embedder) -> None:
    if isinstance(embedder, LsaEmbedder):
        payload = {
            "vocab": embedder.vocab,
            "idf": embedder.idf.tolist(),
            "basis": embedder.basis.astype(np.float32).tobytes().hex(),
            "dim": embedder.dim,
        }
        blob = json.dumps(payload).encode("utf-8")
        connection.execute(
            "INSERT OR REPLACE INTO embedder(key, name, dim, blob, built_at) VALUES (?,?,?,?,?)",
            ("default", embedder.name, embedder.dim, blob, time.time()),
        )
    else:
        connection.execute(
            "INSERT OR REPLACE INTO embedder(key, name, dim, blob, built_at) VALUES (?,?,?,?,?)",
            ("default", embedder.name, 0, b"", time.time()),
        )


def load_embedder(connection: sqlite3.Connection, model_dir: str):
    row = connection.execute("SELECT name, blob FROM embedder WHERE key='default'").fetchone()
    name = row[0] if row else None
    if name in (None, "bge-small-zh-v1.5", "minilm-l6"):
        embedder = load_neural(model_dir)
        return embedder
    if name == "lsa-192" and row and row[1]:
        payload = json.loads(row[1].decode("utf-8"))
        basis = np.frombuffer(bytes.fromhex(payload["basis"]), dtype=np.float32).reshape(-1, payload["dim"])
        return LsaEmbedder(payload["vocab"], np.array(payload["idf"], dtype=np.float32), basis, payload["dim"])
    return None


# ---------------------------------------------------------------------------
# Operations
# ---------------------------------------------------------------------------

def op_probe(request: dict) -> dict:
    model_dir = request.get("modelDir") or DEFAULT_MODEL_DIR
    available = []
    neural = load_neural(model_dir)
    if neural is not None:
        available.append(neural.name)
    available.extend(["lsa-192", "bm25-only"])
    return {
        "ok": True,
        "available": available,
        "selected": neural.name if neural else "lsa-192",
        "modelDir": model_dir,
        "numpy": np.__version__,
    }


def op_build(request: dict) -> dict:
    data_dir = request["dataDir"]
    session_id = request["sessionId"]
    chunks = request.get("chunks") or []
    mode = request.get("mode") or "build"
    source_ids = request.get("sourceIds") or []
    model_dir = request.get("modelDir") or DEFAULT_MODEL_DIR

    directory = os.path.join(data_dir, "kb", session_id)
    os.makedirs(directory, exist_ok=True)
    path = os.path.join(directory, "kb.sqlite")
    connection = open_store(path)
    started = time.time()
    try:
        if mode == "build":
            connection.execute("DELETE FROM chunks")
            connection.execute("DELETE FROM chunks_fts")
        elif source_ids:
            placeholders = ",".join("?" for _ in source_ids)
            existing = [row[0] for row in connection.execute(
                f"SELECT id FROM chunks WHERE source_id IN ({placeholders})", source_ids
            )]
            for chunk_id in existing:
                connection.execute("DELETE FROM chunks_fts WHERE id = ?", (chunk_id,))
            connection.execute(f"DELETE FROM chunks WHERE source_id IN ({placeholders})", source_ids)

        previous = connection.execute("SELECT name FROM embedder WHERE key='default'").fetchone()
        previous_name = previous[0] if previous else None
        if previous_name == "lsa-192" and mode != "build":
            # Keep the trained basis so incremental adds stay in the same space.
            embedder = load_embedder(connection, model_dir)
            if embedder is None:
                embedder = load_neural(model_dir)
        else:
            texts_all = [row[0] for row in connection.execute("SELECT text FROM chunks ORDER BY id")]
            texts_all.extend(chunk.get("text") or "" for chunk in chunks)
            embedder = load_neural(model_dir)
            if embedder is None:
                embedder = train_lsa(texts_all)
            if mode != "build" and previous_name == "lsa-192" and isinstance(embedder, LsaEmbedder):
                # Retrain over the union so old and new vectors share one space.
                pass

        pending = [chunk for chunk in chunks if chunk.get("id")]
        vectors = embedder.encode([chunk.get("text") or "" for chunk in pending]) if pending else np.zeros((0, 0), dtype=np.float32)

        for index, chunk in enumerate(pending):
            vector = vectors[index].astype(np.float32) if index < len(vectors) else np.zeros(1, dtype=np.float32)
            connection.execute(
                "INSERT OR REPLACE INTO chunks(id, source_id, source_title, kind, ordinal, text, concepts, meta, ts_start, ts_end, vec)"
                " VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                (
                    chunk["id"], chunk.get("sourceId"), chunk.get("sourceTitle"), chunk.get("kind"),
                    int(chunk.get("ordinal") or 0), chunk.get("text") or "",
                    json.dumps(chunk.get("concepts") or [], ensure_ascii=True),
                    json.dumps({key: value for key, value in (chunk.get("meta") or {}).items()}, ensure_ascii=True),
                    chunk.get("tsStart"), chunk.get("tsEnd"), vector.tobytes(),
                ),
            )
            connection.execute("DELETE FROM chunks_fts WHERE id = ?", (chunk["id"],))
            connection.execute("INSERT INTO chunks_fts(id, text) VALUES (?,?)", (chunk["id"], chunk.get("text") or ""))

        save_embedder(connection, embedder)

        if isinstance(embedder, LsaEmbedder) and mode != "build":
            # Re-embed everything with the freshly trained basis for consistency.
            rows = connection.execute("SELECT id, text FROM chunks").fetchall()
            if rows:
                matrix = embedder.encode([row[1] for row in rows])
                for row, vector in zip(rows, matrix):
                    connection.execute("UPDATE chunks SET vec = ? WHERE id = ?", (vector.astype(np.float32).tobytes(), row[0]))

        connection.commit()
        total = connection.execute("SELECT COUNT(*) FROM chunks").fetchone()[0]
        return {
            "ok": True,
            "index": path,
            "chunks": total,
            "added": len(pending),
            "embedder": embedder.name,
            "dim": int(vectors.shape[1]) if getattr(vectors, "ndim", 0) == 2 and vectors.size else 0,
            "seconds": round(time.time() - started, 2),
        }
    finally:
        connection.close()


def op_status(request: dict) -> dict:
    data_dir = request["dataDir"]
    session_id = request["sessionId"]
    path = os.path.join(data_dir, "kb", session_id, "kb.sqlite")
    if not os.path.exists(path):
        return {"ok": True, "exists": False}
    connection = sqlite3.connect(path)
    try:
        total = connection.execute("SELECT COUNT(*) FROM chunks").fetchone()[0]
        sources = connection.execute("SELECT COUNT(DISTINCT source_id) FROM chunks").fetchone()[0]
        row = connection.execute("SELECT name, built_at FROM embedder WHERE key='default'").fetchone()
        return {
            "ok": True,
            "exists": True,
            "chunks": total,
            "sources": sources,
            "embedder": row[0] if row else None,
            "builtAt": row[1] if row else None,
            "bytes": os.path.getsize(path),
        }
    finally:
        connection.close()


def op_search(request: dict) -> dict:
    data_dir = request["dataDir"]
    session_id = request["sessionId"]
    query = (request.get("query") or "").strip()
    top_k = int(request.get("topK") or 8)
    filters = request.get("filters") or {}
    use_mmr = request.get("mmr", True)
    path = os.path.join(data_dir, "kb", session_id, "kb.sqlite")
    if not os.path.exists(path):
        return {"ok": False, "code": "NO_INDEX", "message": "The knowledge base has not been built for this session yet."}

    model_dir = request.get("modelDir") or DEFAULT_MODEL_DIR
    connection = open_store(path)
    try:
        rows = connection.execute(
            "SELECT id, source_id, source_title, kind, ordinal, text, concepts, meta, ts_start, ts_end, vec FROM chunks"
        ).fetchall()
        if not rows:
            return {"ok": False, "code": "EMPTY_INDEX", "message": "The knowledge base has no chunks yet."}

        ids = [row[0] for row in rows]
        lexical: dict[str, float] = {}
        try:
            matches = connection.execute(
                "SELECT id, bm25(chunks_fts) FROM chunks_fts WHERE chunks_fts MATCH ? LIMIT 400",
                (fts_query(query),),
            ).fetchall()
            if matches:
                worst = min(score for _, score in matches)
                span = max(1e-6, max(score for _, score in matches) - worst)
                for identifier, score in matches:
                    lexical[identifier] = (score - worst) / span
        except sqlite3.OperationalError:
            tokens = set(tokenize(query))
            for row in rows:
                overlap = len(tokens & set(tokenize(row[5])))
                if overlap:
                    lexical[row[0]] = overlap / max(1, len(tokens))

        embedder = load_embedder(connection, model_dir)
        dense_scores: dict[str, float] = {}
        dim = 0
        matrix = np.zeros((0, 1), dtype=np.float32)
        if embedder is not None and rows[0][10]:
            try:
                matrix = np.vstack([np.frombuffer(row[10], dtype=np.float32) for row in rows])
                dim = matrix.shape[1]
                query_vector = embedder.encode([query])
                if query_vector.shape[1] != dim:
                    query_vector = np.resize(query_vector, (1, dim))
                if dim:
                    sims = matrix @ query_vector[0]
                    if sims.max() > 0 or sims.min() < 0:
                        low, high = float(sims.min()), float(sims.max())
                        span = (high - low) or 1.0
                        for index, identifier in enumerate(ids):
                            dense_scores[identifier] = (float(sims[index]) - low) / span
            except Exception:
                dense_scores = {}

        weights = request.get("weights") or {}
        dense_weight = float(weights.get("dense", 0.55 if dense_scores else 0.0))
        lexical_weight = float(weights.get("lexical", 0.45 if dense_scores else 1.0))
        gap_boost = float(weights.get("gapBoost", 0.15))
        gap_concepts = set(request.get("gapConcepts") or [])

        scored: list[tuple[str, float]] = []
        for row in rows:
            identifier = row[0]
            if filters.get("sourceIds") and row[1] not in set(filters["sourceIds"]):
                continue
            if filters.get("kinds") and row[3] not in set(filters["kinds"]):
                continue
            if filters.get("since") is not None and (row[8] is None or row[8] < float(filters["since"])):
                continue
            if filters.get("until") is not None and (row[8] is None or row[8] > float(filters["until"])):
                continue
            score = dense_weight * dense_scores.get(identifier, 0.0) + lexical_weight * lexical.get(identifier, 0.0)
            if score <= 0 and not filters:
                continue
            if gap_concepts:
                concepts = set(json.loads(row[6]) if row[6] else [])
                if concepts & gap_concepts:
                    score += gap_boost
            meta = json.loads(row[7]) if row[7] else {}
            trust = float(meta.get("trust") or 0)
            score += trust * 0.01
            if score > 0:
                scored.append((identifier, score))

        scored.sort(key=lambda item: item[1], reverse=True)
        picked = mmr_select(scored, ctx_rows(rows), min(top_k * 3, len(scored)), top_k) if use_mmr else scored[:top_k]
        by_id = {row[0]: row for row in rows}
        results = []
        for identifier, score in picked:
            row = by_id[identifier]
            results.append({
                "chunkId": row[0],
                "score": round(float(score), 4),
                "text": row[5][:1800],
                "sourceId": row[1],
                "sourceTitle": row[2],
                "kind": row[3],
                "ordinal": row[4],
                "concepts": json.loads(row[6]) if row[6] else [],
                "meta": json.loads(row[7]) if row[7] else {},
                "tsStart": row[8],
                "tsEnd": row[9],
            })
        return {
            "ok": True,
            "query": query,
            "results": results,
            "embedder": getattr(embedder, "name", "none"),
            "dense": bool(dense_scores),
            "candidates": len(scored),
        }
    finally:
        connection.close()


def ctx_rows(rows):
    return {row[0]: row for row in rows}


def mmr_select(scored, by_id, pool: int, top_k: int, lam: float = 0.7) -> list[tuple[str, float]]:
    """Maximal marginal relevance over the leading candidates."""
    candidates = scored[:pool]
    if len(candidates) <= top_k:
        return candidates
    vectors = {}
    for identifier, _ in candidates:
        blob = by_id[identifier][10]
        vectors[identifier] = np.frombuffer(blob, dtype=np.float32) if blob else None
    chosen: list[tuple[str, float]] = []
    remaining = list(candidates)
    while remaining and len(chosen) < top_k:
        best = None
        best_value = -1e9
        for identifier, score in remaining:
            redundancy = 0.0
            current = vectors.get(identifier)
            if current is not None:
                for picked, _ in chosen:
                    other = vectors.get(picked)
                    if other is not None and current.shape == other.shape:
                        redundancy = max(redundancy, float(current @ other))
            value = lam * score - (1 - lam) * redundancy
            if value > best_value:
                best_value = value
                best = (identifier, score)
        if best is None:
            break
        chosen.append(best)
        remaining = [item for item in remaining if item[0] != best[0]]
    return chosen


def write(payload: dict) -> None:
    sys.stdout.buffer.write(json.dumps(payload, ensure_ascii=True).encode("utf-8"))
    sys.stdout.buffer.flush()


def main() -> None:
    raw = sys.stdin.buffer.read().decode("utf-8", "replace")
    try:
        request = json.loads(raw or "{}")
    except Exception as error:
        write({"ok": False, "code": "BAD_REQUEST", "message": str(error)})
        return
    operation = request.get("op") or "status"
    handlers: dict[str, Any] = {
        "probe": op_probe,
        "build": op_build,
        "status": op_status,
        "search": op_search,
    }
    handler = handlers.get(operation)
    if handler is None:
        write({"ok": False, "code": "UNKNOWN_OP", "message": f"Unknown operation: {operation}"})
        return
    try:
        write(handler(request))
    except Exception as error:
        write({"ok": False, "code": "KB_FAILED", "message": f"{type(error).__name__}: {error}"})


if __name__ == "__main__":
    main()

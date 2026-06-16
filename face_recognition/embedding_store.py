from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from config.settings import STORAGE


@dataclass(frozen=True)
class RegisteredUser:
    username: str
    display_name: str
    embedding_path: Path
    samples: int


class EmbeddingStore:
    def __init__(self) -> None:
        STORAGE.embeddings_dir.mkdir(parents=True, exist_ok=True)
        STORAGE.captured_faces_dir.mkdir(parents=True, exist_ok=True)
        self.index_path = STORAGE.users_index_path
        self._ensure_index()

    def list_users(self) -> list[RegisteredUser]:
        data = self._read_index()
        users: list[RegisteredUser] = []

        for username, payload in data.get("users", {}).items():
            users.append(
                RegisteredUser(
                    username=username,
                    display_name=payload.get("display_name", username),
                    embedding_path=STORAGE.embeddings_dir / payload["embedding_file"],
                    samples=int(payload.get("samples", 0)),
                )
            )

        return sorted(users, key=lambda user: user.username.lower())

    def save_user(self, username: str, embedding: np.ndarray, samples: int) -> Path:
        normalized_username = self._normalize_username(username)
        embedding_file = f"{normalized_username}.npy"
        embedding_path = STORAGE.embeddings_dir / embedding_file

        np.save(embedding_path, embedding.astype(np.float32))

        data = self._read_index()
        data.setdefault("users", {})[normalized_username] = {
            "display_name": username.strip(),
            "embedding_file": embedding_file,
            "samples": samples,
        }
        self._write_index(data)
        return embedding_path

    def delete_user(self, username: str) -> bool:
        normalized_username = self._normalize_username(username)
        data = self._read_index()
        user_payload = data.get("users", {}).pop(normalized_username, None)

        if user_payload is None:
            return False

        embedding_path = STORAGE.embeddings_dir / user_payload["embedding_file"]
        if embedding_path.exists():
            embedding_path.unlink()

        self._write_index(data)
        return True

    def load_embeddings(self) -> dict[str, np.ndarray]:
        embeddings: dict[str, np.ndarray] = {}
        data = self._read_index()

        for username, payload in data.get("users", {}).items():
            embedding_path = STORAGE.embeddings_dir / payload["embedding_file"]
            if embedding_path.exists():
                embeddings[payload.get("display_name", username)] = np.load(embedding_path)

        return embeddings

    def _ensure_index(self) -> None:
        if not self.index_path.exists():
            self._write_index({"users": {}})

    def _read_index(self) -> dict:
        with self.index_path.open("r", encoding="utf-8") as file:
            return json.load(file)

    def _write_index(self, data: dict) -> None:
        with self.index_path.open("w", encoding="utf-8") as file:
            json.dump(data, file, indent=2)

    @staticmethod
    def _normalize_username(username: str) -> str:
        cleaned = username.strip()
        if not cleaned:
            raise ValueError("Username cannot be empty")

        normalized = re.sub(r"[^a-zA-Z0-9_-]+", "_", cleaned).strip("_").lower()
        if not normalized:
            raise ValueError("Username must contain letters or numbers")

        return normalized

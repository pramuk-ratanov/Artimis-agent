"""
Artimis Agent — Embedding Engine

Provides lightweight, local sentence embeddings via fastembed.
Used for true semantic recall of memories.
"""

import json
import logging
import numpy as np

logger = logging.getLogger("artimis.embeddings")

_embed_model = None

def get_embedding_model():
    global _embed_model
    if _embed_model is None:
        try:
            from fastembed import TextEmbedding
            # Using a very small, fast model
            _embed_model = TextEmbedding(model_name="BAAI/bge-small-en-v1.5", cache_dir=None)
        except Exception as e:
            logger.error(f"Failed to load fastembed model: {e}")
            _embed_model = False # Set to false so we don't keep trying
    return _embed_model

def get_embedding(text: str) -> list[float]:
    """Return embedding vector for text as a list of floats, or [] if unavailable."""
    model = get_embedding_model()
    if not model or isinstance(model, bool):
        return []
    try:
        # model.embed returns a generator yielding numpy arrays
        embeddings = list(model.embed([text]))
        return embeddings[0].tolist()
    except Exception as e:
        logger.warning(f"Embedding generation failed: {e}")
        return []

def cosine_similarity(vec1: list[float], vec2: list[float]) -> float:
    """Calculate cosine similarity between two vectors."""
    if not vec1 or not vec2:
        return 0.0
    v1 = np.array(vec1)
    v2 = np.array(vec2)
    norm1 = np.linalg.norm(v1)
    norm2 = np.linalg.norm(v2)
    if norm1 == 0 or norm2 == 0:
        return 0.0
    return float(np.dot(v1, v2) / (norm1 * norm2))

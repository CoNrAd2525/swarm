"""Persistent code database — JSON-backed storage for all detected codes.

Survives restarts, enables:
- Historical code tracking
- Deduplication across runs
- Analytics on past detections
- Export/import of code lists
"""

from __future__ import annotations

import json
import os
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional

from src.config.settings import settings
from src.utils.logger import get_logger
from src.modules.detection_engine import CodeType, DetectedCode

logger = get_logger(__name__)


class CodeDatabase:
    """
    JSON-file-backed persistent code database.

    Structure:
    {
      "version": 1,
      "last_updated": "...",
      "stats": {...},
      "codes": {
        "CODESTRING": {
          "code": "CODESTRING",
          "code_type": "gift_card",
          "status": "redeemed",
          "confidence": 0.95,
          "source_group": -1001270357028,
          "source_name": "Binance Freebies",
          "detected_at": "2026-01-01T12:00:00",
          "verified_at": "2026-01-01T12:00:01",
          "redeemed_at": "2026-01-01T12:00:02",
          "token": "BNB",
          "amount": 0.001,
          "metadata": {}
        }
      }
    }
    """

    def __init__(self, db_path: Optional[str] = None):
        self._db_path = Path(db_path or "data/codes/codes_db.json")
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        self._data: Dict = self._load()

    def _load(self) -> Dict:
        """Load database from disk."""
        if self._db_path.exists():
            try:
                with open(self._db_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                logger.info(f"Code database loaded: {len(data.get('codes', {}))} codes from disk")
                return data
            except Exception as e:
                logger.error(f"Failed to load code database: {e}")

        # Default structure
        return {
            "version": 1,
            "last_updated": datetime.utcnow().isoformat(),
            "stats": {
                "total_detected": 0,
                "total_redeemed": 0,
                "total_value_usd": 0.0,
            },
            "codes": {},
        }

    def _save(self) -> None:
        """Save database to disk."""
        self._data["last_updated"] = datetime.utcnow().isoformat()
        try:
            with open(self._db_path, "w", encoding="utf-8") as f:
                json.dump(self._data, f, indent=2, ensure_ascii=False, default=str)
        except Exception as e:
            logger.error(f"Failed to save code database: {e}")

    def add_code(self, detected: DetectedCode) -> bool:
        """
        Add a detected code to the database.

        Returns True if new code was added, False if duplicate.
        """
        code_key = detected.code
        if code_key in self._data["codes"]:
            # Update existing entry with any new info
            existing = self._data["codes"][code_key]
            if detected.confidence > existing.get("confidence", 0):
                existing["confidence"] = detected.confidence
                existing["code_type"] = detected.code_type.value
            if detected.source_group and not existing.get("source_group"):
                existing["source_group"] = detected.source_group
            self._save()
            return False

        # New code
        self._data["codes"][code_key] = {
            "code": detected.code,
            "code_type": detected.code_type.value,
            "status": "detected",
            "confidence": detected.confidence,
            "source_group": detected.source_group,
            "source_name": detected.source_name,
            "detected_at": detected.detected_at.isoformat(),
            "verified_at": None,
            "redeemed_at": None,
            "token": "",
            "amount": 0.0,
            "value_usd": 0.0,
            "metadata": detected.metadata,
        }
        self._data["stats"]["total_detected"] += 1
        self._save()
        return True

    def update_status(
        self,
        code: str,
        status: str,
        token: str = "",
        amount: float = 0.0,
        value_usd: float = 0.0,
    ) -> None:
        """Update a code's status and related info."""
        if code not in self._data["codes"]:
            return

        entry = self._data["codes"][code]
        entry["status"] = status

        if token:
            entry["token"] = token
        if amount:
            entry["amount"] = amount
        if value_usd:
            entry["value_usd"] = value_usd

        if status == "verified":
            entry["verified_at"] = datetime.utcnow().isoformat()
        elif status == "redeemed":
            entry["redeemed_at"] = datetime.utcnow().isoformat()
            self._data["stats"]["total_redeemed"] += 1
            self._data["stats"]["total_value_usd"] += value_usd

        self._save()

    def get_code(self, code: str) -> Optional[Dict]:
        """Get a specific code's data."""
        return self._data["codes"].get(code)

    def get_codes_by_status(self, status: str) -> List[Dict]:
        """Get all codes with a specific status."""
        return [
            entry for entry in self._data["codes"].values()
            if entry.get("status") == status
        ]

    def get_codes_by_type(self, code_type: str) -> List[Dict]:
        """Get all codes of a specific type."""
        return [
            entry for entry in self._data["codes"].values()
            if entry.get("code_type") == code_type
        ]

    def get_codes_by_group(self, group_id: int) -> List[Dict]:
        """Get all codes from a specific group."""
        return [
            entry for entry in self._data["codes"].values()
            if entry.get("source_group") == group_id
        ]

    def get_recent(self, limit: int = 20) -> List[Dict]:
        """Get most recently detected codes."""
        codes = sorted(
            self._data["codes"].values(),
            key=lambda c: c.get("detected_at", ""),
            reverse=True,
        )
        return codes[:limit]

    def search(self, query: str) -> List[Dict]:
        """Search codes by partial match."""
        query_upper = query.upper()
        return [
            entry for key, entry in self._data["codes"].items()
            if query_upper in key.upper()
            or query.lower() in entry.get("code_type", "").lower()
            or query.lower() in entry.get("token", "").lower()
        ]

    def export_codes(self, status: Optional[str] = None) -> List[str]:
        """Export code strings, optionally filtered by status."""
        if status:
            return [e["code"] for e in self.get_codes_by_status(status)]
        return list(self._data["codes"].keys())

    @property
    def total_codes(self) -> int:
        return len(self._data["codes"])

    @property
    def stats(self) -> Dict:
        return {
            **self._data["stats"],
            "by_status": {
                status: len(self.get_codes_by_status(status))
                for status in ["detected", "verified", "redeemed", "invalid", "expired", "failed"]
            },
            "by_type": {
                ct: len(self.get_codes_by_type(ct))
                for ct in set(e.get("code_type", "") for e in self._data["codes"].values())
            },
        }

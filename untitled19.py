# -*- coding: utf-8 -*-
"""Safety-cleaned utilities.

This file previously included code oriented around private-key searching. That functionality has been removed/disabled.
Only configuration parsing, range math, and environment inspection remain.
"""

from __future__ import annotations

import argparse
import json
import logging
import shutil
import subprocess
import sys
import xml.etree.ElementTree as ET
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Iterable, Iterator, List, Optional, Sequence

LOG = logging.getLogger("bitcoin_puzzle_solver")

PUZZLE_MIN = 1
PUZZLE_MAX = 160

DEFAULT_PUZZLE_ADDRESSES = {
    69: "13zb1hQbWVsc2S7ZTZnP2G4undNNpdh5so",
    70: "1BY8GQbnueYofwSuFAT3USAhGjPrkxDdW9",
    71: "1MVDYgVaSN6iKKEsbzRUAYFhNJT1eLf2E3",
    72: "1BCf6rHUW6m3iH2ptsvnjgLruAiPQQepLe",
    73: "1Kh22PvXERd2xpTQk3ur6pPEqFeckCJfAr",
    74: "1E7Q7Wg5S6VouSTeRZmC3G41E1Kf6VNVkE",
    75: "1KFHE7w8BhaENAswwryaoccDb6qcT6DbYY",
}


def configure_logging(verbose: bool = False) -> None:
    level = logging.DEBUG if verbose else logging.INFO
    logging.basicConfig(level=level, format="%(levelname)s: %(message)s")


def puzzle_bit_range(puzzle_number: int) -> tuple[int, int]:
    if not (PUZZLE_MIN <= puzzle_number <= PUZZLE_MAX):
        raise ValueError(f"puzzle number must be in [{PUZZLE_MIN}, {PUZZLE_MAX}]")
    return 1 << (puzzle_number - 1), (1 << puzzle_number) - 1


def parse_int(value: Optional[str], default: Optional[int] = None) -> Optional[int]:
    """Parse decimal or hex integers while rejecting placeholders.

    Examples of rejected values:
    - "0x..."
    - ""
    - None
    - "unknown"
    """

    if value is None:
        return default
    normalized = value.strip().replace("_", "")
    if not normalized:
        return default
    if "..." in normalized or normalized.lower() in {"unknown", "n/a", "null"}:
        return default
    try:
        return int(normalized, 0)
    except ValueError:
        return default


def _child_text(parent: ET.Element, tag: str) -> Optional[str]:
    child = parent.find(tag)
    if child is None or child.text is None:
        return None
    return child.text.strip()


@dataclass(frozen=True, slots=True)
class KeyRange:
    start: int
    end: int
    label: str = ""

    def __post_init__(self) -> None:
        if self.start < 0 or self.end < 0:
            raise ValueError("range boundaries must be non-negative")
        if self.start > self.end:
            raise ValueError("range start cannot exceed range end")

    @property
    def size(self) -> int:
        return self.end - self.start + 1

    @property
    def start_hex(self) -> str:
        return f"0x{self.start:x}"

    @property
    def end_hex(self) -> str:
        return f"0x{self.end:x}"

    def contains(self, value: int) -> bool:
        return self.start <= value <= self.end

    def overlaps_or_touches(self, other: "KeyRange") -> bool:
        return self.start <= other.end + 1 and other.start <= self.end + 1

    def merge(self, other: "KeyRange") -> "KeyRange":
        if not self.overlaps_or_touches(other):
            raise ValueError("cannot merge disjoint ranges")
        labels = ",".join(filter(None, [self.label, other.label]))
        return KeyRange(min(self.start, other.start), max(self.end, other.end), labels)


@dataclass(slots=True)
class PuzzleConfig:
    puzzle_number: int
    target_address: str = ""
    start: Optional[int] = None
    end: Optional[int] = None
    batch_size: int = 50
    excluded_ranges: List[KeyRange] = field(default_factory=list)
    metadata: dict[str, str] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if not (PUZZLE_MIN <= self.puzzle_number <= PUZZLE_MAX):
            raise ValueError(f"invalid puzzle number: {self.puzzle_number}")
        if self.batch_size < 1:
            raise ValueError("batch_size must be >= 1")
        if self.start is None or self.end is None:
            self.start, self.end = puzzle_bit_range(self.puzzle_number)
        if self.start > self.end:
            raise ValueError("start cannot exceed end")
        self.excluded_ranges = merge_ranges(self.excluded_ranges)
        if not self.target_address:
            self.target_address = DEFAULT_PUZZLE_ADDRESSES.get(self.puzzle_number, "")

    @property
    def full_range(self) -> KeyRange:
        return KeyRange(self.start or 0, self.end or 0, "full")

    @property
    def searchable_ranges(self) -> List[KeyRange]:
        cursor = self.full_range.start
        searchable: List[KeyRange] = []
        for excluded in self.excluded_ranges:
            if excluded.end < self.full_range.start or excluded.start > self.full_range.end:
                continue
            clipped = KeyRange(
                max(excluded.start, self.full_range.start),
                min(excluded.end, self.full_range.end),
                excluded.label,
            )
            if cursor < clipped.start:
                searchable.append(
                    KeyRange(cursor, clipped.start - 1, f"searchable-{len(searchable) + 1}")
                )
            cursor = max(cursor, clipped.end + 1)
        if cursor <= self.full_range.end:
            searchable.append(
                KeyRange(cursor, self.full_range.end, f"searchable-{len(searchable) + 1}")
            )
        return searchable

    @property
    def total_searchable_keys(self) -> int:
        return sum(r.size for r in self.searchable_ranges)

    @property
    def total_excluded_keys(self) -> int:
        return sum(
            max(0, min(r.end, self.full_range.end) - max(r.start, self.full_range.start) + 1)
            for r in self.excluded_ranges
            if r.end >= self.full_range.start and r.start <= self.full_range.end
        )

    @property
    def coverage_percent(self) -> float:
        total = self.full_range.size
        return (self.total_excluded_keys / total * 100.0) if total else 0.0

    def iter_batches(self, batch_size: Optional[int] = None) -> Iterator[tuple[int, int]]:
        size = batch_size or self.batch_size
        for rng in self.searchable_ranges:
            start = rng.start
            while start <= rng.end:
                end = min(start + size - 1, rng.end)
                yield start, end
                start = end + 1

    def summary(self) -> str:
        lines = [
            f"Puzzle #{self.puzzle_number}",
            f"Target address: {self.target_address or '(not set)'}",
            f"Range: {self.full_range.start_hex} -> {self.full_range.end_hex}",
            f"Batch size: {self.batch_size}",
            f"Excluded ranges: {len(self.excluded_ranges)}",
            f"Searchable ranges: {len(self.searchable_ranges)}",
            f"Excluded coverage: {self.coverage_percent:.6f}%",
            f"Searchable keys: {self.total_searchable_keys}",
        ]
        return "\n".join(lines)


def merge_ranges(ranges: Iterable[KeyRange]) -> List[KeyRange]:
    ordered = sorted(ranges, key=lambda item: (item.start, item.end))
    if not ordered:
        return []
    merged = [ordered[0]]
    for current in ordered[1:]:
        previous = merged[-1]
        if previous.overlaps_or_touches(current):
            merged[-1] = previous.merge(current)
        else:
            merged.append(current)
    return merged


def load_config_from_xml_text(xml_text: str) -> PuzzleConfig:
    root = ET.fromstring(xml_text)
    puzzle_number = parse_int(_child_text(root, "PUZZLE_NUMBER"))
    if puzzle_number is None:
        raise ValueError("XML is missing a valid PUZZLE_NUMBER")

    start = parse_int(_child_text(root, "START_HEX"))
    end = parse_int(_child_text(root, "END_HEX"))
    batch_size = parse_int(_child_text(root, "BATCH_SIZE"), default=50) or 50
    target_address = _child_text(root, "TARGET_ADDRESS") or ""

    excluded_ranges: List[KeyRange] = []
    excluded_parent = root.find("EXCLUDED_RANGES")
    if excluded_parent is not None:
        for idx, item in enumerate(excluded_parent.findall("Range"), start=1):
            range_start = parse_int(item.get("start"))
            range_end = parse_int(item.get("end"))
            if range_start is None or range_end is None:
                LOG.debug("Skipping invalid excluded range #%s", idx)
                continue
            excluded_ranges.append(
                KeyRange(range_start, range_end, item.get("label", f"excluded-{idx}"))
            )

    metadata: dict[str, str] = {}
    metadata_parent = root.find("METADATA")
    if metadata_parent is not None:
        for child in metadata_parent:
            if child.text and child.text.strip():
                metadata[child.tag] = child.text.strip()

    return PuzzleConfig(
        puzzle_number=puzzle_number,
        target_address=target_address,
        start=start,
        end=end,
        batch_size=batch_size,
        excluded_ranges=excluded_ranges,
        metadata=metadata,
    )


def load_config_from_xml_file(path: str | Path) -> PuzzleConfig:
    return load_config_from_xml_text(Path(path).read_text(encoding="utf-8"))


@dataclass(frozen=True, slots=True)
class GPUInfo:
    name: str
    driver_version: str
    compute_capability: str
    memory_total_mb: int
    memory_free_mb: int


def detect_gpu() -> Optional[GPUInfo]:
    if shutil.which("nvidia-smi") is None:
        return None
    try:
        result = subprocess.run(
            [
                "nvidia-smi",
                "--query-gpu=name,driver_version,compute_cap,memory.total,memory.free",
                "--format=csv,noheader,nounits",
            ],
            capture_output=True,
            text=True,
            timeout=5,
            check=False,
        )
    except (OSError, subprocess.SubprocessError):
        return None

    if result.returncode != 0 or not result.stdout.strip():
        return None

    parts = [part.strip() for part in result.stdout.splitlines()[0].split(",")]
    if len(parts) < 5:
        return None
    try:
        return GPUInfo(
            name=parts[0],
            driver_version=parts[1],
            compute_capability=parts[2],
            memory_total_mb=int(float(parts[3])),
            memory_free_mb=int(float(parts[4])),
        )
    except ValueError:
        return None


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--verbose", action="store_true", help="enable debug logging")

    subparsers = parser.add_subparsers(dest="command", required=True)

    summary = subparsers.add_parser("summary", help="print puzzle summary from XML")
    summary.add_argument("--xml", required=True, help="path to puzzle XML")

    env = subparsers.add_parser("env", help="show optional runtime environment info")
    env.add_argument(
        "--as-json",
        action="store_true",
        help="print environment information as JSON",
    )

    return parser


def _command_summary(xml_path: str) -> int:
    config = load_config_from_xml_file(xml_path)
    print(config.summary())
    return 0


def _command_env(as_json: bool) -> int:
    gpu = detect_gpu()
    payload = {
        "python": sys.version.split()[0],
        "ripemd160_available": _ripemd160_available(),
        "gpu": None if gpu is None else asdict(gpu),
    }
    if as_json:
        print(json.dumps(payload, indent=2))
    else:
        print(json.dumps(payload, indent=2))
    return 0


def _module_available(name: str) -> bool:
    try:
        __import__(name)
        return True
    except ImportError:
        return False


def _ripemd160_available() -> bool:
    try:
        import hashlib

        hashlib.new("ripemd160")
        return True
    except ValueError:
        return _module_available("Crypto.Hash.RIPEMD160")


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = _build_parser()
    args = parser.parse_args(argv)
    configure_logging(verbose=args.verbose)

    if args.command == "summary":
        return _command_summary(args.xml)
    if args.command == "env":
        return _command_env(args.as_json)
    parser.error("unknown command")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())

"""Group Activity Monitor — track per-group stats, health, message rates, and code productivity."""

from __future__ import annotations

import asyncio
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple

from rich.table import Table

from src.config.settings import settings
from src.utils.logger import get_logger, console
from src.utils.events import EventBus, EventType, Event

logger = get_logger(__name__)


@dataclass
class GroupStats:
    """Statistics for a single Telegram group."""
    group_id: int
    group_name: str = ""
    is_active: bool = True

    # Message tracking
    total_messages: int = 0
    messages_last_hour: int = 0
    messages_last_24h: int = 0

    # Code detection tracking
    codes_detected: int = 0
    codes_verified_valid: int = 0
    codes_redeemed: int = 0
    codes_failed: int = 0

    # Code types breakdown
    code_type_counts: Dict[str, int] = field(default_factory=lambda: defaultdict(int))

    # Value tracking
    total_value_usd: float = 0.0

    # Timing
    first_message_at: Optional[datetime] = None
    last_message_at: Optional[datetime] = None
    last_code_at: Optional[datetime] = None

    # Health
    consecutive_errors: int = 0
    last_error: Optional[str] = None

    @property
    def code_hit_rate(self) -> float:
        """Percentage of messages that contain codes."""
        if self.total_messages == 0:
            return 0.0
        return (self.codes_detected / self.total_messages) * 100

    @property
    def messages_per_hour(self) -> float:
        """Estimated messages per hour based on recent data."""
        return self.messages_last_hour

    @property
    def productivity_score(self) -> float:
        """
        Group productivity score (0-100) based on:
        - Code detection rate (40%)
        - Successful redemptions (40%)
        - Activity level (20%)
        """
        code_score = min(self.code_hit_rate * 10, 40)
        redeem_score = min(self.codes_redeemed * 5, 40)
        activity_score = min(self.messages_last_hour / 10 * 2, 20)
        return code_score + redeem_score + activity_score


class GroupMonitor:
    """
    Monitors Telegram group activity and productivity.

    Features:
    - Per-group message counting and rate tracking
    - Code detection rate per group
    - Productivity scoring to identify best groups
    - Health monitoring (error rates, staleness)
    - Integration with Event Bus for real-time updates
    - Historical message scanning
    """

    def __init__(self, event_bus: Optional[EventBus] = None):
        self._groups: Dict[int, GroupStats] = {}
        self._event_bus = event_bus
        self._running = False

        # Initialize all configured groups
        for gid in settings.telegram.group_ids:
            self._groups[gid] = GroupStats(group_id=gid, group_name=f"Group {gid}")

        # Subscribe to events
        if self._event_bus:
            self._event_bus.subscribe(EventType.GROUP_MESSAGE, self._on_group_message)
            self._event_bus.subscribe(EventType.GROUP_CODE_FOUND, self._on_group_code)
            self._event_bus.subscribe(EventType.CODE_VERIFIED, self._on_code_verified)
            self._event_bus.subscribe(EventType.CODE_REDEEMED, self._on_code_redeemed)
            self._event_bus.subscribe(EventType.CODE_FAILED, self._on_code_failed)

    async def _on_group_message(self, event: Event) -> None:
        """Handle incoming group messages."""
        group_id = event.data.get("group_id", 0)
        if group_id not in self._groups:
            self._groups[group_id] = GroupStats(group_id=group_id)

        stats = self._groups[group_id]
        stats.total_messages += 1
        stats.messages_last_hour += 1
        stats.messages_last_24h += 1
        now = datetime.utcnow()
        stats.last_message_at = now
        if stats.first_message_at is None:
            stats.first_message_at = now

    async def _on_group_code(self, event: Event) -> None:
        """Handle code detections in groups."""
        group_id = event.data.get("group_id", 0)
        code_type = event.data.get("code_type", "unknown")
        if group_id not in self._groups:
            self._groups[group_id] = GroupStats(group_id=group_id)

        stats = self._groups[group_id]
        stats.codes_detected += 1
        stats.code_type_counts[code_type] += 1
        stats.last_code_at = datetime.utcnow()

    async def _on_code_verified(self, event: Event) -> None:
        """Handle successful code verifications."""
        group_id = event.data.get("source_group", 0)
        if group_id in self._groups:
            self._groups[group_id].codes_verified_valid += 1

    async def _on_code_redeemed(self, event: Event) -> None:
        """Handle successful code redemptions."""
        group_id = event.data.get("source_group", 0)
        value = event.data.get("value_usd", 0)
        if group_id in self._groups:
            self._groups[group_id].codes_redeemed += 1
            self._groups[group_id].total_value_usd += value

    async def _on_code_failed(self, event: Event) -> None:
        """Handle code failures."""
        group_id = event.data.get("source_group", 0)
        if group_id in self._groups:
            self._groups[group_id].codes_failed += 1

    def record_message(self, group_id: int, group_name: str = "") -> None:
        """Manually record a message event."""
        if group_id not in self._groups:
            self._groups[group_id] = GroupStats(group_id=group_id, group_name=group_name)
        elif group_name and not self._groups[group_id].group_name:
            self._groups[group_id].group_name = group_name

        stats = self._groups[group_id]
        stats.total_messages += 1
        stats.messages_last_hour += 1
        now = datetime.utcnow()
        stats.last_message_at = now
        if stats.first_message_at is None:
            stats.first_message_at = now

    def record_code_detected(
        self,
        group_id: int,
        code_type: str = "unknown",
    ) -> None:
        """Manually record a code detection event."""
        if group_id not in self._groups:
            self._groups[group_id] = GroupStats(group_id=group_id)

        stats = self._groups[group_id]
        stats.codes_detected += 1
        stats.code_type_counts[code_type] += 1
        stats.last_code_at = datetime.utcnow()

    def get_group(self, group_id: int) -> Optional[GroupStats]:
        """Get stats for a specific group."""
        return self._groups.get(group_id)

    def get_top_groups(self, by: str = "codes_detected", limit: int = 10) -> List[GroupStats]:
        """Get top groups ranked by a metric."""
        groups = list(self._groups.values())
        if by == "codes_detected":
            groups.sort(key=lambda g: g.codes_detected, reverse=True)
        elif by == "codes_redeemed":
            groups.sort(key=lambda g: g.codes_redeemed, reverse=True)
        elif by == "productivity":
            groups.sort(key=lambda g: g.productivity_score, reverse=True)
        elif by == "value":
            groups.sort(key=lambda g: g.total_value_usd, reverse=True)
        elif by == "messages":
            groups.sort(key=lambda g: g.total_messages, reverse=True)
        return groups[:limit]

    def get_groups_table(self) -> Table:
        """Generate a Rich table showing all group stats."""
        table = Table(
            title="Telegram Group Monitor",
            show_lines=True,
            border_style="cyan",
        )
        table.add_column("Group", style="cyan", max_width=20)
        table.add_column("Msgs", style="dim", justify="right", width=7)
        table.add_column("Codes", style="green", justify="right", width=6)
        table.add_column("Valid", style="yellow", justify="right", width=6)
        table.add_column("Redeemed", style="bold green", justify="right", width=8)
        table.add_column("Hit%", style="magenta", justify="right", width=6)
        table.add_column("Value", style="green", justify="right", width=10)
        table.add_column("Score", style="bold", justify="right", width=6)
        table.add_column("Status", style="bold", width=7)

        groups = sorted(self._groups.values(), key=lambda g: g.codes_detected, reverse=True)

        for g in groups:
            status = "[green]LIVE[/]" if g.is_active and g.last_message_at else "[dim]IDLE[/]"
            if g.last_message_at:
                age = (datetime.utcnow() - g.last_message_at).total_seconds()
                if age > 3600:
                    status = "[yellow]STALE[/]"
                if age > 86400:
                    status = "[red]DEAD[/]"

            name = g.group_name or str(g.group_id)[-10:]
            table.add_row(
                name[:20],
                str(g.total_messages),
                str(g.codes_detected),
                str(g.codes_verified_valid),
                str(g.codes_redeemed),
                f"{g.code_hit_rate:.1f}",
                f"${g.total_value_usd:.4f}",
                f"{g.productivity_score:.0f}",
                status,
            )

        return table

    async def run_hourly_reset(self) -> None:
        """Reset hourly counters every hour."""
        self._running = True
        while self._running:
            await asyncio.sleep(3600)
            for g in self._groups.values():
                g.messages_last_hour = 0

    def stop(self) -> None:
        self._running = False

    @property
    def total_stats(self) -> Dict:
        """Aggregate stats across all groups."""
        return {
            "total_groups": len(self._groups),
            "active_groups": len([g for g in self._groups.values() if g.is_active]),
            "total_messages": sum(g.total_messages for g in self._groups.values()),
            "total_codes_detected": sum(g.codes_detected for g in self._groups.values()),
            "total_codes_redeemed": sum(g.codes_redeemed for g in self._groups.values()),
            "total_value_usd": sum(g.total_value_usd for g in self._groups.values()),
        }

"""Enhanced Crypto Box Manager — full detection engine + DB + events + analytics integration."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from datetime import datetime
from typing import Dict, List, Optional

from rich.table import Table

from src.core.binance_client import BinanceClient, BinanceAPIError
from src.config.settings import settings
from src.utils.logger import get_logger, console
from src.utils.helpers import format_crypto_amount, format_usd
from src.utils.events import EventBus, EventType, event_bus
from src.utils.code_database import CodeDatabase
from src.modules.detection_engine import CodeType, DetectedCode, detection_engine

logger = get_logger(__name__)


@dataclass
class CryptoBoxCode:
    """Represents a Binance crypto box / gift card code."""
    code: str
    code_type: str = "generic"
    token: str = ""
    amount: float = 0.0
    confidence: float = 0.0
    status: str = "unknown"  # "valid", "invalid", "redeemed", "expired", "unknown", "detected", "failed"
    verified_at: Optional[datetime] = None
    redeemed_at: Optional[datetime] = None
    source: str = ""
    source_group: int = 0

    @property
    def is_redeemable(self) -> bool:
        return self.status == "valid" and self.amount > 0

    @property
    def display_code(self) -> str:
        if len(self.code) <= 16:
            return self.code
        return f"{self.code[:8]}...{self.code[-4:]}"


class CryptoBoxManagerV2:
    """
    Enhanced Crypto Box Manager with:
    - Advanced detection engine integration
    - Persistent code database
    - Event bus for real-time notifications
    - Per-type tracking and analytics
    - Auto-verify + auto-redeem pipeline
    - Batch operations with rate limiting
    - Gift card creation
    """

    def __init__(
        self,
        client: BinanceClient,
        event_bus: Optional[EventBus] = None,
        code_db: Optional[CodeDatabase] = None,
    ):
        self.client = client
        self._event_bus = event_bus or event_bus
        self._code_db = code_db or CodeDatabase()
        self._codes: Dict[str, CryptoBoxCode] = {}
        self._running = False

        # Stats
        self._total_detected = 0
        self._total_verified = 0
        self._total_redeemed = 0
        self._total_value_usd = 0.0
        self._type_counts: Dict[str, int] = {}

        # Subscribe to detection events
        self._event_bus.subscribe(EventType.CODE_DETECTED, self._on_code_detected)

    async def _on_code_detected(self, event) -> None:
        """Auto-process codes detected by the event bus."""
        code = event.data.get("code", "")
        source = event.data.get("source", "")
        source_group = event.data.get("source_group", 0)
        code_type = event.data.get("code_type", "generic")
        confidence = event.data.get("confidence", 0)

        if code:
            entry = self.add_code(code, source=source, source_group=source_group)
            entry.code_type = code_type
            entry.confidence = confidence

            # Auto-verify high-confidence codes
            if confidence >= 0.7:
                await self.verify(entry)
                # Auto-redeem if valid
                if settings.crypto_box.auto_redeem and entry.is_redeemable:
                    await self.redeem(entry)

    def add_code(
        self,
        code: str,
        source: str = "manual",
        source_group: int = 0,
    ) -> CryptoBoxCode:
        """Add a code for tracking."""
        if code in self._codes:
            return self._codes[code]

        entry = CryptoBoxCode(
            code=code,
            source=source,
            source_group=source_group,
        )
        self._codes[code] = entry
        self._total_detected += 1
        logger.info(f"Added code [cyan]{entry.display_code}[/] from [yellow]{source}[/]")
        return entry

    def add_detected(self, detected: DetectedCode) -> CryptoBoxCode:
        """Add a DetectedCode from the detection engine."""
        entry = self.add_code(
            detected.code,
            source=detected.source_name or "detection_engine",
            source_group=detected.source_group,
        )
        entry.code_type = detected.code_type.value
        entry.confidence = detected.confidence

        # Store in persistent DB
        if self._code_db:
            self._code_db.add_code(detected)

        return entry

    def add_codes_from_text(
        self,
        text: str,
        source: str = "manual",
        source_group: int = 0,
    ) -> List[CryptoBoxCode]:
        """Use the detection engine to find and add all codes in text."""
        detected_list = detection_engine.detect_all(
            text=text,
            source_group=source_group,
            source_name=source,
        )
        added = []
        for detected in detected_list:
            entry = self.add_detected(detected)
            added.append(entry)
        if added:
            logger.info(f"Detected [bold green]{len(added)}[/] codes from {source}")
        return added

    async def verify(self, entry: CryptoBoxCode) -> bool:
        """Verify a code with Binance API."""
        try:
            result = await self.client.verify_gift_card(entry.code)
            entry.token = result.get("token", "")
            entry.amount = float(result.get("amount", 0))
            entry.status = "valid"
            entry.verified_at = datetime.utcnow()
            self._total_verified += 1

            # Update DB
            if self._code_db:
                self._code_db.update_status(
                    entry.code, "verified",
                    token=entry.token, amount=entry.amount,
                )

            # Emit event
            await self._event_bus.emit_simple(
                EventType.CODE_VERIFIED,
                data={
                    "code": entry.code,
                    "token": entry.token,
                    "amount": entry.amount,
                    "source_group": entry.source_group,
                },
                source="crypto_box_manager",
            )

            logger.info(
                f"[bold green]VALID[/] {entry.code_type} code {entry.display_code}: "
                f"{format_crypto_amount(entry.amount)} {entry.token}"
            )
            return True

        except BinanceAPIError as e:
            if "code is invalid" in str(e).lower():
                entry.status = "invalid"
            elif "already redeemed" in str(e).lower():
                entry.status = "redeemed"
            elif "expired" in str(e).lower():
                entry.status = "expired"
            else:
                entry.status = "invalid"

            if self._code_db:
                self._code_db.update_status(entry.code, entry.status)

            await self._event_bus.emit_simple(
                EventType.CODE_FAILED,
                data={"code": entry.code, "error": str(e), "source_group": entry.source_group},
                source="crypto_box_manager",
            )
            return False

        except Exception as e:
            logger.error(f"Verification error: {e}")
            return False

    async def verify_all_pending(self) -> int:
        """Verify all pending/unverified codes concurrently."""
        pending = [c for c in self._codes.values() if c.status in ("unknown", "detected")]
        if not pending:
            return 0

        logger.info(f"Verifying [bold cyan]{len(pending)}[/] pending codes...")
        semaphore = asyncio.Semaphore(5)

        async def _verify_limited(entry):
            async with semaphore:
                return await self.verify(entry)

        results = await asyncio.gather(
            *[_verify_limited(c) for c in pending],
            return_exceptions=True,
        )
        valid = sum(1 for r in results if r is True)
        logger.info(f"Verified: [bold green]{valid}[/] valid, [bold red]{len(pending) - valid}[/] invalid")
        return valid

    async def redeem(self, entry: CryptoBoxCode) -> bool:
        """Redeem a single code."""
        if not entry.is_redeemable:
            return False

        try:
            result = await self.client.redeem_gift_card(entry.code)
            entry.status = "redeemed"
            entry.redeemed_at = datetime.utcnow()
            self._total_redeemed += 1
            value_usd = entry.amount  # Approximate (should convert to USD)
            self._total_value_usd += value_usd

            if self._code_db:
                self._code_db.update_status(entry.code, "redeemed", value_usd=value_usd)

            await self._event_bus.emit_simple(
                EventType.CODE_REDEEMED,
                data={
                    "code": entry.code,
                    "token": entry.token,
                    "amount": entry.amount,
                    "value_usd": value_usd,
                    "source_group": entry.source_group,
                },
                source="crypto_box_manager",
            )

            logger.info(
                f"[bold green]REDEEMED[/] {entry.display_code}: "
                f"{format_crypto_amount(entry.amount)} {entry.token}"
            )
            return True

        except BinanceAPIError as e:
            logger.error(f"Redeem failed for {entry.display_code}: {e}")
            entry.status = "failed"
            if self._code_db:
                self._code_db.update_status(entry.code, "failed")
            return False

        except Exception as e:
            logger.error(f"Redeem error: {e}")
            return False

    async def redeem_all_valid(self) -> int:
        """Redeem all valid codes."""
        redeemable = [c for c in self._codes.values() if c.is_redeemable]
        if not redeemable:
            return 0

        logger.info(f"[bold cyan]Redeeming {len(redeemable)} codes...[/]")
        successful = 0
        for code in redeemable:
            if await self.redeem(code):
                successful += 1
            await asyncio.sleep(0.5)

        logger.info(f"[bold green]{successful}[/] of [bold]{len(redeemable)}[/] redeemed")
        return successful

    async def create_gift_card(self, token: str, amount: float) -> Optional[str]:
        """Create a new Binance gift card."""
        try:
            result = await self.client.create_gift_card(token, amount)
            code = result.get("code", "")
            if code:
                entry = CryptoBoxCode(
                    code=code, token=token, amount=amount,
                    status="valid", source="created",
                    verified_at=datetime.utcnow(),
                )
                self._codes[code] = entry
                logger.info(f"[bold green]CREATED[/] gift card: {format_crypto_amount(amount)} {token}")
                return code
            return None
        except BinanceAPIError as e:
            logger.error(f"Gift card creation failed: {e}")
            return None

    async def run_loop(self) -> None:
        """Main loop: verify + redeem at interval."""
        self._running = True
        interval = settings.crypto_box.check_interval_seconds
        while self._running:
            try:
                await self.verify_all_pending()
                if settings.crypto_box.auto_redeem:
                    await self.redeem_all_valid()
            except Exception as e:
                logger.error(f"Crypto box loop error: {e}")
            await asyncio.sleep(interval)

    def stop(self) -> None:
        self._running = False

    def get_status_table(self) -> Table:
        """Rich table showing all tracked codes."""
        table = Table(title="Crypto Box Codes", show_lines=True, border_style="cyan")
        table.add_column("Code", style="cyan", max_width=16)
        table.add_column("Type", style="magenta", width=12)
        table.add_column("Token", style="yellow", width=8)
        table.add_column("Amount", style="green", width=12)
        table.add_column("Conf%", style="dim", justify="right", width=5)
        table.add_column("Status", style="bold", width=9)
        table.add_column("Source", style="dim", max_width=15)

        for entry in list(self._codes.values())[:30]:
            status_style = {
                "valid": "green", "redeemed": "blue",
                "invalid": "red", "expired": "dim", "failed": "red",
            }.get(entry.status, "white")

            table.add_row(
                entry.display_code,
                entry.code_type,
                entry.token or "—",
                format_crypto_amount(entry.amount) if entry.amount else "—",
                f"{entry.confidence:.0f}" if entry.confidence else "—",
                f"[{status_style}]{entry.status}[/]",
                entry.source[:15],
            )

        return table

    def get_type_breakdown_table(self) -> Table:
        """Rich table showing code type breakdown."""
        table = Table(title="Code Type Breakdown", border_style="magenta")
        table.add_column("Type", style="magenta")
        table.add_column("Count", style="green", justify="right")
        table.add_column("Valid", style="yellow", justify="right")
        table.add_column("Redeemed", style="bold green", justify="right")

        type_counts: Dict[str, Dict] = {}
        for entry in self._codes.values():
            ct = entry.code_type
            if ct not in type_counts:
                type_counts[ct] = {"total": 0, "valid": 0, "redeemed": 0}
            type_counts[ct]["total"] += 1
            if entry.status == "valid":
                type_counts[ct]["valid"] += 1
            elif entry.status == "redeemed":
                type_counts[ct]["redeemed"] += 1

        for ct, counts in sorted(type_counts.items(), key=lambda x: x[1]["total"], reverse=True):
            table.add_row(
                ct.replace("_", " ").title(),
                str(counts["total"]),
                str(counts["valid"]),
                str(counts["redeemed"]),
            )

        return table

    @property
    def stats(self) -> dict:
        return {
            "total_codes": len(self._codes),
            "total_detected": self._total_detected,
            "total_verified": self._total_verified,
            "total_redeemed": self._total_redeemed,
            "total_value_usd": self._total_value_usd,
            "by_status": {
                s: len([c for c in self._codes.values() if c.status == s])
                for s in ("detected", "valid", "redeemed", "invalid", "expired", "failed")
            },
        }

"""Main application orchestrator V2 — full event bus + detection engine + group monitor integration."""

from __future__ import annotations

import asyncio
import signal
import sys
from datetime import datetime
from typing import Optional

from rich.console import Console
from rich.panel import Panel
from rich.table import Table

from src.config.settings import settings
from src.core.binance_client import BinanceClient
from src.modules.faucet_detector import FaucetDetector
from src.modules.crypto_boxes.manager_v2 import CryptoBoxManagerV2
from src.modules.coupon_redeemer import CouponRedeemer
from src.modules.telegram_notifier.notifier_v2 import TelegramNotifierV2
from src.modules.price_monitor import PriceMonitor
from src.modules.group_monitor import GroupMonitor
from src.modules.detection_engine import detection_engine
from src.utils.events import EventBus, event_bus
from src.utils.code_database import CodeDatabase
from src.utils.logger import get_logger, console

logger = get_logger(__name__)


class GetCodesPro:
    """
    Main application V2 — full-featured orchestrator with:
    - Event bus for inter-module communication
    - Advanced code detection engine
    - Group activity monitoring
    - Persistent code database
    - Real-time Telegram integration
    - Concurrent module execution
    - Graceful shutdown
    """

    def __init__(self):
        self.client: Optional[BinanceClient] = None
        self.faucet: Optional[FaucetDetector] = None
        self.crypto_box: Optional[CryptoBoxManagerV2] = None
        self.coupon: Optional[CouponRedeemer] = None
        self.telegram: Optional[TelegramNotifierV2] = None
        self.price_monitor: Optional[PriceMonitor] = None
        self.group_monitor: Optional[GroupMonitor] = None
        self.code_db: Optional[CodeDatabase] = None

        self._tasks: list[asyncio.Task] = []
        self._running = False
        self._start_time: Optional[datetime] = None

    async def initialize(self) -> None:
        """Initialize all modules and wire them together via event bus."""
        console.print(Panel.fit(
            "[bold cyan]GETCODES PRO v2.0[/] — Exponential Improvement\n"
            "[dim]Advanced Detection • Group Monitor • Crypto Boxes • Coupons • Price Alerts[/]",
            border_style="cyan",
        ))

        # Core: Persistent code database
        self.code_db = CodeDatabase()
        logger.info(f"[bold green]Code DB loaded[/]: {self.code_db.total_codes} codes")

        # Core: Group monitor
        self.group_monitor = GroupMonitor(event_bus=event_bus)
        logger.info("[bold green]Group Monitor[/] initialized")

        # Core: Binance client
        self.client = BinanceClient()
        try:
            status = await self.client.get_system_status()
            logger.info(f"Binance system status: {status}")
        except Exception as e:
            logger.warning(f"Binance status check: {e}")

        # Telegram (enhanced)
        if settings.features.telegram_notifier:
            try:
                self.telegram = TelegramNotifierV2(
                    event_bus=event_bus,
                    group_monitor=self.group_monitor,
                    code_db=self.code_db,
                )
                await self.telegram.connect()
            except Exception as e:
                logger.error(f"Telegram init failed: {e}")
                self.telegram = None

        # Feature modules
        if settings.features.faucet_detector:
            self.faucet = FaucetDetector(self.client)
            logger.info("[bold green]Faucet Detector[/] enabled")

        if settings.features.crypto_boxes:
            self.crypto_box = CryptoBoxManagerV2(
                self.client,
                event_bus=event_bus,
                code_db=self.code_db,
            )
            logger.info("[bold green]Crypto Box Manager V2[/] enabled (detection engine + DB + events)")

        if settings.features.coupon_redeemer:
            self.coupon = CouponRedeemer(self.client)
            logger.info("[bold green]Coupon Redeemer[/] enabled")

        if settings.features.price_monitor:
            self.price_monitor = PriceMonitor(self.client, telegram=self.telegram)
            logger.info("[bold green]Price Monitor[/] enabled")

        # Signal handlers
        self._start_time = datetime.utcnow()
        self._running = True
        for sig in (signal.SIGINT, signal.SIGTERM):
            try:
                asyncio.get_event_loop().add_signal_handler(sig, self._handle_signal, sig)
            except NotImplementedError:
                pass

    def _handle_signal(self, sig: signal.Signals) -> None:
        logger.info(f"Signal {sig.name}, shutting down...")
        self._running = False

    async def run(self) -> None:
        """Start all module loops concurrently."""
        await self.initialize()
        console.print("\n[bold green]All modules initialized. Starting main loops...[/]\n")

        module_tasks = []
        if self.faucet and settings.features.faucet_detector:
            module_tasks.append(asyncio.create_task(self.faucet.run_loop(), name="faucet"))
        if self.crypto_box and settings.features.crypto_boxes:
            module_tasks.append(asyncio.create_task(self.crypto_box.run_loop(), name="crypto_boxes"))
        if self.coupon and settings.features.coupon_redeemer:
            module_tasks.append(asyncio.create_task(self.coupon.run_loop(), name="coupons"))
        if self.price_monitor and settings.features.price_monitor:
            module_tasks.append(asyncio.create_task(self.price_monitor.run_loop(), name="prices"))
        if self.group_monitor:
            module_tasks.append(asyncio.create_task(self.group_monitor.run_hourly_reset(), name="group_reset"))

        self._tasks = module_tasks
        if not module_tasks:
            logger.warning("No modules enabled!")
            return

        try:
            await asyncio.gather(*module_tasks, return_exceptions=True)
        except asyncio.CancelledError:
            pass
        finally:
            await self.shutdown()

    async def run_single_scan(self) -> None:
        """Run a single scan cycle."""
        await self.initialize()
        console.print("\n[bold cyan]Running single scan cycle...[/]\n")
        results = {}

        # Faucet scan
        if self.faucet and settings.features.faucet_detector:
            with console.status("[bold green]Scanning faucets..."):
                opps = await self.faucet.scan_all()
                if settings.faucet.auto_claim:
                    claimed = await self.faucet.claim_all_available()
                    results["faucets_claimed"] = len(claimed)
                else:
                    results["faucets_found"] = len(opps)
                console.print(self.faucet.get_status_table())

        # Crypto box scan
        if self.crypto_box and settings.features.crypto_boxes:
            with console.status("[bold green]Verifying crypto box codes..."):
                valid = await self.crypto_box.verify_all_pending()
                if settings.crypto_box.auto_redeem:
                    redeemed = await self.crypto_box.redeem_all_valid()
                    results["codes_redeemed"] = redeemed
                else:
                    results["codes_valid"] = valid
                console.print(self.crypto_box.get_status_table())
                console.print(self.crypto_box.get_type_breakdown_table())

        # Coupon scan
        if self.coupon and settings.features.coupon_redeemer:
            with console.status("[bold green]Scanning coupons/freebies..."):
                coupons = await self.coupon.scan_all()
                if settings.coupon.auto_redeem:
                    redeemed = await self.coupon.redeem_all_available()
                    results["coupons_redeemed"] = len(redeemed)
                else:
                    results["coupons_found"] = len(coupons)
                console.print(self.coupon.get_status_table())

        # Price check
        if self.price_monitor and settings.features.price_monitor:
            with console.status("[bold green]Fetching prices..."):
                await self.price_monitor.fetch_all()
                console.print(self.price_monitor.get_live_table())

        # Group monitor
        if self.group_monitor:
            console.print(self.group_monitor.get_groups_table())

        # Event bus stats
        console.print(self._get_event_table())

        self._print_summary(results)
        await self.shutdown()

    async def scan_history(self, limit: int = 200, days: int = 7) -> None:
        """Scan historical messages in all groups."""
        await self.initialize()
        console.print(f"\n[bold cyan]Scanning history[/]: {limit} msgs/group, {days} days back\n")

        if self.telegram:
            results = await self.telegram.scan_all_groups_history(
                limit_per_group=limit,
                offset_days=days,
            )
            total = sum(len(codes) for codes in results.values())
            console.print(f"\n[bold green]History scan complete:[/] {total} codes found across {len(results)} groups")

            if self.crypto_box:
                # Auto-verify detected history codes
                for gid, codes in results.items():
                    for detected in codes:
                        entry = self.crypto_box.add_detected(detected)

                with console.status("[bold green]Verifying history codes..."):
                    valid = await self.crypto_box.verify_all_pending()
                    if settings.crypto_box.auto_redeem:
                        redeemed = await self.crypto_box.redeem_all_valid()
                        console.print(f"Redeemed: [bold green]{redeemed}[/]")

                console.print(self.crypto_box.get_status_table())
                console.print(self.crypto_box.get_type_breakdown_table())

        if self.group_monitor:
            console.print(self.group_monitor.get_groups_table())

        await self.shutdown()

    def _get_event_table(self) -> Table:
        """Event bus statistics table."""
        stats = event_bus.stats
        table = Table(title="Event Bus", border_style="magenta")
        table.add_column("Metric", style="cyan")
        table.add_column("Value", style="green")
        table.add_row("Total Emitted", str(stats["total_emitted"]))
        table.add_row("Subscribers", str(stats["subscribers"]))
        table.add_row("Errors", str(stats["total_errors"]))
        for etype, count in stats.get("event_type_counts", {}).items():
            table.add_row(f"  {etype}", str(count))
        return table

    def _print_summary(self, results: dict) -> None:
        table = Table(title="Scan Summary", show_header=True)
        table.add_column("Module", style="cyan")
        table.add_column("Result", style="green")
        for key, value in results.items():
            table.add_row(key.replace("_", " ").title(), str(value))
        console.print(table)

    async def shutdown(self) -> None:
        logger.info("[bold yellow]Shutting down...[/]")
        for task in self._tasks:
            if not task.done():
                task.cancel()
        if self._tasks:
            await asyncio.gather(*self._tasks, return_exceptions=True)

        for mod in (self.faucet, self.crypto_box, self.coupon, self.price_monitor, self.group_monitor):
            if mod:
                mod.stop()

        if self.telegram:
            await self.telegram.disconnect()
        if self.client:
            await self.client.close()

        self._print_final_stats()
        logger.info("[bold green]Shutdown complete.[/]")

    def _print_final_stats(self) -> None:
        table = Table(title="Final Statistics", border_style="green")
        table.add_column("Module", style="cyan")
        table.add_column("Stats", style="white")

        if self.client:
            s = self.client.stats
            table.add_row("Binance API", f"Req: {s['total_requests']}, Err: {s['total_errors']}")

        if self.crypto_box:
            s = self.crypto_box.stats
            table.add_row("Crypto Boxes", f"Detected: {s['total_detected']}, Verified: {s['total_verified']}, Redeemed: {s['total_redeemed']} (${s['total_value_usd']:.4f})")

        if self.code_db:
            s = self.code_db.stats
            table.add_row("Code DB", f"Total: {self.code_db.total_codes}, Redeemed: {s.get('total_redeemed', 0)}")

        if self.group_monitor:
            s = self.group_monitor.total_stats
            table.add_row("Groups", f"Groups: {s['total_groups']}, Codes: {s['total_codes_detected']}, Value: ${s['total_value_usd']:.4f}")

        if self.telegram:
            s = self.telegram.stats
            table.add_row("Telegram", f"Connected: {s['connected']}, Msgs: {s['messages_processed']}, Codes: {s['codes_found']}")

        table.add_row("Event Bus", f"Emitted: {event_bus.stats['total_emitted']}, Subs: {event_bus.stats['subscribers']}")

        console.print(table)

    def get_comprehensive_stats(self) -> dict:
        return {
            "codes_detected": self.crypto_box.stats["total_detected"] if self.crypto_box else 0,
            "codes_verified": self.crypto_box.stats["total_verified"] if self.crypto_box else 0,
            "codes_redeemed": self.crypto_box.stats["total_redeemed"] if self.crypto_box else 0,
            "total_usd": self.crypto_box.stats["total_value_usd"] if self.crypto_box else 0,
            "messages": self.telegram.stats["messages_processed"] if self.telegram else 0,
            "groups": len(settings.telegram.group_ids),
        }

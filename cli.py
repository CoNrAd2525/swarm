"""CLI interface V2 — full command set with groups, detections, history, scan-history."""

from __future__ import annotations

import asyncio
import sys

import click
from rich.console import Console
from rich.panel import Panel
from rich.table import Table
from rich.text import Text

from src import __version__, __app_name__
from src.app import GetCodesPro
from src.config.settings import settings

console = Console()


def print_banner():
    """Print application banner."""
    banner = Text()
    banner.append(f"  {__app_name__} ", style="bold cyan")
    banner.append(f"v{__version__}", style="dim")
    banner.append("\n  Exponentially Improved Binance Rewards Tool", style="dim")
    banner.append("\n  Detection Engine • Group Monitor • Crypto Boxes • Coupons • Telegram", style="dim cyan")
    console.print(Panel(banner, border_style="cyan", padding=(1, 2)))


@click.group(invoke_without_command=True)
@click.version_option(version=__version__, prog_name=__app_name__)
@click.option("--scan", is_flag=True, help="Run a single scan cycle")
@click.option("--monitor", is_flag=True, help="Start continuous monitoring")
@click.option("--faucets-only", is_flag=True, help="Only scan faucets")
@click.option("--codes-only", is_flag=True, help="Only scan crypto box codes")
@click.option("--coupons-only", is_flag=True, help="Only scan coupons/freebies")
@click.option("--prices-only", is_flag=True, help="Only monitor prices")
@click.pass_context
def main(ctx, scan, monitor, faucets_only, codes_only, coupons_only, prices_only):
    """GETCODES PRO — Exponentially improved Binance rewards tool."""
    print_banner()

    if faucets_only:
        settings.features.crypto_boxes = False
        settings.features.coupon_redeemer = False
        settings.features.price_monitor = False
    elif codes_only:
        settings.features.faucet_detector = False
        settings.features.coupon_redeemer = False
        settings.features.price_monitor = False
    elif coupons_only:
        settings.features.faucet_detector = False
        settings.features.crypto_boxes = False
        settings.features.price_monitor = False
    elif prices_only:
        settings.features.faucet_detector = False
        settings.features.crypto_boxes = False
        settings.features.coupon_redeemer = False

    app = GetCodesPro()

    if scan:
        asyncio.run(app.run_single_scan())
    elif monitor or ctx.invoked_subcommand is None:
        console.print("[bold green]Starting continuous monitoring...[/]\n")
        try:
            asyncio.run(app.run())
        except KeyboardInterrupt:
            console.print("\n[bold yellow]Shutting down...[/]")


@main.command()
@click.option("--limit", default=200, help="Messages per group to scan")
@click.option("--days", default=7, help="Days back to scan")
def scanhistory(limit, days):
    """Scan historical messages in all Telegram groups for codes."""
    console.print(f"[bold cyan]History Scan[/]: {limit} msgs/group, {days} days back")
    app = GetCodesPro()
    asyncio.run(app.scan_history(limit=limit, days=days))


@main.command()
def groups():
    """Show Telegram group monitoring status and stats."""
    from src.modules.group_monitor import GroupMonitor
    monitor = GroupMonitor()

    # Populate from settings
    for gid in settings.telegram.group_ids:
        monitor.record_message(gid, f"Group {gid}")

    console.print(monitor.get_groups_table())

    console.print(Panel.fit(
        f"[bold]Group Configuration[/]\n\n"
        f"Monitored Groups: [cyan]{len(settings.telegram.group_ids)}[/]\n"
        f"Group IDs: [dim]{', '.join(str(g) for g in settings.telegram.group_ids)}[/]\n\n"
        f"[bold]Detection Engine[/]\n"
        f"Patterns: [cyan]12[/] (URL, keyword, standalone, deeplink, near-Binance)\n"
        f"Code Types: [cyan]11[/] (gift_card, crypto_box, red_packet, pay, square, coupon, voucher, referral, airdrop, reward_center, generic)\n"
        f"Languages: [cyan]English + Chinese[/] keyword support\n\n"
        f"[bold]Code Database[/]\n"
        f"Storage: [cyan]JSON[/] (data/codes/codes_db.json)\n"
        f"Persists across restarts: [green]Yes[/]",
        border_style="cyan",
        title="Group & Detection Info",
    ))


@main.command()
@click.option("--status", "filter_status", default=None, help="Filter by status (detected/verified/redeemed/invalid)")
@click.option("--type", "filter_type", default=None, help="Filter by code type (gift_card/crypto_box/etc)")
@click.option("--limit", default=20, help="Max codes to show")
def detections(filter_status, filter_type, limit):
    """Show detected codes from the persistent database."""
    from src.utils.code_database import CodeDatabase
    db = CodeDatabase()

    if filter_status:
        codes = db.get_codes_by_status(filter_status)
    elif filter_type:
        codes = db.get_codes_by_type(filter_type)
    else:
        codes = db.get_recent(limit)

    if not codes:
        console.print("[dim]No codes in database.[/]")
        return

    table = Table(title=f"Detected Codes ({len(codes)})", show_lines=True, border_style="cyan")
    table.add_column("Code", style="cyan", max_width=16)
    table.add_column("Type", style="magenta", width=12)
    table.add_column("Status", style="bold", width=9)
    table.add_column("Token", style="yellow", width=8)
    table.add_column("Amount", style="green", width=10)
    table.add_column("Conf%", style="dim", width=5)
    table.add_column("Source", style="dim", max_width=15)
    table.add_column("Detected", style="dim", width=16)

    for c in codes[:limit]:
        status_style = {
            "valid": "green", "verified": "green", "redeemed": "blue",
            "invalid": "red", "expired": "dim", "failed": "red",
        }.get(c.get("status", ""), "white")

        table.add_row(
            c.get("code", "")[:12] + "...",
            c.get("code_type", "unknown"),
            f"[{status_style}]{c.get('status', '?')}[/]",
            c.get("token", "—") or "—",
            str(c.get("amount", "")) or "—",
            f"{c.get('confidence', 0):.0f}" if c.get("confidence") else "—",
            (c.get("source_name", "") or "")[:15],
            (c.get("detected_at", "") or "")[:16],
        )

    console.print(table)

    # Stats
    stats = db.stats
    console.print(Panel.fit(
        f"DB Stats: {db.total_codes} total | "
        f"Detected: {stats['by_status'].get('detected', 0)} | "
        f"Verified: {stats['by_status'].get('verified', 0)} | "
        f"Redeemed: {stats['by_status'].get('redeemed', 0)} | "
        f"Invalid: {stats['by_status'].get('invalid', 0)}",
        border_style="dim",
    ))


@main.command()
def history():
    """Show event bus history."""
    from src.utils.events import event_bus

    events = event_bus.get_history(limit=30)
    if not events:
        console.print("[dim]No events in history.[/]")
        return

    table = Table(title="Event History", show_lines=True, border_style="magenta")
    table.add_column("Time", style="dim", width=8)
    table.add_column("Type", style="cyan", width=18)
    table.add_column("Source", style="yellow", width=15)
    table.add_column("Data", style="white", max_width=40)

    for e in events:
        data_str = str({k: v for k, v in e.data.items() if k != "code"})[:40]
        table.add_row(
            e.timestamp.strftime("%H:%M:%S"),
            e.event_type.value,
            e.source,
            data_str,
        )

    console.print(table)
    console.print(f"Event Bus Stats: {event_bus.stats}")


@main.command()
def config():
    """Show current configuration."""
    console.print(Panel.fit(
        f"[bold]Current Configuration[/]\n\n"
        f"[cyan]Language:[/] {settings.language}\n"
        f"[cyan]Log Level:[/] {settings.log_level}\n\n"
        f"[bold]Features:[/]\n"
        f"  Faucet Detector: {'[green]ON[/]' if settings.features.faucet_detector else '[red]OFF[/]'}\n"
        f"  Crypto Boxes:    {'[green]ON[/]' if settings.features.crypto_boxes else '[red]OFF[/]'}\n"
        f"  Coupon Redeemer: {'[green]ON[/]' if settings.features.coupon_redeemer else '[red]OFF[/]'}\n"
        f"  Price Monitor:   {'[green]ON[/]' if settings.features.price_monitor else '[red]OFF[/]'}\n"
        f"  Telegram:        {'[green]ON[/]' if settings.features.telegram_notifier else '[red]OFF[/]'}\n\n"
        f"[bold]Binance:[/]\n"
        f"  API Key: {'[green]Set[/]' if settings.binance.api_key and not settings.binance.api_key.startswith('your_') else '[red]Not Set[/]'}\n"
        f"  Base URL: {settings.binance.base_url}\n\n"
        f"[bold]Telegram:[/]\n"
        f"  API ID: {'[green]Set[/]' if settings.telegram.api_id else '[red]Not Set[/]'}\n"
        f"  Groups: {len(settings.telegram.group_ids)}\n"
        f"  Group IDs: {', '.join(str(g) for g in settings.telegram.group_ids)}\n\n"
        f"[bold]Detection Engine:[/]\n"
        f"  Pattern Tiers: 5 (URL → Keyword → Deeplink → Standalone → Near-Binance)\n"
        f"  Code Types: 11 (gift_card, crypto_box, red_packet, pay, square, coupon, voucher, referral, airdrop, reward_center, generic)\n"
        f"  Languages: English + Chinese (密码/兑换码/红包/礼卡/邀请码)\n\n"
        f"[bold]Intervals:[/]\n"
        f"  Faucet: {settings.faucet.check_interval_seconds}s | Crypto Box: {settings.crypto_box.check_interval_seconds}s\n"
        f"  Coupon: {settings.coupon.check_interval_seconds}s | Price: {settings.price_monitor.interval_seconds}s\n\n"
        f"[bold]Rate Limiting:[/]\n"
        f"  Max Rate: {settings.rate_limit.rate_limit_per_second}/s | Concurrent: {settings.rate_limit.max_concurrent} | Retry: {settings.rate_limit.retry_max_attempts}",
        border_style="cyan",
        title="GETCODES PRO Configuration",
    ))


@main.command()
@click.argument("code")
def redeem(code):
    """Redeem a crypto box / gift card code."""
    console.print(f"[cyan]Redeeming code:[/] {code[:8]}...")

    async def _redeem():
        from src.core.binance_client import BinanceClient
        from src.modules.crypto_boxes.manager_v2 import CryptoBoxManagerV2

        async with BinanceClient() as client:
            manager = CryptoBoxManagerV2(client)
            entry = manager.add_code(code, source="cli")
            await manager.verify(entry)
            if entry.is_redeemable:
                ok = await manager.redeem(entry)
                if ok:
                    console.print(f"[bold green]Successfully redeemed![/] {entry.amount} {entry.token}")
                else:
                    console.print("[bold red]Redemption failed![/]")
            else:
                console.print(f"[yellow]Not redeemable[/] (status: {entry.status})")

    asyncio.run(_redeem())


@main.command()
@click.argument("codes", nargs=-1)
@click.option("--verify", is_flag=True, help="Verify codes after adding")
def addcodes(codes, verify):
    """Add one or more crypto box codes for tracking."""
    console.print(f"[cyan]Adding {len(codes)} codes...[/]")

    async def _add():
        from src.core.binance_client import BinanceClient
        from src.modules.crypto_box.manager_v2 import CryptoBoxManagerV2
        from src.modules.detection_engine import detection_engine

        async with BinanceClient() as client:
            manager = CryptoBoxManagerV2(client)

            # Use detection engine for each code
            for code in codes:
                # Treat each input as potential text containing codes
                detected = detection_engine.detect_all(code, source_name="cli")
                if detected:
                    for d in detected:
                        manager.add_detected(d)
                else:
                    manager.add_code(code, source="cli")

            if verify:
                valid = await manager.verify_all_pending()
                console.print(f"[green]{valid}[/] valid codes")

            console.print(manager.get_status_table())
            console.print(manager.get_type_breakdown_table())

    asyncio.run(_add())


@main.command()
def status():
    """Check Binance system status and account info."""
    async def _status():
        from src.core.binance_client import BinanceClient

        async with BinanceClient() as client:
            sys_status = await client.get_system_status()
            console.print(f"[cyan]Binance System Status:[/] {sys_status}")

            if settings.binance.api_key and not settings.binance.api_key.startswith("your_"):
                try:
                    info = await client.get_account_info()
                    console.print(f"[green]Account connected[/] — {len(info.get('balances', []))} assets")
                    balances = [
                        b for b in info.get("balances", [])
                        if float(b["free"]) > 0 or float(b["locked"]) > 0
                    ]
                    if balances:
                        table = Table(title="Non-Zero Balances")
                        table.add_column("Asset", style="cyan")
                        table.add_column("Free", style="green", justify="right")
                        table.add_column("Locked", style="yellow", justify="right")
                        for b in sorted(balances, key=lambda x: float(x["free"]), reverse=True)[:20]:
                            table.add_row(b["asset"], f"{float(b['free']):.8f}", f"{float(b['locked']):.8f}")
                        console.print(table)
                except Exception as e:
                    console.print(f"[red]Could not fetch account info:[/] {e}")

            console.print(f"\n[cyan]API Stats:[/] {client.stats}")

    asyncio.run(_status())


@main.command()
@click.argument("text")
def detect(text):
    """Test code detection on a text string."""
    from src.modules.detection_engine import detection_engine

    results = detection_engine.detect_all(text, source_name="cli_test")

    if not results:
        console.print("[yellow]No codes detected in text.[/]")
        return

    table = Table(title=f"Detection Results ({len(results)})", show_lines=True, border_style="green")
    table.add_column("Code", style="cyan", max_width=20)
    table.add_column("Type", style="magenta", width=14)
    table.add_column("Confidence", style="yellow", justify="right", width=10)
    table.add_column("Emoji", width=3)

    for r in results:
        table.add_row(
            r.display_code,
            r.code_type.label,
            f"{r.confidence:.0%}",
            r.code_type.emoji,
        )

    console.print(table)


if __name__ == "__main__":
    main()

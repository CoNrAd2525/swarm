"""Enhanced Telegram Notifier — real-time code detection, group scanning, event bus integration."""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta
from typing import Callable, Dict, List, Optional

from rich.table import Table
from telethon import TelegramClient, events
from telethon.tl.types import Channel, Chat, Message

from src.config.settings import settings
from src.utils.logger import get_logger, console
from src.utils.events import EventBus, EventType, event_bus
from src.modules.detection_engine import CodeDetectionEngine, CodeType, DetectedCode, detection_engine
from src.modules.group_monitor import GroupMonitor
from src.utils.code_database import CodeDatabase

logger = get_logger(__name__)


class TelegramNotifierV2:
    """
    Enhanced Telegram integration with:
    - Advanced multi-pattern code detection engine
    - Real-time event bus integration
    - Historical message scanning (find codes in past messages)
    - Group activity monitoring
    - Persistent code database
    - Per-group code tracking
    - Auto-reconnect with exponential backoff
    - Rich alert formatting
    """

    def __init__(
        self,
        event_bus: Optional[EventBus] = None,
        group_monitor: Optional[GroupMonitor] = None,
        code_db: Optional[CodeDatabase] = None,
    ):
        self._client: Optional[TelegramClient] = None
        self._event_bus = event_bus or event_bus
        self._group_monitor = group_monitor
        self._code_db = code_db
        self._connected = False
        self._reconnect_attempts = 0

        # Stats
        self._message_count = 0
        self._codes_found = 0
        self._seen_messages: set[str] = set()

        # Group metadata cache
        self._group_names: Dict[int, str] = {}

    async def connect(self) -> None:
        """Initialize and connect Telegram client with auto-reconnect."""
        try:
            self._client = TelegramClient(
                session=settings.telegram.session_name,
                api_id=settings.telegram.api_id,
                api_hash=settings.telegram.api_hash,
            )
            await self._client.start(phone=settings.telegram.phone)
            self._connected = True
            self._reconnect_attempts = 0

            # Resolve group names
            await self._resolve_group_names()

            # Register handlers
            self._register_handlers()

            logger.info(
                f"[bold green]Telegram connected[/] — monitoring "
                f"[cyan]{len(settings.telegram.group_ids)}[/] groups"
            )

            # Emit event
            await self._event_bus.emit_simple(
                EventType.SYSTEM_STARTED,
                data={"module": "telegram", "groups": len(settings.telegram.group_ids)},
                source="telegram",
            )

        except Exception as e:
            self._reconnect_attempts += 1
            logger.error(f"Telegram connection failed (attempt {self._reconnect_attempts}): {e}")
            self._connected = False

    async def _resolve_group_names(self) -> None:
        """Resolve group IDs to human-readable names."""
        if not self._client:
            return

        for group_id in settings.telegram.group_ids:
            try:
                entity = await self._client.get_entity(group_id)
                if isinstance(entity, (Channel, Chat)):
                    self._group_names[group_id] = entity.title
                    if self._group_monitor:
                        g = self._group_monitor.get_group(group_id)
                        if g:
                            g.group_name = entity.title
                    logger.debug(f"Group {group_id}: {entity.title}")
            except Exception as e:
                logger.warning(f"Could not resolve group {group_id}: {e}")
                self._group_names[group_id] = str(group_id)

    def _register_handlers(self) -> None:
        """Register Telegram event handlers for incoming messages."""

        @self._client.on(events.NewMessage(chats=settings.telegram.group_ids))
        async def on_new_message(event):
            """Handle new messages from monitored groups."""
            try:
                await self._process_message(event.message, event.chat_id)
            except Exception as e:
                logger.error(f"Message handler error: {e}")

        @self._client.on(events.MessageEdited(chats=settings.telegram.group_ids))
        async def on_message_edited(event):
            """Handle edited messages (may contain new codes)."""
            try:
                await self._process_message(event.message, event.chat_id, is_edit=True)
            except Exception as e:
                logger.error(f"Edit handler error: {e}")

    async def _process_message(
        self,
        message: Message,
        chat_id: int,
        is_edit: bool = False,
    ) -> None:
        """Process a Telegram message for code detection."""
        text = message.message or ""
        if not text:
            return

        # Deduplicate
        msg_key = f"{chat_id}:{message.id}"
        if msg_key in self._seen_messages:
            return
        self._seen_messages.add(msg_key)

        self._message_count += 1
        group_name = self._group_names.get(chat_id, str(chat_id))

        # Track message in group monitor
        if self._group_monitor:
            self._group_monitor.record_message(chat_id, group_name)

        # Emit group message event
        await self._event_bus.emit_simple(
            EventType.GROUP_MESSAGE,
            data={
                "group_id": chat_id,
                "group_name": group_name,
                "message_id": message.id,
                "text_length": len(text),
                "is_edit": is_edit,
            },
            source="telegram",
        )

        # Run advanced code detection
        detected_codes = detection_engine.detect_all(
            text=text,
            source_group=chat_id,
            source_name=group_name,
        )

        if not detected_codes:
            return

        # Process each detected code
        for detected in detected_codes:
            self._codes_found += 1

            # Store in persistent database
            if self._code_db:
                self._code_db.add_code(detected)

            # Track in group monitor
            if self._group_monitor:
                self._group_monitor.record_code_detected(
                    chat_id, detected.code_type.value,
                )

            # Emit events
            await self._event_bus.emit_simple(
                EventType.GROUP_CODE_FOUND,
                data={
                    "code": detected.code,
                    "code_type": detected.code_type.value,
                    "confidence": detected.confidence,
                    "group_id": chat_id,
                    "group_name": group_name,
                    "display_code": detected.display_code,
                },
                source="telegram",
            )

            await self._event_bus.emit_simple(
                EventType.CODE_DETECTED,
                data={
                    "code": detected.code,
                    "code_type": detected.code_type.value,
                    "confidence": detected.confidence,
                    "source_group": chat_id,
                    "source_name": group_name,
                    "source": f"telegram:{chat_id}",
                },
                source="detection_engine",
            )

            logger.info(
                f"[bold magenta]{detected.code_type.emoji} DETECTED[/] "
                f"[{detected.code_type.label}] code [cyan]{detected.display_code}[/] "
                f"(confidence: {detected.confidence:.0%}) "
                f"in [yellow]{group_name}[/]"
            )

    async def scan_history(
        self,
        group_id: int,
        limit: int = 200,
        offset_days: int = 7,
    ) -> List[DetectedCode]:
        """
        Scan historical messages in a group for codes.

        This finds codes that were posted BEFORE the bot started,
        enabling retroactive detection.

        Args:
            group_id: Telegram group ID.
            limit: Maximum number of messages to scan.
            offset_days: How many days back to scan.
        """
        if not self._client or not self._connected:
            logger.warning("Cannot scan history — not connected")
            return []

        group_name = self._group_names.get(group_id, str(group_id))
        logger.info(
            f"[bold cyan]Scanning history[/] in [yellow]{group_name}[/]: "
            f"last {limit} messages ({offset_days}d back)"
        )

        all_detected = []
        min_date = datetime.utcnow() - timedelta(days=offset_days)

        try:
            async for message in self._client.iter_messages(
                entity=group_id,
                limit=limit,
                offset_date=min_date,
                reverse=True,
            ):
                if not message or not message.message:
                    continue

                # Process for codes
                detected = detection_engine.detect_all(
                    text=message.message,
                    source_group=group_id,
                    source_name=group_name,
                )

                for d in detected:
                    # Store in DB
                    if self._code_db:
                        self._code_db.add_code(d)
                    # Track in group monitor
                    if self._group_monitor:
                        self._group_monitor.record_code_detected(group_id, d.code_type.value)

                    all_detected.append(d)

        except Exception as e:
            logger.error(f"History scan error for {group_name}: {e}")

        # Deduplicate
        seen = set()
        unique = []
        for d in all_detected:
            if d.code not in seen:
                seen.add(d.code)
                unique.append(d)

        logger.info(
            f"History scan [yellow]{group_name}[/]: "
            f"[bold green]{len(unique)}[/] unique codes found"
        )
        return unique

    async def scan_all_groups_history(
        self,
        limit_per_group: int = 200,
        offset_days: int = 7,
    ) -> Dict[int, List[DetectedCode]]:
        """Scan history of all monitored groups."""
        results = {}
        for gid in settings.telegram.group_ids:
            codes = await self.scan_history(gid, limit_per_group, offset_days)
            results[gid] = codes
        return results

    # ============== Alert Methods ==============

    async def send_alert(
        self,
        message: str,
        groups: Optional[List[int]] = None,
        parse_mode: str = "md",
    ) -> int:
        """Send an alert message to groups."""
        if not self._connected or not self._client:
            return 0

        target_groups = groups or settings.telegram.group_ids
        success = 0
        for gid in target_groups:
            try:
                await self._client.send_message(gid, message, parse_mode=parse_mode)
                success += 1
            except Exception as e:
                logger.error(f"Send failed to {gid}: {e}")
        return success

    async def send_code_alert(
        self,
        code: str,
        code_type: str,
        token: str = "",
        amount: float = 0.0,
        confidence: float = 0.0,
        group_name: str = "",
    ) -> None:
        """Send a formatted code detection alert."""
        type_emoji = {
            "gift_card": "🎁", "crypto_box": "📦", "red_packet": "🧧",
            "coupon": "🏷️", "airdrop_link": "🪂", "generic": "🔑",
        }.get(code_type, "🔑")

        msg = (
            f"{type_emoji} **Code Detected!**\n\n"
            f"Type: **{code_type.replace('_', ' ').title()}**\n"
            f"Code: `{code}`\n"
        )
        if token:
            msg += f"Token: **{token}**\n"
        if amount:
            msg += f"Amount: `{amount}`\n"
        if confidence:
            msg += f"Confidence: `{confidence:.0%}`\n"
        if group_name:
            msg += f"From: **{group_name}**\n"
        msg += f"Time: {datetime.utcnow().strftime('%H:%M:%S UTC')}"

        await self.send_alert(msg)

    async def send_summary(self, stats: dict) -> None:
        """Send a summary report."""
        msg = (
            f"📊 **GETCODES PRO Summary**\n\n"
            f"🕐 {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}\n\n"
            f"🔑 Codes Detected: **{stats.get('codes_detected', 0)}**\n"
            f"✅ Codes Verified: **{stats.get('codes_verified', 0)}**\n"
            f"💰 Codes Redeemed: **{stats.get('codes_redeemed', 0)}**\n"
            f"💵 Total Value: **${stats.get('total_usd', 0):.4f}**\n"
            f"📨 Messages Processed: **{stats.get('messages', 0)}**\n"
            f"📡 Groups Monitored: **{stats.get('groups', 0)}**"
        )
        await self.send_alert(msg)

    async def disconnect(self) -> None:
        """Disconnect Telegram client."""
        if self._client:
            await self._client.disconnect()
            self._connected = False
            logger.info("Telegram disconnected")

    @property
    def is_connected(self) -> bool:
        return self._connected

    @property
    def group_names(self) -> Dict[int, str]:
        return dict(self._group_names)

    @property
    def stats(self) -> dict:
        return {
            "connected": self._connected,
            "messages_processed": self._message_count,
            "codes_found": self._codes_found,
            "groups_monitored": len(settings.telegram.group_ids),
            "group_names": self._group_names,
            "reconnect_attempts": self._reconnect_attempts,
        }

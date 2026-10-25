"""Real-time Event Bus for broadcasting detections to all subscribers.

Enables loose coupling between modules:
- DetectionEngine → emits CodeDetected events
- CryptoBoxManager → subscribes to verify/redeem
- TelegramNotifier → subscribes to send alerts
- GroupMonitor → subscribes to track stats
- CLI → subscribes to display updates
"""

from __future__ import annotations

import asyncio
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Callable, Coroutine, Dict, List, Optional
import uuid

from src.utils.logger import get_logger

logger = get_logger(__name__)


class EventType(Enum):
    """All event types in the system."""
    # Code detection events
    CODE_DETECTED = "code_detected"
    CODE_VERIFIED = "code_verified"
    CODE_REDEEMED = "code_redeemed"
    CODE_FAILED = "code_failed"

    # Group events
    GROUP_MESSAGE = "group_message"
    GROUP_CODE_FOUND = "group_code_found"
    GROUP_JOINED = "group_joined"
    GROUP_LEFT = "group_left"

    # Faucet events
    FAUCET_FOUND = "faucet_found"
    FAUCET_CLAIMED = "faucet_claimed"

    # Coupon events
    COUPON_FOUND = "coupon_found"
    COUPON_REDEEMED = "coupon_redeemed"

    # Price events
    PRICE_ALERT = "price_alert"

    # System events
    SYSTEM_STARTED = "system_started"
    SYSTEM_SHUTDOWN = "system_shutdown"
    SYSTEM_ERROR = "system_error"
    HEALTH_CHECK = "health_check"


@dataclass
class Event:
    """An event in the system."""
    event_type: EventType
    data: Dict[str, Any] = field(default_factory=dict)
    timestamp: datetime = field(default_factory=datetime.utcnow)
    event_id: str = field(default_factory=lambda: str(uuid.uuid4())[:8])
    source: str = ""  # Module that emitted the event


# Type alias for event handlers
EventHandler = Callable[[Event], Coroutine[Any, Any, None]]


class EventBus:
    """
    Async event bus with subscriber management.

    Features:
    - Type-safe event subscriptions
    - Async handler execution
    - Error isolation (one failing handler doesn't break others)
    - Event history for analytics
    - Subscriber introspection
    """

    def __init__(self, max_history: int = 1000):
        self._subscribers: Dict[EventType, List[EventHandler]] = defaultdict(list)
        self._global_subscribers: List[EventHandler] = []
        self._history: List[Event] = []
        self._max_history = max_history
        self._events_emitted = 0
        self._errors = 0

    def subscribe(self, event_type: EventType, handler: EventHandler) -> None:
        """Subscribe a handler to a specific event type."""
        self._subscribers[event_type].append(handler)
        logger.debug(f"Subscribed {handler.__name__} to {event_type.value}")

    def subscribe_all(self, handler: EventHandler) -> None:
        """Subscribe a handler to ALL event types (global listener)."""
        self._global_subscribers.append(handler)
        logger.debug(f"Globally subscribed {handler.__name__}")

    def unsubscribe(self, event_type: EventType, handler: EventHandler) -> None:
        """Unsubscribe a handler from a specific event type."""
        if event_type in self._subscribers:
            self._subscribers[event_type] = [
                h for h in self._subscribers[event_type] if h != handler
            ]

    async def emit(self, event: Event) -> None:
        """
        Emit an event to all subscribers.

        Handlers are executed concurrently but errors are isolated.
        """
        self._events_emitted += 1

        # Store in history
        self._history.append(event)
        if len(self._history) > self._max_history:
            self._history = self._history[-self._max_history:]

        # Get all handlers for this event type
        handlers = list(self._subscribers.get(event.event_type, []))
        handlers.extend(self._global_subscribers)

        if not handlers:
            return

        # Execute all handlers concurrently with error isolation
        async def _safe_execute(handler: EventHandler):
            try:
                await handler(event)
            except Exception as e:
                self._errors += 1
                logger.error(
                    f"Event handler error: {handler.__name__} "
                    f"for {event.event_type.value}: {e}"
                )

        await asyncio.gather(
            *[_safe_execute(h) for h in handlers],
            return_exceptions=True,
        )

    async def emit_simple(
        self,
        event_type: EventType,
        data: Optional[Dict] = None,
        source: str = "",
    ) -> Event:
        """Convenience method to create and emit an event."""
        event = Event(
            event_type=event_type,
            data=data or {},
            source=source,
        )
        await self.emit(event)
        return event

    def get_history(
        self,
        event_type: Optional[EventType] = None,
        limit: int = 50,
    ) -> List[Event]:
        """Get event history, optionally filtered by type."""
        if event_type:
            filtered = [e for e in self._history if e.event_type == event_type]
        else:
            filtered = self._history
        return filtered[-limit:]

    def get_history_since(self, since: datetime) -> List[Event]:
        """Get events since a specific time."""
        return [e for e in self._history if e.timestamp >= since]

    @property
    def stats(self) -> Dict:
        """Get event bus statistics."""
        type_counts = defaultdict(int)
        for event in self._history:
            type_counts[event.event_type.value] += 1

        return {
            "total_emitted": self._events_emitted,
            "total_errors": self._errors,
            "history_size": len(self._history),
            "subscribers": sum(len(v) for v in self._subscribers.values()),
            "global_subscribers": len(self._global_subscribers),
            "event_type_counts": dict(type_counts),
        }


# Singleton event bus
event_bus = EventBus()

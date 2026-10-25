"""Advanced multi-pattern code detection engine.

Detects all types of Binance reward codes from text:
- Gift Card codes (Binance gift card API)
- Crypto Box codes (Binance crypto box / red packet)
- Red Packet codes (Binance Red Packet / 红包)
- Binance Pay URLs / QR codes
- Binance Square activity codes
- Coupon / voucher codes
- Referral / affiliate codes
- Airdrop claim links
- Generic alphanumeric reward codes
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Dict, List, Optional, Tuple


class CodeType(Enum):
    """Classification of detected code types."""
    GIFT_CARD = "gift_card"
    CRYPTO_BOX = "crypto_box"
    RED_PACKET = "red_packet"
    BINANCE_PAY = "binance_pay"
    SQUARE_ACTIVITY = "square_activity"
    COUPON = "coupon"
    VOUCHER = "voucher"
    REFERRAL = "referral"
    AIRDROP_LINK = "airdrop_link"
    REWARD_CENTER = "reward_center"
    GENERIC = "generic"
    UNKNOWN = "unknown"

    @property
    def emoji(self) -> str:
        emojis = {
            CodeType.GIFT_CARD: "🎁",
            CodeType.CRYPTO_BOX: "📦",
            CodeType.RED_PACKET: "🧧",
            CodeType.BINANCE_PAY: "💳",
            CodeType.SQUARE_ACTIVITY: "🎯",
            CodeType.COUPON: "🏷️",
            CodeType.VOUCHER: "🎫",
            CodeType.REFERRAL: "🔗",
            CodeType.AIRDROP_LINK: "🪂",
            CodeType.REWARD_CENTER: "🏆",
            CodeType.GENERIC: "🔑",
            CodeType.UNKNOWN: "❓",
        }
        return emojis.get(self, "❓")

    @property
    def label(self) -> str:
        return self.value.replace("_", " ").title()


@dataclass
class DetectedCode:
    """A detected code with full metadata about its detection."""
    code: str
    code_type: CodeType = CodeType.UNKNOWN
    confidence: float = 0.0  # 0.0 - 1.0 detection confidence
    source_text: str = ""  # Original text snippet (truncated)
    source_group: int = 0  # Telegram group ID (0 = non-telegram)
    source_name: str = ""  # Human-readable source name
    detected_at: datetime = field(default_factory=datetime.utcnow)
    metadata: Dict = field(default_factory=dict)  # Extra type-specific data

    @property
    def display_code(self) -> str:
        """Display-safe truncated code."""
        if len(self.code) <= 16:
            return self.code
        return f"{self.code[:8]}...{self.code[-4:]}"


class CodeDetectionEngine:
    """
    Multi-pattern code detection engine with confidence scoring.

    Uses a tiered detection approach:
    1. HIGH confidence — Binance API-structured codes, URL-embedded codes
    2. MEDIUM confidence — Keyword-adjacent codes (code:, gift:, box:)
    3. LOW confidence — Standalone alphanumeric strings that match patterns

    Each pattern is registered with a type and confidence score.
    Patterns are evaluated in order of specificity (most specific first).
    """

    # ============== Pattern Definitions ==============

    # Pattern: Binance Gift Card / Crypto Box URLs
    # e.g. https://www.binance.com/en/gift-card/ABC123DEF456
    PATTERN_GIFT_CARD_URL = re.compile(
        r'binance\.com/[a-z]{2}/gift-card/([A-Z0-9]{12,32})',
        re.IGNORECASE,
    )

    # Pattern: Binance Crypto Box URLs
    # e.g. https://www.binance.com/en/crypto-box/ABC123DEF456
    PATTERN_CRYPTO_BOX_URL = re.compile(
        r'binance\.com/[a-z]{2}/crypto-box/([A-Z0-9]{12,32})',
        re.IGNORECASE,
    )

    # Pattern: Binance Red Packet URLs
    # e.g. https://www.binance.com/en/red-packet/ABC123
    PATTERN_RED_PACKET_URL = re.compile(
        r'binance\.com/[a-z]{2}/red-packet/([A-Z0-9]{8,32})',
        re.IGNORECASE,
    )

    # Pattern: Binance Pay URLs
    # e.g. https://pay.binance.com/ABC123 or binance://pay/ABC123
    PATTERN_BINANCE_PAY_URL = re.compile(
        r'(?:pay\.binance\.com|binance://pay)/([A-Z0-9]{8,32})',
        re.IGNORECASE,
    )

    # Pattern: Binance Square activity links
    # e.g. https://www.binance.com/en/square/post/123456
    PATTERN_SQUARE_URL = re.compile(
        r'binance\.com/[a-z]{2}/square/(?:post|activity)/([0-9]{6,20})',
        re.IGNORECASE,
    )

    # Pattern: Binance airdrop / campaign links
    # e.g. https://www.binance.com/en/activity/airdrop/ABC123
    PATTERN_AIRDROP_URL = re.compile(
        r'binance\.com/[a-z]{2}/activity/(?:airdrop|campaign)/([A-Z0-9]{6,32})',
        re.IGNORECASE,
    )

    # Pattern: Keyword-adjacent codes
    # e.g. "Gift card code: ABC123DEF456", "Crypto box: XYZ789"
    PATTERN_KEYWORD_CODE = re.compile(
        r'(?:gift\s*card|crypto\s*box|red\s*packet|box\s*code|redeem\s*code|'
        r'claim\s*code|coupon\s*code|voucher\s*code|promo\s*code|'
        r'referral\s*code|invite\s*code|airdrop\s*code|'
        r'密码|兑换码|红包|礼卡|邀请码|领取码'
        r')[\s:：]+([A-Z0-9]{6,32})',
        re.IGNORECASE,
    )

    # Pattern: "Code:" standalone indicator
    PATTERN_CODE_LABEL = re.compile(
        r'(?:code|CODE|Code)[\s:：]+([A-Z0-9]{8,32})',
    )

    # Pattern: Standalone Binance gift card format (pure uppercase alphanumeric, 16-32)
    PATTERN_STANDALONE_LONG = re.compile(
        r'\b([A-Z0-9]{16,32})\b',
    )

    # Pattern: Medium-length codes near Binance keywords
    PATTERN_NEAR_BINANCE = re.compile(
        r'binance[\s\S]{0,50}?([A-Z0-9]{10,32})',
        re.IGNORECASE,
    )

    # Pattern: Binance referral / affiliate codes
    PATTERN_REFERRAL = re.compile(
        r'(?:referral|invite|affiliate|register)[\s:：]+([A-Z0-9]{6,20})',
        re.IGNORECASE,
    )

    # Pattern: Deep-link with embedded code
    # e.g. t.me/Binance_Square_Official?start=ABC123
    PATTERN_DEEPLINK = re.compile(
        r't\.me/[A-Za-z_]+[?&]start=([A-Z0-9]{6,32})',
    )

    # Pattern: Binance activity/campaign codes in shared text
    PATTERN_ACTIVITY_CODE = re.compile(
        r'(?:活动|activity|campaign|event)[\s:：]*([A-Z0-9]{8,24})',
        re.IGNORECASE,
    )

    def detect_all(
        self,
        text: str,
        source_group: int = 0,
        source_name: str = "",
    ) -> List[DetectedCode]:
        """
        Run all detection patterns on text and return classified results.

        Deduplication: if the same code string is found by multiple patterns,
        keep the one with the highest confidence score.
        """
        results: Dict[str, DetectedCode] = {}

        # Tier 1: URL-embedded codes (highest confidence)
        self._detect_urls(text, source_group, source_name, results)

        # Tier 2: Keyword-adjacent codes (high confidence)
        self._detect_keyword_codes(text, source_group, source_name, results)

        # Tier 3: Deep-link codes (medium-high confidence)
        self._detect_deeplinks(text, source_group, source_name, results)

        # Tier 4: Standalone long codes (medium confidence)
        self._detect_standalone(text, source_group, source_name, results)

        # Tier 5: Near-Binance codes (low-medium confidence)
        self._detect_near_binance(text, source_group, source_name, results)

        # Sort by confidence (highest first)
        sorted_results = sorted(results.values(), key=lambda d: d.confidence, reverse=True)
        return sorted_results

    def _add_result(
        self,
        results: Dict[str, DetectedCode],
        code: DetectedCode,
    ) -> None:
        """Add a detection result, keeping the one with highest confidence if duplicate."""
        key = code.code
        if key in results:
            if code.confidence > results[key].confidence:
                results[key] = code
        else:
            results[key] = code

    def _snippet(self, text: str, match_pos: int, context: int = 40) -> str:
        """Extract a text snippet around a match position."""
        start = max(0, match_pos - context)
        end = min(len(text), match_pos + context)
        return text[start:end].strip()

    # ============== Tier 1: URL Detection ==============

    def _detect_urls(self, text, source_group, source_name, results):
        """Detect codes embedded in Binance URLs."""
        for match in self.PATTERN_GIFT_CARD_URL.finditer(text):
            code = match.group(1).upper()
            self._add_result(results, DetectedCode(
                code=code,
                code_type=CodeType.GIFT_CARD,
                confidence=0.95,
                source_text=self._snippet(text, match.start()),
                source_group=source_group,
                source_name=source_name,
                metadata={"url_type": "gift_card"},
            ))

        for match in self.PATTERN_CRYPTO_BOX_URL.finditer(text):
            code = match.group(1).upper()
            self._add_result(results, DetectedCode(
                code=code,
                code_type=CodeType.CRYPTO_BOX,
                confidence=0.95,
                source_text=self._snippet(text, match.start()),
                source_group=source_group,
                source_name=source_name,
                metadata={"url_type": "crypto_box"},
            ))

        for match in self.PATTERN_RED_PACKET_URL.finditer(text):
            code = match.group(1).upper()
            self._add_result(results, DetectedCode(
                code=code,
                code_type=CodeType.RED_PACKET,
                confidence=0.95,
                source_text=self._snippet(text, match.start()),
                source_group=source_group,
                source_name=source_name,
                metadata={"url_type": "red_packet"},
            ))

        for match in self.PATTERN_BINANCE_PAY_URL.finditer(text):
            code = match.group(1).upper()
            self._add_result(results, DetectedCode(
                code=code,
                code_type=CodeType.BINANCE_PAY,
                confidence=0.90,
                source_text=self._snippet(text, match.start()),
                source_group=source_group,
                source_name=source_name,
                metadata={"url_type": "binance_pay"},
            ))

        for match in self.PATTERN_SQUARE_URL.finditer(text):
            code = match.group(1).upper()
            self._add_result(results, DetectedCode(
                code=code,
                code_type=CodeType.SQUARE_ACTIVITY,
                confidence=0.85,
                source_text=self._snippet(text, match.start()),
                source_group=source_group,
                source_name=source_name,
                metadata={"url_type": "square"},
            ))

        for match in self.PATTERN_AIRDROP_URL.finditer(text):
            code = match.group(1).upper()
            self._add_result(results, DetectedCode(
                code=code,
                code_type=CodeType.AIRDROP_LINK,
                confidence=0.85,
                source_text=self._snippet(text, match.start()),
                source_group=source_group,
                source_name=source_name,
                metadata={"url_type": "airdrop"},
            ))

    # ============== Tier 2: Keyword Detection ==============

    def _detect_keyword_codes(self, text, source_group, source_name, results):
        """Detect codes adjacent to keywords in multiple languages."""
        for match in self.PATTERN_KEYWORD_CODE.finditer(text):
            code = match.group(1).upper()
            # Determine type from the keyword
            keyword = match.group(0).lower()
            if "gift" in keyword or "礼" in keyword:
                code_type = CodeType.GIFT_CARD
                confidence = 0.85
            elif "box" in keyword or "包" in keyword:
                code_type = CodeType.CRYPTO_BOX
                confidence = 0.85
            elif "red" in keyword or "红包" in keyword:
                code_type = CodeType.RED_PACKET
                confidence = 0.85
            elif "coupon" in keyword or "voucher" in keyword or "promo" in keyword:
                code_type = CodeType.COUPON
                confidence = 0.80
            elif "referral" in keyword or "invite" in keyword or "邀请" in keyword:
                code_type = CodeType.REFERRAL
                confidence = 0.80
            elif "airdrop" in keyword:
                code_type = CodeType.AIRDROP_LINK
                confidence = 0.80
            else:
                code_type = CodeType.GENERIC
                confidence = 0.75

            self._add_result(results, DetectedCode(
                code=code,
                code_type=code_type,
                confidence=confidence,
                source_text=self._snippet(text, match.start()),
                source_group=source_group,
                source_name=source_name,
            ))

        # "Code:" pattern
        for match in self.PATTERN_CODE_LABEL.finditer(text):
            code = match.group(1).upper()
            self._add_result(results, DetectedCode(
                code=code,
                code_type=CodeType.GENERIC,
                confidence=0.70,
                source_text=self._snippet(text, match.start()),
                source_group=source_group,
                source_name=source_name,
            ))

        # Referral pattern
        for match in self.PATTERN_REFERRAL.finditer(text):
            code = match.group(1).upper()
            self._add_result(results, DetectedCode(
                code=code,
                code_type=CodeType.REFERRAL,
                confidence=0.80,
                source_text=self._snippet(text, match.start()),
                source_group=source_group,
                source_name=source_name,
            ))

        # Activity code pattern
        for match in self.PATTERN_ACTIVITY_CODE.finditer(text):
            code = match.group(1).upper()
            self._add_result(results, DetectedCode(
                code=code,
                code_type=CodeType.SQUARE_ACTIVITY,
                confidence=0.70,
                source_text=self._snippet(text, match.start()),
                source_group=source_group,
                source_name=source_name,
            ))

    # ============== Tier 3: Deep Link Detection ==============

    def _detect_deeplinks(self, text, source_group, source_name, results):
        """Detect codes in Telegram deep links."""
        for match in self.PATTERN_DEEPLINK.finditer(text):
            code = match.group(1).upper()
            self._add_result(results, DetectedCode(
                code=code,
                code_type=CodeType.GENERIC,
                confidence=0.80,
                source_text=self._snippet(text, match.start()),
                source_group=source_group,
                source_name=source_name,
                metadata={"deeplink": match.group(0)},
            ))

    # ============== Tier 4: Standalone Detection ==============

    def _detect_standalone(self, text, source_group, source_name, results):
        """Detect standalone long alphanumeric codes."""
        for match in self.PATTERN_STANDALONE_LONG.finditer(text.upper()):
            code = match.group(1)
            # Skip if already found with higher confidence
            if code in results and results[code].confidence >= 0.60:
                continue
            self._add_result(results, DetectedCode(
                code=code,
                code_type=CodeType.GENERIC,
                confidence=0.55,
                source_text=self._snippet(text, match.start()),
                source_group=source_group,
                source_name=source_name,
            ))

    # ============== Tier 5: Near-Binance Detection ==============

    def _detect_near_binance(self, text, source_group, source_name, results):
        """Detect codes that appear near the word 'Binance' in text."""
        for match in self.PATTERN_NEAR_BINANCE.finditer(text):
            code = match.group(1).upper()
            # Skip if already found with higher confidence
            if code in results and results[code].confidence >= 0.50:
                continue
            self._add_result(results, DetectedCode(
                code=code,
                code_type=CodeType.GENERIC,
                confidence=0.45,
                source_text=self._snippet(text, match.start()),
                source_group=source_group,
                source_name=source_name,
                metadata={"context": "near_binance"},
            ))


# Singleton engine
detection_engine = CodeDetectionEngine()

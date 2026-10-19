"""Simulated and indicative fixtures for BorderWise's price and split features.

Monetary fields use integer minor units: MYR values are sen and KRW values are
whole won.  These fixtures are deliberately not live market or ATM data.
"""

from datetime import datetime, timezone


def now_iso() -> str:
    """Return the current UTC timestamp as an ISO 8601 string."""

    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


_SEED_TIMESTAMP = now_iso()


def _badge(status: str, source: str) -> dict[str, str]:
    return {"status": status, "source": source, "timestamp": _SEED_TIMESTAMP}


EXCHANGE_PROVIDERS = [
    {
        "objective": "exchange_before_spending",
        "provider": "Wise Transfer",
        "rate": 314.20,
        "fixed_fee_sen": 450,
        "percentage_fee": 0.0,
        "funding_source": "MYR_BANK",
        "badge": _badge("Simulated", "Wise Sandbox Quote"),
    },
    {
        "objective": "exchange_before_spending",
        "provider": "Myeongdong Money Changer (Cash)",
        "rate": 315.50,
        "fixed_fee_sen": 0,
        "percentage_fee": 0.0,
        "funding_source": "MYR_BANK",
        "badge": _badge("Indicative", "Myeongdong Street Rate Sample"),
    },
    {
        "objective": "exchange_before_spending",
        "provider": "Malaysian Bank Foreign Wire",
        "rate": 305.80,
        "fixed_fee_sen": 1500,
        "percentage_fee": 0.0,
        "funding_source": "MYR_BANK",
        "badge": _badge("Simulated", "Bank Counter Sample"),
    },
]


CARD_PROVIDERS = [
    {
        "objective": "pay_by_card",
        "provider": "Wise Multi-Currency Card",
        "rate": 314.20,
        "fixed_fee_sen": 0,
        "fx_markup_pct": 0.0,
        "funding_source": "KRW_CARD",
        "badge": _badge("Simulated", "Wise Card Schedule"),
    },
    {
        "objective": "pay_by_card",
        "provider": "BigPay Visa Card",
        "rate": 311.00,
        "fixed_fee_sen": 0,
        "fx_markup_pct": 0.015,
        "funding_source": "MYR_BANK",
        "badge": _badge("Indicative", "Visa Indicative + 1.5% Issuer Fee"),
    },
    {
        "objective": "pay_by_card",
        "provider": "Maybank Visa Debit",
        "rate": 306.50,
        "fixed_fee_sen": 0,
        "fx_markup_pct": 0.025,
        "funding_source": "MYR_BANK",
        "badge": _badge("Indicative", "Maybank Overseas Card Rate"),
    },
]


ATM_PROVIDERS = [
    {
        "objective": "withdraw_atm_cash",
        "provider": "KB Kookmin Bank Global ATM (Hongdae Branch)",
        "rate": 312.00,
        "home_bank_fee_sen": 1200,
        "local_atm_fee_krw": 3500,
        "funding_source": "MYR_BANK",
        "bank_name": "KB Kookmin Bank",
        "location_name": "Hongdae Branch",
        "distance_meters": 120,
        "supported_networks": ["Visa", "Mastercard", "Plus"],
        "map_url": "https://map.naver.com/p/search/KB%20Kookmin%20Bank%20Hongdae",
        "kakao_map_url": "https://map.kakao.com/link/search/KB%20Kookmin%20Bank%20Hongdae",
        "withdrawal_guide": (
            "Select 'Foreign Language' -> 'English/Chinese' -> 'Foreign Card' -> 'Withdrawal'. "
            "Always choose KRW (decline DCC)."
        ),
        "badge": _badge("Simulated", "Sample Korean ATM Dataset"),
    },
    {
        "objective": "withdraw_atm_cash",
        "provider": "Shinhan Bank Global ATM (Hongdae Exit 9)",
        "rate": 311.50,
        "home_bank_fee_sen": 1200,
        "local_atm_fee_krw": 3500,
        "funding_source": "MYR_BANK",
        "bank_name": "Shinhan Bank",
        "location_name": "Hongdae Exit 9",
        "distance_meters": 350,
        "supported_networks": ["UnionPay", "Visa", "Mastercard"],
        "map_url": "https://map.naver.com/p/search/Shinhan%20Bank%20Hongdae",
        "kakao_map_url": "https://map.kakao.com/link/search/Shinhan%20Bank%20Hongdae",
        "withdrawal_guide": (
            "Tap 'Foreign Language' -> 'Foreign Card' -> 'Withdrawal'. "
            "Decline DCC conversion."
        ),
        "badge": _badge("Simulated", "Sample Korean ATM Dataset"),
    },
    {
        "objective": "withdraw_atm_cash",
        "provider": "Woori Bank Global ATM (Sinchon Station)",
        "rate": 311.80,
        "home_bank_fee_sen": 1200,
        "local_atm_fee_krw": 3600,
        "funding_source": "MYR_BANK",
        "bank_name": "Woori Bank",
        "location_name": "Sinchon Station",
        "distance_meters": 220,
        "supported_networks": ["UnionPay", "Visa", "Plus"],
        "map_url": "https://map.naver.com/p/search/Woori%20Bank%20Sinchon",
        "kakao_map_url": "https://map.kakao.com/link/search/Woori%20Bank%20Sinchon",
        "withdrawal_guide": (
            "Select 'Global ATM' button on the right screen before inserting card."
        ),
        "badge": _badge("Simulated", "Sample Korean ATM Dataset"),
    },
    {
        "objective": "withdraw_atm_cash",
        "provider": "CU Convenience Store ATM (Hongdae Street)",
        "rate": 309.00,
        "home_bank_fee_sen": 1500,
        "local_atm_fee_krw": 4000,
        "funding_source": "MYR_BANK",
        "bank_name": "CU Convenience Store ATM",
        "location_name": "Hongdae Street",
        "distance_meters": 60,
        "supported_networks": ["Visa", "Mastercard"],
        "map_url": "https://map.naver.com/p/search/CU%20Hongdae",
        "kakao_map_url": "https://map.kakao.com/link/search/CU%20Hongdae",
        "withdrawal_guide": (
            "Convenient 24/7 inside store, but carries highest local operator surcharge."
        ),
        "badge": _badge("Simulated", "Sample Korean ATM Dataset"),
    },
]


SAMPLE_KOREAN_RECEIPT = {
    "receipt_id": "sample-hongdae-samgyeopsal-2026-10-19",
    "merchant": "Hongdae Samgyeopsal House (홍대삼겹살)",
    "date": "2026-10-19",
    "items": [
        {
            "item_id": "item_1",
            "name": "Shared BBQ Set",
            "quantity": 3,
            "unit_price_krw": 14000,
            "total_price_krw": 42000,
            "assigned_to": ["You", "Daniel", "Tze Loon"],
        },
        {
            "item_id": "item_2",
            "name": "Soju & Craft Beer (Daniel)",
            "quantity": 1,
            "unit_price_krw": 7000,
            "total_price_krw": 7000,
            "assigned_to": ["Daniel"],
        },
        {
            "item_id": "item_3",
            "name": "Steamed Rice (You)",
            "quantity": 1,
            "unit_price_krw": 1000,
            "total_price_krw": 1000,
            "assigned_to": ["You"],
        },
    ],
    "tax_krw": 0,
    "discount_krw": 0,
    "total_krw": 50000,
    "badge": _badge("Simulated", "Sample Korean OCR Receipt Fallback"),
}


REFERENCE_FX_RATES = {
    "MYR/KRW": 315.50,
    "SGD/KRW": 1020.0,
    "KRW/KRW": 1.0,
    "MYR/KRW_history_7d": [309.5, 310.2, 311.0, 312.8, 313.5, 314.2, 315.5],
}

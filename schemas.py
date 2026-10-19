"""Shared API schemas for BorderWise AI's pricing and bill-splitting flows.

All money values are integer minor units: MYR and SGD use cents/sen, while KRW
uses whole won.  Exchange rates are deliberately floats because they are rates,
not monetary balances or fee amounts.
"""

from typing import Dict, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, StrictInt, field_validator


class SchemaModel(BaseModel):
    """Common strict API-model behaviour."""

    model_config = ConfigDict(extra="forbid", strict=True)


class Money(SchemaModel):
    amount_minor: StrictInt
    currency: Literal["MYR", "KRW", "SGD"]


class Badge(SchemaModel):
    status: Literal[
        "User-Entered", "User-Confirmed", "Simulated", "Indicative", "Live"
    ]
    source: Optional[str] = None
    timestamp: str


class FeeItem(SchemaModel):
    label: str
    # Fee amounts are normalized to MYR sen before debit comparisons.
    money: Money
    original_display: Optional[str] = None


class ATMDetails(SchemaModel):
    bank_name: str
    location_name: str
    distance_meters: StrictInt
    supported_networks: List[str]
    map_url: str
    kakao_map_url: Optional[str] = None
    withdrawal_guide: str


class Quote(SchemaModel):
    quote_id: str
    objective: Literal["exchange_before_spending", "pay_by_card", "withdraw_atm_cash"]
    mode: Literal["fixed_myr_budget", "fixed_krw_target"]
    funding_source: Literal["MYR_BANK", "KRW_CARD"]
    provider: str
    rate: float
    principal: Money
    fees: List[FeeItem]
    total_debit: Money
    net_received: Money
    atm_info: Optional[ATMDetails] = None
    badge: Badge


class RateSnapshot(SchemaModel):
    pair: str = "MYR/KRW"
    rate: float
    badge: Badge


class ReceiptItem(SchemaModel):
    item_id: str
    name: str
    quantity: StrictInt
    unit_price_krw: StrictInt
    total_price_krw: StrictInt
    assigned_to: List[str] = Field(default_factory=list)


class OCRReceipt(SchemaModel):
    receipt_id: str
    merchant: str
    date: str
    items: List[ReceiptItem]
    tax_krw: StrictInt
    discount_krw: StrictInt
    total_krw: StrictInt
    badge: Badge


class FriendProfile(SchemaModel):
    name: str
    home_currency: Literal["MYR", "KRW", "SGD"]


class Receivable(SchemaModel):
    receivable_id: str
    receipt_id: str
    merchant: str
    debtor: str
    debtor_home_currency: Literal["MYR", "KRW", "SGD"]
    # This is locked to KRW by the service when the receivable is created.
    amount: Money
    reference_home_amount: Money
    snapshot: RateSnapshot
    badge: Badge
    settled: bool = False
    settlement_details: Optional[dict] = None

class CompareQuotesRequest(SchemaModel):
    """Ask the compare engine to price one exchange, card, or ATM objective."""

    objective: Literal["exchange_before_spending", "pay_by_card", "withdraw_atm_cash"]
    mode: Literal["fixed_myr_budget", "fixed_krw_target"]
    amount: Money
    # Optional filters so all providers can be compared side-by-side by default
    funding_source: Optional[Literal["MYR_BANK", "KRW_CARD"]] = None
    card_network: Optional[Literal["UnionPay", "Visa", "Mastercard", "Plus"]] = None

    @field_validator("card_network", mode="before")
    @classmethod
    def normalize_card_network(cls, value: object) -> object:
        """Accept case-insensitive card-network input while retaining canonical labels."""

        if not isinstance(value, str):
            return value
        canonical_networks = {
            "unionpay": "UnionPay",
            "visa": "Visa",
            "mastercard": "Mastercard",
            "plus": "Plus",
        }
        return canonical_networks.get(value.casefold(), value)


class AllocateSplitRequest(SchemaModel):
    """Assign human-confirmed OCR receipt items to participants."""

    confirmed_receipt: OCRReceipt
    payer: str = "You"
    paid_from_account: Literal["MYR_BANK", "KRW_CARD", "KRW_CASH"] = "KRW_CARD"
    friends: List[FriendProfile]
    # Optional override if frontend passes assignments separately from confirmed_receipt.items
    item_assignments: Optional[Dict[str, List[str]]] = None
    snapshot: Optional[RateSnapshot] = None


class AllocateSplitResponse(SchemaModel):
    """Returned to the UI and Agent after confirming a receipt split."""

    receipt_id: str
    payer: str
    paid_from_account: Literal["MYR_BANK", "KRW_CARD", "KRW_CASH"]
    total_bill: Money
    payer_own_share: Money
    receivables: List[Receivable]
    snapshot: RateSnapshot
    badge: Badge


class SettleReceivableRequest(SchemaModel):
    """Record an actual repayment and tell Daniel's ledger which wallet to credit."""

    receivable_id: Optional[str] = None  # Can come from URL path or body
    amount_received: Money
    target_account: Literal["MYR_BANK", "KRW_CARD", "KRW_CASH"]
    settlement_details: Optional[dict] = None
    badge: Optional[Badge] = None


class TargetAlertRequest(SchemaModel):
    """Evaluate a one-directional MYR/KRW target-rate alert with estimated proceeds."""

    pair: str = "MYR/KRW"
    target_rate: float | int
    planned_amount: Optional[Money] = Field(
        default_factory=lambda: Money(amount_minor=50000, currency="MYR")
    )
    direction: Literal["above", "below"] = "above"
    badge: Optional[Badge] = None

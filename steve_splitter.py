"""Deterministic receipt splitting and receivable tracking for BorderWise."""

from typing import Callable, Dict, List, Optional
import hashlib
import json
from decimal import Decimal
from uuid import uuid4

from schemas import (
    AllocateSplitRequest,
    AllocateSplitResponse,
    AllocateSplitPreviewRequest,
    AllocateSplitPreviewResponse,
    Badge,
    Money,
    OCRReceipt,
    RateSnapshot,
    Receivable,
    SettleReceivableRequest,
)
from seed_data import REFERENCE_FX_RATES, SAMPLE_KOREAN_RECEIPT, now_iso


RECEIVABLE_STORE: Dict[str, Receivable] = {}
MOCK_DANIEL_SETTLEMENT_LOGS: List[dict] = []
DANIEL_LEDGER_BRIDGE_CALLBACK = None


def register_daniel_settlement_hook(callback_fn):
    """Register Daniel's ledger bridge for confirmed receivable settlements."""

    global DANIEL_LEDGER_BRIDGE_CALLBACK
    DANIEL_LEDGER_BRIDGE_CALLBACK = callback_fn


def extract_receipt_ocr(
    image_bytes: Optional[bytes] = None, use_sample: bool = True
) -> OCRReceipt:
    """Return the deterministic Korean receipt used until Vision OCR is integrated."""

    if not use_sample:
        # Gemini/OpenAI Vision receipt extraction will replace this fallback.
        # This phase intentionally remains deterministic and offline.
        _ = image_bytes

    receipt_data = dict(SAMPLE_KOREAN_RECEIPT)
    badge_data = dict(receipt_data["badge"])
    badge_data.update(
        {
            "status": "Simulated",
            "source": "Vision OCR Sandbox",
            "timestamp": now_iso(),
        }
    )
    receipt_data["badge"] = badge_data
    return OCRReceipt(**receipt_data)


def _new_snapshot() -> RateSnapshot:
    return RateSnapshot(
        pair="MYR/KRW",
        rate=float(REFERENCE_FX_RATES["MYR/KRW"]),
        badge=Badge(
            status="Indicative",
            source="Snapshot at Allocation",
            timestamp=now_iso(),
        ),
    )


def _unique_people(people: List[str]) -> List[str]:
    """Keep assignment order for deterministic remainder allocation."""

    return list(dict.fromkeys(people))


def _distribute_adjustment(
    owed: Dict[str, int], people: List[str], adjustment_krw: int
) -> None:
    """Distribute tax or discount exactly, proportionally where possible."""

    if adjustment_krw == 0 or not people:
        return

    subtotal = sum(owed[person] for person in people)
    magnitude = abs(adjustment_krw)
    sign = 1 if adjustment_krw > 0 else -1
    if subtotal == 0:
        base, remainder = divmod(magnitude, len(people))
        for index, person in enumerate(people):
            owed[person] += sign * (base + (1 if index < remainder else 0))
        return

    allocated = 0
    proportional: Dict[str, int] = {}
    for person in people:
        share = (magnitude * owed[person]) // subtotal
        proportional[person] = share
        allocated += share
    remainder = magnitude - allocated
    for index, person in enumerate(people):
        owed[person] += sign * (proportional[person] + (1 if index < remainder else 0))


def _reference_home_amount(krw_share: int, home_currency: str, snapshot: RateSnapshot) -> Money:
    if home_currency == "MYR":
        if snapshot.rate <= 0:
            raise ValueError("Rate snapshot must have a positive MYR/KRW rate")
        amount_minor = int(round((krw_share / snapshot.rate) * 100))
    elif home_currency == "SGD":
        sgd_krw_rate = float(REFERENCE_FX_RATES["SGD/KRW"])
        if sgd_krw_rate <= 0:
            raise ValueError("SGD/KRW reference rate must be positive")
        amount_minor = int(round((krw_share / sgd_krw_rate) * 100))
    elif home_currency == "KRW":
        amount_minor = krw_share
    else:
        raise ValueError(f"Unsupported home currency: {home_currency}")
    return Money(amount_minor=int(amount_minor), currency=home_currency)


def _calculate_shares(items, people, payer, assignments, tax_krw, discount_krw):
    """Pure common arithmetic for the legacy write flow and review-only preview."""

    people = list(people)
    krw_owed_by_person: Dict[str, int] = {person: 0 for person in people}
    item_shares = []
    for item_id, amount, defaults in items:
        if assignments is not None:
            assigned_people = assignments.get(item_id)
        else:
            assigned_people = defaults
        assigned_people = _unique_people(list(assigned_people or [payer]))
        for person in assigned_people:
            krw_owed_by_person.setdefault(person, 0)
            if person not in people:
                people.append(person)
        shares = []
        base_share, remainder = divmod(amount, len(assigned_people))
        for index, person in enumerate(assigned_people):
            share = base_share + (1 if index < remainder else 0)
            krw_owed_by_person[person] += share
            shares.append({"participant_id": person, "amount_minor": share})
        item_shares.append({"item_id": item_id, "shares": shares})
    before_adjustment = dict(krw_owed_by_person)
    _distribute_adjustment(
        krw_owed_by_person, people, int(tax_krw) - int(discount_krw),
    )
    adjustments = [{"participant_id": p, "amount_minor": krw_owed_by_person[p] - before_adjustment[p]} for p in people]
    return krw_owed_by_person, item_shares, adjustments


def preview_bill_split(request: AllocateSplitPreviewRequest) -> AllocateSplitPreviewResponse:
    """No stores, receivable IDs, FX references, callback or posting event here."""

    people = request.participant_ids
    receipt = request.receipt
    item_ids = [item.item_id for item in receipt.items]
    if len(set(people)) != len(people) or request.payer_id not in people or any(not p.strip() or len(p) > 100 for p in people):
        raise ValueError("Choose unique stable participant IDs including the payer")
    if len(set(item_ids)) != len(item_ids) or set(item_ids) != set(request.item_assignments):
        raise ValueError("Every reviewed item requires exactly one explicit assignment")
    for assigned in request.item_assignments.values():
        if not assigned or len(assigned) != len(set(assigned)) or any(p not in people for p in assigned):
            raise ValueError("Assignments require unique selected participant IDs; no payer default is allowed")
    if any(Decimal(item.quantity) <= 0 for item in receipt.items):
        raise ValueError("Reviewed quantities must be positive")
    if sum(item.total_price_krw for item in receipt.items) + receipt.tax_krw - receipt.discount_krw != receipt.total_krw:
        raise ValueError("Reviewed line totals, tax and discount must reconcile")
    owed, item_shares, adjustments = _calculate_shares(
        [(item.item_id, item.total_price_krw, []) for item in receipt.items], people,
        request.payer_id, request.item_assignments, receipt.tax_krw, receipt.discount_krw,
    )
    if any(value < 0 or value > 9007199254740991 for value in owed.values()) or sum(owed.values()) != receipt.total_krw:
        raise ValueError("Allocation rule produced unsupported negative or inconsistent shares")
    binding = hashlib.sha256(json.dumps(request.model_dump(), sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()).hexdigest()
    return AllocateSplitPreviewResponse(
        preview_id=f"split_preview_{binding}", receipt_id=receipt.receipt_id,
        receipt_version=request.receipt_version, payer_id=request.payer_id,
        item_assignments=request.item_assignments,
        total_bill=Money(amount_minor=receipt.total_krw, currency="KRW"),
        participant_shares=[{"participant_id": p, "amount_minor": owed[p]} for p in people],
        item_shares=item_shares, adjustments=adjustments,
        badge=Badge(status="Indicative", source="Steve deterministic reviewed allocation preview; not confirmed or posted", timestamp=now_iso()),
    )


def allocate_bill_split(request: AllocateSplitRequest) -> AllocateSplitResponse:
    """Legacy allocation/write flow retained for existing callers; Node does not call it."""

    snapshot = request.snapshot or _new_snapshot()
    people = _unique_people([request.payer] + [friend.name for friend in request.friends])
    krw_owed_by_person, _, _ = _calculate_shares(
        [(item.item_id, item.total_price_krw, item.assigned_to) for item in request.confirmed_receipt.items],
        people, request.payer, request.item_assignments,
        request.confirmed_receipt.tax_krw, request.confirmed_receipt.discount_krw,
    )

    receivables: List[Receivable] = []
    for friend in request.friends:
        if friend.name == request.payer:
            continue
        krw_share = krw_owed_by_person.get(friend.name, 0)
        if krw_share <= 0:
            continue
        receivable = Receivable(
            receivable_id=f"receivable_{uuid4().hex}",
            receipt_id=request.confirmed_receipt.receipt_id,
            merchant=request.confirmed_receipt.merchant,
            debtor=friend.name,
            debtor_home_currency=friend.home_currency,
            amount=Money(amount_minor=int(krw_share), currency="KRW"),
            reference_home_amount=_reference_home_amount(
                int(krw_share), friend.home_currency, snapshot
            ),
            snapshot=snapshot,
            badge=Badge(
                status="User-Confirmed",
                source="Confirmed receipt allocation",
                timestamp=now_iso(),
            ),
        )
        RECEIVABLE_STORE[receivable.receivable_id] = receivable
        receivables.append(receivable)

    payer_own_share = krw_owed_by_person.get(request.payer, 0)
    response = AllocateSplitResponse(
        receipt_id=request.confirmed_receipt.receipt_id,
        payer=request.payer,
        paid_from_account=request.paid_from_account,
        total_bill=Money(
            amount_minor=int(request.confirmed_receipt.total_krw), currency="KRW"
        ),
        payer_own_share=Money(amount_minor=int(payer_own_share), currency="KRW"),
        receivables=receivables,
        snapshot=snapshot,
        badge=Badge(
            status="User-Confirmed",
            source="Receipt split confirmed by payer",
            timestamp=now_iso(),
        ),
    )
    expense_payload = {
        "type": "shared_expense_paid",
        "receipt_id": response.receipt_id,
        "merchant": request.confirmed_receipt.merchant,
        "payer": request.payer,
        "paid_from_account": request.paid_from_account,
        "total_bill": response.total_bill.model_dump(),
        "payer_own_share": response.payer_own_share.model_dump(),
        "total_receivables_krw": sum(
            receivable.amount.amount_minor for receivable in response.receivables
        ),
        "badge": response.badge.model_dump(),
    }
    if DANIEL_LEDGER_BRIDGE_CALLBACK is not None:
        DANIEL_LEDGER_BRIDGE_CALLBACK(expense_payload)
    else:
        MOCK_DANIEL_SETTLEMENT_LOGS.append(expense_payload)
    return response


def list_receivables(settled: Optional[bool] = None) -> List[Receivable]:
    receivables = list(RECEIVABLE_STORE.values())
    if settled is None:
        return receivables
    return [receivable for receivable in receivables if receivable.settled is settled]


def settle_receivable(request: SettleReceivableRequest) -> Receivable:
    if not request.receivable_id:
        raise ValueError("receivable_id is required to settle a receivable")
    receivable = RECEIVABLE_STORE.get(request.receivable_id)
    if receivable is None:
        raise ValueError(f"Receivable not found: {request.receivable_id}")
    if receivable.settled:
        raise ValueError(f"Receivable is already settled: {request.receivable_id}")

    actual_paid = request.amount_received.model_dump()
    receivable.settled = True
    receivable.settlement_details = {
        "actual_paid": actual_paid,
        "target_account": request.target_account,
    }
    receivable.badge = Badge(
        status="User-Confirmed",
        source="Receivable settlement confirmed by payer",
        timestamp=now_iso(),
    )
    payload = {
        "type": "settlement",
        "receivable_id": request.receivable_id,
        "debtor": receivable.debtor,
        "locked_krw_cleared": receivable.amount.model_dump(),
        "actual_paid": actual_paid,
        "target_account": request.target_account,
    }
    if DANIEL_LEDGER_BRIDGE_CALLBACK is not None:
        DANIEL_LEDGER_BRIDGE_CALLBACK(payload)
    else:
        MOCK_DANIEL_SETTLEMENT_LOGS.append(payload)
    return receivable


if __name__ == "__main__":
    from schemas import FriendProfile

    RECEIVABLE_STORE.clear()
    MOCK_DANIEL_SETTLEMENT_LOGS.clear()

    receipt = extract_receipt_ocr()
    response = allocate_bill_split(
        AllocateSplitRequest(
            confirmed_receipt=receipt,
            payer="You",
            paid_from_account="KRW_CARD",
            friends=[
                FriendProfile(name="You", home_currency="MYR"),
                FriendProfile(name="Daniel", home_currency="MYR"),
                FriendProfile(name="Tze Loon", home_currency="MYR"),
            ],
        )
    )
    print(response.model_dump())

    receivables_by_debtor = {item.debtor: item for item in response.receivables}
    assert receivables_by_debtor["Daniel"].amount.amount_minor == 21000
    assert receivables_by_debtor["Tze Loon"].amount.amount_minor == 14000
    assert response.payer_own_share.amount_minor == 15000

    settle_receivable(
        SettleReceivableRequest(
            receivable_id=receivables_by_debtor["Daniel"].receivable_id,
            amount_received=Money(amount_minor=6656, currency="MYR"),
            target_account="MYR_BANK",
        )
    )
    print(MOCK_DANIEL_SETTLEMENT_LOGS)

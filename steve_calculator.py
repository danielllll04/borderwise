"""Deterministic quote comparison and target-rate calculations.

This module contains no HTTP or database concerns.  The Agent and the manual
Compare flow can both call these functions and receive the same ranked quotes.
"""

import math
from typing import Dict, List, Optional
from uuid import uuid4

from schemas import (
    ATMDetails,
    Badge,
    CompareQuotesRequest,
    FeeItem,
    Money,
    Quote,
    TargetAlertRequest,
)
from seed_data import (
    ATM_PROVIDERS,
    CARD_PROVIDERS,
    EXCHANGE_PROVIDERS,
    REFERENCE_FX_RATES,
    now_iso,
)


QUOTE_STORE: Dict[str, Quote] = {}

_SUPPORTED_MODES = {"fixed_myr_budget", "fixed_krw_target"}
_SUPPORTED_OBJECTIVES = {
    "exchange_before_spending",
    "pay_by_card",
    "withdraw_atm_cash",
}


def _fee(label: str, amount_sen: int, original_display: Optional[str] = None) -> FeeItem:
    return FeeItem(
        label=label,
        money=Money(amount_minor=int(amount_sen), currency="MYR"),
        original_display=original_display,
    )


def _provider_list(objective: str) -> list[dict]:
    if objective == "exchange_before_spending":
        return EXCHANGE_PROVIDERS
    if objective == "pay_by_card":
        return CARD_PROVIDERS
    if objective == "withdraw_atm_cash":
        return ATM_PROVIDERS
    raise ValueError(f"Unsupported objective: {objective}")


def _require_integer_minor_units(value: object, field_name: str) -> int:
    """Reject coercion so money cannot silently lose fractional minor units."""

    if type(value) is not int:
        raise ValueError(f"{field_name} must be an integer minor-unit amount")
    return value


def _validated_rate(provider: dict) -> float:
    provider_name = provider.get("provider", "unknown provider")
    try:
        rate = float(provider["rate"])
    except (KeyError, TypeError, ValueError) as exc:
        raise ValueError(f"Invalid exchange rate for provider {provider_name!r}") from exc
    if not math.isfinite(rate) or rate <= 0:
        raise ValueError(f"Invalid exchange rate for provider {provider_name!r}: {rate!r}")
    return rate


def _proceeds_krw(principal_sen: int, rate: float) -> int:
    return int(round((principal_sen / 100.0) * rate))


def _minimum_principal_for_target(target_krw: int, rate: float) -> int:
    """Return the least MYR-sen principal whose rounded proceeds meet the target."""

    high = max(1, int(round((target_krw / rate) * 100)))
    while _proceeds_krw(high, rate) < target_krw:
        high = high * 2

    low = 0
    while low < high:
        middle = (low + high) // 2
        if _proceeds_krw(middle, rate) >= target_krw:
            high = middle
        else:
            low = middle + 1
    return low


def _atm_info(provider: dict) -> ATMDetails:
    return ATMDetails(
        bank_name=provider["bank_name"],
        location_name=provider["location_name"],
        distance_meters=int(provider["distance_meters"]),
        supported_networks=list(provider["supported_networks"]),
        map_url=provider["map_url"],
        kakao_map_url=provider.get("kakao_map_url"),
        withdrawal_guide=provider["withdrawal_guide"],
    )


def _fixed_fees(provider: dict, objective: str, rate: float) -> list[FeeItem]:
    """Build fees independent of the selected budget/target mode."""

    fees: list[FeeItem] = []
    fixed_sen = int(provider.get("fixed_fee_sen", 0))
    if objective == "exchange_before_spending" and fixed_sen > 0:
        fees.append(_fee("Transfer / Service Fee", fixed_sen))
    elif objective == "pay_by_card" and fixed_sen > 0:
        fees.append(_fee("Card Service Fee", fixed_sen))

    if objective == "withdraw_atm_cash":
        home_sen = int(provider.get("home_bank_fee_sen", 0))
        if home_sen > 0:
            fees.append(_fee("Home Bank Overseas ATM Fee", home_sen))

        local_krw = int(provider.get("local_atm_fee_krw", 0))
        local_sen = int(round((local_krw / rate) * 100))
        label = "Local ATM Operator Fee (Free)" if local_krw == 0 else "Local ATM Operator Fee"
        fees.append(_fee(label, local_sen, original_display=f"₩ {local_krw:,}"))

    return fees


def _percentage(provider: dict, objective: str) -> tuple[float, str]:
    if objective == "exchange_before_spending":
        return float(provider.get("percentage_fee", 0.0)), "Percentage Service Fee"
    if objective == "pay_by_card":
        pct = float(provider.get("fx_markup_pct", 0.0))
        return pct, f"Card FX Markup ({pct * 100:.1f}%)"
    return 0.0, ""


def compare_quotes(request: CompareQuotesRequest) -> List[Quote]:
    """Return ranked quotes for a single objective and amount."""

    if request.mode not in _SUPPORTED_MODES:
        raise ValueError(f"Unsupported comparison mode: {request.mode}")
    if request.objective not in _SUPPORTED_OBJECTIVES:
        raise ValueError(f"Unsupported objective: {request.objective}")

    expected_currency = "MYR" if request.mode == "fixed_myr_budget" else "KRW"
    if request.amount.currency != expected_currency:
        raise ValueError(
            f"{request.mode} requires amount.currency={expected_currency}, "
            f"got {request.amount.currency}"
        )
    requested_minor = _require_integer_minor_units(
        request.amount.amount_minor, "request.amount.amount_minor"
    )
    if requested_minor <= 0:
        raise ValueError("request.amount.amount_minor must be positive")

    providers = _provider_list(request.objective)
    if request.funding_source is not None:
        providers = [
            provider
            for provider in providers
            if provider.get("funding_source") == request.funding_source
        ]
    if request.objective == "withdraw_atm_cash" and request.card_network:
        requested_network = request.card_network.casefold()
        providers = [
            provider
            for provider in providers
            if any(
                requested_network == str(network).casefold()
                for network in provider.get("supported_networks", [])
            )
        ]

    quotes: list[Quote] = []
    for provider in providers:
        rate = _validated_rate(provider)
        fees = _fixed_fees(provider, request.objective, rate)
        pct, pct_label = _percentage(provider, request.objective)

        if request.mode == "fixed_myr_budget":
            total_debit_sen = requested_minor
            pct_fee_sen = int(round(total_debit_sen * pct))
            if pct_fee_sen > 0:
                fees.append(_fee(pct_label, pct_fee_sen))
            total_fees_sen = sum(item.money.amount_minor for item in fees)
            principal_sen = total_debit_sen - total_fees_sen
            if principal_sen <= 0:
                continue
            net_received_krw = _proceeds_krw(principal_sen, rate)
        else:
            net_received_krw = requested_minor
            principal_sen = _minimum_principal_for_target(net_received_krw, rate)
            pct_fee_sen = int(round(principal_sen * pct))
            if pct_fee_sen > 0:
                fees.append(_fee(pct_label, pct_fee_sen))
            total_fees_sen = sum(item.money.amount_minor for item in fees)
            total_debit_sen = principal_sen + total_fees_sen

        quote = Quote(
            quote_id=f"quote_{uuid4().hex}",
            objective=request.objective,
            mode=request.mode,
            funding_source=provider["funding_source"],
            provider=provider["provider"],
            rate=rate,
            principal=Money(amount_minor=int(principal_sen), currency="MYR"),
            fees=fees,
            total_debit=Money(amount_minor=int(total_debit_sen), currency="MYR"),
            net_received=Money(amount_minor=int(net_received_krw), currency="KRW"),
            atm_info=_atm_info(provider) if request.objective == "withdraw_atm_cash" else None,
            badge=Badge(**provider["badge"]),
        )
        QUOTE_STORE[quote.quote_id] = quote
        quotes.append(quote)

    if request.mode == "fixed_myr_budget":
        quotes.sort(key=lambda quote: quote.net_received.amount_minor, reverse=True)
    else:
        quotes.sort(key=lambda quote: quote.total_debit.amount_minor)
    return quotes


def compare_quotes_tool(
    objective: str,
    mode: str,
    amount_minor: int,
    funding_source: Optional[str] = None,
    card_network: Optional[str] = None,
) -> List[Quote]:
    """Primitive-argument wrapper suitable for an LLM tool declaration."""

    minor_units = _require_integer_minor_units(amount_minor, "amount_minor")
    currency = "MYR" if mode == "fixed_myr_budget" else "KRW"
    request = CompareQuotesRequest(
        objective=objective,
        mode=mode,
        amount=Money(amount_minor=minor_units, currency=currency),
        funding_source=funding_source,
        card_network=card_network,
    )
    return compare_quotes(request)


def get_quote_by_id(quote_id: str) -> Optional[Quote]:
    return QUOTE_STORE.get(quote_id)


def check_target_rate_alert(request: TargetAlertRequest) -> dict:
    """Evaluate a target rate and return a non-executing recommendation."""

    if request.pair != "MYR/KRW":
        raise ValueError(f"Unsupported target-rate pair: {request.pair}")
    if request.direction not in {"above", "below"}:
        raise ValueError(f"Unsupported target-rate direction: {request.direction}")
    if type(request.target_rate) not in {int, float} or isinstance(request.target_rate, bool):
        raise ValueError("target_rate must be a positive number")
    target_rate = float(request.target_rate)
    if not math.isfinite(target_rate) or target_rate <= 0:
        raise ValueError("target_rate must be a positive number")

    try:
        current_rate = float(REFERENCE_FX_RATES["MYR/KRW"])
        history = [
            float(rate) for rate in REFERENCE_FX_RATES["MYR/KRW_history_7d"]
        ]
    except (KeyError, TypeError, ValueError) as exc:
        raise ValueError("MYR/KRW reference-rate data is invalid or unavailable") from exc
    if not math.isfinite(current_rate) or current_rate <= 0:
        raise ValueError("MYR/KRW current reference rate must be positive")

    if request.direction == "above":
        triggered = current_rate >= target_rate
        comparison = "at or above"
    else:
        triggered = current_rate <= target_rate
        comparison = "at or below"

    planned_amount = request.planned_amount or Money(
        amount_minor=50000, currency="MYR"
    )
    if planned_amount.currency != "MYR":
        raise ValueError("Target-rate alerts require planned_amount in MYR")
    planned_myr_sen = _require_integer_minor_units(
        planned_amount.amount_minor, "planned_amount.amount_minor"
    )
    if planned_myr_sen <= 0:
        raise ValueError("planned_amount.amount_minor must be positive")
    estimated_proceeds_krw = _proceeds_krw(planned_myr_sen, current_rate)
    recommendation = (
        f"The current {request.pair} rate is {current_rate:.2f}, "
        f"{comparison} your target of {target_rate:.2f}. "
        + ("Review exchange options now." if triggered else "Keep monitoring and review options before exchanging.")
        + " No transfer or exchange was executed."
    )
    return {
        "pair": request.pair,
        "triggered": bool(triggered),
        "current_rate": current_rate,
        "target_rate": target_rate,
        "direction": request.direction,
        "history_7d": history,
        "planned_amount": Money(amount_minor=planned_myr_sen, currency="MYR"),
        "estimated_proceeds": Money(amount_minor=estimated_proceeds_krw, currency="KRW"),
        "recommendation": recommendation,
        "badge": Badge(
            status="Simulated",
            source="Seeded 7-Day FX Dataset",
            timestamp=now_iso(),
        ),
    }


if __name__ == "__main__":
    def expect_value_error(action: object) -> None:
        try:
            action()  # type: ignore[operator]
        except ValueError:
            return
        raise AssertionError("Expected ValueError")

    print("Case 1: ₩100,000 cash target, Visa ATMs")
    atm_quotes = compare_quotes_tool(
        objective="withdraw_atm_cash",
        mode="fixed_krw_target",
        amount_minor=100000,
        card_network="Visa",
    )
    for quote in atm_quotes:
        fees = [(fee.label, fee.money.amount_minor) for fee in quote.fees]
        print(
            f"- {quote.provider}: principal RM {quote.principal.amount_minor / 100:.2f}; "
            f"fees={fees}; total RM {quote.total_debit.amount_minor / 100:.2f}; "
            f"{quote.atm_info.withdrawal_guide if quote.atm_info else ''}"
        )
    assert [quote.total_debit.amount_minor for quote in atm_quotes] == [
        34374,
        34427,
        34427,
        35157,
    ]
    assert all(quote.net_received.amount_minor >= 100000 for quote in atm_quotes)
    assert get_quote_by_id(atm_quotes[0].quote_id) is atm_quotes[0]

    differently_cased_atms = compare_quotes_tool(
        objective="withdraw_atm_cash",
        mode="fixed_krw_target",
        amount_minor=100000,
        card_network="vIsA",
    )
    assert [quote.provider for quote in differently_cased_atms] == [
        quote.provider for quote in atm_quotes
    ]

    print("\nCase 2: RM100 exchange budget")
    budget_quotes = compare_quotes_tool(
        objective="exchange_before_spending",
        mode="fixed_myr_budget",
        amount_minor=10000,
    )
    for quote in budget_quotes:
        print(f"- {quote.provider}: ₩{quote.net_received.amount_minor:,} received")
    assert len(budget_quotes) == 3
    assert all(quote.total_debit.amount_minor == 10000 for quote in budget_quotes)

    affordable_quotes = compare_quotes_tool(
        objective="exchange_before_spending",
        mode="fixed_myr_budget",
        amount_minor=450,
    )
    assert [quote.provider for quote in affordable_quotes] == [
        "Myeongdong Money Changer (Cash)"
    ]
    assert affordable_quotes[0].principal.amount_minor > 0

    print("\nCase 3: 315.0 MYR/KRW target alert")
    alert = check_target_rate_alert(
        TargetAlertRequest(target_rate=315.0, direction="above")
    )
    print(alert["recommendation"])
    assert alert["current_rate"] == 315.50 and alert["triggered"] is True

    below_alert = check_target_rate_alert(
        TargetAlertRequest(target_rate=315.0, direction="below")
    )
    unmet_alert = check_target_rate_alert(
        TargetAlertRequest(target_rate=316.0, direction="above")
    )
    default_amount_alert = check_target_rate_alert(TargetAlertRequest(target_rate=315.0))
    explicit_none_alert = check_target_rate_alert(
        TargetAlertRequest(target_rate=315.0, planned_amount=None)
    )
    assert below_alert["triggered"] is False
    assert unmet_alert["triggered"] is False
    assert default_amount_alert["planned_amount"].amount_minor == 50000
    assert explicit_none_alert["planned_amount"].amount_minor == 50000

    bad_amount = Money(amount_minor=10000, currency="MYR")
    expect_value_error(
        lambda: compare_quotes(
            CompareQuotesRequest.model_construct(
                objective="exchange_before_spending", mode="unsupported", amount=bad_amount
            )
        )
    )
    expect_value_error(
        lambda: compare_quotes(
            CompareQuotesRequest.model_construct(
                objective="unsupported", mode="fixed_myr_budget", amount=bad_amount
            )
        )
    )
    expect_value_error(
        lambda: compare_quotes(
            CompareQuotesRequest(
                objective="exchange_before_spending",
                mode="fixed_myr_budget",
                amount=Money(amount_minor=10000, currency="KRW"),
            )
        )
    )
    expect_value_error(
        lambda: check_target_rate_alert(
            TargetAlertRequest.model_construct(
                pair="MYR/KRW",
                target_rate=315.0,
                direction="sideways",
                planned_amount=Money(amount_minor=50000, currency="MYR"),
            )
        )
    )
    expect_value_error(
        lambda: compare_quotes_tool(
            "exchange_before_spending", "fixed_myr_budget", 100.5
        )
    )

    all_quotes = atm_quotes + budget_quotes + affordable_quotes
    for quote in all_quotes:
        total_fees_sen = sum(fee.money.amount_minor for fee in quote.fees)
        assert quote.total_debit.amount_minor == quote.principal.amount_minor + total_fees_sen
        assert get_quote_by_id(quote.quote_id) is quote

    print("\nAll deterministic calculator self-tests passed.")

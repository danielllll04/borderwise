"""FastAPI routes for Steve's deterministic price and bill-splitting modules."""

from typing import List, Optional

from fastapi import APIRouter, HTTPException, Query, Request
import hashlib

from schemas import (
    AllocateSplitRequest,
    AllocateSplitResponse,
    AllocateSplitPreviewRequest,
    AllocateSplitPreviewResponse,
    ReceiptImageExtraction,
    CompareQuotesRequest,
    OCRReceipt,
    Quote,
    Receivable,
    SettleReceivableRequest,
    TargetAlertRequest,
)
from steve_calculator import (
    check_target_rate_alert,
    compare_quotes,
    get_quote_by_id,
)
from steve_splitter import (
    MOCK_DANIEL_SETTLEMENT_LOGS,
    allocate_bill_split,
    preview_bill_split,
    extract_receipt_ocr,
    list_receivables,
    settle_receivable,
)


router = APIRouter(prefix="/api", tags=["Steve - Price Checker & Bill Splitter"])


@router.post("/compare/quotes", response_model=List[Quote])
def post_compare_quotes(request: CompareQuotesRequest) -> List[Quote]:
    try:
        return compare_quotes(request)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/compare/quotes/{quote_id}", response_model=Quote)
def get_quote(quote_id: str) -> Quote:
    quote = get_quote_by_id(quote_id)
    if quote is None:
        raise HTTPException(status_code=404, detail=f"Quote not found: {quote_id}")
    return quote


@router.post("/alerts/check")
def post_check_target_alert(request: TargetAlertRequest) -> dict:
    try:
        return check_target_rate_alert(request)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/split/ocr", response_model=OCRReceipt)
def post_split_ocr(use_sample: bool = Query(default=True)) -> OCRReceipt:
    # File uploads can be passed to extract_receipt_ocr once a Vision provider is wired.
    return extract_receipt_ocr(use_sample=use_sample)


@router.post("/split/allocate", response_model=AllocateSplitResponse)
def post_allocate_split(request: AllocateSplitRequest) -> AllocateSplitResponse:
    try:
        return allocate_bill_split(request)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/split/ocr/image", response_model=ReceiptImageExtraction)
async def post_receipt_image(request: Request) -> ReceiptImageExtraction:
    """Receive Node's private normalized PNG; current OCR remains a sample fallback."""

    if request.headers.get("content-type", "").split(";")[0].strip() != "image/png":
        raise HTTPException(status_code=415, detail="Send normalized image/png bytes")
    image = bytearray()
    async for chunk in request.stream():
        if len(image) + len(chunk) > 4 * 1024 * 1024:
            raise HTTPException(status_code=413, detail="Receipt image exceeds 4 MiB")
        image.extend(chunk)
    if not image.startswith(b"\x89PNG\r\n\x1a\n"):
        raise HTTPException(status_code=400, detail="Expected a nonempty normalized PNG")
    payload = bytes(image)
    return ReceiptImageExtraction(
        receipt=extract_receipt_ocr(image_bytes=payload, use_sample=False),
        image_sha256=hashlib.sha256(payload).hexdigest(), bytes_received=len(payload),
        fixture_notice="Steve received the uploaded PNG but returned its fixed Simulated sample receipt. Image content was not interpreted. Review and correct every field.",
    )


@router.post("/split/allocate/preview", response_model=AllocateSplitPreviewResponse)
def post_split_preview(request: AllocateSplitPreviewRequest) -> AllocateSplitPreviewResponse:
    try:
        return preview_bill_split(request)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/split/receivables", response_model=List[Receivable], deprecated=True,
            summary="Legacy standalone Python debt store; integrated views must read Node /api/receivables")
def get_receivables(settled: Optional[bool] = Query(default=None)) -> List[Receivable]:
    return list_receivables(settled=settled)


@router.post(
    "/split/receivables/{receivable_id}/settle", response_model=Receivable, deprecated=True,
    summary="Legacy standalone write; integrated frontend must confirm repayment with Node",
)
def post_settle_receivable(
    receivable_id: str, request: SettleReceivableRequest
) -> Receivable:
    """Legacy Python-only mutation, never the integrated Node settlement workflow."""
    if request.receivable_id is not None and request.receivable_id != receivable_id:
        raise HTTPException(
            status_code=400,
            detail="receivable_id in the request body must match the path parameter",
        )
    request = request.model_copy(update={"receivable_id": receivable_id})
    try:
        return settle_receivable(request)
    except ValueError as exc:
        status_code = 404 if "not found" in str(exc).lower() else 400
        raise HTTPException(status_code=status_code, detail=str(exc)) from exc


@router.get("/split/daniel-bridge-logs", deprecated=True,
            summary="Legacy diagnostic log; never poll/replay these events into Node financial writes")
def get_daniel_bridge_logs() -> List[dict]:
    return MOCK_DANIEL_SETTLEMENT_LOGS

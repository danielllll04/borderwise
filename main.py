"""BorderWise AI FastAPI entrypoint for Steve's price and bill-split modules."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from steve_router import router as steve_router


app = FastAPI(title="BorderWise AI Backend", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(steve_router)


# Daniel integration example:
# from daniel_router import router as daniel_router
# from daniel_ledger import post_shared_expense_or_settlement
# from steve_splitter import register_daniel_settlement_hook
# app.include_router(daniel_router)
# register_daniel_settlement_hook(post_shared_expense_or_settlement)


@app.get("/api/health")
def health() -> dict:
    return {
        "status": "ok",
        "service": "BorderWise AI",
        "steve_modules": ["compare", "alerts", "split"],
    }

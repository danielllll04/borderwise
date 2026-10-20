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


# Integrated Split reads Node GET /api/receivables and its settlement history.
# Explicit repayment confirmation goes directly to Node's narrow confirmation route.
# Do not register the legacy settlement hook or replay Python bridge logs into Node:
# Node is the sole financial writer and outstanding-debt authority.


@app.get("/api/health")
def health() -> dict:
    return {
        "status": "ok",
        "service": "BorderWise AI",
        "steve_modules": ["compare", "alerts", "split"],
    }

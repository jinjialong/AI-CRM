from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlmodel import Session

from app.core.config import settings
from app.core.database import engine, init_database
from app.routers.admin import router as admin_router
from app.routers.assistant import router as assistant_router
from app.routers.auth import router as auth_router
from app.routers.customers import router as customers_router
from app.routers.leads import router as leads_router
from app.routers.skills import router as skills_router
from app.services import init_demo_data

app = FastAPI(title=settings.app_name, version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup():
    init_database()
    with Session(engine) as session:
        init_demo_data(session)


@app.exception_handler(Exception)
async def global_exception_handler(_, exc: Exception):
    return JSONResponse(status_code=500, content={"detail": str(exc)})


@app.get("/")
def root():
    return {"status": "ok", "service": settings.app_name}


app.include_router(auth_router, prefix="/api/v1")
app.include_router(leads_router, prefix="/api/v1")
app.include_router(customers_router, prefix="/api/v1")
app.include_router(admin_router, prefix="/api/v1")
app.include_router(assistant_router, prefix="/api/v1")
app.include_router(skills_router, prefix="/api/v1")

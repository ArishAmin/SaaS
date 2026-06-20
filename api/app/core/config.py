from pydantic import model_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Supabase project
    supabase_url: str | None = None
    supabase_service_role_key: str | None = None

    # Where to fetch Supabase JWKS keys for JWT verification.
    # Supabase typically exposes keys at: {SUPABASE_URL}/auth/v1/keys
    supabase_jwks_url: str | None = None

    # Paddle Billing (https://developer.paddle.com)
    paddle_api_key: str | None = None
    paddle_webhook_secret: str | None = None
    paddle_environment: str = "sandbox"  # sandbox | production
    paddle_price_id_pro: str | None = None
    paddle_price_id_pro_yearly: str | None = None
    paddle_price_id_business: str | None = None
    paddle_price_id_business_yearly: str | None = None
    # JSON: {"5000":{"monthly":"pri_...","yearly":"pri_..."}}
    paddle_custom_credit_price_ids: str | None = None
    paddle_checkout_url: str | None = None
    app_public_url: str = "http://localhost:3000"

    # Set True in production (Render blueprint enables this). False only for local dev without billing.
    billing_enforcement_enabled: bool = True


    # production | development
    app_env: str = "development"
    # Comma-separated origins for CORS, e.g. https://app.example.com,https://www.example.com
    allowed_origins: str = "http://localhost:3000,http://127.0.0.1:3000"

    # Rate limiting
    redis_url: str = "redis://localhost:6379"
    rate_limit_per_minute: str = "30/minute"

    # Background jobs / team scaling
    background_jobs_enabled: bool = False
    worker_id: str = "worker"
    worker_concurrency: int = 1
    max_queued_jobs_per_workspace: int = 200
    job_stale_timeout_minutes: int = 120
    job_recovery_interval_minutes: int = 15

    # Global safety ceilings (per-plan caps applied in data_limits.py)
    max_columns: int = 200
    preview_max_rows: int = 20_000
    free_pipeline_max_rows: int = 20_000
    paid_pipeline_max_rows: int = 2_000_000
    cleaned_max_bytes: int = 80 * 1024 * 1024

    # Full async training limits (guardrails)
    full_max_rows: int = 250_000
    full_max_bytes: int = 250 * 1024 * 1024

    auto_delete_after_full_training: bool = True

    # Storage cleanup (configurable)
    # Optional: delete raw file from storage after analysis/cleaning.
    auto_delete_after_analysis: bool = False
    auto_delete_after_cleaning: bool = False

    # TTL cleanup (scheduled)
    # When enabled, the worker will periodically delete entire datasets (DB + storage + runs + shares)
    # that have been inactive (updated_at) longer than the TTL, as long as no run is queued/running.
    ttl_cleanup_enabled: bool = True
    ttl_cleanup_interval_minutes: int = 60
    dataset_ttl_hours: int = 24 * 30  # 30 days

    # Optionally delete share tokens older than this, even if dataset remains.
    shared_report_ttl_hours: int = 24 * 30  # 30 days

    # AI assistant (OpenAI-compatible)
    openai_api_key: str | None = None
    openai_base_url: str = "https://api.openai.com/v1"
    openai_model: str = "gpt-4o-mini"

    # Email
    resend_api_key: str | None = None

    # Centralized API logs to Supabase (table: public.app_logs)
    supabase_log_enabled: bool = True

    class Config:
        env_file = ".env"
        extra = "ignore"


    @model_validator(mode="after")
    def validate_production_billing_environment(self) -> "Settings":
        paddle_environment = (self.paddle_environment or "").lower()
        if paddle_environment not in {"sandbox", "production"}:
            raise ValueError("PADDLE_ENVIRONMENT must be either 'sandbox' or 'production'.")
        if self.app_env == "production" and paddle_environment != "production":
            raise ValueError("Production deployments must set PADDLE_ENVIRONMENT=production.")
        return self


def get_settings() -> Settings:
    return Settings()

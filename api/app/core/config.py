from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Supabase project
    supabase_url: str | None = None
    supabase_service_role_key: str | None = None

    # Where to fetch Supabase JWKS keys for JWT verification.
    # Supabase typically exposes keys at: {SUPABASE_URL}/auth/v1/keys
    supabase_jwks_url: str | None = None

    # Stripe
    stripe_secret_key: str | None = None
    stripe_webhook_secret: str | None = None
    stripe_price_id_pro: str | None = None
    stripe_price_id_business: str | None = None

    # When False, all users get Business-tier limits (no plan / Stripe gating). Set True in production.
    billing_enforcement_enabled: bool = False

    # Rate limiting
    redis_url: str = "redis://localhost:6379"
    rate_limit_per_minute: str = "30/minute"

    # Instant analyzer limits (DoS / resource safety)
    instant_max_rows: int = 10_000
    instant_max_columns: int = 200
    instant_max_bytes: int = 50 * 1024 * 1024

    # Cleaning / quick-training limits
    cleaning_max_rows: int = 10_000
    cleaning_max_columns: int = 200
    cleaning_max_bytes: int = 50 * 1024 * 1024
    cleaned_max_bytes: int = 60 * 1024 * 1024

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
    ttl_cleanup_enabled: bool = False
    ttl_cleanup_interval_minutes: int = 60
    dataset_ttl_hours: int = 24 * 7  # 7 days

    # Optionally delete share tokens older than this, even if dataset remains.
    shared_report_ttl_hours: int = 24 * 30  # 30 days

    # AI assistant (OpenAI-compatible)
    openai_api_key: str | None = None
    openai_base_url: str = "https://api.openai.com/v1"
    openai_model: str = "gpt-4o-mini"

    # Centralized API logs to Supabase (table: public.app_logs)
    supabase_log_enabled: bool = True

    class Config:
        env_file = ".env"
        extra = "ignore"


def get_settings() -> Settings:
    return Settings()


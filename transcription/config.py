"""
Transcription Worker Configuration
Centralized configuration for the Whisper transcription service.
"""

import os
from dataclasses import dataclass
from typing import Literal, Optional


@dataclass
class RedisConfig:
    """Redis connection configuration."""
    host: str = os.getenv("REDIS_HOST", "localhost")
    port: int = int(os.getenv("REDIS_PORT", "6379"))
    db: int = int(os.getenv("REDIS_DB", "0"))
    password: Optional[str] = os.getenv("REDIS_PASSWORD")

    @property
    def url(self) -> str:
        if self.password:
            return f"redis://:{self.password}@{self.host}:{self.port}/{self.db}"
        return f"redis://{self.host}:{self.port}/{self.db}"


@dataclass
class WhisperConfig:
    """Whisper model configuration."""
    # Model size: tiny, base, small, medium, large, large-v2, large-v3
    model_name: str = os.getenv("WHISPER_MODEL", "base.en")

    # Device: cpu, cuda, or auto (auto-detect)
    device: str = os.getenv("WHISPER_DEVICE", "auto")

    # Download directory for model files
    download_root: str = os.getenv("WHISPER_DOWNLOAD_ROOT", "/app/models")

    # Default language (None = auto-detect)
    default_language: Optional[str] = os.getenv("WHISPER_DEFAULT_LANGUAGE")

    # Enable word-level timestamps
    word_timestamps: bool = os.getenv("WHISPER_WORD_TIMESTAMPS", "true").lower() == "true"

    # Initial prompt for better accuracy (context hints)
    initial_prompt: Optional[str] = os.getenv("WHISPER_INITIAL_PROMPT")


@dataclass
class StorageConfig:
    """S3/R2 storage configuration."""
    provider: Literal["s3", "r2", "local"] = os.getenv("STORAGE_PROVIDER", "s3")

    # AWS/Cloudflare credentials
    access_key_id: Optional[str] = os.getenv("AWS_ACCESS_KEY_ID")
    secret_access_key: Optional[str] = os.getenv("AWS_SECRET_ACCESS_KEY")
    region: str = os.getenv("AWS_REGION", "us-east-1")
    bucket: str = os.getenv("AWS_S3_BUCKET", "relay-recordings")

    # R2-specific endpoint
    endpoint_url: Optional[str] = os.getenv("S3_ENDPOINT_URL")

    # Local storage fallback
    local_path: str = os.getenv("LOCAL_STORAGE_PATH", "/app/storage")


@dataclass
class WorkerConfig:
    """Worker process configuration."""
    # Maximum concurrent transcription jobs
    max_concurrency: int = int(os.getenv("MAX_CONCURRENT_TRANSCRIPTIONS", "2"))

    # Job timeout in seconds (transcription can be slow)
    job_timeout: int = int(os.getenv("TRANSCRIPTION_JOB_TIMEOUT", "1800"))  # 30 minutes

    # Backend API URL for callbacks
    backend_url: str = os.getenv("BACKEND_URL", "http://localhost:3000")

    # Backend API key for authentication
    backend_api_key: Optional[str] = os.getenv("BACKEND_API_KEY")

    # Temporary file directory
    temp_dir: str = os.getenv("TEMP_DIR", "/tmp/transcription")

    # Enable debug logging
    debug: bool = os.getenv("DEBUG", "false").lower() == "true"


@dataclass
class Config:
    """Main configuration container."""
    redis: RedisConfig
    whisper: WhisperConfig
    storage: StorageConfig
    worker: WorkerConfig

    @classmethod
    def from_env(cls) -> "Config":
        """Load configuration from environment variables."""
        return cls(
            redis=RedisConfig(),
            whisper=WhisperConfig(),
            storage=StorageConfig(),
            worker=WorkerConfig(),
        )


# Global configuration instance
config = Config.from_env()

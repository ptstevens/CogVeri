#!/usr/bin/env python3
"""
Transcription Worker
Uses OpenAI Whisper for speech-to-text transcription.
Integrates with BullMQ via Redis for job processing.
"""

import json
import os
import sys
import time
import tempfile
import hashlib
import logging
from pathlib import Path
from typing import Any, Optional
from dataclasses import dataclass, asdict

# Configure basic logging first for early startup messages
logging.basicConfig(
    level=logging.DEBUG if os.getenv("DEBUG", "").lower() == "true" else logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)
_early_logger = logging.getLogger("transcription.startup")
_early_logger.info("Transcription worker starting")

_early_logger.debug("Importing httpx")
import httpx
_early_logger.debug("Importing redis")
import redis
_early_logger.debug("Importing structlog")
import structlog
_early_logger.debug("Importing whisper")
import whisper
_early_logger.debug("Importing torch")
import torch
_early_logger.debug("All imports successful")

from config import config
_early_logger.info("Config loaded", extra={"redis_host": config.redis.host, "redis_port": config.redis.port})

# Configure structured logging (replaces basic logging)
structlog.configure(
    processors=[
        structlog.stdlib.filter_by_level,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.stdlib.PositionalArgumentsFormatter(),
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.processors.UnicodeDecoder(),
        structlog.processors.JSONRenderer() if not config.worker.debug else structlog.dev.ConsoleRenderer(),
    ],
    wrapper_class=structlog.stdlib.BoundLogger,
    context_class=dict,
    logger_factory=structlog.stdlib.LoggerFactory(),
    cache_logger_on_first_use=True,
)

logger = structlog.get_logger(__name__)


@dataclass
class TranscriptionSegment:
    """A single segment of transcribed speech."""
    start: float
    end: float
    text: str
    speaker: Optional[str] = None


@dataclass
class TranscriptionResult:
    """Complete transcription result."""
    recording_id: str
    transcript_text: str
    segments: list[TranscriptionSegment]
    language: str
    duration: float
    model_used: str
    processing_time: float


class StorageClient:
    """Client for downloading files from S3/R2/local storage."""

    def __init__(self):
        self.provider = config.storage.provider
        self._s3_client = None

    @property
    def s3_client(self):
        """Lazy-load S3 client."""
        if self._s3_client is None:
            import boto3

            client_kwargs = {
                "region_name": config.storage.region,
            }

            if config.storage.access_key_id and config.storage.secret_access_key:
                client_kwargs["aws_access_key_id"] = config.storage.access_key_id
                client_kwargs["aws_secret_access_key"] = config.storage.secret_access_key

            if config.storage.endpoint_url:
                client_kwargs["endpoint_url"] = config.storage.endpoint_url

            self._s3_client = boto3.client("s3", **client_kwargs)

        return self._s3_client

    def download_file(self, file_url: str, dest_path: Path) -> None:
        """Download a file from storage to a local path."""
        log = logger.bind(file_url=file_url, dest_path=str(dest_path))

        if self.provider == "local":
            # Local file path
            import shutil
            source_path = Path(file_url.replace("file://", ""))
            shutil.copy(source_path, dest_path)
            log.info("Downloaded file from local storage")

        elif file_url.startswith("http://") or file_url.startswith("https://"):
            # Pre-signed URL - download directly
            with httpx.Client(timeout=300) as client:
                with client.stream("GET", file_url) as response:
                    response.raise_for_status()
                    with open(dest_path, "wb") as f:
                        for chunk in response.iter_bytes(chunk_size=8192):
                            f.write(chunk)
            log.info("Downloaded file from URL")

        else:
            # S3/R2 path (e.g., s3://bucket/key or just bucket/key)
            if file_url.startswith("s3://"):
                file_url = file_url[5:]

            parts = file_url.split("/", 1)
            bucket = parts[0] if len(parts) > 1 else config.storage.bucket
            key = parts[1] if len(parts) > 1 else file_url

            self.s3_client.download_file(bucket, key, str(dest_path))
            log.info("Downloaded file from S3", bucket=bucket, key=key)


class WhisperTranscriber:
    """Whisper-based transcription engine."""

    def __init__(self):
        self.model = None
        self.model_name = config.whisper.model_name
        self.device = self._get_device()

    def _get_device(self) -> str:
        """Determine the best device to use."""
        if config.whisper.device == "auto":
            if torch.cuda.is_available():
                return "cuda"
            elif hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
                return "mps"  # Apple Silicon
            return "cpu"
        return config.whisper.device

    def load_model(self) -> None:
        """Load the Whisper model (lazy loading)."""
        if self.model is None:
            log = logger.bind(model=self.model_name, device=self.device)
            log.info("Loading Whisper model")

            start_time = time.time()
            self.model = whisper.load_model(
                self.model_name,
                device=self.device,
                download_root=config.whisper.download_root,
            )
            load_time = time.time() - start_time

            log.info("Whisper model loaded", load_time_seconds=round(load_time, 2))

    def transcribe(
        self,
        audio_path: Path,
        language: Optional[str] = None,
        include_timestamps: bool = True,
    ) -> dict[str, Any]:
        """Transcribe an audio file."""
        self.load_model()

        log = logger.bind(audio_path=str(audio_path), language=language)
        log.info("Starting transcription")

        transcribe_options = {
            "word_timestamps": config.whisper.word_timestamps,
            "verbose": config.worker.debug,
        }

        # Whisper expects None for auto-detection, not the string "auto"
        effective_language = None if language == "auto" else language

        if effective_language:
            transcribe_options["language"] = effective_language
        elif config.whisper.default_language and config.whisper.default_language != "auto":
            transcribe_options["language"] = config.whisper.default_language

        if config.whisper.initial_prompt:
            transcribe_options["initial_prompt"] = config.whisper.initial_prompt

        start_time = time.time()
        result = self.model.transcribe(str(audio_path), **transcribe_options)
        processing_time = time.time() - start_time

        log.info(
            "Transcription complete",
            processing_time_seconds=round(processing_time, 2),
            detected_language=result.get("language"),
            text_length=len(result.get("text", "")),
        )

        return {
            **result,
            "processing_time": processing_time,
        }


class TranscriptionWorker:
    """Main worker that processes transcription jobs from Redis."""

    # BullMQ queue and job key patterns
    # The prefix must match QUEUE_PREFIX in backend's bullmq.ts config
    # BullMQ keys are: {prefix}:{queueName}:{state} (NO "bull:" prefix when custom prefix is set)
    # BullMQ v5: 'prioritized' is a sorted set for priority jobs, 'wait' is a LIST for regular jobs
    QUEUE_PREFIX = os.getenv("QUEUE_PREFIX", "cogveri")
    QUEUE_NAME = "transcription"
    WAIT_KEY = f"{QUEUE_PREFIX}:{QUEUE_NAME}:wait"
    PRIORITIZED_KEY = f"{QUEUE_PREFIX}:{QUEUE_NAME}:prioritized"
    ACTIVE_KEY = f"{QUEUE_PREFIX}:{QUEUE_NAME}:active"

    def __init__(self):
        logger.debug("Initializing TranscriptionWorker")
        logger.debug("Connecting to Redis", host=config.redis.host, port=config.redis.port)
        self.redis_client = redis.Redis(
            host=config.redis.host,
            port=config.redis.port,
            db=config.redis.db,
            password=config.redis.password,
            decode_responses=True,
        )
        # Test Redis connection
        self.redis_client.ping()
        logger.info("Redis connection successful")

        logger.debug("Creating StorageClient")
        self.storage = StorageClient()
        logger.debug("Creating WhisperTranscriber")
        self.transcriber = WhisperTranscriber()
        logger.debug("WhisperTranscriber created")
        self.running = True
        logger.debug("TranscriptionWorker initialization complete")

    def get_job_data(self, job_id: str) -> Optional[dict]:
        """Fetch job data from Redis."""
        job_key = f"{self.QUEUE_PREFIX}:{self.QUEUE_NAME}:{job_id}"
        data = self.redis_client.hgetall(job_key)

        if not data:
            return None

        return {
            "id": job_id,
            "data": json.loads(data.get("data", "{}")),
            "opts": json.loads(data.get("opts", "{}")),
            "name": data.get("name"),
            "timestamp": data.get("timestamp"),
            "attemptsMade": int(data.get("attemptsMade", 0)),
        }

    def update_job_progress(self, job_id: str, progress: dict) -> None:
        """Update job progress in Redis."""
        job_key = f"{self.QUEUE_PREFIX}:{self.QUEUE_NAME}:{job_id}"
        self.redis_client.hset(job_key, "progress", json.dumps(progress))

        # Also publish progress event for real-time updates
        event = {
            "event": "progress",
            "jobId": job_id,
            "data": progress,
        }
        self.redis_client.publish(f"{self.QUEUE_PREFIX}:{self.QUEUE_NAME}:events", json.dumps(event))

    def complete_job(self, job_id: str, result: dict) -> None:
        """Mark job as completed and store result."""
        job_key = f"{self.QUEUE_PREFIX}:{self.QUEUE_NAME}:{job_id}"

        # Update job state
        self.redis_client.hset(job_key, mapping={
            "returnvalue": json.dumps(result),
            "finishedOn": str(int(time.time() * 1000)),
            "processedOn": str(int(time.time() * 1000)),
        })

        # Move from active to completed
        self.redis_client.lrem(self.ACTIVE_KEY, 1, job_id)
        completed_key = f"{self.QUEUE_PREFIX}:{self.QUEUE_NAME}:completed"
        self.redis_client.zadd(completed_key, {job_id: time.time() * 1000})

        # Publish completion event
        event = {
            "event": "completed",
            "jobId": job_id,
            "returnvalue": result,
        }
        self.redis_client.publish(f"{self.QUEUE_PREFIX}:{self.QUEUE_NAME}:events", json.dumps(event))

        logger.info("Job completed", job_id=job_id)

    def fail_job(self, job_id: str, error: str, stack: Optional[str] = None) -> None:
        """Mark job as failed."""
        job_key = f"{self.QUEUE_PREFIX}:{self.QUEUE_NAME}:{job_id}"

        self.redis_client.hset(job_key, mapping={
            "failedReason": error,
            "stacktrace": json.dumps([stack] if stack else []),
            "finishedOn": str(int(time.time() * 1000)),
        })

        # Move from active to failed
        self.redis_client.lrem(self.ACTIVE_KEY, 1, job_id)
        failed_key = f"{self.QUEUE_PREFIX}:{self.QUEUE_NAME}:failed"
        self.redis_client.zadd(failed_key, {job_id: time.time() * 1000})

        # Publish failure event
        event = {
            "event": "failed",
            "jobId": job_id,
            "failedReason": error,
        }
        self.redis_client.publish(f"{self.QUEUE_PREFIX}:{self.QUEUE_NAME}:events", json.dumps(event))

        logger.error("Job failed", job_id=job_id, error=error)

    def notify_backend(self, result: TranscriptionResult) -> None:
        """Send transcription result to the backend API."""
        if not config.worker.backend_url:
            logger.warning("No backend URL configured, skipping notification")
            return

        endpoint = f"{config.worker.backend_url}/api/transcription/callback"

        payload = {
            "recordingId": result.recording_id,
            "transcriptText": result.transcript_text,
            "segments": [asdict(s) for s in result.segments],
            "language": result.language,
            "duration": result.duration,
            "metadata": {
                "modelUsed": result.model_used,
                "processingTime": result.processing_time,
            },
        }

        headers = {}
        if config.worker.backend_api_key:
            headers["X-API-Key"] = config.worker.backend_api_key

        try:
            with httpx.Client(timeout=30) as client:
                response = client.post(endpoint, json=payload, headers=headers)
                response.raise_for_status()
                logger.info("Backend notified successfully", recording_id=result.recording_id)
        except Exception as e:
            logger.error("Failed to notify backend", error=str(e), recording_id=result.recording_id)
            # Don't fail the job - transcription is complete, notification is best-effort

    def process_job(self, job_id: str, job_data: dict) -> TranscriptionResult:
        """Process a single transcription job."""
        data = job_data["data"]
        recording_id = data["recordingId"]
        file_url = data["fileUrl"]
        language = data.get("language")
        options = data.get("options", {})

        log = logger.bind(job_id=job_id, recording_id=recording_id)
        log.info("Processing transcription job")

        # Create temp directory if needed
        temp_dir = Path(config.worker.temp_dir)
        temp_dir.mkdir(parents=True, exist_ok=True)

        # Generate unique filename for this job
        file_hash = hashlib.md5(f"{recording_id}:{file_url}".encode()).hexdigest()[:12]
        audio_path = temp_dir / f"audio_{file_hash}.tmp"

        try:
            # Stage 1: Download file
            self.update_job_progress(job_id, {
                "percentage": 10,
                "stage": "downloading",
                "message": "Downloading audio file",
            })

            self.storage.download_file(file_url, audio_path)

            # Stage 2: Transcribe
            self.update_job_progress(job_id, {
                "percentage": 30,
                "stage": "transcribing",
                "message": "Transcribing audio with Whisper",
            })

            include_timestamps = options.get("includeTimestamps", True)
            transcription = self.transcriber.transcribe(
                audio_path,
                language=language,
                include_timestamps=include_timestamps,
            )

            # Stage 3: Process results
            self.update_job_progress(job_id, {
                "percentage": 90,
                "stage": "processing",
                "message": "Processing transcription results",
            })

            # Extract segments
            segments = []
            if include_timestamps and "segments" in transcription:
                for seg in transcription["segments"]:
                    segments.append(TranscriptionSegment(
                        start=seg["start"],
                        end=seg["end"],
                        text=seg["text"].strip(),
                        speaker=None,  # Speaker diarization would require additional processing
                    ))

            # Calculate duration from segments or audio
            duration = 0.0
            if segments:
                duration = segments[-1].end

            result = TranscriptionResult(
                recording_id=recording_id,
                transcript_text=transcription["text"].strip(),
                segments=segments,
                language=transcription.get("language", "en"),
                duration=duration,
                model_used=self.transcriber.model_name,
                processing_time=transcription.get("processing_time", 0),
            )

            # Stage 4: Complete
            self.update_job_progress(job_id, {
                "percentage": 100,
                "stage": "completed",
                "message": "Transcription complete",
            })

            log.info(
                "Transcription successful",
                language=result.language,
                duration=round(result.duration, 2),
                segments_count=len(result.segments),
            )

            return result

        finally:
            # Cleanup temp file
            if audio_path.exists():
                audio_path.unlink()
                log.debug("Cleaned up temp file")

    def claim_job(self) -> Optional[str]:
        """Try to claim a job from the queue.

        BullMQ v5 data structures:
        - prioritized: sorted set (for priority jobs)
        - wait: LIST (for regular jobs)
        - active: LIST
        """
        # First try prioritized queue (sorted set, non-blocking)
        result = self.redis_client.zpopmin(self.PRIORITIZED_KEY, count=1)
        source_queue = self.PRIORITIZED_KEY

        if result:
            # zpopmin returns list of (member, score) tuples
            job_id = result[0][0] if result else None
            if job_id:
                logger.info("Job claimed from prioritized queue", job_id=job_id)
                self.redis_client.lpush(self.ACTIVE_KEY, job_id)
                logger.info("Job moved to active", job_id=job_id)
                return job_id

        # No prioritized jobs, try wait queue (LIST, blocking)
        # brpop returns (key, value) tuple or None
        result = self.redis_client.brpop(self.WAIT_KEY, timeout=5)

        if not result:
            return None

        # brpop returns (key, member) tuple
        job_id = result[1] if len(result) >= 2 else result[0]
        source_queue = self.WAIT_KEY

        logger.info("Job claimed from wait queue", job_id=job_id, source=source_queue)

        # Add to active list (BullMQ uses a list for active jobs)
        self.redis_client.lpush(self.ACTIVE_KEY, job_id)

        logger.info("Job moved to active", job_id=job_id)
        return job_id

    def run(self) -> None:
        """Main worker loop."""
        logger.info(
            "Transcription worker starting",
            model=config.whisper.model_name,
            device=self.transcriber.device,
            max_concurrency=config.worker.max_concurrency,
        )

        # Pre-load the model
        logger.info("Loading Whisper model (this may take a while)")
        self.transcriber.load_model()
        logger.info("Whisper model loaded")

        # Debug: Check queue state on startup
        # BullMQ v5: wait is a LIST, prioritized is a sorted set
        wait_count = self.redis_client.llen(self.WAIT_KEY)
        prioritized_count = self.redis_client.zcard(self.PRIORITIZED_KEY)
        active_count = self.redis_client.llen(self.ACTIVE_KEY)
        logger.info("Worker ready, waiting for jobs",
                   wait_queue=self.WAIT_KEY,
                   prioritized_queue=self.PRIORITIZED_KEY,
                   waiting_jobs=wait_count,
                   prioritized_jobs=prioritized_count,
                   active_jobs=active_count)

        # Recover any stuck jobs in active queue (from previous crashed workers)
        if active_count > 0:
            logger.info("Found stuck jobs in active queue, recovering...", count=active_count)
            stuck_jobs = self.redis_client.lrange(self.ACTIVE_KEY, 0, -1)
            for job_id in stuck_jobs:
                logger.info("Recovering stuck job", job_id=job_id)
                # Move back to wait queue (BullMQ v5: wait is a list, use rpush for FIFO)
                self.redis_client.lrem(self.ACTIVE_KEY, 1, job_id)
                self.redis_client.rpush(self.WAIT_KEY, job_id)
            logger.info("Stuck jobs recovered", count=len(stuck_jobs))
            # Verify recovery
            new_wait_count = self.redis_client.llen(self.WAIT_KEY)
            new_active_count = self.redis_client.llen(self.ACTIVE_KEY)
            wait_members = self.redis_client.lrange(self.WAIT_KEY, 0, -1)
            logger.info("Queue state after recovery",
                       waiting_jobs=new_wait_count,
                       active_jobs=new_active_count,
                       wait_queue_members=wait_members)

        while self.running:
            try:
                # Debug: log each poll attempt
                # BullMQ v5: wait is a LIST
                current_wait = self.redis_client.llen(self.WAIT_KEY)
                if current_wait > 0:
                    logger.info("Polling for job, wait queue has jobs", count=current_wait)

                # Try to claim a job
                job_id = self.claim_job()

                if not job_id:
                    continue

                # Fetch job data
                job_data = self.get_job_data(job_id)

                if not job_data:
                    logger.warning("Job data not found", job_id=job_id)
                    self.redis_client.lrem(self.ACTIVE_KEY, 1, job_id)
                    continue

                # Process the job
                try:
                    result = self.process_job(job_id, job_data)

                    # Prepare result for storage
                    result_dict = {
                        "recordingId": result.recording_id,
                        "transcriptText": result.transcript_text,
                        "segments": [asdict(s) for s in result.segments],
                        "language": result.language,
                        "duration": result.duration,
                    }

                    self.complete_job(job_id, result_dict)

                    # Notify backend (best-effort)
                    self.notify_backend(result)

                except Exception as e:
                    import traceback
                    error_msg = str(e)
                    stack_trace = traceback.format_exc()

                    logger.exception("Job processing failed", job_id=job_id)
                    self.fail_job(job_id, error_msg, stack_trace)

            except KeyboardInterrupt:
                logger.info("Shutdown requested")
                self.running = False
            except redis.ConnectionError as e:
                logger.error("Redis connection error, retrying in 5s", error=str(e))
                time.sleep(5)
            except Exception:
                logger.exception("Unexpected error in worker loop")
                time.sleep(1)

        logger.info("Worker stopped")

    def shutdown(self) -> None:
        """Graceful shutdown."""
        self.running = False


def main():
    """Entry point."""
    logger.info("Starting transcription worker main")

    # Ensure temp directory exists
    Path(config.worker.temp_dir).mkdir(parents=True, exist_ok=True)
    logger.debug("Temp directory ready", path=config.worker.temp_dir)

    logger.debug("Creating TranscriptionWorker")
    worker = TranscriptionWorker()
    logger.debug("TranscriptionWorker created")

    import signal

    def signal_handler(signum, _frame):
        logger.info("Received signal, shutting down", signal=signum)
        worker.shutdown()

    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    try:
        logger.info("Starting worker run loop")
        worker.run()
    except Exception as e:
        logger.exception("Worker crashed", error=str(e))
        sys.exit(1)


if __name__ == "__main__":
    main()

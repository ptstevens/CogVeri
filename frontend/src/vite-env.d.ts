/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_NAME: string
  readonly VITE_APP_VERSION: string
  readonly VITE_APP_ENVIRONMENT: string
  readonly VITE_OPEN_FOR_BUSINESS: string
  readonly VITE_API_URL: string
  readonly VITE_API_TIMEOUT: string
  readonly VITE_SOCKET_URL: string
  readonly VITE_SOCKET_PATH: string
  readonly VITE_AUTH_TOKEN_KEY: string
  readonly VITE_AUTH_REFRESH_TOKEN_KEY: string
  readonly VITE_AUTH_USER_KEY: string
  readonly VITE_FEATURE_LIVE_SESSIONS: string
  readonly VITE_FEATURE_SLACK_INTEGRATION: string
  readonly VITE_FEATURE_DARK_MODE: string
  readonly VITE_FEATURE_ANALYTICS: string
  readonly VITE_MAX_RECORDING_SIZE_MB: string
  readonly VITE_MAX_RECORDING_DURATION_MINUTES: string
  readonly VITE_RECORDING_COUNTDOWN_SECONDS: string
  readonly VITE_PREFERRED_VIDEO_CODEC: string
  readonly VITE_VIDEO_BITRATE: string
  readonly VITE_DEFAULT_THEME: string
  readonly VITE_SIDEBAR_COLLAPSED: string
  readonly VITE_ITEMS_PER_PAGE: string
  readonly VITE_CHUNK_SIZE: string
  readonly VITE_MAX_PARALLEL_UPLOADS: string
  readonly VITE_UPLOAD_RETRY_ATTEMPTS: string
  readonly VITE_TOAST_DURATION: string
  readonly VITE_NOTIFICATION_SOUND: string
  readonly VITE_DEBUG_MODE: string
  readonly VITE_LOG_LEVEL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

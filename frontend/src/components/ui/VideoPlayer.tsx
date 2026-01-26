import { forwardRef, useImperativeHandle, useRef } from 'react';
import {
  MediaPlayer,
  MediaProvider,
  Poster,
  type MediaPlayerInstance,
} from '@vidstack/react';
import {
  DefaultVideoLayout,
  defaultLayoutIcons,
} from '@vidstack/react/player/layouts/default';
import '@vidstack/react/player/styles/default/theme.css';
import '@vidstack/react/player/styles/default/layouts/video.css';

// Custom theme styles to match CogVeri brand (keeping light menus)
const playerStyles = `
  .cogveri-player {
    --media-brand: #0d9488;
    --media-focus-ring-color: #14b8a6;
    --media-focus-ring: 0 0 0 3px var(--media-focus-ring-color);

    /* Slider track colors */
    --media-slider-track-fill-bg: #0d9488;
    --media-slider-thumb-bg: #14b8a6;

    /* Time slider hover */
    --media-time-slider-focused-track-height: 6px;
  }

  .cogveri-player [data-media-button]:hover {
    color: #14b8a6;
  }
`;

export interface VideoPlayerProps {
  src: string | undefined;
  poster?: string;
  className?: string;
  onTimeUpdate?: (currentTime: number) => void;
  onDurationChange?: (duration: number) => void;
  onPlay?: () => void;
  onPause?: () => void;
  onError?: (error: Error) => void;
  onEnded?: () => void;
}

export interface VideoPlayerHandle {
  seekTo: (time: number) => void;
  getCurrentTime: () => number;
  play: () => Promise<void>;
  pause: () => void;
}

const VideoPlayer = forwardRef<VideoPlayerHandle, VideoPlayerProps>(
  (
    {
      src,
      poster,
      className = '',
      onTimeUpdate,
      onDurationChange,
      onPlay,
      onPause,
      onError,
      onEnded,
    },
    ref
  ) => {
    const playerRef = useRef<MediaPlayerInstance>(null);

    useImperativeHandle(
      ref,
      () => ({
        seekTo: (time: number) => {
          if (playerRef.current) {
            playerRef.current.currentTime = time;
          }
        },
        getCurrentTime: () => {
          return playerRef.current?.currentTime ?? 0;
        },
        play: async () => {
          if (playerRef.current) {
            await playerRef.current.play();
          }
        },
        pause: () => {
          if (playerRef.current) {
            playerRef.current.pause();
          }
        },
      }),
      []
    );

    if (!src) {
      return (
        <div
          className={`flex items-center justify-center bg-black text-white aspect-video ${className}`}
        >
          No video available
        </div>
      );
    }

    return (
      <>
        <style>{playerStyles}</style>
        <MediaPlayer
          ref={playerRef}
          src={src}
          viewType="video"
          streamType="on-demand"
          crossOrigin
          className={`cogveri-player ${className}`}
          onTimeUpdate={(detail) => {
            onTimeUpdate?.(detail.currentTime);
          }}
          onDurationChange={(duration) => {
            if (duration && duration > 0) {
              onDurationChange?.(duration);
            }
          }}
          onPlay={() => onPlay?.()}
          onPause={() => onPause?.()}
          onError={(detail) => {
            const error = new Error(detail?.message || 'Video playback error');
            onError?.(error);
          }}
          onEnded={() => onEnded?.()}
        >
          <MediaProvider>
            {poster && <Poster className="vds-poster" src={poster} alt="" />}
          </MediaProvider>
          <DefaultVideoLayout
            icons={defaultLayoutIcons}
            playbackRates={[0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]}
          />
        </MediaPlayer>
      </>
    );
  }
);

VideoPlayer.displayName = 'VideoPlayer';

export default VideoPlayer;

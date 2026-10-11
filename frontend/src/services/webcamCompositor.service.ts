/**
 * Webcam Compositor Service
 *
 * Composites screen capture and webcam streams into a single video stream
 * using HTML5 Canvas. The webcam appears as a circular bubble overlay.
 *
 * Usage:
 *   const compositor = new WebcamCompositor(screenStream, webcamStream, options);
 *   const compositedStream = await compositor.start();
 *   // Use compositedStream with MediaRecorder
 *   compositor.stop();
 */

export type BubbleSize = 'small' | 'medium' | 'large';
export type BubbleShape = 'circle' | 'rounded';
export type BubblePosition = 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right' | 'custom';

export interface BubbleConfig {
  size: BubbleSize;
  shape: BubbleShape;
  position: BubblePosition;
  customX?: number; // 0-1 percentage from left
  customY?: number; // 0-1 percentage from top
  visible: boolean;
  borderWidth: number;
  borderColor: string;
  mirrored: boolean; // Mirror webcam horizontally (natural selfie view)
}

export interface CompositorOptions {
  frameRate?: number; // Target FPS (default: 30)
  bubble?: Partial<BubbleConfig>;
}

// Size presets in pixels
const SIZE_PRESETS: Record<BubbleSize, number> = {
  small: 120,
  medium: 200,
  large: 300,
};

// Position presets (percentage from edge)
const POSITION_MARGIN = 20; // pixels from edge

const DEFAULT_BUBBLE_CONFIG: BubbleConfig = {
  size: 'medium',
  shape: 'circle',
  position: 'bottom-left',
  visible: true,
  borderWidth: 3,
  borderColor: '#ffffff',
  mirrored: true,
};

export class WebcamCompositor {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private screenVideo: HTMLVideoElement;
  private webcamVideo: HTMLVideoElement;
  private animationFrameId: number | null = null;
  private isRunning = false;
  private bubbleConfig: BubbleConfig;
  private frameRate: number;
  private lastFrameTime = 0;
  private frameInterval: number;

  // Actual pixel position/size (computed from config)
  private bubbleX = 0;
  private bubbleY = 0;
  private bubbleSizePx = 0;

  constructor(
    private screenStream: MediaStream,
    private webcamStream: MediaStream,
    options: CompositorOptions = {}
  ) {
    this.frameRate = options.frameRate ?? 30;
    this.frameInterval = 1000 / this.frameRate;
    this.bubbleConfig = { ...DEFAULT_BUBBLE_CONFIG, ...options.bubble };

    // Create canvas
    this.canvas = document.createElement('canvas');
    const ctx = this.canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to get canvas 2D context');
    }
    this.ctx = ctx;

    // Create video elements for streams
    this.screenVideo = this.createVideoElement(this.screenStream);
    this.webcamVideo = this.createVideoElement(this.webcamStream);
  }

  private createVideoElement(stream: MediaStream): HTMLVideoElement {
    const video = document.createElement('video');
    video.srcObject = stream;
    video.muted = true;
    video.playsInline = true;
    video.autoplay = true;
    return video;
  }

  /**
   * Start compositing and return the combined stream
   */
  async start(): Promise<MediaStream> {
    // Wait for videos to be ready
    await Promise.all([
      this.waitForVideoReady(this.screenVideo),
      this.waitForVideoReady(this.webcamVideo),
    ]);

    // Set canvas size to match screen
    this.canvas.width = this.screenVideo.videoWidth;
    this.canvas.height = this.screenVideo.videoHeight;

    // Calculate bubble position
    this.updateBubblePosition();

    // Start render loop
    this.isRunning = true;
    this.render(performance.now());

    // Capture canvas as stream
    const canvasStream = this.canvas.captureStream(this.frameRate);

    return canvasStream;
  }

  private waitForVideoReady(video: HTMLVideoElement): Promise<void> {
    return new Promise((resolve, reject) => {
      if (video.readyState >= 2) {
        resolve();
        return;
      }

      const onCanPlay = () => {
        video.removeEventListener('canplay', onCanPlay);
        video.removeEventListener('error', onError);
        resolve();
      };

      const onError = () => {
        video.removeEventListener('canplay', onCanPlay);
        video.removeEventListener('error', onError);
        reject(new Error('Video failed to load'));
      };

      video.addEventListener('canplay', onCanPlay);
      video.addEventListener('error', onError);

      // Ensure video starts playing
      video.play().catch(reject);
    });
  }

  /**
   * Main render loop - composites screen and webcam
   */
  private render = (timestamp: number): void => {
    if (!this.isRunning) return;

    const elapsed = timestamp - this.lastFrameTime;

    // Throttle to target frame rate
    if (elapsed >= this.frameInterval) {
      this.lastFrameTime = timestamp - (elapsed % this.frameInterval);
      this.drawFrame();
    }

    this.animationFrameId = requestAnimationFrame(this.render);
  };

  private drawFrame(): void {
    const { width, height } = this.canvas;

    // Draw screen capture as background
    this.ctx.drawImage(this.screenVideo, 0, 0, width, height);

    // Draw webcam bubble if visible
    if (this.bubbleConfig.visible && this.webcamStream.active) {
      this.drawWebcamBubble();
    }
  }

  private drawWebcamBubble(): void {
    const { shape, borderWidth, borderColor, mirrored } = this.bubbleConfig;
    const x = this.bubbleX;
    const y = this.bubbleY;
    const size = this.bubbleSizePx;

    // Get webcam video dimensions for proper aspect ratio cropping
    const videoWidth = this.webcamVideo.videoWidth;
    const videoHeight = this.webcamVideo.videoHeight;

    // Calculate crop area to center-crop the webcam into a square
    // This maintains aspect ratio and avoids stretching
    let sx = 0,
      sy = 0,
      sWidth = videoWidth,
      sHeight = videoHeight;

    if (videoWidth > videoHeight) {
      // Landscape webcam - crop sides
      sWidth = videoHeight;
      sx = (videoWidth - videoHeight) / 2;
    } else if (videoHeight > videoWidth) {
      // Portrait webcam - crop top/bottom
      sHeight = videoWidth;
      sy = (videoHeight - videoWidth) / 2;
    }
    // If square, no cropping needed

    this.ctx.save();

    // Create clipping path based on shape
    if (shape === 'circle') {
      this.ctx.beginPath();
      this.ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
      this.ctx.closePath();
      this.ctx.clip();
    } else if (shape === 'rounded') {
      this.ctx.beginPath();
      this.roundRect(x, y, size, size, 16);
      this.ctx.closePath();
      this.ctx.clip();
    }

    // Draw webcam with proper cropping (optionally mirrored)
    if (mirrored) {
      this.ctx.translate(x + size, y);
      this.ctx.scale(-1, 1);
      // Use 9-arg drawImage for source cropping: (img, sx, sy, sW, sH, dx, dy, dW, dH)
      this.ctx.drawImage(this.webcamVideo, sx, sy, sWidth, sHeight, 0, 0, size, size);
    } else {
      this.ctx.drawImage(this.webcamVideo, sx, sy, sWidth, sHeight, x, y, size, size);
    }

    this.ctx.restore();

    // Draw border
    if (borderWidth > 0) {
      this.ctx.save();
      this.ctx.strokeStyle = borderColor;
      this.ctx.lineWidth = borderWidth;

      if (shape === 'circle') {
        this.ctx.beginPath();
        this.ctx.arc(x + size / 2, y + size / 2, size / 2 - borderWidth / 2, 0, Math.PI * 2);
        this.ctx.stroke();
      } else if (shape === 'rounded') {
        this.ctx.beginPath();
        this.roundRect(
          x + borderWidth / 2,
          y + borderWidth / 2,
          size - borderWidth,
          size - borderWidth,
          14
        );
        this.ctx.stroke();
      }

      this.ctx.restore();
    }
  }

  /**
   * Helper to draw rounded rectangles (polyfill for older browsers)
   */
  private roundRect(x: number, y: number, w: number, h: number, r: number): void {
    if (this.ctx.roundRect) {
      this.ctx.roundRect(x, y, w, h, r);
    } else {
      // Fallback for browsers without roundRect
      this.ctx.moveTo(x + r, y);
      this.ctx.arcTo(x + w, y, x + w, y + h, r);
      this.ctx.arcTo(x + w, y + h, x, y + h, r);
      this.ctx.arcTo(x, y + h, x, y, r);
      this.ctx.arcTo(x, y, x + w, y, r);
    }
  }

  /**
   * Calculate bubble pixel position from config
   */
  private updateBubblePosition(): void {
    const { position, size, customX, customY } = this.bubbleConfig;
    const canvasW = this.canvas.width;
    const canvasH = this.canvas.height;

    this.bubbleSizePx = SIZE_PRESETS[size];

    switch (position) {
      case 'bottom-left':
        this.bubbleX = POSITION_MARGIN;
        this.bubbleY = canvasH - this.bubbleSizePx - POSITION_MARGIN;
        break;
      case 'bottom-right':
        this.bubbleX = canvasW - this.bubbleSizePx - POSITION_MARGIN;
        this.bubbleY = canvasH - this.bubbleSizePx - POSITION_MARGIN;
        break;
      case 'top-left':
        this.bubbleX = POSITION_MARGIN;
        this.bubbleY = POSITION_MARGIN;
        break;
      case 'top-right':
        this.bubbleX = canvasW - this.bubbleSizePx - POSITION_MARGIN;
        this.bubbleY = POSITION_MARGIN;
        break;
      case 'custom':
        this.bubbleX = (customX ?? 0) * canvasW;
        this.bubbleY = (customY ?? 0) * canvasH;
        // Clamp to canvas bounds
        this.bubbleX = Math.max(0, Math.min(canvasW - this.bubbleSizePx, this.bubbleX));
        this.bubbleY = Math.max(0, Math.min(canvasH - this.bubbleSizePx, this.bubbleY));
        break;
    }
  }

  /**
   * Update bubble configuration at runtime
   */
  updateBubbleConfig(updates: Partial<BubbleConfig>): void {
    this.bubbleConfig = { ...this.bubbleConfig, ...updates };
    this.updateBubblePosition();
  }

  /**
   * Set bubble position by pixel coordinates (for dragging)
   */
  setBubblePixelPosition(x: number, y: number): void {
    const canvasW = this.canvas.width;
    const canvasH = this.canvas.height;

    // Convert to percentage and clamp
    this.bubbleConfig.position = 'custom';
    this.bubbleConfig.customX = Math.max(0, Math.min(1 - this.bubbleSizePx / canvasW, x / canvasW));
    this.bubbleConfig.customY = Math.max(0, Math.min(1 - this.bubbleSizePx / canvasH, y / canvasH));

    this.bubbleX = x;
    this.bubbleY = y;

    // Clamp to canvas bounds
    this.bubbleX = Math.max(0, Math.min(canvasW - this.bubbleSizePx, this.bubbleX));
    this.bubbleY = Math.max(0, Math.min(canvasH - this.bubbleSizePx, this.bubbleY));
  }

  /**
   * Get the canvas element (for dimension calculations)
   */
  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  /**
   * Get current bubble position (for UI overlay sync)
   */
  getBubbleRect(): { x: number; y: number; size: number } {
    return {
      x: this.bubbleX,
      y: this.bubbleY,
      size: this.bubbleSizePx,
    };
  }

  /**
   * Get canvas dimensions
   */
  getCanvasSize(): { width: number; height: number } {
    return {
      width: this.canvas.width,
      height: this.canvas.height,
    };
  }

  /**
   * Toggle webcam visibility
   */
  toggleWebcam(): boolean {
    this.bubbleConfig.visible = !this.bubbleConfig.visible;
    return this.bubbleConfig.visible;
  }

  /**
   * Show/hide webcam
   */
  setWebcamVisible(visible: boolean): void {
    this.bubbleConfig.visible = visible;
  }

  /**
   * Get current config
   */
  getConfig(): BubbleConfig {
    return { ...this.bubbleConfig };
  }

  /**
   * Stop compositing and cleanup resources
   */
  stop(): void {
    this.isRunning = false;

    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    // Stop video elements
    this.screenVideo.pause();
    this.screenVideo.srcObject = null;
    this.webcamVideo.pause();
    this.webcamVideo.srcObject = null;

    // Don't stop the streams themselves - let the caller handle that
  }

  /**
   * Check if compositor is running
   */
  isActive(): boolean {
    return this.isRunning;
  }
}

/**
 * Helper function to get available webcam devices
 */
export async function getWebcamDevices(): Promise<MediaDeviceInfo[]> {
  // First request permission to get full device list with labels
  // Without permission, enumerateDevices returns empty deviceId/label
  try {
    const tempStream = await navigator.mediaDevices.getUserMedia({ video: true });
    // Immediately stop the stream - we just needed it for permission
    tempStream.getTracks().forEach((track) => track.stop());
  } catch (err) {
    // Return empty list if permission denied
    return [];
  }

  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter((device) => device.kind === 'videoinput');
}

/**
 * Helper function to get webcam stream with specific device
 * Supports background blur on Chrome 99+ / Edge 99+
 */
export async function getWebcamStream(
  deviceId?: string,
  options: { width?: number; height?: number; backgroundBlur?: boolean } = {}
): Promise<MediaStream> {
  // Build video constraints
  const videoConstraints: MediaTrackConstraints & { backgroundBlur?: boolean } = {
    deviceId: deviceId ? { exact: deviceId } : undefined,
    width: { ideal: options.width ?? 640 },
    height: { ideal: options.height ?? 480 },
    facingMode: 'user',
    frameRate: { ideal: 30 },
  };

  // Handle background blur constraint (Chrome 99+, Edge 99+)
  // Explicitly set to false to disable OS/browser-level background effects
  if (options.backgroundBlur === true) {
    videoConstraints.backgroundBlur = true;
  } else {
    // Explicitly disable to prevent Chrome/OS from applying background effects
    videoConstraints.backgroundBlur = false;
  }

  const constraints: MediaStreamConstraints = {
    video: videoConstraints,
    audio: false,
  };

  const stream = await navigator.mediaDevices.getUserMedia(constraints);

  // Double-check: try to disable background blur on the track if it's enabled
  // This handles cases where the OS enforces blur
  try {
    const [videoTrack] = stream.getVideoTracks();
    if (videoTrack) {
      const capabilities = videoTrack.getCapabilities() as any;
      const settings = videoTrack.getSettings() as any;

      console.log('[getWebcamStream] Track capabilities:', {
        backgroundBlur: capabilities.backgroundBlur,
        currentSetting: settings.backgroundBlur,
      });

      // If background blur is controllable (has both true and false options)
      if (capabilities.backgroundBlur?.length === 2 && !options.backgroundBlur) {
        console.log('[getWebcamStream] Disabling background blur on track...');
        await videoTrack.applyConstraints({ backgroundBlur: false } as any);
        console.log('[getWebcamStream] Background blur disabled');
      }
    }
  } catch (err) {
    // Some browsers don't support backgroundBlur - ignore the error
    console.log('[getWebcamStream] Could not modify backgroundBlur:', err);
  }

  return stream;
}

/**
 * Check if background blur is supported by the browser
 */
export function isBackgroundBlurSupported(): boolean {
  // Check if the browser supports the backgroundBlur constraint
  // This is available in Chrome 99+, Edge 99+
  try {
    const supported = navigator.mediaDevices.getSupportedConstraints();
    return 'backgroundBlur' in supported;
  } catch {
    return false;
  }
}

/**
 * Check if webcam is available
 */
export async function isWebcamAvailable(): Promise<boolean> {
  try {
    const devices = await getWebcamDevices();
    return devices.length > 0;
  } catch {
    return false;
  }
}

export default WebcamCompositor;

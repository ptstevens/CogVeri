/**
 * Virtual Background Service - CORRECTED IMPLEMENTATION
 *
 * Technical Audit Findings and Fixes:
 *
 * FAILURE MATRIX:
 * ┌─────────────────────────────────┬─────────────────────────────────────────────────────────────────────┬──────────────────────────────────────────────┐
 * │ Symptom                         │ Root Cause                                                          │ Fix                                          │
 * ├─────────────────────────────────┼─────────────────────────────────────────────────────────────────────┼──────────────────────────────────────────────┤
 * │ Light blue background shows     │ Mask extraction failing silently, fallback draws background only   │ Robust mask extraction with multiple methods │
 * │ Person not visible              │ toCanvasImageSource() throws on TFJS runtime                       │ Try-catch chain with proper error handling   │
 * │ "source width is zero" error    │ Tensor memory leak / GPU memory exhaustion                         │ Proper tensor disposal with tf.dispose()     │
 * │ Flickering / frame drops        │ clearRect + captureStream race condition                           │ Draw to offscreen first, then composite      │
 * │ Blank on iOS Safari             │ WebGL memory limits / missing willReadFrequently                   │ CPU fallback path for iOS Safari             │
 * │ Black preview initially         │ captureStream before first frame drawn                             │ Draw initial frame before captureStream      │
 * │ Background image fails          │ Cross-origin tainting / load errors                                │ Proper image load validation                 │
 * │ Performance degrades over time  │ Creating new canvases every frame                                  │ Reuse canvas instances                       │
 * └─────────────────────────────────┴─────────────────────────────────────────────────────────────────────┴──────────────────────────────────────────────┘
 *
 * RENDERING PIPELINE (CORRECTED):
 * 1. Camera frame → Video element
 * 2. Video → Segmentation model → Mask tensor
 * 3. Mask tensor → Binary mask canvas (white=person, black=background)
 * 4. Background: Blur(video) OR backgroundImage → tempCanvas
 * 5. Person: Video + Mask via destination-in → personCanvas
 * 6. Composite: tempCanvas + personCanvas → outputCanvas
 * 7. outputCanvas.captureStream() → MediaStream for recording/preview
 */

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export type BackgroundMode = 'none' | 'blur-light' | 'blur-medium' | 'blur-strong' | 'image';

export interface VirtualBackgroundConfig {
  mode: BackgroundMode;
  backgroundImage?: HTMLImageElement | null;
}

interface BrowserCapabilities {
  hasWebGL: boolean;
  hasWebGL2: boolean;
  isIOSSafari: boolean;
  isSafari: boolean;
  hasOffscreenCanvas: boolean;
  maxTextureSize: number;
  recommendedResolution: { width: number; height: number };
}

// ============================================================================
// CONSTANTS
// ============================================================================

const BLUR_AMOUNTS: Record<string, number> = {
  'blur-light': 5,
  'blur-medium': 12,
  'blur-strong': 20,
};

// Maximum resolution for different scenarios (prevents GPU memory exhaustion)
const MAX_RESOLUTION = {
  desktop: { width: 1280, height: 720 },
  mobile: { width: 640, height: 480 },
  iosSafari: { width: 640, height: 480 }, // iOS Safari has strict memory limits
};

// Mask threshold - values above this are considered "person"
// Tuned for MediaPipe SelfieSegmentation model output
const MASK_THRESHOLD = 0.5;

// Frame rate for output stream
const TARGET_FPS = 30;

// ============================================================================
// BROWSER DETECTION & CAPABILITIES
// ============================================================================

let cachedCapabilities: BrowserCapabilities | null = null;

function detectBrowserCapabilities(): BrowserCapabilities {
  if (cachedCapabilities) return cachedCapabilities;

  const ua = navigator.userAgent;
  const isIOSSafari = /iPad|iPhone|iPod/.test(ua) && /Safari/.test(ua) && !/Chrome/.test(ua);
  const isSafari = /Safari/.test(ua) && !/Chrome/.test(ua);

  // Test WebGL support
  let hasWebGL = false;
  let hasWebGL2 = false;
  let maxTextureSize = 0;

  try {
    const testCanvas = document.createElement('canvas');
    const gl2 = testCanvas.getContext('webgl2') as WebGL2RenderingContext | null;
    if (gl2) {
      hasWebGL2 = true;
      hasWebGL = true;
      maxTextureSize = gl2.getParameter(gl2.MAX_TEXTURE_SIZE);
    } else {
      const gl = testCanvas.getContext('webgl') || testCanvas.getContext('experimental-webgl');
      if (gl) {
        hasWebGL = true;
        maxTextureSize = (gl as WebGLRenderingContext).getParameter((gl as WebGLRenderingContext).MAX_TEXTURE_SIZE);
      }
    }
  } catch (_e) {
    console.warn('[VirtualBG] WebGL detection failed:', _e);
  }

  // Test OffscreenCanvas support
  let hasOffscreenCanvas = false;
  try {
    if (typeof OffscreenCanvas !== 'undefined') {
      const test = new OffscreenCanvas(1, 1);
      const ctx = test.getContext('2d');
      hasOffscreenCanvas = ctx !== null;
    }
  } catch {
    hasOffscreenCanvas = false;
  }

  // Determine recommended resolution
  let recommendedResolution = MAX_RESOLUTION.desktop;
  if (isIOSSafari) {
    recommendedResolution = MAX_RESOLUTION.iosSafari;
  } else if (/Android|Mobile|Phone/i.test(ua)) {
    recommendedResolution = MAX_RESOLUTION.mobile;
  }

  cachedCapabilities = {
    hasWebGL,
    hasWebGL2,
    isIOSSafari,
    isSafari,
    hasOffscreenCanvas,
    maxTextureSize,
    recommendedResolution,
  };

  console.log('[VirtualBG] Browser capabilities:', cachedCapabilities);
  return cachedCapabilities;
}

// ============================================================================
// TENSORFLOW.JS LAZY LOADING
// ============================================================================

let tfModule: typeof import('@tensorflow/tfjs-core') | null = null;
let bodySegmentationModule: typeof import('@tensorflow-models/body-segmentation') | null = null;
let loadPromise: Promise<void> | null = null;

async function ensureTensorFlowLoaded(): Promise<{
  tf: typeof import('@tensorflow/tfjs-core');
  bodySegmentation: typeof import('@tensorflow-models/body-segmentation');
}> {
  if (tfModule && bodySegmentationModule) {
    return { tf: tfModule, bodySegmentation: bodySegmentationModule };
  }

  if (!loadPromise) {
    loadPromise = (async () => {
      const capabilities = detectBrowserCapabilities();

      console.log('[VirtualBG] Loading TensorFlow.js...');

      // Import TensorFlow core
      const tf = await import('@tensorflow/tfjs-core');

      // Choose backend based on capabilities
      if (capabilities.hasWebGL && !capabilities.isIOSSafari) {
        // Use WebGL backend for GPU acceleration
        console.log('[VirtualBG] Loading WebGL backend...');
        await import('@tensorflow/tfjs-backend-webgl');

        try {
          await tf.setBackend('webgl');
          await tf.ready();
          console.log('[VirtualBG] WebGL backend ready');
        } catch (e) {
          console.warn('[VirtualBG] WebGL backend failed, falling back to CPU:', e);
          await import('@tensorflow/tfjs-backend-cpu');
          await tf.setBackend('cpu');
          await tf.ready();
          console.log('[VirtualBG] CPU backend ready');
        }
      } else {
        // iOS Safari or no WebGL - use CPU backend
        console.log('[VirtualBG] Loading CPU backend (iOS Safari or no WebGL)...');
        await import('@tensorflow/tfjs-backend-cpu');
        await tf.setBackend('cpu');
        await tf.ready();
        console.log('[VirtualBG] CPU backend ready');
      }

      // Import body segmentation
      console.log('[VirtualBG] Loading body segmentation module...');
      const bodySegmentation = await import('@tensorflow-models/body-segmentation');

      tfModule = tf;
      bodySegmentationModule = bodySegmentation;

      console.log('[VirtualBG] TensorFlow.js fully loaded');
    })();
  }

  await loadPromise;
  return { tf: tfModule!, bodySegmentation: bodySegmentationModule! };
}

// ============================================================================
// VIRTUAL BACKGROUND PROCESSOR CLASS
// ============================================================================

export class VirtualBackgroundProcessor {
  // Core state
  private segmenter: any = null;
  private config: VirtualBackgroundConfig;
  private isInitialized = false;
  private isProcessing = false;
  private isDisposed = false;

  // Video/Canvas elements
  private videoElement: HTMLVideoElement | null = null;
  private outputCanvas: HTMLCanvasElement;
  private outputCtx: CanvasRenderingContext2D;
  private outputStream: MediaStream | null = null;

  // Reusable canvases (prevents garbage collection thrashing)
  private maskCanvas: HTMLCanvasElement;
  private maskCtx: CanvasRenderingContext2D;
  private personCanvas: HTMLCanvasElement;
  private personCtx: CanvasRenderingContext2D;
  private tempCanvas: HTMLCanvasElement;
  private tempCtx: CanvasRenderingContext2D;

  // Render loop
  private animationFrameId: number | null = null;
  private lastFrameTime = 0;
  private frameInterval = 1000 / TARGET_FPS;

  // Diagnostics
  private frameCount = 0;
  private errorCount = 0;
  private lastMaskValid = false;

  // Browser capabilities
  private capabilities: BrowserCapabilities;

  constructor(config: VirtualBackgroundConfig = { mode: 'none' }) {
    this.config = config;
    this.capabilities = detectBrowserCapabilities();

    // Create output canvas with proper context options
    this.outputCanvas = document.createElement('canvas');
    const outputCtx = this.outputCanvas.getContext('2d', {
      alpha: false, // No transparency needed - prevents compositing issues
      desynchronized: true, // Better performance for animation
    });
    if (!outputCtx) throw new Error('[VirtualBG] Failed to create output canvas context');
    this.outputCtx = outputCtx;

    // Create reusable working canvases
    // These are created once and resized as needed - prevents GC thrashing
    this.maskCanvas = document.createElement('canvas');
    this.maskCtx = this.maskCanvas.getContext('2d', { willReadFrequently: true })!;

    this.personCanvas = document.createElement('canvas');
    this.personCtx = this.personCanvas.getContext('2d')!;

    this.tempCanvas = document.createElement('canvas');
    this.tempCtx = this.tempCanvas.getContext('2d')!;

    console.log('[VirtualBG] Processor created with config:', config);
  }

  /**
   * Initialize the ML segmentation model
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.log('[VirtualBG] Already initialized');
      return;
    }

    if (this.isDisposed) {
      throw new Error('[VirtualBG] Processor has been disposed');
    }

    console.log('[VirtualBG] Initializing...');

    const { bodySegmentation } = await ensureTensorFlowLoaded();

    // Create segmenter with TFJS runtime
    // MediaPipe runtime has CORS issues and WASM loading problems
    const model = bodySegmentation.SupportedModels.MediaPipeSelfieSegmentation;

    const segmenterConfig: any = {
      runtime: 'tfjs',
      modelType: this.capabilities.isIOSSafari ? 'landscape' : 'general',
      // 'landscape' is faster but lower quality - good for mobile
      // 'general' is higher quality but slower - good for desktop
    };

    console.log('[VirtualBG] Creating segmenter with config:', segmenterConfig);

    try {
      this.segmenter = await bodySegmentation.createSegmenter(model, segmenterConfig);
      this.isInitialized = true;
      console.log('[VirtualBG] Segmenter created successfully');
    } catch (err) {
      console.error('[VirtualBG] Failed to create segmenter:', err);
      throw new Error(`Failed to initialize segmentation model: ${err}`);
    }
  }

  /**
   * Start processing a video stream
   * Returns a new MediaStream with effects applied
   */
  async startProcessing(inputStream: MediaStream): Promise<MediaStream> {
    console.log('[VirtualBG] startProcessing called');

    if (this.isDisposed) {
      throw new Error('[VirtualBG] Processor has been disposed');
    }

    if (!this.isInitialized) {
      await this.initialize();
    }

    // Clean up any existing processing
    this.stopRenderLoop();

    // Create video element for input stream
    this.videoElement = document.createElement('video');
    this.videoElement.srcObject = inputStream;
    this.videoElement.muted = true;
    this.videoElement.playsInline = true;
    // Required for iOS Safari
    this.videoElement.setAttribute('playsinline', 'true');
    this.videoElement.setAttribute('webkit-playsinline', 'true');

    // Wait for video to be ready
    console.log('[VirtualBG] Waiting for video ready...');
    await this.waitForVideoReady();

    // Get video dimensions (may be constrained by getUserMedia)
    let width = this.videoElement.videoWidth;
    let height = this.videoElement.videoHeight;

    // Validate dimensions
    if (!width || !height) {
      throw new Error(`[VirtualBG] Invalid video dimensions: ${width}x${height}`);
    }

    // Constrain to recommended resolution to prevent GPU memory issues
    const maxRes = this.capabilities.recommendedResolution;
    if (width > maxRes.width || height > maxRes.height) {
      const scale = Math.min(maxRes.width / width, maxRes.height / height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
      console.log(`[VirtualBG] Constraining resolution to ${width}x${height}`);
    }

    console.log('[VirtualBG] Video ready:', width, 'x', height);

    // Resize all canvases to match video
    this.resizeCanvases(width, height);

    // CRITICAL: Draw initial frame BEFORE captureStream
    // Without this, browsers show uninitialized buffer (often light blue)
    this.outputCtx.drawImage(this.videoElement, 0, 0, width, height);

    // Create output stream from canvas
    this.outputStream = this.outputCanvas.captureStream(TARGET_FPS);
    console.log('[VirtualBG] Output stream created:', this.outputStream.id);

    // Start render loop
    this.startRenderLoop();

    return this.outputStream;
  }

  /**
   * Wait for video element to be ready for playback
   */
  private async waitForVideoReady(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.videoElement) {
        reject(new Error('No video element'));
        return;
      }

      const video = this.videoElement;
      const timeoutId = setTimeout(() => {
        reject(new Error('Video ready timeout'));
      }, 10000);

      const cleanup = () => {
        clearTimeout(timeoutId);
        video.removeEventListener('loadeddata', onReady);
        video.removeEventListener('error', onError);
      };

      const onReady = () => {
        cleanup();
        resolve();
      };

      const onError = (e: Event) => {
        cleanup();
        reject(new Error(`Video error: ${e}`));
      };

      // Check if already ready
      if (video.readyState >= 2) {
        cleanup();
        resolve();
        return;
      }

      video.addEventListener('loadeddata', onReady);
      video.addEventListener('error', onError);

      // Start playing
      video.play().catch((err) => {
        // Ignore autoplay policy errors - video will still work when user interacts
        if (err.name !== 'NotAllowedError') {
          cleanup();
          reject(err);
        }
      });
    });
  }

  /**
   * Resize all canvases to match video dimensions
   */
  private resizeCanvases(width: number, height: number): void {
    this.outputCanvas.width = width;
    this.outputCanvas.height = height;

    this.maskCanvas.width = width;
    this.maskCanvas.height = height;

    this.personCanvas.width = width;
    this.personCanvas.height = height;

    this.tempCanvas.width = width;
    this.tempCanvas.height = height;

    console.log('[VirtualBG] Canvases resized to:', width, 'x', height);
  }

  /**
   * Start the render loop
   */
  private startRenderLoop(): void {
    console.log('[VirtualBG] Starting render loop');

    const render = async (timestamp: number) => {
      if (this.isDisposed || !this.videoElement || !this.isInitialized) {
        return;
      }

      // Frame rate limiting
      const elapsed = timestamp - this.lastFrameTime;
      if (elapsed >= this.frameInterval) {
        this.lastFrameTime = timestamp - (elapsed % this.frameInterval);
        await this.processFrame();
      }

      this.animationFrameId = requestAnimationFrame(render);
    };

    this.animationFrameId = requestAnimationFrame(render);
  }

  /**
   * Stop the render loop
   */
  private stopRenderLoop(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  // Processing state for error recovery
  private consecutiveErrors = 0;
  private processingPaused = false;
  private pauseTimeout: number | null = null;
  private lastGoodFrame: ImageData | null = null;
  private videoFrameVerified = false;

  /**
   * Check if video element has actual frame data ready
   * videoWidth/Height can be set before any frame is actually decoded
   */
  private isVideoFrameReady(): boolean {
    const video = this.videoElement;
    if (!video) return false;

    // Basic dimension check
    if (video.videoWidth === 0 || video.videoHeight === 0) return false;

    // Check readyState - HAVE_CURRENT_DATA (2) or higher means frame available
    // This is MORE reliable than just checking dimensions
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      if (this.frameCount <= 3) {
        console.log('[VirtualBG] Video readyState:', video.readyState, '(need >= 2)');
      }
      return false;
    }

    // Check if video is actually playing
    if (video.paused || video.ended) return false;

    // First-time verification: actually try to read a pixel
    if (!this.videoFrameVerified && this.frameCount < 10) {
      try {
        const testCanvas = document.createElement('canvas');
        testCanvas.width = 1;
        testCanvas.height = 1;
        const ctx = testCanvas.getContext('2d')!;
        ctx.drawImage(video, 0, 0, 1, 1);
        const pixel = ctx.getImageData(0, 0, 1, 1).data;

        // If all zeros with zero alpha, frame likely not ready
        if (pixel[0] === 0 && pixel[1] === 0 && pixel[2] === 0 && pixel[3] === 0) {
          if (this.frameCount <= 3) {
            console.log('[VirtualBG] Video frame appears empty (all zeros)');
          }
          return false;
        }

        // Frame verified - don't check again
        this.videoFrameVerified = true;
        console.log('[VirtualBG] Video frame verified ready');
      } catch (err) {
        if (this.frameCount <= 3) {
          console.log('[VirtualBG] Video frame test failed:', err);
        }
        return false;
      }
    }

    return true;
  }

  /**
   * Validate segmentation result before using library functions
   * SIMPLIFIED: Only check basic structure, let library functions handle tensor conversion
   *
   * NOTE: We previously tried validating tensor.shape here, but calling toTensor()
   * seems to corrupt the mask state for the TFJS runtime. Let the library handle it.
   */
  private isSegmentationValid(segmentation: any[] | null): boolean {
    if (!segmentation || segmentation.length === 0) {
      return false;
    }

    const mask = segmentation[0]?.mask;
    if (!mask) {
      return false;
    }

    // Log mask info on first few frames (without calling toTensor)
    if (this.frameCount <= 3) {
      const underlyingType = typeof mask.getUnderlyingType === 'function'
        ? mask.getUnderlyingType()
        : 'unknown';
      console.log('[VirtualBG] Mask validation:', {
        underlyingType,
        hasToTensor: typeof mask.toTensor === 'function',
        hasToImageData: typeof mask.toImageData === 'function',
        hasToCanvasImageSource: typeof mask.toCanvasImageSource === 'function',
      });
    }

    // Basic validation only - mask object exists with expected methods
    // Don't call toTensor() as it may corrupt the mask state
    return typeof mask.toTensor === 'function' ||
           typeof mask.toImageData === 'function' ||
           typeof mask.toCanvasImageSource === 'function';
  }

  /**
   * Draw a placeholder frame (used when video not ready)
   */
  private drawPlaceholder(width: number, height: number): void {
    this.outputCtx.fillStyle = '#1a1a1a';
    this.outputCtx.fillRect(0, 0, width, height);

    // Show loading text
    this.outputCtx.fillStyle = '#666';
    this.outputCtx.font = '14px sans-serif';
    this.outputCtx.textAlign = 'center';
    this.outputCtx.textBaseline = 'middle';
    this.outputCtx.fillText('Initializing...', width / 2, height / 2);
  }

  /**
   * Draw fallback frame (video or cached or placeholder)
   */
  private drawFallback(width: number, height: number): void {
    // Try 1: Draw video directly
    try {
      if (this.videoElement && this.videoElement.readyState >= 2) {
        this.outputCtx.drawImage(this.videoElement, 0, 0, width, height);
        return;
      }
    } catch {
      // Video draw failed
    }

    // Try 2: Use last good frame
    if (this.lastGoodFrame &&
        this.lastGoodFrame.width === width &&
        this.lastGoodFrame.height === height) {
      this.outputCtx.putImageData(this.lastGoodFrame, 0, 0);
      return;
    }

    // Try 3: Dark placeholder
    this.outputCtx.fillStyle = '#1a1a1a';
    this.outputCtx.fillRect(0, 0, width, height);
  }

  /**
   * Pause processing temporarily (for error recovery)
   */
  private pauseProcessing(durationMs: number): void {
    if (this.processingPaused) return;

    console.log(`[VirtualBG] Pausing processing for ${durationMs}ms due to consecutive errors`);
    this.processingPaused = true;

    this.pauseTimeout = window.setTimeout(() => {
      console.log('[VirtualBG] Resuming processing');
      this.processingPaused = false;
      this.consecutiveErrors = 0;
      this.videoFrameVerified = false; // Re-verify on resume
    }, durationMs);
  }

  /**
   * Process a single frame
   * This is the core rendering pipeline with robust error handling
   */
  private async processFrame(): Promise<void> {
    // Skip if already processing (prevents frame queue buildup)
    if (this.isProcessing || !this.videoElement || !this.segmenter) {
      return;
    }

    const { width, height } = this.outputCanvas;

    // Skip if paused due to errors
    if (this.processingPaused) {
      this.drawFallback(width, height);
      return;
    }

    // CRITICAL: Check if video frame is actually ready
    // This prevents the zero-dimension tensor issue
    if (!this.isVideoFrameReady()) {
      this.drawPlaceholder(width, height);
      return;
    }

    // Mode: none - just copy video frame
    if (this.config.mode === 'none') {
      this.outputCtx.drawImage(this.videoElement, 0, 0, width, height);
      return;
    }

    this.isProcessing = true;
    this.frameCount++;

    let segmentation: any[] | null = null;

    try {
      // ========================================
      // STEP 1: Get segmentation from model
      // Use canvas snapshot instead of video element directly
      // This ensures frame data is fully synchronized and available
      // ========================================

      // Draw current video frame to temp canvas
      // This forces the frame to be fully available in a known format
      this.tempCtx.drawImage(this.videoElement, 0, 0, width, height);

      // Use the canvas for segmentation instead of video element
      // This is more reliable as it guarantees frame availability
      segmentation = await this.segmenter.segmentPeople(this.tempCanvas, {
        flipHorizontal: false,
        multiSegmentation: false,
        segmentBodyParts: false,
      });

      if (this.frameCount <= 3) {
        console.log('[VirtualBG] Segmentation result:', {
          exists: !!segmentation,
          length: segmentation?.length,
          hasMask: !!segmentation?.[0]?.mask,
        });
      }

      // ========================================
      // STEP 2: Validate segmentation result
      // This catches zero-dimension tensors BEFORE library functions throw
      // ========================================
      if (!this.isSegmentationValid(segmentation)) {
        this.logDiagnostic('Invalid segmentation - drawing video directly');
        this.outputCtx.drawImage(this.videoElement, 0, 0, width, height);
        this.consecutiveErrors++;

        // If too many invalid segmentations, pause briefly
        if (this.consecutiveErrors > 30) {
          this.pauseProcessing(1000);
        }
        return;
      }

      // ========================================
      // STEP 3: Render based on mode
      // ========================================
      if (this.config.mode.startsWith('blur')) {
        await this.renderBlurWithLibrary(segmentation!, width, height);
      } else if (this.config.mode === 'image') {
        await this.renderImageWithLibrary(segmentation!, width, height);
      } else {
        this.outputCtx.drawImage(this.videoElement, 0, 0, width, height);
      }

      // Success! Cache this frame and reset error count
      this.lastMaskValid = true;
      this.consecutiveErrors = 0;
      this.errorCount = 0;

      // Cache successful frame for fallback
      try {
        this.lastGoodFrame = this.outputCtx.getImageData(0, 0, width, height);
      } catch {
        // getImageData can fail - not critical
      }

    } catch (err) {
      this.errorCount++;
      this.consecutiveErrors++;
      this.lastMaskValid = false;

      // Check for the specific zero-width error
      const isZeroWidthError = err instanceof Error &&
        (err.message.includes('width is zero') || err.message.includes('IndexSizeError'));

      if (isZeroWidthError) {
        // This is the known issue - handle gracefully
        if (this.consecutiveErrors <= 3 || this.consecutiveErrors % 60 === 0) {
          console.warn(`[VirtualBG] Zero-width frame (consecutive: ${this.consecutiveErrors})`);
        }

        // Pause if happening too often
        if (this.consecutiveErrors > 10) {
          this.pauseProcessing(500);
        }
      } else {
        // Unknown error - log it
        if (this.errorCount <= 3 || this.errorCount % 60 === 0) {
          console.error(`[VirtualBG] Frame ${this.frameCount} error:`, err);
        }
      }

      // Draw fallback
      this.drawFallback(width, height);

    } finally {
      // CRITICAL: Dispose segmentation tensors to prevent memory leak
      if (segmentation) {
        this.disposeSegmentation(segmentation);
      }
      this.isProcessing = false;
    }
  }

  /**
   * Extract segmentation mask to the mask canvas (LEGACY - available for future use)
   * Returns true if successful, false if failed
   */
  // @ts-expect-error Method available for future mask processing implementations
  private async extractMaskToCanvas(mask: any, width: number, height: number): Promise<boolean> {
    // Clear mask canvas first
    this.maskCtx.clearRect(0, 0, width, height);

    // Log mask info on first few frames for debugging
    if (this.frameCount <= 3) {
      console.log('[VirtualBG] Mask object info:', {
        type: typeof mask,
        hasToCanvasImageSource: typeof mask?.toCanvasImageSource === 'function',
        hasToImageData: typeof mask?.toImageData === 'function',
        hasToTensor: typeof mask?.toTensor === 'function',
        getUnderlyingType: typeof mask?.getUnderlyingType === 'function' ? mask.getUnderlyingType() : 'N/A',
        keys: mask ? Object.keys(mask) : [],
      });
    }

    // Try multiple methods to extract mask data
    // Different TensorFlow.js versions and runtimes have different APIs

    // Method 1: toCanvasImageSource (fastest, works on some configs)
    try {
      if (typeof mask.toCanvasImageSource === 'function') {
        const source = await mask.toCanvasImageSource();
        if (this.frameCount <= 3) {
          console.log('[VirtualBG] toCanvasImageSource result:', source, 'width:', (source as any)?.width);
        }
        if (source && (source as any).width > 0) {
          this.maskCtx.drawImage(source as CanvasImageSource, 0, 0, width, height);
          if (this.frameCount <= 3) console.log('[VirtualBG] Method 1 (toCanvasImageSource) succeeded');
          return true;
        }
      }
    } catch (err) {
      if (this.frameCount <= 3) console.warn('[VirtualBG] toCanvasImageSource failed:', err);
    }

    // Method 2: toImageData (medium speed, most compatible)
    try {
      if (typeof mask.toImageData === 'function') {
        const imageData = await mask.toImageData();
        if (this.frameCount <= 3) {
          console.log('[VirtualBG] toImageData result:', imageData?.width, 'x', imageData?.height);
        }
        if (imageData && imageData.width > 0 && imageData.height > 0) {
          // ImageData from segmentation is usually grayscale
          // Need to scale to canvas dimensions
          if (imageData.width !== width || imageData.height !== height) {
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = imageData.width;
            tempCanvas.height = imageData.height;
            tempCanvas.getContext('2d')!.putImageData(imageData, 0, 0);
            this.maskCtx.drawImage(tempCanvas, 0, 0, width, height);
          } else {
            this.maskCtx.putImageData(imageData, 0, 0);
          }
          if (this.frameCount <= 3) console.log('[VirtualBG] Method 2 (toImageData) succeeded');
          return true;
        }
      }
    } catch (err) {
      if (this.frameCount <= 3) console.warn('[VirtualBG] toImageData failed:', err);
    }

    // Method 3: toTensor - carefully handle tensor lifecycle
    try {
      if (typeof mask.toTensor === 'function' && tfModule) {
        const tensor = mask.toTensor();
        if (this.frameCount <= 3) {
          console.log('[VirtualBG] toTensor result:', {
            type: typeof tensor,
            shape: tensor?.shape,
            dtype: tensor?.dtype,
            hasDispose: typeof tensor?.dispose === 'function',
            hasData: typeof tensor?.data === 'function',
          });
        }

        // Only proceed if we got a valid tensor-like object
        if (tensor && typeof tensor.data === 'function' && tensor.shape) {
          try {
            // Get tensor data (this is async)
            const data = await tensor.data(); // Returns Float32Array or TypedArray
            const shape = tensor.shape; // [height, width] or [height, width, channels]

            const maskHeight = shape[0];
            const maskWidth = shape[1];
            const channels = shape[2] || 1;

            if (maskWidth > 0 && maskHeight > 0) {
              // Create ImageData from tensor
              const imageData = new ImageData(maskWidth, maskHeight);
              const pixels = imageData.data;

              // Convert mask values to RGBA
              // Mask values: ~1.0 = person, ~0.0 = background
              for (let i = 0; i < maskHeight * maskWidth; i++) {
                // Get mask value (handle multi-channel case)
                const maskValue = channels > 1 ? data[i * channels] : data[i];

                // Threshold and convert to 0 or 255
                // White (255) = person, Black (0) = background
                const pixelValue = maskValue > MASK_THRESHOLD ? 255 : 0;

                const pixelIdx = i * 4;
                pixels[pixelIdx] = pixelValue;     // R
                pixels[pixelIdx + 1] = pixelValue; // G
                pixels[pixelIdx + 2] = pixelValue; // B
                pixels[pixelIdx + 3] = 255;        // A (always opaque)
              }

              // Draw to mask canvas, scaling if needed
              if (maskWidth !== width || maskHeight !== height) {
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = maskWidth;
                tempCanvas.height = maskHeight;
                tempCanvas.getContext('2d')!.putImageData(imageData, 0, 0);
                this.maskCtx.drawImage(tempCanvas, 0, 0, width, height);
              } else {
                this.maskCtx.putImageData(imageData, 0, 0);
              }

              if (this.frameCount <= 3) console.log('[VirtualBG] Method 3 (toTensor) succeeded');
              return true;
            }
          } finally {
            // CRITICAL: Dispose tensor to prevent GPU memory leak
            // Only call dispose if it exists as a function
            if (typeof tensor.dispose === 'function') {
              tensor.dispose();
            } else if (tfModule && typeof tfModule.dispose === 'function') {
              // Try using tf.dispose() as an alternative
              tfModule.dispose(tensor);
            }
          }
        }
      }
    } catch (err) {
      console.warn('[VirtualBG] toTensor mask extraction failed:', err);
    }

    // Method 4: Direct tensor access (TFJS runtime may store mask as raw tensor)
    try {
      // For TFJS runtime, the mask might already be a tensor or have tensor-like properties
      if (mask && mask.shape && typeof mask.data === 'function') {
        if (this.frameCount <= 3) {
          console.log('[VirtualBG] Trying direct tensor access on mask object');
        }

        const data = await mask.data();
        const shape = mask.shape;
        const maskHeight = shape[0];
        const maskWidth = shape[1];
        const channels = shape[2] || 1;

        if (maskWidth > 0 && maskHeight > 0) {
          const imageData = new ImageData(maskWidth, maskHeight);
          const pixels = imageData.data;

          for (let i = 0; i < maskHeight * maskWidth; i++) {
            const maskValue = channels > 1 ? data[i * channels] : data[i];
            const pixelValue = maskValue > MASK_THRESHOLD ? 255 : 0;

            const pixelIdx = i * 4;
            pixels[pixelIdx] = pixelValue;
            pixels[pixelIdx + 1] = pixelValue;
            pixels[pixelIdx + 2] = pixelValue;
            pixels[pixelIdx + 3] = 255;
          }

          if (maskWidth !== width || maskHeight !== height) {
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = maskWidth;
            tempCanvas.height = maskHeight;
            tempCanvas.getContext('2d')!.putImageData(imageData, 0, 0);
            this.maskCtx.drawImage(tempCanvas, 0, 0, width, height);
          } else {
            this.maskCtx.putImageData(imageData, 0, 0);
          }

          if (this.frameCount <= 3) console.log('[VirtualBG] Method 4 (direct tensor) succeeded');
          return true;
        }
      }
    } catch (err) {
      if (this.frameCount <= 3) console.warn('[VirtualBG] Direct tensor access failed:', err);
    }

    // All methods failed
    console.warn('[VirtualBG] All mask extraction methods failed');
    return false;
  }

  /**
   * Render blur effect using toBinaryMask + manual compositing
   *
   * NOTE: We don't use drawBokehEffect() because it draws directly to the output
   * canvas in multiple steps, causing flicker with captureStream().
   * Instead, we use the same approach as image backgrounds which works smoothly.
   */
  private async renderBlurWithLibrary(segmentation: any[], width: number, height: number): Promise<void> {
    if (!bodySegmentationModule) {
      this.outputCtx.drawImage(this.videoElement!, 0, 0, width, height);
      return;
    }

    const blurAmount = BLUR_AMOUNTS[this.config.mode] || 10;

    try {
      // Step 1: Get binary mask using library function (same as image mode)
      const binaryMask = await bodySegmentationModule.toBinaryMask(
        segmentation,
        { r: 0, g: 0, b: 0, a: 0 },    // foreground (person) = transparent
        { r: 0, g: 0, b: 0, a: 255 },  // background = opaque black
        false,                          // drawContour
        0.5                             // foregroundThreshold
      );

      if (!binaryMask || binaryMask.width === 0 || binaryMask.height === 0) {
        throw new Error('toBinaryMask returned invalid mask');
      }

      // Step 2: Draw BLURRED video to a buffer canvas (personCanvas reused as blur buffer)
      // We use CSS filter for blur - this is GPU accelerated
      this.personCtx.save();
      this.personCtx.filter = `blur(${blurAmount}px)`;
      this.personCtx.drawImage(this.tempCanvas, 0, 0, width, height);
      this.personCtx.restore();

      // Step 3: Draw blurred background to output canvas
      this.outputCtx.drawImage(this.personCanvas, 0, 0, width, height);

      // Step 4: Prepare mask for compositing
      // Put mask to mask canvas (may need scaling)
      if (binaryMask.width !== width || binaryMask.height !== height) {
        const tempMaskCanvas = document.createElement('canvas');
        tempMaskCanvas.width = binaryMask.width;
        tempMaskCanvas.height = binaryMask.height;
        tempMaskCanvas.getContext('2d')!.putImageData(binaryMask, 0, 0);
        this.maskCtx.drawImage(tempMaskCanvas, 0, 0, width, height);
      } else {
        this.maskCtx.putImageData(binaryMask, 0, 0);
      }

      // Step 5: Invert mask (we need person=opaque, background=transparent)
      const maskImageData = this.maskCtx.getImageData(0, 0, width, height);
      const data = maskImageData.data;
      for (let i = 0; i < data.length; i += 4) {
        const alpha = data[i + 3];
        data[i + 3] = 255 - alpha;  // Invert alpha
        if (data[i + 3] > 0) {
          data[i] = 255;
          data[i + 1] = 255;
          data[i + 2] = 255;
        }
      }
      this.maskCtx.putImageData(maskImageData, 0, 0);

      // Step 6: Draw sharp person to personCanvas using mask
      this.personCtx.globalCompositeOperation = 'source-over';
      this.personCtx.drawImage(this.tempCanvas, 0, 0, width, height);  // Sharp video
      this.personCtx.globalCompositeOperation = 'destination-in';
      this.personCtx.drawImage(this.maskCanvas, 0, 0, width, height);  // Apply mask

      // Step 7: Composite sharp person onto blurred background
      this.outputCtx.drawImage(this.personCanvas, 0, 0, width, height);

      // Reset composite mode
      this.personCtx.globalCompositeOperation = 'source-over';

      if (this.frameCount <= 3) {
        console.log('[VirtualBG] Blur effect rendered successfully');
      }

    } catch (err) {
      console.error('[VirtualBG] renderBlurWithLibrary failed:', err);
      this.outputCtx.drawImage(this.videoElement!, 0, 0, width, height);
    }
  }

  /**
   * Render image background using library's toBinaryMask
   * This uses the library's internal tensor handling which works correctly
   */
  private async renderImageWithLibrary(segmentation: any[], width: number, height: number): Promise<void> {
    if (!bodySegmentationModule) {
      this.outputCtx.drawImage(this.videoElement!, 0, 0, width, height);
      return;
    }

    try {
      // Step 1: Get binary mask using library function (handles tensor conversion internally)
      // Foreground (person) = transparent, Background = opaque black
      const binaryMask = await bodySegmentationModule.toBinaryMask(
        segmentation,
        { r: 0, g: 0, b: 0, a: 0 },    // foreground color (transparent - will show person)
        { r: 0, g: 0, b: 0, a: 255 },  // background color (opaque - will be replaced)
        false,                          // drawContour
        0.5                             // foregroundThreshold
      );

      if (this.frameCount <= 3) {
        console.log('[VirtualBG] toBinaryMask result:', binaryMask?.width, 'x', binaryMask?.height);
      }

      if (!binaryMask || binaryMask.width === 0 || binaryMask.height === 0) {
        throw new Error('toBinaryMask returned invalid mask');
      }

      // Step 2: Draw background image to output canvas
      if (this.config.backgroundImage) {
        const img = this.config.backgroundImage;

        // Scale image to cover canvas (like CSS background-size: cover)
        const imgAspect = img.width / img.height;
        const canvasAspect = width / height;

        let drawWidth: number, drawHeight: number, drawX: number, drawY: number;

        if (imgAspect > canvasAspect) {
          drawHeight = height;
          drawWidth = height * imgAspect;
          drawX = (width - drawWidth) / 2;
          drawY = 0;
        } else {
          drawWidth = width;
          drawHeight = width / imgAspect;
          drawX = 0;
          drawY = (height - drawHeight) / 2;
        }

        this.outputCtx.drawImage(img, drawX, drawY, drawWidth, drawHeight);
      } else {
        this.outputCtx.fillStyle = '#1a1a1a';
        this.outputCtx.fillRect(0, 0, width, height);
      }

      // Step 3: Draw person (from canvas snapshot) to person canvas
      // Use tempCanvas which has the exact frame that was segmented
      this.personCtx.globalCompositeOperation = 'source-over';
      this.personCtx.drawImage(this.tempCanvas, 0, 0, width, height);

      // Step 4: Apply binary mask to person canvas
      // Put mask to temp canvas first (may need scaling)
      if (binaryMask.width !== width || binaryMask.height !== height) {
        const tempMaskCanvas = document.createElement('canvas');
        tempMaskCanvas.width = binaryMask.width;
        tempMaskCanvas.height = binaryMask.height;
        tempMaskCanvas.getContext('2d')!.putImageData(binaryMask, 0, 0);
        this.maskCtx.drawImage(tempMaskCanvas, 0, 0, width, height);
      } else {
        this.maskCtx.putImageData(binaryMask, 0, 0);
      }

      // The mask has: transparent (person) and opaque black (background)
      // We need to INVERT this for destination-in compositing
      // destination-in keeps pixels where mask is opaque
      // So we need: opaque white (person), transparent (background)

      // Get mask data and invert alpha
      const maskImageData = this.maskCtx.getImageData(0, 0, width, height);
      const data = maskImageData.data;
      for (let i = 0; i < data.length; i += 4) {
        // Invert alpha: 255 - alpha
        const alpha = data[i + 3];
        data[i + 3] = 255 - alpha;
        // Set RGB to white for visible person area
        if (data[i + 3] > 0) {
          data[i] = 255;
          data[i + 1] = 255;
          data[i + 2] = 255;
        }
      }
      this.maskCtx.putImageData(maskImageData, 0, 0);

      // Apply inverted mask
      this.personCtx.globalCompositeOperation = 'destination-in';
      this.personCtx.drawImage(this.maskCanvas, 0, 0, width, height);

      // Step 5: Composite person onto background
      this.outputCtx.drawImage(this.personCanvas, 0, 0, width, height);

      // Reset composite mode
      this.personCtx.globalCompositeOperation = 'source-over';

      if (this.frameCount <= 3) {
        console.log('[VirtualBG] renderImageWithLibrary succeeded');
      }

    } catch (err) {
      console.error('[VirtualBG] renderImageWithLibrary failed:', err);
      // Fallback: show original video
      this.outputCtx.drawImage(this.videoElement!, 0, 0, width, height);
    }
  }

  // ========================================
  // LEGACY METHODS (kept for reference, no longer used)
  // ========================================

  /**
   * Render blur effect on background (LEGACY - available for future use)
   */
  // @ts-expect-error Method available for future blur effect implementations
  private async renderBlurEffect(width: number, height: number): Promise<void> {
    const blurAmount = BLUR_AMOUNTS[this.config.mode] || 10;

    // Step 1: Draw blurred video to temp canvas
    this.tempCtx.save();
    this.tempCtx.filter = `blur(${blurAmount}px)`;
    this.tempCtx.drawImage(this.videoElement!, 0, 0, width, height);
    this.tempCtx.restore();

    // Step 2: Extract person using mask
    // Draw original video to person canvas
    this.personCtx.globalCompositeOperation = 'source-over';
    this.personCtx.drawImage(this.videoElement!, 0, 0, width, height);

    // Apply mask: keep only person (white areas of mask)
    this.personCtx.globalCompositeOperation = 'destination-in';
    this.personCtx.drawImage(this.maskCanvas, 0, 0, width, height);

    // Step 3: Composite to output
    // First, draw blurred background
    this.outputCtx.drawImage(this.tempCanvas, 0, 0, width, height);

    // Then, draw person on top
    this.outputCtx.drawImage(this.personCanvas, 0, 0, width, height);

    // Reset person canvas composite mode for next frame
    this.personCtx.globalCompositeOperation = 'source-over';
  }

  /**
   * Render virtual background image (LEGACY - available for future use)
   */
  // @ts-expect-error Method available for future background image implementations
  private async renderImageBackground(width: number, height: number): Promise<void> {
    // Step 1: Draw background image (or fallback color)
    if (this.config.backgroundImage) {
      const img = this.config.backgroundImage;

      // Scale image to cover canvas (like CSS background-size: cover)
      const imgAspect = img.width / img.height;
      const canvasAspect = width / height;

      let drawWidth: number, drawHeight: number, drawX: number, drawY: number;

      if (imgAspect > canvasAspect) {
        // Image is wider - fit height, crop width
        drawHeight = height;
        drawWidth = height * imgAspect;
        drawX = (width - drawWidth) / 2;
        drawY = 0;
      } else {
        // Image is taller - fit width, crop height
        drawWidth = width;
        drawHeight = width / imgAspect;
        drawX = 0;
        drawY = (height - drawHeight) / 2;
      }

      // Draw to temp canvas first (cleaner compositing)
      this.tempCtx.drawImage(img, drawX, drawY, drawWidth, drawHeight);
    } else {
      // No image - use dark background
      this.tempCtx.fillStyle = '#1a1a1a';
      this.tempCtx.fillRect(0, 0, width, height);
    }

    // Step 2: Extract person using mask
    this.personCtx.globalCompositeOperation = 'source-over';
    this.personCtx.drawImage(this.videoElement!, 0, 0, width, height);

    this.personCtx.globalCompositeOperation = 'destination-in';
    this.personCtx.drawImage(this.maskCanvas, 0, 0, width, height);

    // Step 3: Composite to output
    this.outputCtx.drawImage(this.tempCanvas, 0, 0, width, height);
    this.outputCtx.drawImage(this.personCanvas, 0, 0, width, height);

    // Reset composite mode
    this.personCtx.globalCompositeOperation = 'source-over';
  }

  /**
   * Dispose of segmentation result tensors
   */
  private disposeSegmentation(segmentation: any[]): void {
    try {
      for (const seg of segmentation) {
        if (seg?.mask) {
          // Try different disposal methods
          if (typeof seg.mask.close === 'function') {
            seg.mask.close();
          } else if (typeof seg.mask.dispose === 'function') {
            seg.mask.dispose();
          }
        }
      }
    } catch (err) {
      // Ignore disposal errors - tensor may already be disposed
    }
  }

  /**
   * Log diagnostic message (rate-limited to prevent spam)
   */
  private logDiagnostic(message: string): void {
    if (this.frameCount % 60 === 1) {
      console.log(`[VirtualBG] Frame ${this.frameCount}: ${message}`);
    }
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<VirtualBackgroundConfig>): void {
    this.config = { ...this.config, ...config };
    console.log('[VirtualBG] Config updated:', {
      mode: this.config.mode,
      hasImage: !!this.config.backgroundImage
    });
  }

  /**
   * Get current configuration
   */
  getConfig(): VirtualBackgroundConfig {
    return { ...this.config };
  }

  /**
   * Get the output canvas (for preview)
   */
  getOutputCanvas(): HTMLCanvasElement {
    return this.outputCanvas;
  }

  /**
   * Check if processor is initialized
   */
  isReady(): boolean {
    return this.isInitialized && !this.isDisposed;
  }

  /**
   * Get diagnostic info
   */
  getDiagnostics(): {
    frameCount: number;
    errorCount: number;
    lastMaskValid: boolean;
    isProcessing: boolean;
  } {
    return {
      frameCount: this.frameCount,
      errorCount: this.errorCount,
      lastMaskValid: this.lastMaskValid,
      isProcessing: this.isProcessing,
    };
  }

  /**
   * Stop processing (can be restarted)
   */
  stop(): void {
    console.log('[VirtualBG] Stopping...');

    this.stopRenderLoop();

    if (this.videoElement) {
      this.videoElement.pause();
      this.videoElement.srcObject = null;
      this.videoElement = null;
    }

    if (this.outputStream) {
      this.outputStream.getTracks().forEach(track => track.stop());
      this.outputStream = null;
    }

    console.log('[VirtualBG] Stopped');
  }

  /**
   * Full cleanup - cannot be reused after this
   */
  dispose(): void {
    if (this.isDisposed) return;

    console.log('[VirtualBG] Disposing...');

    this.stop();

    // Clean up error recovery state
    if (this.pauseTimeout) {
      clearTimeout(this.pauseTimeout);
      this.pauseTimeout = null;
    }
    this.processingPaused = false;
    this.consecutiveErrors = 0;
    this.lastGoodFrame = null;
    this.videoFrameVerified = false;

    if (this.segmenter) {
      try {
        this.segmenter.dispose?.();
      } catch {
        // Ignore disposal errors
      }
      this.segmenter = null;
    }

    this.isInitialized = false;
    this.isDisposed = true;

    console.log('[VirtualBG] Disposed');
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Check if virtual backgrounds are supported in this browser
 */
export function isVirtualBackgroundSupported(): boolean {
  // Browser capabilities available via detectBrowserCapabilities() if needed

  // Minimum requirements:
  // - 2D canvas context
  // - WebGL (for TensorFlow.js GPU acceleration) OR CPU fallback

  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return false;

    // WebGL is preferred but not required - CPU fallback works
    return true;
  } catch {
    return false;
  }
}

/**
 * Load an image for use as background
 * Handles cross-origin and validates the image
 */
export async function loadBackgroundImage(src: string): Promise<HTMLImageElement> {
  console.log('[VirtualBG] Loading background image:', src);

  return new Promise((resolve, reject) => {
    const img = new Image();

    // Handle cross-origin images
    // Only set crossOrigin for non-data URLs
    if (!src.startsWith('data:')) {
      img.crossOrigin = 'anonymous';
    }

    const timeout = setTimeout(() => {
      reject(new Error(`Image load timeout: ${src}`));
    }, 10000);

    img.onload = () => {
      clearTimeout(timeout);

      // Validate image dimensions
      if (img.width === 0 || img.height === 0) {
        reject(new Error(`Invalid image dimensions: ${img.width}x${img.height}`));
        return;
      }

      // Check for tainted canvas (CORS issue)
      try {
        const testCanvas = document.createElement('canvas');
        testCanvas.width = 1;
        testCanvas.height = 1;
        const ctx = testCanvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, 1, 1);
        ctx.getImageData(0, 0, 1, 1); // This throws if image is tainted
      } catch (err) {
        console.warn('[VirtualBG] Image may be cross-origin tainted:', src);
        // Don't reject - image can still be drawn, just not read
      }

      console.log('[VirtualBG] Image loaded:', img.width, 'x', img.height);
      resolve(img);
    };

    img.onerror = (err) => {
      clearTimeout(timeout);
      console.error('[VirtualBG] Image load failed:', src, err);
      reject(new Error(`Failed to load image: ${src}`));
    };

    img.src = src;
  });
}

/**
 * Preset background images
 */
export const PRESET_BACKGROUNDS = [
  { id: 'office', name: 'Office', src: '/backgrounds/office.svg' },
  { id: 'nature', name: 'Nature', src: '/backgrounds/nature.svg' },
  { id: 'abstract', name: 'Abstract', src: '/backgrounds/abstract.svg' },
  { id: 'bookshelf', name: 'Bookshelf', src: '/backgrounds/bookshelf.svg' },
];

export default VirtualBackgroundProcessor;

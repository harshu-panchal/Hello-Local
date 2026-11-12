import React, { useCallback, useEffect, useRef, useState } from "react";

/**
 * Full-screen camera barcode scanner for the POS.
 *
 * Engines:
 *  - Native `BarcodeDetector` (Chrome / Edge on Android, Chrome on desktop): fast, no download.
 *  - ZXing (lazy-loaded) everywhere else, notably iOS Safari / iOS PWAs and Firefox.
 *
 * We own the camera stream ourselves and feed frames to whichever engine is
 * available, so camera switching, torch and cleanup behave the same everywhere.
 */

interface BarcodeScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called with the decoded text. Return value is ignored. */
  onDetected: (code: string) => void;
}

type Status = "starting" | "scanning" | "error";

// Minimal typing for the Shape Detection API (not in TS's DOM lib yet).
interface DetectedBarcode {
  rawValue: string;
}
interface NativeBarcodeDetector {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>;
}
interface NativeBarcodeDetectorCtor {
  new (options?: { formats?: string[] }): NativeBarcodeDetector;
  getSupportedFormats?: () => Promise<string[]>;
}

const WANTED_FORMATS = [
  "ean_13",
  "ean_8",
  "upc_a",
  "upc_e",
  "code_128",
  "code_39",
  "code_93",
  "itf",
  "codabar",
  "qr_code",
  "data_matrix",
];

/** Time between decode attempts. Keeps phones cool and the UI responsive. */
const SCAN_INTERVAL_MS = 120;
/** Ignore the same code for this long in continuous mode (avoids double-adds). */
const SAME_CODE_COOLDOWN_MS = 2000;

type Decoder = {
  decode: (video: HTMLVideoElement) => Promise<string | null>;
  dispose?: () => void;
};

async function createNativeDecoder(): Promise<Decoder | null> {
  const Ctor = (window as unknown as { BarcodeDetector?: NativeBarcodeDetectorCtor }).BarcodeDetector;
  if (!Ctor) return null;
  try {
    const supported = Ctor.getSupportedFormats ? await Ctor.getSupportedFormats() : WANTED_FORMATS;
    const formats = WANTED_FORMATS.filter((f) => supported.includes(f));
    if (formats.length === 0) return null;
    const detector = new Ctor({ formats });
    return {
      decode: async (video) => {
        const found = await detector.detect(video);
        const value = found.find((b) => b.rawValue && b.rawValue.trim())?.rawValue;
        return value ? value.trim() : null;
      },
    };
  } catch {
    return null;
  }
}

async function createZxingDecoder(): Promise<Decoder> {
  const [{ BrowserMultiFormatReader }, { DecodeHintType, BarcodeFormat }] = await Promise.all([
    import("@zxing/browser"),
    import("@zxing/library"),
  ]);
  const hints = new Map();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [
    BarcodeFormat.EAN_13,
    BarcodeFormat.EAN_8,
    BarcodeFormat.UPC_A,
    BarcodeFormat.UPC_E,
    BarcodeFormat.CODE_128,
    BarcodeFormat.CODE_39,
    BarcodeFormat.CODE_93,
    BarcodeFormat.ITF,
    BarcodeFormat.CODABAR,
    BarcodeFormat.QR_CODE,
    BarcodeFormat.DATA_MATRIX,
  ]);
  hints.set(DecodeHintType.TRY_HARDER, true);
  const reader = new BrowserMultiFormatReader(hints);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true } as CanvasRenderingContext2DSettings);

  return {
    decode: async (video) => {
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (!vw || !vh || !ctx) return null;
      // Decode the centre of the frame (where the guide box is), downscaled.
      const cropW = Math.round(vw * 0.9);
      const cropH = Math.round(vh * 0.6);
      const sx = Math.round((vw - cropW) / 2);
      const sy = Math.round((vh - cropH) / 2);
      const scale = Math.min(1, 960 / cropW);
      canvas.width = Math.round(cropW * scale);
      canvas.height = Math.round(cropH * scale);
      ctx.drawImage(video, sx, sy, cropW, cropH, 0, 0, canvas.width, canvas.height);
      try {
        const result = reader.decodeFromCanvas(canvas);
        const text = result?.getText?.();
        return text ? text.trim() : null;
      } catch {
        return null; // NotFound / checksum / format errors: no barcode in this frame
      }
    },
  };
}

function cameraErrorMessage(err: unknown): string {
  const name = (err as { name?: string })?.name || "";
  if (name === "NotAllowedError" || name === "SecurityError" || name === "PermissionDeniedError") {
    return "Camera permission was denied. Allow camera access for this site in your browser settings, then try again.";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError" || name === "OverconstrainedError") {
    return "No usable camera was found on this device.";
  }
  if (name === "NotReadableError" || name === "TrackStartError" || name === "AbortError") {
    return "The camera is busy in another app or tab. Close it and try again.";
  }
  return "Could not start the camera. Please try again.";
}

export const BarcodeScannerModal: React.FC<BarcodeScannerModalProps> = ({ isOpen, onClose, onDetected }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const decoderRef = useRef<Decoder | null>(null);
  const loopRef = useRef<number | null>(null);
  const activeRef = useRef(false);
  const lastHitRef = useRef<{ code: string; at: number } | null>(null);
  const onDetectedRef = useRef(onDetected);
  const onCloseRef = useRef(onClose);
  onDetectedRef.current = onDetected;
  onCloseRef.current = onClose;

  const [status, setStatus] = useState<Status>("starting");
  const [errorMessage, setErrorMessage] = useState("");
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceIndex, setDeviceIndex] = useState<number>(-1); // -1 = rear camera via facingMode
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [continuous, setContinuous] = useState(false);
  const continuousRef = useRef(continuous);
  continuousRef.current = continuous;
  const [lastCode, setLastCode] = useState("");
  const [manualCode, setManualCode] = useState("");

  const stopLoop = () => {
    if (loopRef.current !== null) {
      window.clearTimeout(loopRef.current);
      loopRef.current = null;
    }
  };

  // Bumped on every start/stop so an in-flight start that was superseded
  // (e.g. scanner closed while the permission prompt was open) releases its stream.
  const sessionRef = useRef(0);

  const stopCamera = useCallback(() => {
    sessionRef.current += 1;
    activeRef.current = false;
    stopLoop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setTorchOn(false);
    setTorchSupported(false);
  }, []);

  const handleHit = useCallback(
    (code: string) => {
      const now = Date.now();
      const last = lastHitRef.current;
      if (last && last.code === code && now - last.at < SAME_CODE_COOLDOWN_MS) return false;
      lastHitRef.current = { code, at: now };
      try {
        navigator.vibrate?.(60);
      } catch {
        /* not supported (iOS) */
      }
      setLastCode(code);
      onDetectedRef.current(code);
      if (!continuousRef.current) {
        stopCamera();
        onCloseRef.current();
        return true;
      }
      return false;
    },
    [stopCamera]
  );

  const scanFrame = useCallback(async () => {
    if (!activeRef.current) return;
    const video = videoRef.current;
    const decoder = decoderRef.current;
    let closed = false;
    if (video && decoder && video.readyState >= 2 && !video.paused) {
      try {
        const code = await decoder.decode(video);
        if (code && activeRef.current) closed = handleHit(code);
      } catch {
        /* transient decode failure: try next frame */
      }
    }
    if (!closed && activeRef.current) {
      loopRef.current = window.setTimeout(scanFrame, SCAN_INTERVAL_MS);
    }
  }, [handleHit]);

  const startCamera = useCallback(
    async (index: number) => {
      stopCamera();
      const session = sessionRef.current;
      const superseded = () => sessionRef.current !== session;
      setStatus("starting");
      setErrorMessage("");

      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setStatus("error");
        setErrorMessage(
          "Camera scanning needs a secure (https) connection and a browser with camera support. You can still type the barcode below."
        );
        return;
      }

      const deviceId = index >= 0 ? devices[index]?.deviceId : undefined;
      const base: MediaTrackConstraints = { width: { ideal: 1280 }, height: { ideal: 720 } };
      const attempts: MediaStreamConstraints[] = deviceId
        ? [{ audio: false, video: { ...base, deviceId: { exact: deviceId } } }]
        : [
            { audio: false, video: { ...base, facingMode: { ideal: "environment" } } },
            { audio: false, video: true },
          ];

      let stream: MediaStream | null = null;
      let lastErr: unknown = null;
      for (const constraints of attempts) {
        try {
          stream = await navigator.mediaDevices.getUserMedia(constraints);
          break;
        } catch (err) {
          lastErr = err;
          const name = (err as { name?: string })?.name;
          if (name === "NotAllowedError" || name === "SecurityError") break; // retrying won't help
        }
      }
      if (superseded()) {
        stream?.getTracks().forEach((t) => t.stop());
        return;
      }
      if (!stream) {
        setStatus("error");
        setErrorMessage(cameraErrorMessage(lastErr));
        return;
      }

      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) {
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        return;
      }
      // iOS Safari: must be muted + playsinline to render inline.
      video.setAttribute("playsinline", "true");
      video.muted = true;
      video.srcObject = stream;
      try {
        await video.play();
      } catch {
        /* autoplay quirks: the play() below on metadata usually succeeds */
      }

      // Torch (Android Chrome only).
      const track = stream.getVideoTracks()[0];
      try {
        const caps = (track?.getCapabilities?.() || {}) as MediaTrackCapabilities & { torch?: boolean };
        setTorchSupported(!!caps.torch);
      } catch {
        setTorchSupported(false);
      }

      // Device labels are only available after permission is granted.
      try {
        const all = await navigator.mediaDevices.enumerateDevices();
        setDevices(all.filter((d) => d.kind === "videoinput"));
      } catch {
        /* ignore */
      }

      if (!decoderRef.current) {
        try {
          decoderRef.current = (await createNativeDecoder()) || (await createZxingDecoder());
        } catch {
          if (superseded()) return;
          stopCamera();
          setStatus("error");
          setErrorMessage("The barcode reader failed to load. Check your connection and try again.");
          return;
        }
      }

      if (superseded() || streamRef.current !== stream) return; // closed or restarted meanwhile
      activeRef.current = true;
      setStatus("scanning");
      stopLoop();
      loopRef.current = window.setTimeout(scanFrame, SCAN_INTERVAL_MS);
    },
    [devices, scanFrame, stopCamera]
  );

  // Open / close lifecycle
  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      return;
    }
    lastHitRef.current = null;
    setLastCode("");
    setManualCode("");
    startCamera(deviceIndex);
    return () => stopCamera();
    // Restart only when opening or switching camera.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, deviceIndex]);

  // Release the camera when the app goes to the background (iOS kills it anyway)
  useEffect(() => {
    if (!isOpen) return;
    const onVisibility = () => {
      if (document.hidden) stopCamera();
      else startCamera(deviceIndex);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [isOpen, deviceIndex, startCamera, stopCamera]);

  // Escape closes
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen]);

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      const next = !torchOn;
      await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] });
      setTorchOn(next);
    } catch {
      setTorchSupported(false);
    }
  };

  const switchCamera = () => {
    if (devices.length < 2) return;
    setDeviceIndex((i) => (i + 1) % devices.length);
  };

  const submitManual = (e: React.FormEvent) => {
    e.preventDefault();
    const code = manualCode.trim();
    if (!code) return;
    setManualCode("");
    lastHitRef.current = null;
    handleHit(code);
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex flex-col bg-black text-white"
      role="dialog"
      aria-modal="true"
      aria-label="Scan barcode with camera"
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 bg-black/80"
        style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
      >
        <div>
          <h3 className="text-sm font-bold">Scan Barcode</h3>
          <p className="text-[11px] text-white/70">Hold the barcode inside the box, about 15–20 cm away</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-lg font-bold"
          aria-label="Close scanner"
        >
          ✕
        </button>
      </div>

      {/* Camera view */}
      <div className="relative flex-1 overflow-hidden">
        <video
          ref={videoRef}
          className="absolute inset-0 h-full w-full object-cover"
          playsInline
          muted
          autoPlay
        />

        {status !== "error" && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="relative h-[38%] w-[86%] max-w-md rounded-2xl border-2 border-white/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]">
              <div className="absolute left-3 right-3 top-1/2 h-0.5 -translate-y-1/2 bg-rose-500/90 animate-pulse" />
            </div>
          </div>
        )}

        {status === "starting" && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="rounded-xl bg-black/70 px-4 py-3 text-xs font-semibold">Starting camera…</div>
          </div>
        )}

        {status === "error" && (
          <div className="absolute inset-0 flex items-center justify-center p-6">
            <div className="max-w-sm space-y-3 rounded-2xl bg-white p-5 text-center text-slate-800">
              <p className="text-sm font-bold">Camera unavailable</p>
              <p className="text-xs text-slate-600">{errorMessage}</p>
              <button
                type="button"
                onClick={() => startCamera(deviceIndex)}
                className="w-full rounded-xl bg-purple-600 py-2.5 text-xs font-bold text-white min-h-[44px]"
              >
                Try Again
              </button>
            </div>
          </div>
        )}

        {lastCode && continuous && (
          <div className="absolute left-1/2 top-4 -translate-x-1/2 rounded-full bg-emerald-600/90 px-3 py-1.5 text-xs font-bold">
            Scanned: {lastCode}
          </div>
        )}
      </div>

      {/* Controls */}
      <div
        className="space-y-3 bg-black/90 px-4 pt-3"
        style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
      >
        <div className="flex items-center justify-between gap-2">
          <label className="flex items-center gap-2 text-xs font-semibold text-white/90 cursor-pointer">
            <input
              type="checkbox"
              checked={continuous}
              onChange={(e) => setContinuous(e.target.checked)}
              className="h-4 w-4 rounded border-white/40 accent-purple-500"
            />
            Scan multiple items
          </label>
          <div className="flex items-center gap-2">
            {torchSupported && (
              <button
                type="button"
                onClick={toggleTorch}
                className={`rounded-xl px-3 py-2 text-xs font-bold min-h-[40px] ${
                  torchOn ? "bg-amber-400 text-black" : "bg-white/10 text-white"
                }`}
              >
                {torchOn ? "Flash On" : "Flash"}
              </button>
            )}
            {devices.length > 1 && (
              <button
                type="button"
                onClick={switchCamera}
                className="rounded-xl bg-white/10 px-3 py-2 text-xs font-bold min-h-[40px]"
              >
                Switch Camera
              </button>
            )}
          </div>
        </div>

        <form onSubmit={submitManual} className="flex items-center gap-2">
          <input
            type="text"
            inputMode="numeric"
            value={manualCode}
            onChange={(e) => setManualCode(e.target.value)}
            placeholder="Or type barcode / SKU"
            className="flex-1 rounded-xl border border-white/20 bg-white/10 px-3 py-2.5 text-sm text-white placeholder-white/50 outline-none focus:border-purple-400 min-h-[44px]"
          />
          <button
            type="submit"
            className="rounded-xl bg-purple-600 px-4 py-2.5 text-xs font-bold min-h-[44px]"
          >
            Add
          </button>
        </form>
      </div>
    </div>
  );
};

export default BarcodeScannerModal;

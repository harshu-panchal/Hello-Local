import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { OrderNotificationData } from '../../../services/api/delivery/deliveryOrderNotificationService';

interface OrderNotificationCardProps {
    notification: OrderNotificationData;
    onAccept: (orderId: string) => Promise<{ success: boolean; message: string }>;
    onReject: (orderId: string) => Promise<{ success: boolean; message: string; allRejected: boolean }>;
}

export default function OrderNotificationCard({
    notification,
    onAccept,
    onReject,
}: OrderNotificationCardProps) {
    const audioRef = useRef<HTMLAudioElement | null>(null);
    /**
     * Tracks whether a pending play() Promise is in flight.
     * We must await/cancel it before calling pause() to avoid the
     * "play interrupted by pause" AbortError in browsers.
     */
    const playPromiseRef = useRef<Promise<void> | null>(null);
    const isAudioStoppedRef = useRef(false); // once stopped, never restart

    const [isProcessing, setIsProcessing] = useState(false);
    const [audioError, setAudioError] = useState<string | null>(null);

    const vibrationPatternRef = useRef<number[]>([200, 100, 200, 100, 200]);

    const vibrate = useCallback((pattern?: number | number[]) => {
        if ('vibrate' in navigator) {
            try {
                navigator.vibrate(pattern || vibrationPatternRef.current);
            } catch { /* ignore */ }
        }
    }, []);

    /** Safely pause the audio, handling the play-promise race. */
    const stopAudio = useCallback(() => {
        isAudioStoppedRef.current = true;
        if ('vibrate' in navigator) navigator.vibrate(0);

        const audio = audioRef.current;
        if (!audio) return;

        if (playPromiseRef.current) {
            // Wait for in-flight play() to resolve, then pause
            playPromiseRef.current
                .then(() => {
                    audio.pause();
                    audio.currentTime = 0;
                })
                .catch(() => {
                    // play() was already rejected/aborted — nothing to do
                });
            playPromiseRef.current = null;
        } else {
            audio.pause();
            audio.currentTime = 0;
        }
    }, []);

    // ── Audio initialisation ──────────────────────────────────────────────────
    useEffect(() => {
        isAudioStoppedRef.current = false;
        const audio = new Audio('/assets/sound/delivery-alert.mp3');
        audio.loop = true;
        audio.volume = 0.8;

        audioRef.current = audio;

        const startPlayback = () => {
            if (isAudioStoppedRef.current) return;
            const p = audio.play();
            if (p !== undefined) {
                playPromiseRef.current = p;
                p.then(() => {
                    playPromiseRef.current = null;
                    setAudioError(null);
                }).catch((err: DOMException) => {
                    playPromiseRef.current = null;
                    if (err.name === 'NotAllowedError') {
                        setAudioError('Tap to enable sound');
                    } else if (err.name !== 'AbortError') {
                        // AbortError = we paused before play finished; not an error
                        console.log('Audio playback error:', err.name);
                    }
                });
            }
        };

        if (audio.readyState >= 2) {
            startPlayback();
        } else {
            audio.addEventListener('canplaythrough', startPlayback, { once: true });
            audio.load();
        }

        // Start vibration immediately
        vibrate();

        return () => {
            // Cleanup: always stop audio when card unmounts (exit animation complete)
            isAudioStoppedRef.current = true;
            if (playPromiseRef.current) {
                playPromiseRef.current.then(() => {
                    audio.pause();
                    audio.currentTime = 0;
                }).catch(() => {});
            } else {
                audio.pause();
                audio.currentTime = 0;
            }
            audioRef.current = null;
            if ('vibrate' in navigator) navigator.vibrate(0);
        };
    }, [vibrate]);

    // ── User interaction: unlock audio on first tap (autoplay policy) ─────────
    const handleUserInteraction = useCallback(() => {
        if (isAudioStoppedRef.current) return;
        const audio = audioRef.current;
        if (!audio || !audio.paused) return; // already playing

        const p = audio.play();
        if (p !== undefined) {
            playPromiseRef.current = p;
            p.then(() => {
                playPromiseRef.current = null;
                setAudioError(null);
            }).catch((err: DOMException) => {
                playPromiseRef.current = null;
                if (err.name === 'NotAllowedError') {
                    setAudioError('Audio permission denied');
                }
            });
        }
    }, []);

    // ── Accept ────────────────────────────────────────────────────────────────
    const handleAccept = async () => {
        if (isProcessing) return;
        setIsProcessing(true);

        // Stop sound & vibration immediately — before any async work
        stopAudio();

        // The hook handles dismiss + navigation for both success AND failure,
        // so we don't need to do anything else here. Just await the result.
        try {
            await onAccept(notification.orderId);
        } catch (err) {
            console.error('Error in onAccept:', err);
        }
        // Note: isProcessing is intentionally left true because the card is
        // being dismissed by the hook. Setting it false on an unmounting
        // component would cause a React warning.
    };

    // ── Reject ────────────────────────────────────────────────────────────────
    const handleReject = async () => {
        if (isProcessing) return;
        setIsProcessing(true);

        // Stop sound & vibration immediately
        stopAudio();

        // The hook dismisses the card immediately (optimistic), then fires
        // the socket call in the background. We just need to call it.
        try {
            await onReject(notification.orderId);
        } catch (err) {
            console.error('Error in onReject:', err);
        }
        // Same as above — don't reset isProcessing; card is unmounting
    };

    const formatAddress = () => {
        const { address, city, state, pincode, landmark } = notification.deliveryAddress;
        return `${address}${landmark ? `, Near ${landmark}` : ''}, ${city}${state ? `, ${state}` : ''} - ${pincode}`;
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: -50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -50, scale: 0.9 }}
            transition={{ duration: 0.3 }}
            className="fixed top-4 left-4 right-4 sm:top-4 sm:left-auto sm:right-4 sm:w-auto sm:max-w-md z-50"
            onClick={handleUserInteraction}
            onMouseEnter={handleUserInteraction}
            onTouchStart={handleUserInteraction}
            style={{ paddingTop: 'env(safe-area-inset-top, 0)' }}
        >
            <div className="bg-white rounded-xl shadow-2xl border-2 border-teal-500 p-4 sm:p-6">
                {/* Header */}
                <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                    <div className="flex items-center gap-3">
                        <div className="relative">
                            <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                            <div className="absolute inset-0 w-3 h-3 bg-red-500 rounded-full animate-ping opacity-75"></div>
                        </div>
                        <h3 className="text-base sm:text-lg font-bold text-neutral-900">New Order!</h3>
                    </div>
                    {audioError && (
                        <div className="text-xs text-neutral-500 bg-neutral-100 px-2 py-1 rounded whitespace-nowrap">
                            {audioError}
                        </div>
                    )}
                </div>

                {/* Order Information */}
                <div className="space-y-3 mb-4">
                    <div>
                        <p className="text-xs sm:text-sm text-neutral-600">Order Number</p>
                        <p className="text-base sm:text-lg font-semibold text-neutral-900 break-all">{notification.orderNumber}</p>
                    </div>

                    <div>
                        <p className="text-xs sm:text-sm text-neutral-600">Customer</p>
                        <p className="text-sm sm:text-base font-medium text-neutral-900 break-words">{notification.customerName}</p>
                        <p className="text-xs sm:text-sm text-neutral-500 break-all">{notification.customerPhone}</p>
                    </div>

                    <div>
                        <p className="text-xs sm:text-sm text-neutral-600">Delivery Address</p>
                        <p className="text-xs sm:text-sm text-neutral-900 break-words leading-relaxed">{formatAddress()}</p>
                    </div>

                    <div>
                        <p className="text-xs sm:text-sm text-neutral-600">Order Amount</p>
                        <p className="text-lg sm:text-xl font-bold text-teal-600">₹{notification.total.toFixed(2)}</p>
                    </div>

                    {/* Earning */}
                    <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-lg p-3 -mx-1">
                        <p className="text-xs sm:text-sm text-green-700 font-medium flex items-center gap-1">
                            <span className="text-green-600">💰</span> Your Earning
                        </p>
                        <p className="text-xl sm:text-2xl font-bold text-green-600">
                            ₹{notification.deliveryBoyEarning?.toFixed(2) || '0.00'}
                        </p>
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3">
                    <button
                        onClick={(e) => { e.stopPropagation(); handleReject(); }}
                        disabled={isProcessing}
                        className="flex-1 px-4 py-3 sm:py-3 bg-neutral-100 active:bg-neutral-200 text-neutral-700 font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation"
                        style={{ WebkitTapHighlightColor: 'transparent' }}
                    >
                        {isProcessing ? 'Processing…' : 'Reject'}
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); handleAccept(); }}
                        disabled={isProcessing}
                        className="flex-1 px-4 py-3 sm:py-3 bg-teal-600 active:bg-teal-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation"
                        style={{ WebkitTapHighlightColor: 'transparent' }}
                    >
                        {isProcessing ? 'Processing…' : 'Accept'}
                    </button>
                </div>
            </div>
        </motion.div>
    );
}

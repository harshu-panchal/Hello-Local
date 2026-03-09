import Lenis from '@studio-freight/lenis';

let lenisInstance: Lenis | null = null;

export function initSmoothScroll() {
    if (lenisInstance) return lenisInstance;

    const lenis = new Lenis({
        duration: 1.1,
        smoothWheel: true,
    });

    function raf(time: number) {
        lenis.raf(time);
        requestAnimationFrame(raf);
    }

    requestAnimationFrame(raf);
    lenisInstance = lenis;

    return lenis;
}

export function getLenis() {
    return lenisInstance;
}

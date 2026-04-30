import React, { useEffect, useRef } from 'react';
import Lenis from '@studio-freight/lenis';
import Navbar from '../components/Navbar';
import Hero from '../components/Hero';
import Features from '../components/Features';
import AppPreview from '../components/AppPreview';
import HowItWorks from '../components/HowItWorks';
import Categories from '../components/Categories';
import WhyHelloLocal from '../components/WhyHelloLocal';
import DownloadSection from '../components/DownloadSection';
import Footer from '../components/Footer';
import '../styles/website.css';

const WebsiteHome: React.FC = () => {
    const lenisRef = useRef<Lenis | null>(null);

    useEffect(() => {
        // Change body class to apply website-specific styles
        document.body.classList.add('website-body');
        
        // Initialize Lenis for smooth scroll
        const lenis = new Lenis({
            duration: 1.2,
            easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
            smoothWheel: true,
            wheelMultiplier: 1,
            infinite: false,
        });

        lenisRef.current = lenis;

        function raf(time: number) {
            lenis.raf(time);
            requestAnimationFrame(raf);
        }

        requestAnimationFrame(raf);

        // Handle internal anchor links
        const handleAnchorClick = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            const anchor = target.closest('a');
            if (anchor && anchor.hash && anchor.origin === window.location.origin) {
                e.preventDefault();
                lenis.scrollTo(anchor.hash);
            }
        };

        document.addEventListener('click', handleAnchorClick);

        return () => {
            document.body.classList.remove('website-body');
            document.removeEventListener('click', handleAnchorClick);
            lenis.destroy();
            lenisRef.current = null;
        };
    }, []);

    return (
        <div className="relative">
            <Navbar />
            <main>
                <Hero />
                <Features />
                <AppPreview />
                <HowItWorks />
                <Categories />
                <WhyHelloLocal />
                <DownloadSection />
            </main>
            <Footer />
        </div>
    );
};

export default WebsiteHome;

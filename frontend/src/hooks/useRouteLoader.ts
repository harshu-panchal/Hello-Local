import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useLoading } from '../context/LoadingContext';

const useRouteLoader = () => {
  const location = useLocation();
  const { startRouteLoading, stopRouteLoading } = useLoading();
  const isInitialMount = useRef(true);

  useEffect(() => {
    // Only show the full-screen route loader on the very first load (page refresh).
    // In-app navigations should NOT trigger a full-screen loader — each page renders
    // its own inline loader, and lazy routes already use the Suspense fallback.
    // This prevents the loader from re-appearing on every navigation/refetch.
    if (!isInitialMount.current) return;

    const timer = setTimeout(() => {
      stopRouteLoading(); // clears the initial-load loader started by LoadingProvider
      isInitialMount.current = false;
    }, 100);

    return () => clearTimeout(timer);
  }, [location.pathname, startRouteLoading, stopRouteLoading]);
};

export default useRouteLoader;

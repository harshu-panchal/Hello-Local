import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLocation } from '../../../hooks/useLocation';
import { useToast } from '../../../context/ToastContext';
import {
  LocationPinIcon,
  SearchIcon,
  MicIcon,
  BellIcon,
  StorefrontIcon,
  MapPlaceIcon,
  ChevronRightIcon,
  ChevronDownIcon
} from './common/UserIcons';

interface UserTopHeaderProps {
  onLocationClick?: () => void;
  onPlaceClick?: () => void;
}

export default function UserTopHeader({ onLocationClick, onPlaceClick }: UserTopHeaderProps) {
  const navigate = useNavigate();
  const { location: userLocation } = useLocation();
  const { showToast } = useToast();
  const [isListening, setIsListening] = useState(false);
  const [currentSearchIndex, setCurrentSearchIndex] = useState(0);

  const searchPlaceholders = useMemo(
    () => [
      "'milk', 'cake', 'shoe'...",
      "'atta', 'dal', 'rice'...",
      "'fruits', 'vegetables'...",
      "'paneer', 'butter', 'ghee'...",
      "'snacks', 'biscuits', 'tea'...",
    ],
    []
  );

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentSearchIndex((prev) => (prev + 1) % searchPlaceholders.length);
    }, 2800);
    return () => clearInterval(interval);
  }, [searchPlaceholders.length]);

  const locationText = useMemo(() => {
    if (userLocation?.city && userLocation?.state) {
      return `${userLocation.city}, ${userLocation.state}`;
    }
    if (userLocation?.city) {
      return userLocation.city;
    }
    if (userLocation?.address) {
      const parts = userLocation.address.split(',');
      return parts.slice(0, 2).join(', ').trim();
    }
    return 'Pune, Maharashtra';
  }, [userLocation]);

  const startVoiceSearch = (e: React.MouseEvent) => {
    e.stopPropagation();
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      showToast('Voice search is not supported in your browser', 'info');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-IN';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setIsListening(false);
      if (transcript) {
        navigate(`/search?q=${encodeURIComponent(transcript)}`);
      }
    };

    recognition.onerror = () => {
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.start();
  };

  return (
    <div className="w-full bg-white border-b border-slate-100/80 sticky top-0 z-30 transition-all">
      <div className="max-w-[1440px] mx-auto px-3.5 sm:px-6 lg:px-8 pt-2.5 pb-2.5 space-y-2">
        {/* MOBILE TOP BAR (md:hidden): Location Pill | HelloLocal Wordmark | Notification Bell */}
        <div className="flex md:hidden items-center justify-between gap-2">
          {/* Location Pill */}
          <button
            type="button"
            onClick={onLocationClick || onPlaceClick || (() => navigate('/addresses'))}
            className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-50/80 hover:bg-slate-100 border border-slate-200/80 rounded-xl text-left transition-all active:scale-95 shadow-2xs max-w-[44%] min-h-[40px]"
            aria-label="Change Location"
          >
            <div className="w-6 h-6 rounded-lg bg-[#FFF1F4] flex items-center justify-center text-[#FF2E7A] flex-shrink-0">
              <LocationPinIcon size={13} className="text-[#FF2E7A]" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-[9px] font-bold text-slate-500 uppercase tracking-tight leading-tight">Deliver to</span>
              <span className="text-[11px] text-slate-900 font-extrabold truncate leading-tight flex items-center gap-0.5">
                {locationText}
                <ChevronDownIcon size={10} className="flex-shrink-0 text-slate-400" />
              </span>
            </div>
          </button>

          {/* HelloLocal Wordmark & Tagline */}
          <div className="flex flex-col items-center justify-center flex-1">
            <div className="flex items-center leading-none select-none">
              <span className="text-xl font-black text-[#FF8A00] tracking-tight">Hello</span>
              <span className="text-xl font-black text-[#FF2E7A] tracking-tight">Local</span>
            </div>
            <span className="text-[9px] text-slate-500 font-semibold tracking-tight mt-0.5">
              Sab kuch, aapke Local mein
            </span>
          </div>

          {/* Notification Bell */}
          <button
            type="button"
            onClick={() => navigate('/account')}
            className="relative w-9 h-9 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200/80 flex items-center justify-center text-slate-700 shadow-2xs active:scale-95 transition-all flex-shrink-0"
            aria-label="Notifications"
          >
            <BellIcon size={17} className="text-slate-700" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#FF2E7A] ring-2 ring-white" />
          </button>
        </div>

        {/* SEARCH BAR — Shared between Mobile and Desktop with polished pill styling */}
        <div
          onClick={() => navigate('/search')}
          className={`group relative flex items-center w-full bg-slate-50/90 hover:bg-white border border-slate-200/90 hover:border-[#FF2E7A]/40 rounded-2xl px-3.5 sm:px-4 py-2 sm:py-2.5 shadow-2xs hover:shadow-xs cursor-pointer transition-all duration-200 min-h-[44px] ${
            isListening ? 'ring-2 ring-[#FF2E7A] border-[#FF2E7A] bg-white' : ''
          }`}
        >
          <div className="w-7 h-7 rounded-lg bg-white group-hover:bg-[#FFF1F4] flex items-center justify-center mr-2.5 flex-shrink-0 border border-slate-200/60 group-hover:border-[#FFE4EA] transition-colors">
            <SearchIcon size={15} className="text-slate-500 group-hover:text-[#FF2E7A] transition-colors" />
          </div>

          <div className="flex-1 text-xs sm:text-sm text-slate-500 font-medium truncate">
            {isListening ? (
              <span className="text-[#FF2E7A] font-bold animate-pulse">Listening... speak now</span>
            ) : (
              <span>Search for <strong className="text-slate-800 font-semibold">{searchPlaceholders[currentSearchIndex]}</strong></span>
            )}
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={startVoiceSearch}
              className={`p-1.5 text-slate-400 hover:text-[#FF2E7A] hover:bg-[#FFF1F4] rounded-lg transition-colors flex-shrink-0 flex items-center justify-center min-h-[32px] min-w-[32px] ${
                isListening ? 'text-[#FF2E7A] bg-[#FFF1F4] animate-pulse' : ''
              }`}
              aria-label="Voice Search"
              title="Search by voice"
            >
              <MicIcon size={16} />
            </button>
          </div>
        </div>

        {/* DISCOVERY SPLIT ACTION CARDS: Search by Shop & Search by Place */}
        <div className="grid grid-cols-2 gap-2 sm:gap-3.5 pt-0.5">
          {/* Search by Shop */}
          <button
            type="button"
            onClick={() => navigate('/shop-by-stores')}
            className="flex items-center justify-between p-2 sm:p-3 bg-gradient-to-r from-[#FFF1F4]/50 to-white hover:from-[#FFF1F4] hover:to-[#FFF1F4]/70 border border-[#FFE4EA] hover:border-[#FF2E7A]/40 rounded-2xl shadow-2xs hover:shadow-xs transition-all active:scale-[0.98] text-left group min-h-[48px]"
          >
            <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
              <div className="w-7 h-7 sm:w-9 sm:h-9 rounded-xl bg-white shadow-2xs flex items-center justify-center text-[#FF2E7A] flex-shrink-0 border border-[#FFE4EA] group-hover:scale-105 transition-transform">
                <StorefrontIcon size={15} className="text-[#FF2E7A]" />
              </div>
              <div className="min-w-0">
                <h4 className="text-[11px] sm:text-sm font-black text-slate-900 leading-tight whitespace-nowrap">Search by Shop</h4>
                <p className="text-[9px] sm:text-xs text-slate-500 font-medium leading-tight truncate mt-0.5">Find shops near you</p>
              </div>
            </div>
            <ChevronRightIcon size={14} className="text-slate-400 group-hover:text-[#FF2E7A] group-hover:translate-x-0.5 transition-all flex-shrink-0 ml-0.5" />
          </button>

          {/* Search by Place */}
          <button
            type="button"
            onClick={onPlaceClick || onLocationClick || (() => navigate('/shop-by-stores'))}
            className="flex items-center justify-between p-2 sm:p-3 bg-gradient-to-r from-[#FFF7ED]/50 to-white hover:from-[#FFF7ED] hover:to-[#FFF7ED]/70 border border-[#FED7AA]/60 hover:border-[#FF8A00]/40 rounded-2xl shadow-2xs hover:shadow-xs transition-all active:scale-[0.98] text-left group min-h-[48px]"
          >
            <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
              <div className="w-7 h-7 sm:w-9 sm:h-9 rounded-xl bg-white shadow-2xs flex items-center justify-center text-[#FF8A00] flex-shrink-0 border border-[#FED7AA]/60 group-hover:scale-105 transition-transform">
                <MapPlaceIcon size={15} className="text-[#FF8A00]" />
              </div>
              <div className="min-w-0">
                <h4 className="text-[11px] sm:text-sm font-black text-slate-900 leading-tight whitespace-nowrap">Search by Place</h4>
                <p className="text-[9px] sm:text-xs text-slate-500 font-medium leading-tight truncate mt-0.5">Explore by area</p>
              </div>
            </div>
            <ChevronRightIcon size={14} className="text-slate-400 group-hover:text-[#FF8A00] group-hover:translate-x-0.5 transition-all flex-shrink-0 ml-0.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

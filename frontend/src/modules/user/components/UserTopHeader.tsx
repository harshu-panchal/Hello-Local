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
    <div className="w-full bg-white border-b border-slate-100 sticky top-0 z-30">
      <div className="max-w-[1440px] mx-auto px-3.5 sm:px-6 lg:px-8 pt-3 pb-3 space-y-2.5">
        {/* MOBILE TOP BAR (md:hidden): Location Pill | HelloLocal Wordmark | Notification Bell */}
        <div className="flex md:hidden items-center justify-between gap-2">
          {/* Location Pill */}
          <button
            type="button"
            onClick={onLocationClick || onPlaceClick || (() => navigate('/addresses'))}
            className="flex items-center gap-1.5 px-2.5 py-1 bg-white hover:bg-slate-50 border border-slate-200/90 rounded-2xl text-left transition-all active:scale-98 shadow-2xs max-w-[42%] min-h-[44px]"
            aria-label="Change Location"
          >
            <div className="w-6 h-6 rounded-full bg-[#FFF1F4] flex items-center justify-center text-[#FF2E7A] flex-shrink-0">
              <LocationPinIcon size={14} className="text-[#FF2E7A]" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-[10px] font-bold text-slate-900 leading-tight">Deliver to</span>
              <span className="text-[10px] text-slate-500 font-medium truncate leading-tight flex items-center gap-0.5">
                {locationText}
                <ChevronDownIcon size={10} className="flex-shrink-0 text-slate-400" />
              </span>
            </div>
          </button>

          {/* HelloLocal Wordmark & Tagline */}
          <div className="flex flex-col items-center justify-center flex-1">
            <div className="flex items-center leading-none">
              <span className="text-xl font-black text-[#FF8A00]">Hello</span>
              <span className="text-xl font-black text-[#FF2E7A]">Local</span>
            </div>
            <span className="text-[9px] text-slate-500 font-medium tracking-tight mt-0.5">
              Sab kuch, aapke Local mein
            </span>
          </div>

          {/* Notification Bell */}
          <button
            type="button"
            onClick={() => navigate('/account')}
            className="relative min-h-[44px] min-w-[44px] rounded-full bg-white hover:bg-slate-50 border border-slate-200/90 flex items-center justify-center text-slate-700 shadow-2xs active:scale-95 transition-all"
            aria-label="Notifications"
          >
            <BellIcon size={18} className="text-slate-700" />
          </button>
        </div>

        {/* SEARCH BAR — Shared between Mobile and Desktop (On desktop, acts as the primary marketplace discovery bar) */}
        <div
          onClick={() => navigate('/search')}
          className={`relative flex items-center w-full bg-slate-50 hover:bg-white border border-slate-200 rounded-full px-4 py-2.5 shadow-2xs cursor-pointer transition-all min-h-[44px] ${
            isListening ? 'ring-2 ring-[#FF2E7A] border-[#FF2E7A] bg-white' : ''
          }`}
        >
          <SearchIcon size={18} className="text-slate-400 mr-2.5 flex-shrink-0" />

          <div className="flex-1 text-xs sm:text-sm text-slate-400 font-medium truncate">
            {isListening ? (
              <span className="text-[#FF2E7A] font-bold animate-pulse">Listening... speak now</span>
            ) : (
              <span>Search for {searchPlaceholders[currentSearchIndex]}</span>
            )}
          </div>

          <button
            type="button"
            onClick={startVoiceSearch}
            className={`p-1.5 text-slate-400 hover:text-[#FF2E7A] transition-colors flex-shrink-0 rounded-full min-h-[36px] min-w-[36px] flex items-center justify-center ${
              isListening ? 'text-[#FF2E7A] animate-pulse' : ''
            }`}
            aria-label="Voice Search"
          >
            <MicIcon size={17} />
          </button>
        </div>

        {/* DISCOVERY SPLIT ACTION CARDS: Search by Shop & Search by Place */}
        <div className="grid grid-cols-2 gap-2.5 sm:gap-4 pt-0.5">
          {/* Search by Shop */}
          <button
            type="button"
            onClick={() => navigate('/shop-by-stores')}
            className="flex items-center justify-between p-2.5 sm:p-3.5 bg-white hover:bg-slate-50 border border-slate-200/80 rounded-2xl shadow-2xs transition-all active:scale-98 text-left group min-h-[50px]"
          >
            <div className="flex items-center gap-2.5 sm:gap-3.5">
              <div className="w-9 h-9 rounded-xl bg-[#FFF1F4] flex items-center justify-center text-[#FF2E7A] flex-shrink-0 border border-[#FFE4EA]">
                <StorefrontIcon size={18} className="text-[#FF2E7A]" />
              </div>
              <div>
                <h4 className="text-xs sm:text-sm font-bold text-slate-900 leading-tight">Search by Shop</h4>
                <p className="text-[10px] sm:text-xs text-slate-400 font-medium leading-tight mt-0.5">Find shops near you</p>
              </div>
            </div>
            <ChevronRightIcon size={16} className="text-slate-400 group-hover:text-[#FF2E7A] transition-colors flex-shrink-0" />
          </button>

          {/* Search by Place */}
          <button
            type="button"
            onClick={onPlaceClick || onLocationClick || (() => navigate('/shop-by-stores'))}
            className="flex items-center justify-between p-2.5 sm:p-3.5 bg-white hover:bg-slate-50 border border-slate-200/80 rounded-2xl shadow-2xs transition-all active:scale-98 text-left group min-h-[50px]"
          >
            <div className="flex items-center gap-2.5 sm:gap-3.5">
              <div className="w-9 h-9 rounded-xl bg-[#FFF1F4] flex items-center justify-center text-[#FF2E7A] flex-shrink-0 border border-[#FFE4EA]">
                <MapPlaceIcon size={18} className="text-[#FF2E7A]" />
              </div>
              <div>
                <h4 className="text-xs sm:text-sm font-bold text-slate-900 leading-tight">Search by Place</h4>
                <p className="text-[10px] sm:text-xs text-slate-400 font-medium leading-tight mt-0.5">Explore by area</p>
              </div>
            </div>
            <ChevronRightIcon size={16} className="text-slate-400 group-hover:text-[#FF2E7A] transition-colors flex-shrink-0" />
          </button>
        </div>
      </div>
    </div>
  );
}

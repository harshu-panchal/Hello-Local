import React, { useState, useEffect } from 'react';
import { StorefrontIcon, CategoryNavIcon } from './UserIcons';

export type UserImageCategory = 'grocery' | 'food' | 'produce' | 'dairy' | 'bakery' | 'shop' | 'general';

interface UserImageProps extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'> {
  src?: string | null;
  alt: string;
  className?: string;
  categoryFallback?: UserImageCategory | string;
  aspectRatio?: 'square' | 'video' | '4/3' | 'auto';
}

export const UserImage: React.FC<UserImageProps> = ({
  src,
  alt,
  className = '',
  categoryFallback = 'general',
  aspectRatio = 'square',
  ...props
}) => {
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>(src ? 'loading' : 'error');

  useEffect(() => {
    if (!src || !src.trim()) {
      setStatus('error');
      return;
    }
    setStatus('loading');
  }, [src]);

  const aspectClass = {
    square: 'aspect-square',
    video: 'aspect-video',
    '4/3': 'aspect-[4/3]',
    auto: '',
  }[aspectRatio];

  const getFallbackSvg = (cat: string) => {
    const c = (cat || '').toLowerCase();
    if (c.includes('shop') || c.includes('store') || c.includes('market')) {
      return (
        <div className="flex flex-col items-center justify-center gap-1 text-slate-400">
          <div className="w-9 h-9 rounded-xl bg-white/80 border border-slate-200/60 shadow-2xs flex items-center justify-center text-[#FF2E7A]">
            <StorefrontIcon size={20} className="text-[#FF2E7A]" />
          </div>
        </div>
      );
    }
    return <CategoryNavIcon size={24} className="text-slate-300" />;
  };

  return (
    <div className={`relative overflow-hidden bg-slate-50 flex items-center justify-center ${aspectClass} ${className}`}>
      {/* Loading Skeleton */}
      {status === 'loading' && (
        <div className="absolute inset-0 user-image-shimmer z-0" />
      )}

      {/* Actual Image */}
      {src && status !== 'error' && (
        <img
          src={src}
          alt={alt}
          onLoad={() => setStatus('loaded')}
          onError={() => setStatus('error')}
          className={`w-full h-full object-cover transition-opacity duration-200 ${
            status === 'loaded' ? 'opacity-100' : 'opacity-0'
          }`}
          {...props}
        />
      )}

      {/* Subtle Fallback on Error / Missing Image */}
      {status === 'error' && (
        <div className="w-full h-full flex items-center justify-center p-2 text-center bg-gradient-to-br from-rose-50/60 via-slate-50 to-amber-50/40 rounded-[inherit]">
          {getFallbackSvg(categoryFallback)}
        </div>
      )}
    </div>
  );
};

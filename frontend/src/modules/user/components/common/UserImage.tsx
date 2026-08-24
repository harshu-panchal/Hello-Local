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
      return <StorefrontIcon size={24} className="text-slate-300" />;
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
          className={`w-full h-full object-contain transition-opacity duration-200 ${
            status === 'loaded' ? 'opacity-100' : 'opacity-0'
          }`}
          {...props}
        />
      )}

      {/* Subtle Fallback on Error / Missing Image */}
      {status === 'error' && (
        <div className="w-full h-full flex flex-col items-center justify-center p-2 text-center bg-slate-50 border border-slate-100 rounded-[inherit]">
          {getFallbackSvg(categoryFallback)}
          <span className="text-[9px] font-bold text-slate-300 mt-1 line-clamp-1 max-w-[90%]">
            {alt || 'HelloLocal'}
          </span>
        </div>
      )}
    </div>
  );
};

import React, { useState, useEffect, useRef } from 'react';
import { StorefrontIcon } from './UserIcons';
import { getIconByName } from '../../../../utils/iconLibrary';

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
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>(() => (src ? 'loading' : 'error'));
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (!src || !src.trim()) {
      setStatus('error');
      return;
    }
    // If the browser already has the image in memory cache
    if (imgRef.current && imgRef.current.complete && imgRef.current.naturalWidth > 0) {
      setStatus('loaded');
    } else {
      setStatus('loading');
    }
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
    const icon = getIconByName(cat || alt || 'grid');
    return (
      <div className="w-full h-full flex items-center justify-center text-[#FF2E7A]">
        {icon}
      </div>
    );
  };

  return (
    <div className={`relative overflow-hidden flex items-center justify-center ${aspectClass} ${className}`}>
      {/* Actual Image */}
      {src && status !== 'error' && (
        <img
          ref={imgRef}
          src={src}
          alt={alt}
          onLoad={() => setStatus('loaded')}
          onError={() => setStatus('error')}
          className="w-full h-full object-cover transition-opacity duration-200"
          {...props}
        />
      )}

      {/* Fallback on Error or Missing Image */}
      {(!src || status === 'error') && (
        <div className="w-full h-full flex items-center justify-center p-1.5 text-center bg-gradient-to-br from-rose-50/60 via-slate-50 to-amber-50/40 rounded-[inherit]">
          {getFallbackSvg(categoryFallback)}
        </div>
      )}
    </div>
  );
};

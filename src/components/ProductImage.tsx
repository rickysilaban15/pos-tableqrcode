import React, { useState } from 'react';
import { Coffee } from 'lucide-react';

interface ProductImageProps {
  src?: string;
  alt: string;
  className?: string;
}

export const ProductImage: React.FC<ProductImageProps> = ({
  src,
  alt,
  className = 'w-full h-full object-cover',
}) => {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-[#F2EFE9] text-[#64625C] p-4 text-center">
        <Coffee className="w-7 h-7 text-[#1B4D3E]/60 mb-1.5" strokeWidth={1.75} />
        <span className="text-xs font-medium text-[#64625C] line-clamp-1">{alt}</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={className}
      loading="lazy"
    />
  );
};

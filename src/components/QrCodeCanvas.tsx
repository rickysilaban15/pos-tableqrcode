import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';

interface QrCodeCanvasProps {
  value: string;
  size?: number;
  darkColor?: string;
  className?: string;
  alt?: string;
}

export const QrCodeCanvas: React.FC<QrCodeCanvasProps> = ({
  value,
  size = 200,
  darkColor = '#1B4D3E',
  className = '',
  alt = 'QR Code Pemesanan',
}) => {
  const [dataUrl, setDataUrl] = useState<string>('');
  const [error, setError] = useState<boolean>(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    setError(false);
    QRCode.toDataURL(value || 'https://laris-pos.demo', {
      width: Math.max(size * 2, 320),
      margin: 2,
      errorCorrectionLevel: 'M',
      color: {
        dark: darkColor,
        light: '#FFFFFF',
      },
    })
      .then((url) => {
        if (mountedRef.current) {
          setDataUrl(url);
        }
      })
      .catch(() => {
        if (mountedRef.current) {
          setError(true);
        }
      });

    return () => {
      mountedRef.current = false;
    };
  }, [value, size, darkColor]);

  if (error) {
    return (
      <div
        style={{ width: size, height: size }}
        className={`flex items-center justify-center rounded-lg border border-[#E8E6DF] bg-[#FAF9F6] text-xs text-[#64625C] text-center p-3 ${className}`}
      >
        Gagal membuat QR Code
      </div>
    );
  }

  if (!dataUrl) {
    return (
      <div
        style={{ width: size, height: size }}
        className={`rounded-lg bg-[#F2EFE9] animate-pulse ${className}`}
      />
    );
  }

  return (
    <img
      src={dataUrl}
      alt={alt}
      width={size}
      height={size}
      className={`block rounded-lg bg-white ${className}`}
    />
  );
};

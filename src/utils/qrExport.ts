import QRCode from 'qrcode';
import type { CafeSettings, CafeTable } from '../types/pos';
import { buildTableQrUrl } from './format';

export async function generateQrDataUrl(text: string, width = 512): Promise<string> {
  return QRCode.toDataURL(text, {
    width,
    margin: 2,
    errorCorrectionLevel: 'M',
    color: {
      dark: '#1B4D3E',
      light: '#FFFFFF',
    },
  });
}

function triggerDownload(dataUrl: string, filename: string): void {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(err);
    img.src = src;
  });
}

export async function downloadCleanQrPng(
  cafe: CafeSettings,
  table: CafeTable,
): Promise<void> {
  const url = buildTableQrUrl(cafe.qrBaseUrl, cafe.slug, table);
  const qrDataUrl = await QRCode.toDataURL(url, {
    width: 1024,
    margin: 3,
    errorCorrectionLevel: 'H',
    color: {
      dark: '#1B4D3E',
      light: '#FFFFFF',
    },
  });
  const safeName = table.name.replace(/[^A-Za-z0-9_-]/g, '_');
  triggerDownload(qrDataUrl, `LARIS-QR-Meja-${safeName}.png`);
}

export async function downloadTableCardPng(
  cafe: CafeSettings,
  table: CafeTable,
): Promise<void> {
  const url = buildTableQrUrl(cafe.qrBaseUrl, cafe.slug, table);
  const qrDataUrl = await QRCode.toDataURL(url, {
    width: 680,
    margin: 2,
    errorCorrectionLevel: 'H',
    color: {
      dark: '#252525',
      light: '#FFFFFF',
    },
  });

  const qrImg = await loadImage(qrDataUrl);

  const width = 1000;
  const height = 1360;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Background Warm White
  ctx.fillStyle = '#FAF9F6';
  ctx.fillRect(0, 0, width, height);

  // Outer crisp border
  ctx.strokeStyle = '#E8E6DF';
  ctx.lineWidth = 4;
  ctx.strokeRect(24, 24, width - 48, height - 48);

  // Top dark green header band
  ctx.fillStyle = '#1B4D3E';
  ctx.fillRect(24, 24, width - 48, 250);

  // Yellow thin accent line under header
  ctx.fillStyle = '#FCD804';
  ctx.fillRect(24, 274, width - 48, 10);

  // Brand emblem circle
  ctx.fillStyle = '#FCD804';
  ctx.beginPath();
  ctx.arc(width / 2, 102, 34, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#1B4D3E';
  ctx.font = '800 32px "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('L', width / 2, 104);

  // Cafe Name
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '700 44px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(cafe.name || 'LARIS Coffee', width / 2, 184);

  ctx.fillStyle = 'rgba(255,255,255,0.82)';
  ctx.font = '500 22px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('QR Self-Service Ordering', width / 2, 232);

  // Table badge area
  ctx.fillStyle = '#252525';
  ctx.font = '600 26px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('NOMOR MEJA', width / 2, 356);

  // Table number pill box
  const pillW = 280;
  const pillH = 92;
  const pillX = (width - pillW) / 2;
  const pillY = 386;
  ctx.fillStyle = '#FCD804';
  ctx.beginPath();
  ctx.roundRect(pillX, pillY, pillW, pillH, 16);
  ctx.fill();

  ctx.fillStyle = '#252525';
  ctx.font = '800 54px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(table.name, width / 2, pillY + pillH / 2 + 2);

  // QR Container Box
  const qrBoxSize = 540;
  const qrBoxX = (width - qrBoxSize) / 2;
  const qrBoxY = 516;
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.roundRect(qrBoxX, qrBoxY, qrBoxSize, qrBoxSize, 24);
  ctx.fill();

  ctx.strokeStyle = '#E8E6DF';
  ctx.lineWidth = 3;
  ctx.stroke();

  const qrDrawSize = 484;
  ctx.drawImage(
    qrImg,
    qrBoxX + (qrBoxSize - qrDrawSize) / 2,
    qrBoxY + (qrBoxSize - qrDrawSize) / 2,
    qrDrawSize,
    qrDrawSize,
  );

  // Call to action
  ctx.fillStyle = '#1B4D3E';
  ctx.font = '800 40px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('Scan untuk Memesan', width / 2, 1128);

  // Short instructions
  ctx.fillStyle = '#64625C';
  ctx.font = '500 24px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('1. Buka kamera HP & arahkan ke QR Code', width / 2, 1188);
  ctx.fillText('2. Pilih menu, varian & lakukan pembayaran', width / 2, 1226);
  ctx.fillText('3. Pantau status pesanan langsung dari HP Anda', width / 2, 1264);

  // Footer token
  ctx.fillStyle = '#8C8980';
  ctx.font = '500 18px "JetBrains Mono", monospace';
  ctx.fillText(`LARIS POS  ·  ${table.area}  ·  ${table.token}`, width / 2, 1312);

  const safeName = table.name.replace(/[^A-Za-z0-9_-]/g, '_');
  triggerDownload(canvas.toDataURL('image/png'), `LARIS-Kartu-Meja-${safeName}.png`);
}

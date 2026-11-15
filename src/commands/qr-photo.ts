import { InputFile } from 'grammy';
import { bmpToPng } from '../sgqr/png';
import { renderQrPng } from '../sgqr/qr-render';

/**
 * The QR as a PNG file for Telegram. The renderer makes a 1 MB BMP; as a PNG it is about 20 KB,
 * so each upload takes a fraction of the time.
 */
export async function qrPhoto(payload: string, lines: string[]): Promise<InputFile> {
  return new InputFile(await bmpToPng(await renderQrPng(payload, lines)), 'paynow-qr.png');
}

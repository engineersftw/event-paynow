import type { Api } from 'grammy';
import { parseScan, type Receipt } from './commands/receipt';
import { type ReceiptReader, ReceiptReaderError } from './receipt-reader';
import type { VoiceReader } from './voice-reader';

/**
 * What it takes to read a receipt photo or a voice note, shared by the inline path (the webhook
 * update reads it itself) and the `SplitAiWorkflow` steps. Everything here holds the photo or audio
 * in memory for one call. Nothing is logged but the failed stage and the error's own message.
 */

/** What a Workflow instance is started with: ids only, never the photo, audio or any bill data. */
export interface SplitAiParams {
  kind: 'scan' | 'voice';
  jobId: string;
  chatId: number;
  chatType: string;
  /** Forum topic of the split, when it runs in one. */
  threadId?: number;
  userId: number;
  /** The Telegram file to download inside the step. */
  fileId: string;
  /** The "Reading your receipt…" / "Listening…" message, removed when the result is used. */
  noticeMsg: number;
}

/** What a finished read leaves in the conversation until it is shown. */
export type AiJobResult =
  | { kind: 'scan'; receipt: Receipt }
  | { kind: 'scan'; failure: string }
  | { kind: 'voice'; heard: string; lines: string }
  | { kind: 'voice'; failure: string };

/** The read failed in a way that may work on another attempt; `message` is what the user is told. */
export class AiReadError extends Error {}

export const SCAN_DOWNLOAD_FAILED = 'I could not download that photo (download).';
export const SCAN_MODEL_FAILED = 'The receipt reader failed (model).';
export const SCAN_REPLY_FAILED = 'The reader answered, but I could not use its answer (reply).';
export const VOICE_FAILED = 'Voice is not working right now. Please type who had what.';

export type Download = (api: Api, fileId: string) => Promise<Uint8Array>;

const text = (error: unknown) =>
  (error instanceof Error ? error.message : String(error)).slice(0, 200);

/**
 * Download, read and validate a receipt photo. Throws `AiReadError` (with the text for the user)
 * when the download or the model fails, so a Workflow step retries it; an answer that is not a
 * usable receipt is a result (`failure`), not an error, because another attempt would not help.
 */
export async function readScan(
  reader: ReceiptReader,
  download: Download,
  api: Api,
  fileId: string
): Promise<AiJobResult> {
  let bytes: Uint8Array;
  try {
    bytes = await download(api, fileId);
  } catch (error) {
    console.error(`split receipt download failed: ${text(error)}`);
    throw new AiReadError(SCAN_DOWNLOAD_FAILED);
  }
  let raw: unknown;
  try {
    raw = await reader.read(bytes);
  } catch (error) {
    const stage = error instanceof ReceiptReaderError ? error.stage : 'model';
    console.error(`split receipt ${stage} failed: ${text(error)}`);
    throw new AiReadError(stage === 'reply' ? SCAN_REPLY_FAILED : SCAN_MODEL_FAILED);
  }
  const scan = parseScan(raw);
  return scan.ok ? { kind: 'scan', receipt: scan.receipt } : { kind: 'scan', failure: scan.error };
}

/** Download and hear a voice note. Throws `AiReadError` when the download or a model call fails. */
export async function readVoice(
  voice: VoiceReader,
  download: Download,
  api: Api,
  fileId: string,
  items: string[]
): Promise<AiJobResult> {
  try {
    const { heard, lines } = await voice.hear(await download(api, fileId), items);
    return { kind: 'voice', heard, lines };
  } catch (error) {
    // Only the error's own message: never audio or what was said
    console.error(`split voice failed: ${text(error)}`);
    throw new AiReadError(VOICE_FAILED);
  }
}

/** The result a user sees when a read could not be done: the same messages as the inline path. */
export function failureResult(kind: 'scan' | 'voice', error: unknown): AiJobResult {
  // A Workflow hands back a rebuilt Error, so the class is lost; the user text is what identifies it
  const known = [SCAN_DOWNLOAD_FAILED, SCAN_MODEL_FAILED, SCAN_REPLY_FAILED, VOICE_FAILED];
  if (error instanceof Error && known.includes(error.message)) {
    return { kind, failure: error.message } as AiJobResult;
  }
  return { kind, failure: kind === 'scan' ? SCAN_MODEL_FAILED : VOICE_FAILED } as AiJobResult;
}

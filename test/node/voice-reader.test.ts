import { describe, expect, it } from 'vitest';
import { cleanLines, VoiceReaderError, WorkersAiVoiceReader } from '../../src/voice-reader';

describe('cleanLines', () => {
  it('keeps only the lines that start with an item number', () => {
    expect(cleanLines('Here you go:\n```\n1,3 Ann\n2 Ann, Bob (shared)\n```\nHope it helps')).toBe(
      '1,3 Ann\n2 Ann, Bob (shared)'
    );
  });

  it('gives nothing for an empty or non-text reply', () => {
    expect(cleanLines('')).toBe('');
    expect(cleanLines('I cannot do that')).toBe('');
    expect(cleanLines(undefined)).toBe('');
    expect(cleanLines({ response: '1 Ann' })).toBe('');
  });
});

describe('WorkersAiVoiceReader', () => {
  const calls: { model: string; input: unknown }[] = [];
  const reader = (speech: unknown, text: unknown) =>
    new WorkersAiVoiceReader(
      {
        run: async (model: string, input: unknown) => {
          calls.push({ model, input });
          const out = model === 'speech' ? speech : text;
          if (out instanceof Error) throw out;
          return out;
        },
      },
      'speech',
      'text'
    );

  it('sends the audio as base64, then the numbered items and the words to the text model', async () => {
    calls.length = 0;
    const r = reader({ text: ' crab is Ann ' }, { response: '1 Ann' });
    expect(await r.hear(new Uint8Array([1, 2, 3]), ['Crab', 'Rice'])).toEqual({
      heard: 'crab is Ann',
      lines: '1 Ann',
    });
    expect(calls[0]).toEqual({ model: 'speech', input: { audio: 'AQID' } });
    const messages = (calls[1]!.input as { messages: { content: string }[] }).messages;
    expect(messages[1]!.content).toBe('Items:\n1. Crab\n2. Rice\n\nSpeech:\ncrab is Ann');
  });

  it('does not call the text model when nothing was heard', async () => {
    calls.length = 0;
    expect(
      await reader({ text: '  ' }, { response: '1 Ann' }).hear(new Uint8Array(1), ['A'])
    ).toEqual({ heard: '', lines: '' });
    expect(calls).toHaveLength(1);
  });

  it('names the stage that failed', async () => {
    await expect(
      reader(new Error('stt down'), {}).hear(new Uint8Array(1), ['A'])
    ).rejects.toMatchObject({ stage: 'hear', message: 'stt down' });
    await expect(
      reader({ text: 'hello' }, new Error('llm down')).hear(new Uint8Array(1), ['A'])
    ).rejects.toBeInstanceOf(VoiceReaderError);
  });
});

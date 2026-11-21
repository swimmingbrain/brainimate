import { describe, expect, it } from 'vitest';
import { canShareFiles, KINDS, shareBlob, type ShareTarget } from './save';

function target(fail?: string): ShareTarget & { shared: ShareData[] } {
  const shared: ShareData[] = [];
  return {
    shared,
    canShare: (data) => (data.files?.length ?? 0) > 0,
    share: async (data) => {
      if (fail) throw new DOMException('no', fail);
      shared.push(data);
    }
  };
}

describe('sharing an export', () => {
  it('is offered only where the share sheet takes files', () => {
    expect(canShareFiles(KINDS.mp4, target())).toBe(true);
    expect(canShareFiles(KINDS.mp4, null)).toBe(false);
    expect(canShareFiles(KINDS.mp4, { share: async () => {} })).toBe(false);
    expect(canShareFiles(KINDS.mp4, { share: async () => {}, canShare: () => false })).toBe(false);
    const throws: ShareTarget = {
      share: async () => {},
      canShare: () => {
        throw new TypeError('no files');
      }
    };
    expect(canShareFiles(KINDS.mp4, throws)).toBe(false);
  });

  it('hands over the file alone with its name and type', async () => {
    const t = target();
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'video/mp4' });
    expect(await shareBlob(blob, 'Story.mp4', KINDS.mp4, t)).toBe('shared');
    expect(t.shared).toHaveLength(1);
    const file = t.shared[0].files![0];
    expect(file.name).toBe('Story.mp4');
    expect(file.type).toBe('video/mp4');
    expect(file.size).toBe(3);
    expect(t.shared[0].title).toBeUndefined();
  });

  it('tells a closed sheet from one that needs another tap', async () => {
    const blob = new Blob(['x']);
    expect(await shareBlob(blob, 'a.mp4', KINDS.mp4, target('AbortError'))).toBe('cancelled');
    expect(await shareBlob(blob, 'a.mp4', KINDS.mp4, target('NotAllowedError'))).toBe('needs-tap');
    await expect(shareBlob(blob, 'a.mp4', KINDS.mp4, target('DataError'))).rejects.toThrow();
    await expect(shareBlob(blob, 'a.mp4', KINDS.mp4, {})).rejects.toThrow();
  });
});

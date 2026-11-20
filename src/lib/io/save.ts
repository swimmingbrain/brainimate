import { fileSave } from 'browser-fs-access';

export interface FileKind {
  ext: string;
  mime: string;
  description: string;
}

export const KINDS = {
  png: { ext: '.png', mime: 'image/png', description: 'PNG picture' },
  svg: { ext: '.svg', mime: 'image/svg+xml', description: 'SVG drawing' },
  zip: { ext: '.zip', mime: 'application/zip', description: 'Zip archive' },
  gif: { ext: '.gif', mime: 'image/gif', description: 'GIF animation' },
  webm: { ext: '.webm', mime: 'video/webm', description: 'WebM video' },
  mp4: { ext: '.mp4', mime: 'video/mp4', description: 'MP4 video' },
  json: { ext: '.json', mime: 'application/json', description: 'JSON data' }
} satisfies Record<string, FileKind>;

// the save dialog opens while the click still counts, the blob may still be on its way. false when
// the dialog was closed
export async function saveBlob(blob: Blob | Promise<Blob>, fileName: string, kind: FileKind): Promise<boolean> {
  try {
    await fileSave(blob, {
      fileName,
      extensions: [kind.ext],
      mimeTypes: [kind.mime],
      description: kind.description,
      id: 'brainimate-export'
    });
    return true;
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return false;
    throw e;
  }
}

// a plain download without a dialog, for a second file right after the first
export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 10_000);
}

// a file name from the document name, what the file system does not take is left out
export function exportName(name: string, suffix = ''): string {
  const clean = name
    .replace(/[\/:*?"<>|\x00-\x1f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return `${(clean || 'Untitled').slice(0, 100)}${suffix}`;
}

// the parts of navigator the share sheet needs, so tests can hand in their own
export interface ShareTarget {
  share?: (data: ShareData) => Promise<void>;
  canShare?: (data: ShareData) => boolean;
}

function shareTarget(): ShareTarget | null {
  return typeof navigator === 'undefined' ? null : (navigator as ShareTarget);
}

// the share sheet of the system takes files on ipads, iphones, android and some desktops. on an
// ipad it saves a video to the photos or hands it to an app
export function canShareFiles(kind: FileKind, target: ShareTarget | null = shareTarget()): boolean {
  if (!target?.share || !target.canShare || typeof File === 'undefined') return false;
  try {
    return target.canShare({ files: [new File([new Uint8Array(1)], `probe${kind.ext}`, { type: kind.mime })] });
  } catch {
    return false;
  }
}

export type ShareResult = 'shared' | 'cancelled' | 'needs-tap';

// the sheet only opens while a tap still counts, after a long export it may not. needs-tap asks for
// another tap on a button that shares the finished file
export async function shareBlob(
  blob: Blob,
  fileName: string,
  kind: FileKind,
  target: ShareTarget | null = shareTarget()
): Promise<ShareResult> {
  if (!target?.share) throw new Error('This browser cannot share files');
  const file = new File([blob], fileName, { type: kind.mime });
  try {
    // files alone, with a title next to them ios offers to share the text and hides save video
    await target.share({ files: [file] });
    return 'shared';
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled';
    if (e instanceof DOMException && e.name === 'NotAllowedError') return 'needs-tap';
    throw e;
  }
}

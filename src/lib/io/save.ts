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

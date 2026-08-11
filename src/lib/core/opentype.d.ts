// the small part of opentype.js the app uses, the package ships no types
declare module 'opentype.js' {
  export interface PathCommand {
    type: 'M' | 'L' | 'C' | 'Q' | 'Z';
    x?: number;
    y?: number;
    x1?: number;
    y1?: number;
    x2?: number;
    y2?: number;
  }

  export interface Path {
    commands: PathCommand[];
  }

  export interface Glyph {
    index: number;
    name?: string;
    unicode?: number;
    advanceWidth?: number;
    getPath(x: number, y: number, fontSize: number): Path;
  }

  export interface Font {
    unitsPerEm: number;
    ascender: number;
    descender: number;
    tables: {
      os2?: { usWeightClass?: number; fsSelection?: number };
      [name: string]: unknown;
    };
    getEnglishName(name: string): string | undefined;
    charToGlyph(c: string): Glyph;
    hasChar(c: string): boolean;
    getKerningValue(left: Glyph | number, right: Glyph | number): number;
  }

  export function parse(buffer: ArrayBuffer): Font;
}

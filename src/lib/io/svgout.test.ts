import { describe, expect, it } from 'vitest';
import type { Bone, Doc, Item, TextItem } from '$lib/core/types';
import { layoutText, type FontLike } from '$lib/core/text';
import { identity, multiply, scale, translate } from '$lib/core/mat';
import { makeImageItem, makeInstance, makePathItem, makeTextItem } from '$lib/core/items';
import { rectPath } from '$lib/core/shapes';
import { defaultStyle, solid } from '$lib/core/style';
import { makeGradient } from '$lib/core/gradient';
import { makeAsset } from '$lib/core/assets';
import { makeDoc, makeLayer } from '$lib/editor/editor';
import { restWorld } from '$lib/rig/bones';
import { makeGroup } from '$lib/editor/commands';
import { escapeXml, exportSvg, matrixAttr, num } from './svgout';

function red(x: number, y: number, w: number, h: number, transform = identity()) {
  return makePathItem('Rect', rectPath(x, y, w, h), defaultStyle(solid('#ff0000'), null), transform);
}

function docWith(...items: Item[]): Doc {
  const doc = makeDoc(200, 100, 24);
  doc.layers[0].keyframes[0].items.push(...items);
  return doc;
}

describe('svg export', () => {
  it('writes numbers with two decimals at most and escapes text', () => {
    expect(num(1.23456)).toBe('1.23');
    expect(num(2)).toBe('2');
    expect(num(-0.001)).toBe('0');
    expect(escapeXml('a<b & "c"')).toBe('a&lt;b &amp; &quot;c&quot;');
    expect(matrixAttr(identity())).toBe('');
    expect(matrixAttr(translate(5, 6.5))).toBe('translate(5 6.5)');
    expect(matrixAttr(scale(2))).toBe('matrix(2 0 0 2 0 0)');
  });

  it('writes a rect as a path in a group named after its layer', () => {
    const svg = exportSvg(docWith(red(10, 20, 100, 50)), { frame: 0 });
    expect(svg).toContain('viewBox="0 0 200 100"');
    expect(svg).toContain('<g id="Layer_1" data-name="Layer 1">');
    expect(svg).toContain('<path d="M10 20L110 20L110 70L10 70Z" fill="#ff0000"/>');
    expect(svg).toContain('<rect width="200" height="100" fill="#ffffff"/>');
    expect(exportSvg(docWith(red(0, 0, 1, 1)), { frame: 0, background: false })).not.toContain('<rect');
  });

  it('keeps the layer order and leaves hidden and guide layers out', () => {
    const doc = docWith(red(0, 0, 5, 5));
    const top = makeLayer('Top', '#fff');
    top.keyframes[0].items.push(red(1, 1, 5, 5));
    const hidden = makeLayer('Hidden', '#fff');
    hidden.visible = false;
    hidden.keyframes[0].items.push(red(2, 2, 5, 5));
    const guide = makeLayer('Guide', '#fff', 'guide');
    guide.keyframes[0].items.push(red(3, 3, 5, 5));
    doc.layers.push(top, hidden, guide);
    const svg = exportSvg(doc, { frame: 0 });
    expect(svg.indexOf('id="Layer_1"')).toBeLessThan(svg.indexOf('id="Top"'));
    expect(svg).not.toContain('Hidden');
    expect(svg).not.toContain('Guide');
    expect(svg.match(/<path /g)).toHaveLength(2);
  });

  it('keeps an item transform, a group transform and the item opacity and blend', () => {
    const inner = red(0, 0, 10, 10, translate(5, 5));
    inner.opacity = 0.5;
    inner.blend = 'multiply';
    const group = makeGroup([inner]);
    group.transform = multiply(translate(20, 0), scale(2));
    const svg = exportSvg(docWith(group), { frame: 0 });
    expect(svg).toContain('<g transform="matrix(2 0 0 2 20 0)">');
    expect(svg).toContain('transform="translate(5 5)"');
    expect(svg).toContain('opacity="0.5" style="mix-blend-mode:multiply"');
  });

  it('keeps strokes the width the stage shows them at', () => {
    const style = defaultStyle(null, solid('#000000', 0.5), 4);
    const item = makePathItem('Line', rectPath(0, 0, 10, 10), style, scale(2));
    item.style.dash = [4, 2];
    const svg = exportSvg(docWith(item), { frame: 0 });
    expect(svg).toContain('stroke="#000000" stroke-opacity="0.5" stroke-width="2"');
    expect(svg).toContain('stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="2 1"');
    item.style.scaleStroke = true;
    expect(exportSvg(docWith(item), { frame: 0 })).toContain('stroke-width="4"');
  });

  it('puts gradients in defs in user space, an unplaced one spans the shape', () => {
    const item = red(0, 0, 100, 40);
    item.style.fill = makeGradient('linear', [
      { t: 0, color: '#000000', alpha: 1 },
      { t: 1, color: '#ffffff', alpha: 0.5 }
    ]);
    const svg = exportSvg(docWith(item), { frame: 0 });
    expect(svg).toContain(
      '<defs><linearGradient id="gradient-1" gradientUnits="userSpaceOnUse" x1="0" y1="20" x2="100" y2="20">'
    );
    expect(svg).toContain('<stop offset="1" stop-color="#ffffff" stop-opacity="0.5"/>');
    expect(svg).toContain('fill="url(#gradient-1)"');
    const round = red(0, 0, 10, 10);
    const stops = [{ t: 0, color: '#ff0000', alpha: 1 }];
    round.style.fill = { type: 'radial', stops, cx: 5, cy: 5, r: 5, fx: 4, fy: 4 };
    expect(exportSvg(docWith(round), { frame: 0 })).toContain(
      '<radialGradient id="gradient-1" gradientUnits="userSpaceOnUse" cx="5" cy="5" r="5" fx="4" fy="4">'
    );
  });

  it('writes text as text with its font settings', () => {
    const style = defaultStyle(solid('#123456'), null);
    const text = makeTextItem('Hi <you>\nthere', 'Instrument Serif', 30, style, translate(10, 10));
    text.align = 'center';
    text.weight = 700;
    text.italic = true;
    text.spacing = 1.5;
    const svg = exportSvg(docWith(text), { frame: 0, pretty: true });
    expect(svg).toContain(
      'font-family="&apos;Instrument Serif&apos;, sans-serif" font-size="30" font-weight="700" font-style="italic"'
    );
    expect(svg).toContain('letter-spacing="1.5" text-anchor="middle" fill="#123456"');
    expect(svg).toContain('>Hi &lt;you&gt;</tspan>');
    expect(svg.match(/<tspan x="0"/g)).toHaveLength(2);
  });

  it('writes text as glyph outlines or as text placed on the baselines of its layout', () => {
    // every letter a 6 by 8 box standing on the baseline
    const font: FontLike = {
      unitsPerEm: 10,
      ascender: 8,
      descender: -2,
      advance: () => 6,
      kerning: () => 0,
      outline: (ch, x, y, size) => {
        const k = size / 10;
        return [
          { type: 'M', x, y },
          { type: 'L', x: x + 6 * k, y },
          { type: 'L', x: x + 6 * k, y: y - 8 * k },
          { type: 'L', x, y: y - 8 * k },
          { type: 'Z' }
        ];
      }
    };
    const text = makeTextItem('ab', 'Inter', 10, defaultStyle(solid('#000000'), null), translate(5, 5));
    const layout = (t: TextItem) => layoutText(t.text, font, t);
    const outlined = exportSvg(docWith(text), { frame: 0, outlineText: true, layout });
    expect(outlined).not.toContain('<text');
    const d = 'M0 9L6 9L6 1L0 1Z M6 9L12 9L12 1L6 1Z';
    expect(outlined).toContain(`<path d="${d}" transform="translate(5 5)" fill="#000000"/>`);
    const plain = exportSvg(docWith(text), { frame: 0, layout });
    expect(plain).toContain('<tspan x="0" y="9">ab</tspan>');
  });

  it('writes pictures with their data url', () => {
    const asset = makeAsset('image', 'a.png', 'data:image/png;base64,AAAA');
    const doc = docWith(makeImageItem(asset.id, 'a.png', 30, 20, translate(1, 2)));
    doc.assets[asset.id] = asset;
    const svg = exportSvg(doc, { frame: 0 });
    expect(svg).toContain('<image href="data:image/png;base64,AAAA" width="30" height="20"');
    expect(svg).toContain('preserveAspectRatio="none" transform="translate(1 2)"/>');
  });

  it('writes what an instance shows in its place, tinted', () => {
    const doc = docWith();
    const layer = makeLayer('Inside', '#fff');
    layer.keyframes[0].items.push(red(0, 0, 4, 4));
    doc.symbols.s = { id: 's', name: 'Ball', kind: 'graphic', layers: [layer] };
    const inst = makeInstance('s', 'Ball', translate(50, 50));
    inst.tint = '#0000ff';
    inst.tintAmount = 1;
    inst.alpha = 0.5;
    doc.layers[0].keyframes[0].items.push(inst);
    const svg = exportSvg(doc, { frame: 0 });
    expect(svg).toContain('<g transform="translate(50 50)" opacity="0.5"><path d="M0 0L4 0L4 4L0 4Z" fill="#0000ff"');
  });

  it('writes a shape bent by bones where it shows, with no transform', () => {
    const doc = docWith();
    const rig = makeLayer('Rig', '#fff', 'rig');
    const bone: Bone = {
      id: 'b',
      name: 'b',
      parent: null,
      x: 0,
      y: 0,
      length: 100,
      radius: 35,
      rotation: 0,
      bind: identity(),
      pinned: false,
      color: '#fff'
    };
    bone.bind = restWorld([bone], bone);
    rig.bones = [bone];
    rig.keyframes[0].pose = { b: { rotation: 0, x: 10, y: 0, scale: 1 } };
    doc.layers.push(rig);
    const bent = red(0, 0, 10, 10, translate(5, 0));
    bent.skin = { weights: bent.path.anchors.map(() => [{ bone: 'b', w: 1 }]), rigid: null };
    const rigid = red(0, 0, 10, 10, translate(0, 50));
    rigid.skin = { weights: [], rigid: 'b' };
    doc.layers[0].keyframes[0].items.push(bent, rigid);
    const svg = exportSvg(doc, { frame: 0 });
    expect(svg).toContain('<path d="M15 0L25 0L25 10L15 10Z" fill="#ff0000"/>');
    expect(svg).toContain('<path d="M0 0L10 0L10 10L0 10Z" transform="translate(10 50)"');
    expect(svg).not.toContain('Rig');
  });
});

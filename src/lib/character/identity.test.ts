import { beforeEach, describe, expect, it } from 'vitest';
import type { Item, PathItem } from '$lib/core/types';
import { editor } from '$lib/editor/editor';
import { frame, selection } from '$lib/stores/app';
import { buildCharacter, characterLayers, defaultCharacter, HAIR_STYLES, seeded } from './model';
import { buildView, joints3d, modelFrom } from './views';
import { BODY_PRESETS, BOTTOMS, HAIR_COLORS, OUTFITS, SHOES, TOPS, randomLook, type Identity } from './wardrobe';
import { createCharacter, setHair, recolorCharacter } from '$lib/editor/character';
import { applyLook, applyOutfit, lookLocked, modelHere, setBodyType, setIdentity, setLocked, setModel, turnToView } from '$lib/editor/turn';

const W = 1080;
const H = 1920;
const ANGLES = [90, 50, 12, -50, -90];
const ids = (role: string, child?: string) => `x.${role}${child ? `.${child}` : ''}`;
const anchors = (items: Item[]) => {
  const out: Record<string, number[]> = {};
  for (const i of items) {
    if (!i.role) continue;
    const paths = i.type === 'group' ? i.children : [i];
    out[i.role] = paths.map((p) => (p as PathItem).path.anchors.length + ((p as PathItem).subpaths?.length ?? 0) * 100);
  }
  return out;
};
function view(identity: Partial<Identity>, angle: number, extra: Partial<ReturnType<typeof modelFrom>> = {}) {
  const m = { ...modelFrom({ ...defaultCharacter(W, H), identity }), ...extra };
  return buildView(m, { body: angle, head: angle }, { emotion: 'neutral', mouth: 'closed', blink: false }, ids);
}

describe('bodies', () => {
  it('differ by type: wider shoulders for a male body, a narrower waist, wider hips and a chest for a female one', () => {
    const male = joints3d({ height: 900, build: 'regular', headSize: 1, identity: BODY_PRESETS.male });
    const female = joints3d({ height: 900, build: 'regular', headSize: 1, identity: BODY_PRESETS.female });
    expect(Math.abs(male.shoulderR[1])).toBeGreaterThan(Math.abs(female.shoulderR[1]) * 1.15);
    expect(Math.abs(female.hipR[1])).toBeGreaterThan(Math.abs(male.hipR[1]) * 1.1);
    // from the side the chest of a female body reaches further forward
    const width = (items: Item[], role: string) => {
      const g = items.find((i) => i.role === role) as Extract<Item, { type: 'group' }>;
      const xs = (g.children[0] as PathItem).path.anchors.map((a) => a.x);
      return Math.max(...xs) - Math.min(...xs);
    };
    expect(width(view({ ...BODY_PRESETS.female, type: 'female' }, 12), 'torso')).toBeGreaterThan(width(view({ ...BODY_PRESETS.male, type: 'male', bust: 0 }, 12), 'torso'));
  });
});

describe('clothes, shoes and extras', () => {
  it('draw every top, bottom and pair of shoes from all five sides with the same parts and anchors', () => {
    for (const top of TOPS)
      for (const bottom of BOTTOMS) {
        const id = { top: top.id, bottom: bottom.id, shoes: SHOES[(TOPS.indexOf(top) + BOTTOMS.indexOf(bottom)) % SHOES.length].id };
        const base = anchors(view(id, ANGLES[0]));
        for (const a of ANGLES.slice(1)) expect(anchors(view(id, a)), `${top.id} ${bottom.id} ${a}`).toEqual(base);
      }
  });

  it('show what each one is made of: sleeves, a hood, a skirt over bare legs, boots, soles, straps', () => {
    const roles = (id: Partial<Identity>) => view(id, 90).map((i) => i.role);
    expect(roles({ top: 'hoodie' })).toEqual(expect.arrayContaining(['hood', 'pocket', 'cuffR', 'hemBand']));
    expect(roles({ top: 'jacket' })).toContain('jacketInner');
    expect(roles({ top: 'shirt' })).toEqual(expect.arrayContaining(['collarL', 'collarR', 'placket']));
    expect(roles({ bottom: 'skirt' })).toContain('skirt');
    expect(roles({ bottom: 'skirt' })).not.toContain('pelvis');
    expect(roles({ bottom: 'shorts' })).toEqual(expect.arrayContaining(['shortsL', 'shortsR']));
    expect(roles({ shoes: 'boots' })).toEqual(expect.arrayContaining(['bootL', 'bootR', 'soleR']));
    expect(roles({ shoes: 'sandals' })).toEqual(expect.arrayContaining(['strap0R', 'strap1L']));
    expect(roles({ watch: true, bag: 'shoulder', jewelry: 'both' })).toEqual(expect.arrayContaining(['watch', 'bag', 'bagStrap', 'necklace', 'earringR']));
    expect(roles({ bag: 'backpack' })).toContain('backpack');
    // the legs under a skirt are skin, under trousers cloth
    const fill = (items: Item[], role: string) => ((items.find((i) => i.role === role) as Extract<Item, { type: 'group' }>).children[0] as PathItem).style.fill;
    const skin = defaultCharacter(W, H).colors.skin;
    expect(fill(view({ bottom: 'skirt' }, 90), 'lowerLegR')).toMatchObject({ color: skin });
    expect(fill(view({ bottom: 'jeans' }, 90), 'lowerLegR')).not.toMatchObject({ color: skin });
    // a long sleeve top covers the forearm, a top leaves the arm bare
    expect(fill(view({ top: 'longsleeve' }, 90), 'lowerArmR')).not.toMatchObject({ color: skin });
    expect(fill(view({ top: 'top' }, 90), 'upperArmR')).toMatchObject({ color: skin });
  });

  it('hide what faces away: a pocket in front from behind, a hood under the head from the front', () => {
    const shown = (id: Partial<Identity>, a: number, role: string) => view(id, a).find((i) => i.role === role)!.visible;
    expect(shown({ top: 'hoodie' }, 90, 'pocket')).toBe(true);
    expect(shown({ top: 'hoodie' }, -90, 'pocket')).toBe(false);
    const order = (a: number) => view({ top: 'hoodie' }, a).map((i) => i.role);
    expect(order(90).indexOf('hood')).toBeLessThan(order(90).indexOf('torso'));
    expect(order(-90).indexOf('hood')).toBeGreaterThan(order(-90).indexOf('torso'));
  });
});

describe('faces and hair', () => {
  it('give faces shapes, colored eyes, freckles, beards and make-up, the nose can go', () => {
    const items = view({ faceShape: 'heart', eyeColor: '#4f6f95', freckles: true, beard: 'full', lipstick: true, blush: true }, 90, { face: { ...modelFrom(defaultCharacter(W, H)).face, nose: false } });
    const roles = items.map((i) => i.role);
    expect(roles).toEqual(expect.arrayContaining(['pupilL', 'pupilR', 'freckles', 'beard', 'mustache', 'blushL']));
    expect((items.find((i) => i.role === 'eyeR') as PathItem).style.fill).toMatchObject({ color: '#4f6f95' });
    expect(items.find((i) => i.role === 'nose')!.visible).toBe(false);
    // from behind no face at all
    const back = view({ beard: 'full', freckles: true }, -90);
    expect(back.find((i) => i.role === 'beard')!.visible).toBe(false);
  });

  it('draw every hairstyle from all five sides without parts appearing or going', () => {
    for (const h of HAIR_STYLES) {
      const list = (a: number) => anchors(view({}, a, { hair: h.id }));
      const base = list(90);
      for (const a of ANGLES.slice(1)) expect(list(a), `${h.id} ${a}`).toEqual(base);
    }
    expect(HAIR_STYLES.length).toBeGreaterThanOrEqual(18);
    expect(HAIR_COLORS.map((c) => c.name)).toEqual(['Black', 'Dark brown', 'Brown', 'Light brown', 'Dark blond', 'Blond', 'Red', 'Copper', 'Grey', 'White']);
  });
});

describe('new characters', () => {
  it('each get a look of their own', () => {
    const looks = Array.from({ length: 12 }, (_, i) => randomLook(i % 2 ? 'male' : 'female', seeded(i * 101 + 7)));
    const outfits = new Set(looks.map((l) => `${l.identity.top}/${l.colors.shirt}/${l.identity.bottom}/${l.colors.pants}`));
    expect(outfits.size).toBeGreaterThanOrEqual(8);
    expect(new Set(looks.map((l) => l.colors.hair)).size).toBeGreaterThanOrEqual(5);
    expect(new Set(looks.map((l) => l.hair)).size).toBeGreaterThanOrEqual(6);
    // men no make-up by default, bodies by type
    for (const l of looks.filter((x) => x.identity.type === 'male')) expect(l.identity.bust).toBe(0);
    expect(OUTFITS.length).toBeGreaterThanOrEqual(18);
  });
});

describe('the creator in the editor', () => {
  beforeEach(() => {
    editor.newDoc(W, H, 24);
    frame.set(0);
    selection.set(new Set());
  });

  it('changes body type, clothes, outfits and whole looks in single undo steps, and they hold through a turn', () => {
    const id = createCharacter(defaultCharacter(W, H))!;
    const rig = () => characterLayers(editor.doc.layers, id)!.rig!;
    const bones = rig().bones.map((b) => b.id);
    setBodyType(id, 'female');
    expect(modelHere(id)!.identity.type).toBe('female');
    expect(rig().bones.map((b) => b.id)).toEqual(bones);
    setIdentity(id, { top: 'hoodie', bottom: 'skirt', shoes: 'boots' });
    applyOutfit(id, OUTFITS[1]);
    expect(modelHere(id)!.identity.top).toBe(OUTFITS[1].top);
    applyLook(id, randomLook('male', seeded(3)));
    expect(modelHere(id)!.identity.type).toBe('male');
    editor.undo();
    expect(modelHere(id)!.identity.top).toBe(OUTFITS[1].top);
    frame.set(4);
    turnToView(id, 'back', 6);
    const body = characterLayers(editor.doc.layers, id)!.body!;
    for (const k of body.keyframes) expect(k.items.some((i) => i.role === 'hood')).toBe(OUTFITS[1].top === 'hoodie');
  });

  it('locks the look of a main character: nothing changes it until it is unlocked', () => {
    const id = createCharacter({ ...defaultCharacter(W, H), identity: { top: 'shirt' } })!;
    setLocked(id, true);
    expect(lookLocked(id)).toBe(true);
    expect(setIdentity(id, { top: 'hoodie' })).toBe(false);
    setHair(id, 'bob');
    recolorCharacter(id, { shirt: '#ff0000' });
    expect(setModel(id, { hat: 'cap' })).toBe(false);
    const m = modelHere(id)!;
    expect(m.identity.top).toBe('shirt');
    expect(m.hair).not.toBe('bob');
    expect(m.colors.shirt).not.toBe('#ff0000');
    expect(m.hat).toBe('none');
    // moves and turns still work
    expect(turnToView(id, 'front', 4)).toBe(true);
    setLocked(id, false);
    expect(setIdentity(id, { top: 'hoodie' })).toBe(true);
  });

  it('keeps the whole look through a package, a scene and a project file exactly as it was', async () => {
    const { packCharacter, unpackCharacter } = await import('./pack');
    const { packDoc, parseBytes } = await import('$lib/io/project');
    const look = randomLook('female', seeded(77));
    const id = createCharacter({ ...defaultCharacter(W, H), identity: look.identity, colors: look.colors, hair: look.hair })!;
    setLocked(id, true);
    const before = JSON.stringify(modelHere(id));
    const items = JSON.stringify(characterLayers(editor.doc.layers, id)!.body!.keyframes[0].items.map((i) => [i.role, i.type === 'group' ? (i.children[0] as PathItem).style.fill : null]));
    const pkg = JSON.parse(JSON.stringify(packCharacter(editor.doc, id)!));
    const out = unpackCharacter(pkg);
    const folder = out.layers.find((l) => l.character)!;
    const m = folder.character!.model as Record<string, unknown>;
    expect(m.identity).toEqual(look.identity);
    expect(m.locked).toBe(true);
    editor.loadDoc(parseBytes(packDoc(editor.doc)).doc);
    expect(JSON.stringify(modelHere(id))).toBe(before);
    expect(JSON.stringify(characterLayers(editor.doc.layers, id)!.body!.keyframes[0].items.map((i) => [i.role, i.type === 'group' ? (i.children[0] as PathItem).style.fill : null]))).toBe(items);
  });

  it('builds old characters as before: a t-shirt, trousers and sneakers', () => {
    const c = buildCharacter(defaultCharacter(W, H));
    const m = c.info.model as unknown as { identity: Identity };
    expect(m.identity.top).toBe('tshirt');
    expect(m.identity.bottom).toBe('trousers');
  });
});

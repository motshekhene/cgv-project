"""
Build Level 3's Kai from the raw Mixamo downloads (Blender 4.4+).

    blender -b --factory-startup --python tools/build-kai.py -- \
        _source/downloads/mixamo-bryce assets/characters/kai-bryce.glb

The source folder holds the character (bryce.fbx, downloaded with skin) and
each move (downloaded Without Skin, 30 fps, In Place where Mixamo offers it),
named as Mixamo names them. Writes:

  kai-bryce.glb   the character with every move as a named animation. Only what
                  the game draws is kept: colour and normal maps at 1024 px
                  (WebP), not the 4096 px colour/normal/specular/gloss set
                  Mixamo ships (54 MB -> a few MB).
  kai-bryce.json  what the fight code needs to know about each move, measured
                  from the animation itself: its length, when each hit lands,
                  when the guard is fully up, how high the hips sit, how fast
                  a walk cycle walks... (times in seconds from the move's start)

Jab Cross is split into two moves, "jab" and "jabcross2", one per punch.

Missing moves are skipped with a warning, so the game falls back for those.
"""
import bpy
import json
import os
import sys

argv = sys.argv[sys.argv.index('--') + 1:]
SRC, OUT_GLB = argv[0], argv[1]
OUT_JSON = os.path.splitext(OUT_GLB)[0] + '.json'
CHARACTER = 'bryce.fbx'
TEX = 1024

# game name: (Mixamo file, loops?)
CLIPS = {
    'idle': ('Fight Idle.fbx', True),
    'walk': ('Walking.fbx', True),
    'walkback': ('Walking Backwards.fbx', True),
    'run': ('Running.fbx', True),
    'jabcross': ('Jab Cross.fbx', False),
    'cross': ('Cross Punch.fbx', False),
    'hook': ('Hook Punch.fbx', False),
    'kick': ('Mma Kick.fbx', False),
    'roundhouse': ('Roundhouse Kick.fbx', False),
    'block': ('Center Block.fbx', False),
    'dodge': ('Dodging.fbx', False),
    'hit': ('Hit Reaction.fbx', False),
    'death': ('Dying.fbx', False),
    'sitting': ('Sitting Idle.fbx', True),
    'standing': ('Getting Up.fbx', False),
}
B = 'mixamorig:'


def log(*a):
    print('[build-kai]', *a, flush=True)


# ------------------------------------------------------------------ import
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=os.path.join(SRC, CHARACTER))
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
arm.name = 'Kai'
for a in list(bpy.data.actions):  # whatever move was showing when it was downloaded
    bpy.data.actions.remove(a)
arm.animation_data_create()
scene = bpy.context.scene
fps = scene.render.fps

actions = {}
for name, (file, loop) in CLIPS.items():
    path = os.path.join(SRC, file)
    if not os.path.exists(path):
        log(f'WARNING: {file} not found, no "{name}" move')
        continue
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    src = next((o for o in new if o.type == 'ARMATURE' and o.animation_data and o.animation_data.action), None)
    if not src:
        log(f'WARNING: {file} has no animation')
    else:
        act = src.animation_data.action
        act.name = name
        act.use_fake_user = True
        actions[name] = (act, loop)
    for o in new:
        data = o.data
        bpy.data.objects.remove(o, do_unlink=True)
        if data and data.users == 0 and isinstance(data, bpy.types.Armature):
            bpy.data.armatures.remove(data)


# ------------------------------------------------------------------ measure
def use(act):
    ad = arm.animation_data
    ad.action = act
    if hasattr(ad, 'action_slot') and getattr(act, 'slots', None) and ad.action_slot is None:
        ad.action_slot = act.slots[0]


def sample(act, bones):
    """Per frame: {bone: world position} for the listed bones (metres, z up)."""
    use(act)
    f0, f1 = int(act.frame_range[0]), int(act.frame_range[1])
    frames = []
    for f in range(f0, f1 + 1):
        scene.frame_set(f)
        frames.append({b: (arm.matrix_world @ arm.pose.bones[B + b].head).copy() for b in bones})
    return f0, frames


def flat(v, w):
    return ((v.x - w.x) ** 2 + (v.y - w.y) ** 2) ** 0.5


def t(i):
    return round(i / fps, 3)


BONES = ['Hips', 'Head', 'LeftHand', 'RightHand', 'LeftFoot', 'RightFoot']
meta = {'fps': fps, 'clips': {}}
arm.animation_data.action = None
scene.frame_set(1)
rest = {b: (arm.matrix_world @ arm.pose.bones[B + b].head).copy() for b in BONES}
meta['ankle'] = round(min(rest['LeftFoot'].z, rest['RightFoot'].z), 3)  # ankle bone height, standing
meta['hips'] = round(rest['Hips'].z, 3)

for name, (act, loop) in list(actions.items()):
    f0, fr = sample(act, BONES)
    n = len(fr)
    info = {'duration': t(n - 1), 'loop': loop}
    reach = {s: [flat(p[s], p['Hips']) for p in fr] for s in ('LeftHand', 'RightHand', 'LeftFoot', 'RightFoot')}

    def strike(limbs, after=0, before=None):
        """The frame a limb is furthest from the hips, and which limb."""
        before = n if before is None else before
        best = max(((reach[s][i], i, s) for s in limbs for i in range(after, before)))
        return best[1], best[2]

    def started(limb, hit):
        """When the strike sets off: the limb's closest point to the body before the hit."""
        return min(range(0, hit + 1), key=lambda i: reach[limb][i])

    def settled(limb, hit):
        """When it's back: first frame after the hit within 15% of where it set off."""
        lo, hi = min(reach[limb][:hit + 1]), reach[limb][hit]
        for i in range(hit, n):
            if reach[limb][i] <= lo + 0.15 * (hi - lo):
                return i
        return n - 1

    if name == 'jabcross':
        jab, _ = strike(['LeftHand'], 0, n)
        cross, _ = strike(['RightHand'], 0, n)
        hits = sorted([(jab, 'LeftHand'), (cross, 'RightHand')])
        (h1, l1), (h2, l2) = hits
        split = (settled(l1, h1) + started(l2, h2)) // 2
        # two moves of their own: the jab up to the split, the cross from it (times relative to each)
        for part, a, b, h, limb in (('jab', 0, split, h1, l1), ('jabcross2', split, n - 1, h2, l2)):
            cut = act.copy()
            cut.name = part
            cut.use_fake_user = True
            cut.use_frame_range = True
            cut.frame_start, cut.frame_end = f0 + a, f0 + b
            actions[part] = (cut, False)
            meta['clips'][part] = {
                'duration': t(b - a), 'loop': False, 'start': t(max(0, started(limb, h) - a)),
                'hit': t(h - a), 'settle': t(min(settled(limb, h), b) - a), 'limb': limb,
            }
            log(part, meta['clips'][part])
    elif name in ('cross', 'hook'):
        h, limb = strike(['LeftHand', 'RightHand'])
        info.update(start=t(started(limb, h)), hit=t(h), settle=t(settled(limb, h)), limb=limb)
    elif name in ('kick', 'roundhouse'):
        h, limb = strike(['LeftFoot', 'RightFoot'])
        info.update(start=t(started(limb, h)), hit=t(h), settle=t(settled(limb, h)), limb=limb)
    elif name == 'block':
        up = [((p['LeftHand'].z + p['RightHand'].z) / 2 - p['Hips'].z) for p in fr]
        info['hold'] = t(max(range(n), key=lambda i: up[i]))
    elif name in ('hit', 'dodge'):
        moved = [flat(p['Head'], fr[0]['Head']) for p in fr]
        peak = max(range(n), key=lambda i: moved[i])
        back = next((i for i in range(peak, n) if moved[i] < 0.3 * moved[peak]), n - 1)
        info.update(peak=t(peak), settle=t(back), lean=round(moved[peak], 3))
    elif name in ('sitting', 'standing'):
        info.update(hips0=round(fr[0]['Hips'].z, 3), hips1=round(fr[-1]['Hips'].z, 3))
        if name == 'standing':
            top = fr[-1]['Hips'].z
            info['up'] = t(next(i for i in range(n) if fr[i]['Hips'].z >= fr[0]['Hips'].z + 0.9 * (top - fr[0]['Hips'].z)))
    if name in ('walk', 'walkback', 'run'):
        # the speed the cycle "walks" at (it's in place): how fast a planted foot slides back under him
        ground = min(min(p['LeftFoot'].z, p['RightFoot'].z) for p in fr)
        v = []
        for i in range(1, n):
            for s in ('LeftFoot', 'RightFoot'):
                if fr[i][s].z < ground + 0.03 and fr[i - 1][s].z < ground + 0.03:
                    v.append(flat(fr[i][s], fr[i - 1][s]) * fps)
        v.sort()
        info['speed'] = round(v[len(v) // 2], 2) if v else None
    meta['clips'][name] = info
    log(name, info)

arm.animation_data.action = None
scene.frame_set(1)
for pb in arm.pose.bones:
    pb.location = (0, 0, 0)
    pb.rotation_quaternion = (1, 0, 0, 0)
    pb.rotation_euler = (0, 0, 0)
    pb.scale = (1, 1, 1)

zs = [(o.matrix_world @ v.co).z for o in bpy.data.objects if o.type == 'MESH' for v in o.data.vertices]
meta['height'] = round(max(zs) - min(zs), 3)

# ------------------------------------------------------------------ textures
def image(stem):
    return next((i for i in bpy.data.images if os.path.basename(i.filepath.replace(chr(92), '/')).startswith(stem)), None)


body_col, body_nrm, hair_col = image('Ch42_1001_Diffuse'), image('Ch42_1001_Normal'), image('Ch42_1002_Diffuse')
for img in (body_col, body_nrm, hair_col):
    if img and img.size[0] > TEX:
        img.scale(TEX, TEX)
if body_nrm:
    body_nrm.colorspace_settings.name = 'Non-Color'


def rebuild(mat, col, nrm, alpha):
    """Colour (+ normal, + alpha) into a plain Principled BSDF: nothing else survives into the game anyway."""
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
    bsdf.inputs['Roughness'].default_value = 0.75
    nt.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    if col:
        tex = nt.nodes.new('ShaderNodeTexImage')
        tex.image = col
        nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
        if alpha:
            nt.links.new(tex.outputs['Alpha'], bsdf.inputs['Alpha'])
    if nrm:
        tex = nt.nodes.new('ShaderNodeTexImage')
        tex.image = nrm
        nm = nt.nodes.new('ShaderNodeNormalMap')
        nt.links.new(tex.outputs['Color'], nm.inputs['Color'])
        nt.links.new(nm.outputs['Normal'], bsdf.inputs['Normal'])


for mat in bpy.data.materials:
    if 'hair' in mat.name.lower():
        rebuild(mat, hair_col, None, True)
    else:
        rebuild(mat, body_col, body_nrm, False)
for img in list(bpy.data.images):
    if img not in (body_col, body_nrm, hair_col):
        bpy.data.images.remove(img)

# ------------------------------------------------------------------ export
os.makedirs(os.path.dirname(os.path.abspath(OUT_GLB)), exist_ok=True)
bpy.ops.export_scene.gltf(
    filepath=OUT_GLB,
    export_format='GLB',
    export_yup=True,
    export_image_format='WEBP',
    export_image_quality=82,
    export_image_webp_fallback=False,
    export_tangents=False,
    export_animations=True,
    export_animation_mode='ACTIONS',
    export_force_sampling=True,
    export_optimize_animation_size=True,
    export_anim_slide_to_zero=True,
    export_def_bones=False,
    export_skins=True,
    export_influence_nb=4,
    export_morph=False,
)
with open(OUT_JSON, 'w') as f:
    json.dump(meta, f, indent=2)
log('wrote', OUT_GLB, f'{os.path.getsize(OUT_GLB) / 1e6:.1f} MB', 'and', OUT_JSON, '-', len(actions), 'moves')

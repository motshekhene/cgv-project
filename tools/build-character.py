"""
Build Level 3's fighters from the raw Mixamo downloads (Blender 4.4+).

    blender -b --factory-startup --python tools/build-character.py -- kai \
        _source/downloads/mixamo-bryce assets/characters/kai-bryce.glb
    blender -b --factory-startup --python tools/build-character.py -- handler \
        _source/downloads/mixamo-handler assets/characters/handler-monk.glb

The source folder holds the character (downloaded with skin, T-pose) and each
move (downloaded Without Skin, 30 fps, In Place where Mixamo offers it), named
as Mixamo names them; CONFIGS below says which file is which move. Writes:

  <name>.glb    the character with every move as a named animation. Only what
                the game draws is kept: colour and normal maps at 1024 px
                (WebP), not the 4096 px colour/normal/specular/gloss set Mixamo
                ships (40-54 MB -> about 5 MB).
  <name>.json   what the fight code needs to know about each move, measured from
                the animation itself: its length, when each hit lands, when the
                guard is fully up, how high the hips sit, how fast a walk cycle
                walks... (times in seconds from the move's start)

Some moves are reworked on the way:
  split    Jab Cross becomes two moves, "jab" and "jabcross2", one per punch.
  mirror   left-handed copies: "kickl" (MMA Kick with the left leg), "dodgel"
           (Dodging, slipping to the other side).
  pinned   travelling moves Mixamo has no In Place for (the spinning kicks) are
           held where they start: the game moves the fighter itself.
  jump     Jumping Down's drop is taken out too, so the game can drop him from
           any height and the clip only adds the leap and the landing.

Missing moves are skipped with a warning, so the game falls back for those.
"""
import bpy
import json
import os
import sys
from mathutils import Matrix, Vector

argv = sys.argv[sys.argv.index('--') + 1:]
WHO, SRC, OUT_GLB = argv[0], argv[1], argv[2]
OUT_JSON = os.path.splitext(OUT_GLB)[0] + '.json'
TEX = 1024
B = 'mixamorig:'

# per fighter: the character file, and each move as game name: (Mixamo file, kind, options...)
# options: 'hands' / 'feet' (what a strike lands with), 'pinned' (held on the spot)
CONFIGS = {
    'kai': {  # Mixamo's Bryce
        'character': 'bryce.fbx',
        'clips': {
            'idle': ('Fight Idle.fbx', 'loop'),
            'walk': ('Walking.fbx', 'walk'),
            'walkback': ('Walking Backwards.fbx', 'walk'),
            'run': ('Running.fbx', 'walk'),
            'jabcross': ('Jab Cross.fbx', 'split'),
            'cross': ('Cross Punch.fbx', 'strike', 'hands'),
            'hook': ('Hook Punch.fbx', 'strike', 'hands'),
            'kick': ('Mma Kick.fbx', 'strike', 'feet'),
            'roundhouse': ('Roundhouse Kick.fbx', 'strike', 'feet'),
            'block': ('Center Block.fbx', 'block'),
            'dodge': ('Dodging.fbx', 'dodge'),
            'hit': ('Hit Reaction.fbx', 'hit'),
            'death': ('Dying.fbx', 'once'),
            'sitting': ('Sitting Idle.fbx', 'pose'),
            'standing': ('Getting Up.fbx', 'standing'),
        },
        # lower case: the game lower-cases clip names
        'mirror': {'kickl': 'kick', 'dodgel': 'dodge'},
    },
    'handler': {  # Mixamo's Ch39, the shrine monk
        'character': 'handler.fbx',
        'clips': {
            'idle': ('Boxing.fbx', 'loop'),
            'run': ('Running (1).fbx', 'walk'),
            'lunge': ('Punching.fbx', 'strike', 'hands'),
            'sweep': ('Hurricane Kick.fbx', 'strike', 'feet', 'pinned'),
            'capoeira': ('Chapaeu De Couro.fbx', 'strike', 'feet', 'pinned'),
            'combo': ('Combo Punch.fbx', 'strike', 'hands'),
            'jump': ('Jumping Down.fbx', 'jump'),
            'stunned': ('Dizzy Idle.fbx', 'loop'),
            'angry': ('Angry Point.fbx', 'strike', 'hands'),  # the point: his arm at full stretch
            'hit': ('Zombie Reaction Hit.fbx', 'hit'),
            'death': ('Zombie Dying.fbx', 'once', 'pinned'),  # falls where he stands, not back under Kai's feet
        },
        'mirror': {},
    },
}
CFG = CONFIGS[WHO]
LOOPS = ('loop', 'walk', 'pose')


def log(*a):
    print(f'[build-{WHO}]', *a, flush=True)


# ------------------------------------------------------------------ import
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=os.path.join(SRC, CFG['character']))
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
arm.name = WHO.capitalize()
for a in list(bpy.data.actions):  # whatever move was showing when it was downloaded
    bpy.data.actions.remove(a)
arm.animation_data_create()
scene = bpy.context.scene
fps = scene.render.fps

actions = {}  # game name: (action, kind, options)
for name, (file, kind, *opts) in CFG['clips'].items():
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
        actions[name] = (act, kind, set(opts))
    for o in new:
        data = o.data
        bpy.data.objects.remove(o, do_unlink=True)
        if data and data.users == 0 and isinstance(data, bpy.types.Armature):
            bpy.data.armatures.remove(data)


def use(act):
    ad = arm.animation_data
    ad.action = act
    if act and hasattr(ad, 'action_slot') and getattr(act, 'slots', None) and ad.action_slot is None:
        ad.action_slot = act.slots[0]


def frames_of(act):
    return range(int(act.frame_range[0]), int(act.frame_range[1]) + 1)


# ------------------------------------------------------------------ mirror
def mirrored(act, name):
    """
    A left-right mirror of a move (a left kick from a right one), baked bone by
    bone: each bone takes its twin's pose, reflected across the body's middle.
    General form, so it doesn't rely on the left and right bones' rest axes
    being exact mirrors: M = F (M_twin R_twin^-1) F R, F = the reflection.
    """
    flip = Matrix.Scale(-1, 4, (1, 0, 0))  # the armature's own x is the body's left-right
    bones = arm.pose.bones
    rest = {b.name: b.bone.matrix_local.copy() for b in bones}

    def twin(n):
        return n.replace('Left', '\0').replace('Right', 'Left').replace('\0', 'Right')

    use(act)
    want = []
    for f in frames_of(act):
        scene.frame_set(f)
        pose = {b.name: b.matrix.copy() for b in bones}
        want.append({b.name: flip @ pose[twin(b.name)] @ rest[twin(b.name)].inverted() @ flip @ rest[b.name] for b in bones})

    # pose bones are set parent-first (a child's local pose depends on its parent's), with no action playing
    arm.animation_data.action = None
    levels = {}
    for b in bones:
        levels.setdefault(len(b.parent_recursive), []).append(b)
    basis = []
    for w in want:
        for d in sorted(levels):
            for b in levels[d]:
                b.matrix = w[b.name]
            bpy.context.view_layer.update()
        basis.append({b.name: (b.location.copy(), b.rotation_quaternion.copy()) for b in bones})

    new = bpy.data.actions.new(name)
    new.use_fake_user = True
    arm.animation_data.action = new
    prev = {}
    for i, f in enumerate(frames_of(act)):
        for b in bones:
            loc, rot = basis[i][b.name]
            if b.name in prev and prev[b.name].dot(rot) < 0:
                rot.negate()  # keep the quaternions on one side, or the in-betweens spin the long way round
            prev[b.name] = rot
            b.location, b.rotation_quaternion = loc, rot
            b.keyframe_insert('location', frame=f)
            b.keyframe_insert('rotation_quaternion', frame=f)
    arm.animation_data.action = None
    return new


for name, src in CFG['mirror'].items():
    if src in actions:
        act, kind, opts = actions[src]
        actions[name] = (mirrored(act, name), kind, opts)
        log('mirrored', src, '->', name)


# ------------------------------------------------------------------ pin
def smooth(a, b, x):
    k = min(1, max(0, (x - a) / (b - a))) if b > a else 1.0
    return k * k * (3 - 2 * k)


def pin(act, kind):
    """
    Hold the hips where the move starts, so a travelling move plays on the spot
    (the game moves the fighter). For a jump, the drop is taken out as he falls
    (between take-off and landing), so he lands at the height he left from.
    Returns the jump's take-off/landing frames (None otherwise).
    """
    hips = arm.pose.bones[B + 'Hips']
    use(act)
    world = []
    for f in frames_of(act):
        scene.frame_set(f)
        world.append((arm.matrix_world @ hips.matrix).copy())
    z = [m.translation.z for m in world]
    start = world[0].translation.copy()
    jump = None
    if kind == 'jump':
        land = min(range(len(z)), key=lambda i: z[i])  # the landing crouch is the lowest he goes
        takeoff = max((i for i in range(land) if z[i] >= z[0] - 0.05), default=0)
        jump = (takeoff, land, z[0] - z[-1])
    inv = arm.matrix_world.inverted()
    for i, f in enumerate(frames_of(act)):
        m = world[i].copy()
        m.translation.x, m.translation.y = start.x, start.y
        if jump:
            m.translation.z += jump[2] * smooth(jump[0], jump[1], i)
        hips.matrix = inv @ m
        hips.keyframe_insert('location', frame=f)
    return jump


pins = {}
for name, (act, kind, opts) in actions.items():
    if 'pinned' in opts or kind == 'jump':
        pins[name] = pin(act, kind)
        log('pinned', name)

# ------------------------------------------------------------------ measure
def sample(act, bones):
    """Per frame: {bone: world position} for the listed bones (metres, z up)."""
    use(act)
    out = []
    for f in frames_of(act):
        scene.frame_set(f)
        out.append({b: (arm.matrix_world @ arm.pose.bones[B + b].head).copy() for b in bones})
    return int(act.frame_range[0]), out


def flat(v, w):
    return ((v.x - w.x) ** 2 + (v.y - w.y) ** 2) ** 0.5


def t(i):
    return round(i / fps, 3)


LIMBS = ('LeftHand', 'RightHand', 'LeftFoot', 'RightFoot')
BONES = ['Hips', 'Head', *LIMBS]
meta = {'fps': fps, 'clips': {}}
arm.animation_data.action = None
scene.frame_set(1)
rest = {b: (arm.matrix_world @ arm.pose.bones[B + b].head).copy() for b in BONES}
meta['ankle'] = round(min(rest['LeftFoot'].z, rest['RightFoot'].z), 3)  # ankle bone height, standing
meta['hips'] = round(rest['Hips'].z, 3)

for name, (act, kind, opts) in list(actions.items()):
    f0, fr = sample(act, BONES)
    pinned = 'pinned' in opts
    limbs = ('LeftHand', 'RightHand') if 'hands' in opts else ('LeftFoot', 'RightFoot') if 'feet' in opts else LIMBS
    n = len(fr)
    info = {'duration': t(n - 1), 'loop': kind in LOOPS}
    reach = {s: [flat(p[s], p['Hips']) for p in fr] for s in LIMBS}

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

    def peaks(frac=0.75, gap=0.15):
        """Every blow in the move: a limb at full stretch (3/4 of the move's longest reach or more)."""
        top = max(reach[s][i] for s in limbs for i in range(n))
        found = []
        for s in limbs:
            r = reach[s]
            for i in range(n):
                window = r[max(0, i - 3):i + 4]
                if r[i] >= frac * top and r[i] == max(window):
                    found.append((i, s, r[i]))
        merged = []
        for i, s, v in sorted(found):
            if merged and i - merged[-1][0] < gap * fps:
                if v > merged[-1][2]:
                    merged[-1] = (i, s, v)
            else:
                merged.append((i, s, v))
        return [{'t': t(i), 'limb': s} for i, s, _ in merged]

    if kind == 'split':
        jab, _ = strike(['LeftHand'], 0, n)
        cross, _ = strike(['RightHand'], 0, n)
        (h1, l1), (h2, l2) = sorted([(jab, 'LeftHand'), (cross, 'RightHand')])
        split = (settled(l1, h1) + started(l2, h2)) // 2
        # two moves of their own: the jab up to the split, the cross from it (times relative to each)
        for part, a, b, h, limb in (('jab', 0, split, h1, l1), ('jabcross2', split, n - 1, h2, l2)):
            cut = act.copy()
            cut.name = part
            cut.use_fake_user = True
            cut.use_frame_range = True
            cut.frame_start, cut.frame_end = f0 + a, f0 + b
            actions[part] = (cut, 'strike', {'hands'})
            meta['clips'][part] = {
                'duration': t(b - a), 'loop': False, 'start': t(max(0, started(limb, h) - a)),
                'hit': t(h - a), 'settle': t(min(settled(limb, h), b) - a), 'limb': limb,
            }
            log(part, meta['clips'][part])
    elif kind == 'strike':
        h, limb = strike(limbs)
        info.update(start=t(started(limb, h)), hit=t(h), settle=t(settled(limb, h)), limb=limb, hits=peaks())
    elif kind == 'block':
        # Center Block takes a blow: from the guard he rocks back (recoil) and comes back up with his
        # forearms round his head. hold: back up, upright again - the guard to hold; jolt: just before
        # the rock back starts, where a blow landing on the guard plays from
        lean = [flat(p['Head'], fr[0]['Head']) for p in fr]
        recoil = max(range(n), key=lambda i: lean[i])
        hold = next((i for i in range(recoil, n) if lean[i] <= 0.3 * lean[recoil]), n - 1)
        jolt = max((i for i in range(recoil) if lean[i] <= 0.5 * lean[recoil]), default=0)
        info.update(hold=t(hold), jolt=t(jolt), recoil=t(recoil))
    elif kind in ('hit', 'dodge'):
        moved = [flat(p['Head'], fr[0]['Head']) for p in fr]
        peak = max(range(n), key=lambda i: moved[i])
        back = next((i for i in range(peak, n) if moved[i] < 0.3 * moved[peak]), n - 1)
        info.update(peak=t(peak), settle=t(back), lean=round(moved[peak], 3))
        if kind == 'dodge':
            # duck: head lowest before the slip; slip: which way the head goes (his right is -x: he faces -y)
            info['duck'] = t(min(range(peak + 1), key=lambda i: fr[i]['Head'].z))
            info['slip'] = 'right' if fr[peak]['Head'].x < fr[0]['Head'].x else 'left'
    elif kind in ('pose', 'standing'):
        info.update(hips0=round(fr[0]['Hips'].z, 3), hips1=round(fr[-1]['Hips'].z, 3))
        if kind == 'standing':
            top = fr[-1]['Hips'].z
            info['up'] = t(next(i for i in range(n) if fr[i]['Hips'].z >= fr[0]['Hips'].z + 0.9 * (top - fr[0]['Hips'].z)))
    elif kind == 'jump':
        takeoff, land, drop = pins[name]
        info.update(takeoff=t(takeoff), land=t(land), drop=round(drop, 3))
    if kind == 'walk':
        # the speed the cycle "walks" at (it's in place): how fast a planted foot slides back under him
        ground = min(min(p['LeftFoot'].z, p['RightFoot'].z) for p in fr)
        v = []
        for i in range(1, n):
            for s in ('LeftFoot', 'RightFoot'):
                if fr[i][s].z < ground + 0.03 and fr[i - 1][s].z < ground + 0.03:
                    v.append(flat(fr[i][s], fr[i - 1][s]) * fps)
        v.sort()
        info['speed'] = round(v[len(v) // 2], 2) if v else None
    if pinned or kind == 'jump':
        info['travel'] = round(flat(fr[-1]['Hips'], fr[0]['Hips']), 3)  # what's left of it: ~0
    if kind != 'split':
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
def feeding(mat, socket):
    """The image texture wired into a Principled BSDF input (through a Normal Map node for 'Normal')."""
    for link in mat.node_tree.links:
        if link.to_node.type != 'BSDF_PRINCIPLED' or link.to_socket.name != socket:
            continue
        node = link.from_node
        if node.type == 'NORMAL_MAP':
            node = next((l.from_node for l in mat.node_tree.links if l.to_node == node and l.to_socket.name == 'Color'), None)
        if node is not None and node.type == 'TEX_IMAGE':
            return node.image
    return None


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


keep = set()
for mat in bpy.data.materials:
    if not mat.use_nodes:
        continue
    col, nrm = feeding(mat, 'Base Color'), feeding(mat, 'Normal')
    alpha = feeding(mat, 'Alpha') is not None  # hair cards: cut out by the colour map's alpha, no normal map
    if alpha:
        nrm = None
    for img in (col, nrm):
        if img and img not in keep:
            keep.add(img)
            if img.size[0] > TEX:
                img.scale(TEX, TEX)
    if nrm:
        nrm.colorspace_settings.name = 'Non-Color'
    rebuild(mat, col, nrm, alpha)
for img in list(bpy.data.images):
    if img not in keep:
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

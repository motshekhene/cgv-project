/**
 * CREDITS on the main menu (ui/CreditsMenu.js): the team who made the game,
 * the cast, the music written for it, and everything in it the team did not
 * make: what it is, who made it, its licence, where it is in the game, and a
 * link to where it came from.
 *
 * The asset folders keep the same lists by file name (assets/jungle/
 * README.md, public/assets/level2/CREDITS.md, public/assets/audio/
 * CREDITS.md). A new asset gets a row there and an entry here.
 *
 * Nothing here names who plays whom: the menu is open before the story is.
 */

/** The developers, in the order the team gave them. */
export const TEAM = [
  'Sebetola Junior',
  'Maredi Mahlatse',
  'Mbatha Nontokozo',
  'Monaiwa Realeboha',
  'Keamogetswe Modiakgotle',
  'Kgothatso Nkadimeng',
]

/** The cast, each in the colour their lines are written in (ui/dialogue.js SPEAKERS). */
export const CAST = [
  { name: 'KAI', color: '#9ed36a', role: 'The boy who takes the horn',
    line: 'Grew up on Baba Zwane’s stories by the fire. Tonight he walks up the old path to the stone.' },
  { name: 'BABA ZWANE', color: '#ffb03a', role: 'The old guide at the fire',
    line: 'Knows every path in the valley, and every story ever told about the horn.' },
  { name: 'THE MARSHAL', color: '#f2934f', role: 'The logging company’s man',
    line: 'Hard hat, hi-vis vest and a mask. On foot, then in his car, he never stops coming.' },
  { name: 'THE COMPANY’S MEN', color: '#c9b48a', role: 'The crew at the falls',
    line: 'Paid to clear the valley, and waiting where the river goes over the edge.' },
  { name: 'THE FOREST’S SPIRITS', color: '#4fd6e0', role: 'The Stag, the Fox and the Ember',
    line: 'Old as the stone. They heal, they warn, and they hit back, for whoever carries the horn.' },
];
/** Who made the cast's bodies and every move they make. */
export const CAST_CREDIT = { title: 'Characters and animations', by: 'Mixamo (Adobe)', licence: 'Mixamo', url: 'https://www.mixamo.com/' };

/**
 * The score: written for this game and synthesised in code, one piece per
 * chapter, all carrying the mbira tune from the fire (audio/chaseScore.js,
 * and the prologue's own in levels/Prologue.js).
 */
export const SCORE = [
  { title: 'The Fire and the Stone', where: 'PROLOGUE', color: '#ffb03a',
    what: 'An mbira over a low drone, under Baba Zwane’s story. It goes quiet with the forest.' },
  { title: 'The Old Trail', where: 'LEVEL 1', color: '#9ed36a',
    what: 'A rolling 12/8 djembe, shaker, talking drum and drone, with the fire’s tune running faster.' },
  { title: 'The River Road', where: 'LEVEL 2', color: '#7fc8e8',
    what: 'A pushing 4/4 at car speed: low drums, a pulsing bass and a marimba, the tune out of the window.' },
  { title: 'The Falls', where: 'LEVEL 3', color: '#f2934f',
    what: 'Big low toms, a war horn every four bars, and the fire’s tune at full speed: a fight song.' },
];
export const LICENCES = {
  CC0: { name: 'CC0', url: 'https://creativecommons.org/publicdomain/zero/1.0/' },
  'CC BY 3.0': { name: 'CC BY 3.0', url: 'https://creativecommons.org/licenses/by/3.0/' },
  Pixabay: { name: 'PIXABAY LICENSE', url: 'https://pixabay.com/service/license-summary/' },
  OFL: { name: 'SIL OFL 1.1', url: 'https://openfontlicense.org/' },
  MIT: { name: 'MIT', url: 'https://opensource.org/license/mit' },
  Mixamo: { name: 'ROYALTY-FREE', url: 'https://www.mixamo.com/' },
  // a published method we wrote our own shader code from: the link is the source itself
  Technique: { name: 'TECHNIQUE, OUR CODE', url: null },
};

export const CREDIT_SECTIONS = [
  {
    title: 'THE FOREST AND THE SHRINE',
    items: [
      { title: 'Simple Nature Pack', by: 'Quaternius', licence: 'CC0', url: 'https://quaternius.com/packs/simplenature.html',
        use: 'The trees, bushes, grass and rocks' },
      { title: 'Ultimate Modular Ruins Pack', by: 'Quaternius', licence: 'CC0', url: 'https://quaternius.com/packs/ultimatemodularruins.html',
        use: 'The shrine: walls, arches, columns, the stag and fox statues, torches, traps' },
      { title: 'Ultimate Fantasy RTS', by: 'Quaternius', licence: 'CC0', url: 'https://quaternius.com/packs/ultimatefantasyrts.html',
        use: 'Logs, crates, barrels, boulders and the small trees' },
      { title: 'Ground 040', by: 'ambientCG', licence: 'CC0', url: 'https://ambientcg.com/view?id=Ground040',
        use: 'The forest floor texture' },
      { title: 'Ground 051', by: 'ambientCG', licence: 'CC0', url: 'https://ambientcg.com/view?id=Ground051',
        use: 'The mud of the trail and the River Road' },
      { title: 'Rock 063', by: 'ambientCG', licence: 'CC0', url: 'https://ambientcg.com/view?id=Rock063',
        use: 'The mossy stone' },
      { title: 'Car Kit', by: 'Kenney', licence: 'CC0', url: 'https://kenney.nl/assets/car-kit',
        use: 'The wreck in the pool below the falls: wheel, tyre, bumper, axle' },
      { title: '“Steering wheel”', by: 'Poly by Google', licence: 'CC BY 3.0', url: 'https://poly.pizza/m/bIYbhKwE4L0',
        use: 'The wreck in the pool below the falls' },
      { title: '“Hut”', by: 'Jarlan Perez', licence: 'CC BY 3.0', url: 'https://poly.pizza/m/3OlnbRfwPLc',
        use: 'The ruined hut in the prologue’s valley' },
    ],
  },
  {
    title: 'THE RIVER ROAD',
    items: [
      { title: 'Cars Bundle', by: 'Quaternius', licence: 'CC0', url: 'https://poly.pizza/bundle/Cars-Bundle-FE5IWe6OMk',
        use: 'The Street Racer, and the saloons, hatchbacks, coupes, SUVs and taxis in traffic' },
      { title: '“Toyota AE86”', by: 'IvOfficial', licence: 'CC BY 3.0', url: 'https://poly.pizza/m/ZEFWmOPSgh', use: 'The Drifter' },
      { title: '“Car”', by: 'theking1322', licence: 'CC BY 3.0', url: 'https://poly.pizza/m/t8njpnyrxg', use: 'The Muscle' },
      { title: '“Convertible”', by: 'Poly by Google', licence: 'CC BY 3.0', url: 'https://poly.pizza/m/dggOiBLYyuR', use: 'The Executive' },
      { title: '“CAR Model”', by: 'Ignition Labs', licence: 'CC BY 3.0', url: 'https://poly.pizza/m/5zUWP5UsLg-', use: 'The Supercar' },
      { title: '“Range Rover”', by: 'IvOfficial', licence: 'CC BY 3.0', url: 'https://poly.pizza/m/8zk4o6nALW', use: 'The Marshal’s car' },
      { title: '“Richie”', by: 'joney_lol', licence: 'CC BY 3.0', url: 'https://poly.pizza/m/BwaLw2Olre', use: 'The Marshal’s drones' },
      { title: '“Pickup Truck”', by: 'Quaternius', licence: 'CC0', url: 'https://poly.pizza/m/qn4grQgHm8', use: 'The Bruiser, the pickups in traffic, and the crew’s truck in the valley' },
      { title: '“Van”', by: 'jeremy', licence: 'CC BY 3.0', url: 'https://poly.pizza/m/9hUUD2DWk1v', use: 'Traffic' },
      { title: '“Bus”', by: 'Poly by Google', licence: 'CC BY 3.0', url: 'https://poly.pizza/m/4CPpvEmrMoF', use: 'Traffic' },
    ],
  },
  {
    title: 'ANIMALS',
    items: [
      { title: '“Boar”', by: 'Poly by Google', licence: 'CC BY 3.0', url: 'https://poly.pizza/m/57fSWum6F1P', use: 'The warthogs' },
      { title: '“Stag”', by: 'Quaternius', licence: 'CC0', url: 'https://poly.pizza/m/tQdzbZ1Cmw', use: 'The kudu' },
      { title: '“Deer”', by: 'Quaternius', licence: 'CC0', url: 'https://poly.pizza/m/T6Cs7tmMHJ', use: 'The kudu' },
    ],
  },
  {
    title: 'RECORDED MUSIC AND SOUND',
    note: 'The score is written in code (THE MUSIC tab), and every other sound in the game is synthesised with the Web Audio API.',
    items: [
      { title: '“Repeat (Gaming Background Music)”', by: 'SoundUniverseStudio', licence: 'Pixabay',
        url: 'https://pixabay.com/music/video-games-repeat-gaming-background-music-instrumental-218942/', use: 'The music on the title screen' },
      { title: '“Collect Points”', by: 'Liecio', licence: 'Pixabay',
        url: 'https://pixabay.com/sound-effects/collect-points-190037/', use: 'Catching Forest Lights on the trail' },
      { title: '“Car crash (swerving, and crash)”', by: 'RSF_STUDIOS', licence: 'Pixabay',
        url: 'https://pixabay.com/sound-effects/car-crash-swerving-and-crash-592672/', use: 'Wrecks on the River Road' },
      { title: '“racing car engine sound loops”', by: 'domasx2', licence: 'CC0', url: 'https://opengameart.org/content/racing-car-engine-sound-loops',
        use: 'Your car’s engine on the River Road' },
      { title: '“Big Explosion”', by: 'elnineo', licence: 'CC0', url: 'https://opengameart.org/content/explosion-tilesets',
        use: 'A wreck going up, and the Marshal’s bombs' },
    ],
  },
  {
    title: 'TECHNIQUES WE ADAPTED',
    note: 'The shader code is our own (src/core/PostFX.js, src/shaders/); these are the published methods it follows.',
    items: [
      { title: 'Next Generation Post Processing in Call of Duty: Advanced Warfare', by: 'Jorge Jimenez, SIGGRAPH 2014', licence: 'Technique',
        url: 'https://www.iryoku.com/next-generation-post-processing-in-call-of-duty-advanced-warfare/',
        use: 'The bloom: the 13-tap downsample and tent-filter upsample chain' },
      { title: 'Volumetric Light Scattering as a Post-Process', by: 'Kenny Mitchell, GPU Gems 3 ch. 13', licence: 'Technique',
        url: 'https://developer.nvidia.com/gpugems/gpugems3/part-ii-light-and-shadows/chapter-13-volumetric-light-scattering-post-process',
        use: 'The god rays through the canopy' },
      { title: 'ACES Filmic tone curve (fitted)', by: 'Stephen Hill, via three.js', licence: 'MIT', url: 'https://threejs.org/',
        use: 'The tone curve, and its inverse that keeps the sky and fog true under post-processing' },
    ],
  },
  {
    title: 'TYPE AND CODE',
    items: [
      { title: 'Crimson Pro', by: 'Jacques Le Bailly', licence: 'OFL', url: 'https://fonts.google.com/specimen/Crimson+Pro',
        use: 'The serif of every title, line and card' },
      { title: 'three.js', by: 'three.js authors', licence: 'MIT', url: 'https://threejs.org/', use: 'The 3D engine' },
      { title: 'Vite', by: 'Vite authors', licence: 'MIT', url: 'https://vite.dev/', use: 'The build' },
    ],
  },
];

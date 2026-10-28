/**
 * Everything in the game the team did not make, for CREDITS on the main menu
 * (ui/CreditsMenu.js): what it is, who made it, its licence, where it is in
 * the game, and a link to where it came from.
 *
 * The asset folders keep the same lists by file name (assets/jungle/
 * README.md, public/assets/level2/CREDITS.md, public/assets/audio/
 * CREDITS.md). A new asset gets a row there and an entry here.
 *
 * Nothing here names who plays whom: the menu is open before the story is.
 */
export const LICENCES = {
  CC0: { name: 'CC0', url: 'https://creativecommons.org/publicdomain/zero/1.0/' },
  'CC BY 3.0': { name: 'CC BY 3.0', url: 'https://creativecommons.org/licenses/by/3.0/' },
  Pixabay: { name: 'PIXABAY LICENSE', url: 'https://pixabay.com/service/license-summary/' },
  OFL: { name: 'SIL OFL 1.1', url: 'https://openfontlicense.org/' },
  MIT: { name: 'MIT', url: 'https://opensource.org/license/mit' },
  Mixamo: { name: 'ROYALTY-FREE', url: 'https://www.mixamo.com/' },
};

export const CREDIT_SECTIONS = [
  {
    title: 'CHARACTERS',
    items: [
      { title: 'Characters and animations', by: 'Mixamo (Adobe)', licence: 'Mixamo', url: 'https://www.mixamo.com/',
        use: 'Every character in the story, every player you can choose, and every move they make' },
    ],
  },
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
      { title: '“Pickup Truck”', by: 'Quaternius', licence: 'CC0', url: 'https://poly.pizza/m/qn4grQgHm8', use: 'The Bruiser, and the pickups in traffic' },
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
    title: 'MUSIC AND SOUND',
    note: 'Every other sound in the game is synthesised in code with the Web Audio API.',
    items: [
      { title: '“Repeat (Gaming Background Music)”', by: 'SoundUniverseStudio', licence: 'Pixabay',
        url: 'https://pixabay.com/music/video-games-repeat-gaming-background-music-instrumental-218942/', use: 'The theme' },
      { title: '“Collect Points”', by: 'Liecio', licence: 'Pixabay',
        url: 'https://pixabay.com/sound-effects/collect-points-190037/', use: 'The coins on the trail' },
      { title: '“Car crash (swerving, and crash)”', by: 'RSF_STUDIOS', licence: 'Pixabay',
        url: 'https://pixabay.com/sound-effects/car-crash-swerving-and-crash-592672/', use: 'Wrecks on the River Road' },
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

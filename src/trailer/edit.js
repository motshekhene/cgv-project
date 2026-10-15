import { TitleScene } from '../levels/TitleScene.js';
import { Prologue } from '../levels/Prologue.js';
import { Level01 } from '../levels/Level01.js';
import { DriveOutIntro } from '../intros/level2/DriveOutIntro.js';
import { Level02 } from '../levels/Level02.js';
import { Level03 } from '../levels/Level03.js';
import { AWAKENING, TITLE, titleCards } from './seq/glade.js';
import { FIRE_AND_STONE } from './seq/prologue.js';
import { RUN } from './seq/trail.js';
import { NO_ESCAPE } from './seq/drive.js';
import { TRUTH, POWER } from './seq/shrine.js';

/**
 * THE EDIT — every shot, word and fade of the trailer, in order.
 *
 *   1  THE AWAKENING          0:00  the glade at dawn, the horn on its stone
 *   7  TITLE                  ...   black, THE SILENT HORN, the stone and its watcher
 *
 * The stages are the game's own levels, built once when the page loads.
 */
export const STAGES = {
  title: () => new TitleScene(),
  prologue: () => new Prologue(),
  level01: () => new Level01(),
  intro2: () => new DriveOutIntro({}),
  level02: () => new Level02({ fromIntro: true }),
  level03: () => new Level03(),
};

const TITLE_AT = 78.6;
export const SKIP_TO = TITLE_AT;
export const LENGTH = TITLE_AT + 10.8;

const SEQUENCES = [AWAKENING, FIRE_AND_STONE, RUN, NO_ESCAPE, TRUTH, POWER, { shots: TITLE.shots(TITLE_AT), ...titleCards(TITLE_AT) }];

export const SHOTS = SEQUENCES.flatMap((s) => s.shots);
export const CARDS = SEQUENCES.flatMap((s) => s.cards || []);
export const FADES = SEQUENCES.flatMap((s) => s.fades || []);
/** The letterbox: in from the first frame. */
export const BARS = () => 1;

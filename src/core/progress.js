/**
 * Where the story is up to, for CONTINUE on the main menu (ui/TitleScreen.js):
 * the last chapter played, kept in this browser. main.js tells it each level
 * that starts. Reaching the epilogue finishes the story, and CONTINUE goes
 * until the next one is started.
 *
 *   reached('level02-intro');   // the River Road is where they're up to
 *   lastChapter();              // 'level02', or null
 */
const KEY = 'silent-horn.progress';
// a level, as the chapter CONTINUE starts (the drive-out is the start of the River Road)
const CHAPTER_OF = { prologue: 'prologue', level01: 'level01', 'level02-intro': 'level02', level02: 'level02', level03: 'level03' };

/** A level has started: remember its chapter (or, the epilogue, that the story is done). */
export function reached(level) {
  try {
    if (level === 'epilogue') localStorage.removeItem(KEY);
    else if (CHAPTER_OF[level]) localStorage.setItem(KEY, CHAPTER_OF[level]);
  } catch {
    // storage blocked: no CONTINUE, CHAPTERS still has everything
  }
}

/** The chapter to continue from, or null: nothing started, or the story finished. */
export function lastChapter() {
  try {
    const c = localStorage.getItem(KEY);
    return Object.values(CHAPTER_OF).includes(c) ? c : null;
  } catch {
    return null;
  }
}

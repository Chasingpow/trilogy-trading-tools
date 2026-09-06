/**
 * Trilogy Trading Tools — site entry point.
 *
 * Each feature lives in its own module; this file only wires them up.
 * The bundle is built by scripts/build.mjs (esbuild) and inlined into index.html.
 */
import { initProgressBar, initCardSpotlight, initRevealOnScroll, initLegalDialogs, initMobileNav } from './chrome';
import { initHeroRibbons } from './ribbons';
import { initCosmos } from './cosmos';
import { initCandleWords } from './candles';
import { initTicker } from './ticker';
import { initStages } from './stages';

initMobileNav();
initProgressBar();
initCardSpotlight();
initRevealOnScroll();
initLegalDialogs();
initHeroRibbons();
initCosmos();
initCandleWords();
initTicker();
initStages();

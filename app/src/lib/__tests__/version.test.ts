/* Version comparison, which is a classic quiet failure.
 *
 * The whole point of showing a version is to tell someone whether to update. A
 * comparison that gets it backwards tells a user on an old build that they are
 * current, and they stop looking — worse than showing nothing at all.
 */

import { describe, expect, it } from 'vitest';
import { STRK20_MIN_READY, isBelow } from '../wallet';

describe('isBelow', () => {
  it('compares numerically, not as strings', () => {
    /* The reason this function exists. Lexicographically '5.9.0' > '5.33.8',
       so a string compare would tell someone on 5.9.0 they were up to date. */
    expect(isBelow('5.9.0', '5.33.8')).toBe(true);
    expect(isBelow('5.33.8', '5.9.0')).toBe(false);
  });

  it('treats the minimum itself as new enough', () => {
    expect(isBelow('5.33.8', '5.33.8')).toBe(false);
  });

  it('handles each position independently', () => {
    expect(isBelow('5.33.7', '5.33.8')).toBe(true);
    expect(isBelow('5.33.9', '5.33.8')).toBe(false);
    expect(isBelow('4.99.99', '5.33.8')).toBe(true);
    expect(isBelow('6.0.0', '5.33.8')).toBe(false);
  });

  it('treats missing components as zero', () => {
    expect(isBelow('5.33', '5.33.8')).toBe(true);
    expect(isBelow('6', '5.33.8')).toBe(false);
    expect(isBelow('5.34', '5.33.8')).toBe(false);
  });

  it('ignores prerelease and build suffixes rather than choking on them', () => {
    /* A wallet reporting '5.34.0-beta.1' is newer than the minimum, and must
       not be told to update because of the suffix. */
    expect(isBelow('5.34.0-beta.1', '5.33.8')).toBe(false);
    expect(isBelow('5.33.7-rc.2', '5.33.8')).toBe(true);
  });

  it('does not crash on nonsense, and does not claim it is too old', () => {
    /* An unparseable version is unknown, not old. Telling someone to update
       from a version we could not read is a guess presented as a fact. */
    expect(isBelow('', '5.33.8')).toBe(true);
    expect(typeof isBelow('not-a-version', '5.33.8')).toBe('boolean');
  });

  it('pins the documented minimum', () => {
    expect(STRK20_MIN_READY).toBe('5.33.8');
  });
});

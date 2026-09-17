/**
 * Two typefaces, with different jobs.
 *
 * TECH is the lettering on the die. A coding monospace was the wrong signal
 * entirely: it reads as a terminal, and nothing on a real die is set in one.
 * Die markings, foundry stamps and the block labels on published annotated die
 * shots are technical engineering lettering - DIN 1451, the German industrial
 * standard used on drawings, machinery and road signage.
 *
 * Bahnschrift IS DIN 1451 and ships with Windows 10+; macOS ships DIN Alternate.
 * Between them the real thing is already installed nearly everywhere, so this
 * stack buys the correct look without bundling a font or hitting a CDN.
 *
 * MONO stays for the HUD, which is an instrument reading out numbers, not part
 * of the artefact. Keeping the two apart is deliberate: the panel should not
 * look like it is etched into the silicon.
 */

export const TECH = [
  '"Bahnschrift"',        // Windows 10+ : DIN 1451, variable width axis
  '"DIN Alternate"',      // macOS
  '"DIN Condensed"',
  '"Roboto Condensed"',   // common on Linux / Android
  '"Archivo Narrow"',
  '"Arial Narrow"',
  '"Franklin Gothic Medium"',
  '"Helvetica Neue"',
  'Arial',
  'sans-serif',
].join(', ');

export const MONO = [
  'ui-monospace',
  '"Cascadia Mono"',
  '"JetBrains Mono"',
  '"SF Mono"',
  'Menlo',
  'Consolas',
  '"Liberation Mono"',
  'monospace',
].join(', ');

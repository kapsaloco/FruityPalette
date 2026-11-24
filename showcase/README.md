# FruityUI showcase

FruityUI 1.1 is the FruityHash 1.0 foundation plus the reusable additions first
used in FruityPalette. The versioned bundle is independent of the app version.

Run `npm ci` and `npm run build:showcase` once to generate the offline pages.
Double-click `dist-showcase/offline/v1.1/fruity.html` to open the showcase in a
browser. The HTML contains its styles, artwork, and interactive demos. Keep the
`offline` folder together when sharing it so the version and workflow links work.

When editing the showcase, run `npm run dev` and open the [1.1 component
source](v1.1/fruity.html) at `http://localhost:1420/showcase/v1.1/fruity.html`.
The [1.1 file workflows](v1.1/workflow.html) show the existing FruityHash file
selection, progress, results, and comparison fixtures.

## Using 1.1 in another app

Copy the complete `src/styles/fruity/` directory, including its license and
`v1.1/` subdirectory. Import `fruity/v1.1/index.css` once, then put host layout
rules in the `app` cascade layer. The 1.1 stylesheet imports the original 1.0
foundation.

| Reusable addition | Integration |
| --- | --- |
| Glass dropdown | Keep a labeled native select with an ID. Pair it with `-control`, `-trigger`, `-menu`, and `-value` IDs as shown in the example. Call `enhanceSelect(select)` from `v1.1/select.ts`. The select emits a change event on selection. Call the returned sync function after setting the value programmatically. Allow space for the overlay and place its open panel above adjacent glass panels. |
| Color picker controls | Use `fr-sv-picker` with its marker and a native input with `fr-hue-slider`. The helpers in `v1.1/color-controls.ts` provide painting, pointer capture, and arrow-key handling. The host supplies color state, accessible value text, and any history. Saturation and value are fractions between zero and one. |
| Swatches and chips | Use `fr-color-swatch` for a large sample or `fr-color-chip` for a small sample. Choose `--preview` or `--compact` for the display variants and set `--fr-swatch-color`. Pair the color with a readable label. |
| Contrast sample | Use `fr-contrast-sample` to show large and normal text in the host's chosen foreground and background colors. The host computes any contrast result. |
| Glass scrollbar | Add `fr-glass-scrollbar` to an element with a constrained height. |
| Glass disclosure header | Add `fr-disclosure--glass` to the existing `fr-disclosure` details element. |
| Inline feedback | Use `fr-field-error` for an input error, `fr-status-strip` for live status, and `fr-action-notice` with `fr-action-notice__body` for a message paired with a control. |
| Field divider | Add `fr-field-divider` to a field group or action row to separate it with a subtle glass rule. |
| Destructive actions | Add `fr-button--danger` for a destructive primary action or `fr-button--danger-hover` for a neutral action that turns red on hover. Use the existing dialog component for confirmation. |

The original buttons, panels, tabs, inputs, dialogs, disclosures, titlebar,
file chooser, and footer remain part of 1.0. FruityPalette composes them with the
new primitives. Its recent and saved palette lists, contrast checker, image
sampler, wallpaper, and desktop commands stay in the app.

The 1.1 showcase includes the changelog and links to the
[archived 1.0 components](v1.0/fruity.html) and
[archived 1.0 file workflows](v1.0/workflow.html).

When a Fruity app introduces a reusable UI element, give FruityUI the next
minor version. Carry the earlier examples forward, demonstrate each addition,
update the changelog, and link the previous showcase from the new one.

# Tiny Tile Studio

Tiny Tile Studio is a standalone browser-based pixel editor that works from local files. Open `index.html` in your browser and you can:

- Pick any grid size up to 128 x 128
- Paint full tiles by clicking or dragging
- Use a color wheel, type hex codes, and save favorite swatches
- Switch to an eyedropper or eraser for transparent cells
- Load a PNG directly as a pixel grid, including fully transparent cells
- Export PNG, WebP, JPEG, SVG, or a reusable JSON project file

## Opening it

1. Open `/Users/dantasqu/Downloads/CODEX/tiny-tile-studio/index.html` in your browser.
2. If you want a bigger or denser board, change the column and row values and click **Resize Grid**.
3. Pick a color, then click or drag on the canvas.

## Export notes

- `PNG`, `WebP`, and `SVG` can preserve transparent empty cells.
- Imported PNGs use one image pixel per grid tile and must be no larger than 128 x 128.
- Semi-transparent imported pixels become solid colors because grid cells are either solid or transparent.
- `JPEG` always flattens to a solid background because JPEG does not support transparency.
- `Project` exports a JSON file you can load back into the app later.

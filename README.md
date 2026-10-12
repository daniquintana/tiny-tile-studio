# Tiny Tile Studio

**[Open Tiny Tile Studio →](https://daniquintana.github.io/tiny-tile-studio/)**

Create pixel art right in your browser. No installation or account needed.

## Features

- **Paint and refine:** brush, eraser, eyedropper, undo, and redo.
- **Choose your colors:** color picker, hex codes, and saved swatches.
- **Arrange artwork:** select, move, copy, and paste regions, with optional snapping to 2, 4, 8, 16, or 32 px grids. Pasted artwork previews under the pointer until you click to place it.
- **Work at your size:** adjustable grids up to 4,096 px per side and 1.5 million total tiles, with zoom and scrolling for larger canvases.
- **Import and export:** load PNG artwork; save PNG, WebP, JPEG, SVG, or an editable JSON project.

## Saving your work

Artwork is edited locally in your browser, and the current project is automatically saved in that browser when local storage is available. Export a **Project** file for a backup you can reload later or move to another browser.

- **PNG, WebP, and SVG** support transparent empty cells.
- **JPEG** uses a solid background.
- **PNG imports** map each image pixel to one tile, within the grid limits above. Fully transparent pixels stay empty; partially transparent pixels become solid colors.

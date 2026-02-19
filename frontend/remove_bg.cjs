const Jimp = require('jimp');
const path = require('path');

const LOGO_PATH = path.join('public', 'logo.png');

async function processLogo() {
    try {
        console.log(`Processing ${LOGO_PATH}...`);
        const image = await Jimp.read(LOGO_PATH);

        // Get image dimensions
        const width = image.bitmap.width;
        const height = image.bitmap.height;

        // Use a simple flood fill from the corners
        // This assumes the background is uniform white (or close to white)
        // and the logo text/icon is NOT connected to the corners by white pixels.
        // If text is white and connected, this might erase text. 
        // The previous analysis suggests logo is centered with padding.

        const queue = [];
        const visited = new Set();

        // Add corners and edges (assuming background touches edges)
        // Add all edge pixels
        for (let x = 0; x < width; x++) {
            queue.push({ x, y: 0 });
            queue.push({ x, y: height - 1 });
        }
        for (let y = 0; y < height; y++) {
            queue.push({ x: 0, y });
            queue.push({ x: width - 1, y });
        }

        // Process queue
        while (queue.length > 0) {
            const { x, y } = queue.pop();
            const key = `${x},${y}`;
            if (visited.has(key)) continue;

            if (x < 0 || x >= width || y < 0 || y >= height) continue;

            visited.add(key);

            const color = Jimp.intToRGBA(image.getPixelColor(x, y));

            // Is this pixel white-ish?
            // Tolerance: R, G, B > 240
            // Adjust tolerance if needed. The screenshot looked very white.
            if (color.r > 230 && color.g > 230 && color.b > 230 && color.a > 0) {
                // Yes, it's white background. Make transparent.
                image.setPixelColor(Jimp.rgbaToInt(0, 0, 0, 0), x, y);

                // Add neighbors
                queue.push({ x: x + 1, y });
                queue.push({ x: x - 1, y });
                queue.push({ x, y: y + 1 });
                queue.push({ x, y: y - 1 });
            }
        }

        // Save
        await image.writeAsync(LOGO_PATH);
        console.log('Logo saved with transparent background.');

    } catch (error) {
        console.error('Error processing logo:', error);
    }
}

processLogo();

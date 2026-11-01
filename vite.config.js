import { defineConfig } from 'vite';

// Vite hanya dipakai untuk preview pengembangan HTML, CSS, dan JavaScript.
export default defineConfig({
  // Path relatif membuat aset tetap berfungsi di alamat GitHub Pages /nama-repo/.
  base: './',
});

import { defineConfig } from 'vite'
// https://vitejs.dev/config/
export default defineConfig({
  build:{
    emptyOutDir: false,
    rollupOptions:{
      input:{
        content: "./content-script/content-script.ts",
        "content-main": "./content-script/main.ts",
        "content-css": "./content-script/content.css",
      },
      output:{
        entryFileNames: "assets/[name].js",
        assetFileNames: "assets/[name].[ext]"
      }
    },
  }
})
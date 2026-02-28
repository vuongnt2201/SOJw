import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

export default defineConfig({
  plugins: [react()],
  // If you deploy to GitHub Pages under a subpath, set base later, e.g.:
  // base: '/your-repo-name/',
})


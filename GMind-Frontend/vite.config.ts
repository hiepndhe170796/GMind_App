import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5194',
        changeOrigin: true,
        configure(proxy) {
          proxy.on('error', (_error, _request, response) => {
            if ('writeHead' in response && !response.headersSent) {
              response.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
              response.end(JSON.stringify({
                success: false,
                code: 'API_UNAVAILABLE',
                message: 'Không thể kết nối máy chủ GMind. Hãy chạy GMind.API trong Visual Studio rồi thử lại.',
              }));
            }
          });
        },
      },
    },
  },
})

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true, // cho phép truy cập từ điện thoại/máy khác cùng mạng LAN khi dev
  },
});

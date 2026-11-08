import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: [
      'src/__tests__/Login.test.jsx',
      'src/__tests__/RegisterUser.test.jsx',
      'src/__tests__/ForgotPassword.test.jsx',
      'src/__tests__/ServiceManagement.test.jsx',
    ],
  },
})

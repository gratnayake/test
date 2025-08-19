module.exports = {
  apps: [
    {
      name: 'oracle-backend',
      script: 'backend/server.js',
      cwd: './',
      env: {
        NODE_ENV: 'production',
        PORT: 5001
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      error_file: './logs/backend-error.log',
      out_file: './logs/backend-out.log',
      log_file: './logs/backend-combined.log'
    },
    {
      name: 'oracle-frontend',
      script: 'serve',
      args: '-s frontend/build -l 3000',
      cwd: './',
      env: {
        NODE_ENV: 'production'
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M'
    }
  ]
};
module.exports = {
  apps: [
    {
      name: 'baileys-api',
      script: 'lib/server.js',
  cwd: '/home/ubuntu/baileys',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3333
      },
      env_production: {
        NODE_ENV: "production"
      },
      // keep logs managed by pm2; we also keep wa-logs.txt produced by app
  error_file: '/home/ubuntu/baileys/logs/pm2-err.log',
  out_file: '/home/baileys/logs/pm2-out.log',
      merge_logs: true,
      autorestart: true
    }
  ]
}
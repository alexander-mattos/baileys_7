module.exports = {
  apps: [
    {
      name: 'baileys-api',
      script: 'lib/server.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
}

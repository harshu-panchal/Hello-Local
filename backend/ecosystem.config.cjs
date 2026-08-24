module.exports = {
  apps: [
    {
      name: "backend",
      cwd: __dirname,
      script: "dist/server.js",
      interpreter: "node",
      watch: false,
      env: {
        NODE_ENV: "production",
      },
      // `pm2 ... --env production` resolves this block. It was missing, so the
      // flag silently fell back to `env`. Both are now correct.
      env_production: {
        NODE_ENV: "production",
      },
    },
  ],
};

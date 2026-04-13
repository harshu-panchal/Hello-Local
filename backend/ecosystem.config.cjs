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
    },
  ],
};

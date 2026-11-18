// cwd matters: dotenv/config reads .env from the process cwd.
module.exports = {
  apps: [
    {
      name: "transport",
      script: "dist/server.js",
      cwd: __dirname,
    },
  ],
}

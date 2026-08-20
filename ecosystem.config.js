// pm2 process definition. Run the app via this file instead of
// `pm2 start npm -- start` so it runs in cluster mode: pm2 forks 2 Node
// processes that share the same port (pm2 handles the port-sharing), so if
// one process crashes or is momentarily busy, the other keeps serving
// requests -- no more brief site-wide outage from a single bad request
// crashing the one and only process.
//
// Deploy: `pm2 delete strivo` (if an old single-process one is running),
// then `pm2 start ecosystem.config.js` from the repo root, then `pm2 save`.
module.exports = {
  apps: [
    {
      name: "strivo",
      script: "node_modules/next/dist/bin/next",
      args: "start",
      cwd: __dirname,
      exec_mode: "cluster",
      instances: 2,
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};

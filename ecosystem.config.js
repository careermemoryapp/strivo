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
      // Added 2026-09-06: with real launch traffic now hitting the server,
      // free RAM has been trending down (server is a small instance -- see
      // the admin Security Status panel's "Server has headroom" check). If
      // either worker's memory footprint ever balloons (a request that
      // leaks, a slow client holding a big response in memory, etc.), pm2
      // now kills and restarts JUST that one worker once it crosses 450MB,
      // instead of the whole box running low on RAM, falling into swap, and
      // going slow or 502ing for everyone -- the same kind of outage seen
      // earlier today. The other cluster worker keeps serving traffic
      // during the ~1-2s restart, so this is invisible to users.
      max_memory_restart: "450M",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};

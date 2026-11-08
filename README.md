# HelpNearby Project

HelpNearby is a local university project for requesting and offering community help in Muscat. Run it on your own machine. It is not set up for hosting or deployment.

## Requirements


- Node.js
- The shared `server/.env` file
- The dependencies in `client/` and `server/`

The `.env` file is shared privately with the team. It is not stored in Git. Place that file at `server/.env` before starting the API. Do not commit it.

The API reads `MONGODB_URI`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, and `OPENROUTESERVICE_API_KEY` from that file before it connects to MongoDB or creates the mail transport.

## Install and run

From `server`:

```bash
npm install
npm run dev
```

The API listens at `http://localhost:5000`. `npm start` runs it once, without restarting on file changes.

From `client`:

```bash
npm install
npm run dev
```

Open `http://localhost:5173`. The interface calls the API and Socket.IO at `http://localhost:5000`.

## Checks

From `client`:

```bash
npm test
npm run build
```

`npm test` runs the existing suite. `npm run build` checks that the interface compiles. Neither command publishes the project.

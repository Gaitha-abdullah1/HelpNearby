# HelpNearby

HelpNearby is a local university project. Run the API and the React app on your own machine. It is not set up for hosting or deployment.

## Requirements

- Node.js
- The dependencies in `client/` and `server/`
- A MongoDB database the API can reach
- The shared `server/.env` file, placed in the `server` folder

The API reads that file before it connects to MongoDB or creates the mail transport. Do not commit `.env`. Setup for the whole project is in the repository README.

## Start the API

From the `server` folder:

```bash
npm install
npm run dev
```

`npm start` runs the same server without automatic restart. The API listens at `http://localhost:5000`.

## Start the interface

From the `client` folder:

```bash
npm install
npm run dev
```

Open `http://localhost:5173`. The interface calls the API and Socket.IO at `http://localhost:5000`.

## Check the project

From the `client` folder:

```bash
npm test
npm run build
```

The test command runs the existing suite. The build command checks that the interface compiles. It does not publish the project.

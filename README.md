# CU Bank

CU Bank is a small banking web app: register, log in, deposit, withdraw, transfer and pay bills. In this repo it is the **system under test** for our software testing team project, and we write test scenarios and automated tests against it.

- **Frontend:** React 18 (Create React App) on <http://localhost:3000>
- **Backend:** Express + Mongoose REST API on <http://localhost:4000/api/v1>
- **Database:** MongoDB 8.0 on `127.0.0.1:27017`, database `cubank`

> [!IMPORTANT]
> Don't change the app code in `backend/` or `frontend/src/`. The bugs in it are there on purpose, so our tests have something to find. If something won't start, fix the scripts or the config.

## Quick start

```bash
git clone https://github.com/Saannddy/cu-bank-testing.git
cd cu-bank-testing
./setup.sh   # once
./start.sh   # every time you want to run the app
```

Open <http://localhost:3000> once the terminal shows `✓ CU Bank is running`. Press `Ctrl+C` to stop everything.

## Requirements

You need macOS, Linux, or Windows with WSL (Ubuntu), plus `curl` and an internet connection for the first setup. `setup.sh` fills in anything else that's missing. It installs nothing system-wide and never asks for `sudo`.

| Tool | If you already have it | If you don't |
| --- | --- | --- |
| Node.js 20–25 | Used as is | Node 24 is downloaded into `.tools/node` |
| Docker ([OrbStack](https://orbstack.dev) or Docker Desktop) | MongoDB runs in the `cubank-mongo` container | A portable MongoDB 8.0 is downloaded into `.tools/mongodb` |

On macOS, if OrbStack or Docker Desktop is installed but not running, the scripts start it for you.

## Setup: `./setup.sh`

Run it once after cloning. It's safe to run again, for example after pulling new dependencies or switching how MongoDB runs. It does four things:

1. **Node.js:** checks for Node 20–25 and installs Node 24 into `.tools/` if it's missing.
2. **Config:** creates `backend/config/config.env` if it doesn't exist, and adds `MONGO_URI` if that line is missing.
3. **MongoDB:** picks the first option that works:
   - the remote database, if `MONGO_URI` points somewhere other than localhost
   - the `cubank-mongo` Docker container, if it's already running
   - a MongoDB that's already listening on port 27017
   - Docker: pulls the `mongo:8.0` image
   - otherwise, a portable `mongod` in `.tools/`
4. **Dependencies:** runs `npm install` in `backend/` and then `frontend/`. The frontend install takes a few minutes the first time.

## Start: `./start.sh`

`start.sh` starts MongoDB, the backend and the frontend, and streams the backend and frontend logs into one terminal with `[backend]` and `[frontend]` prefixes.

- **Restart:** run `./start.sh` again from any terminal. It stops the previous run first, including a backend or frontend you started by hand from this folder.
- **Stop:** press `Ctrl+C`. That stops the backend, the frontend and the MongoDB that `start.sh` started.
- **If one part crashes,** the others stop too, and the terminal shows which one died.

| Service | URL |
| --- | --- |
| App | <http://localhost:3000> |
| API | <http://localhost:4000/api/v1> |
| MongoDB | `mongodb://127.0.0.1:27017/cubank` |

## Automated UI tests (Playwright)

The 8 test scenarios from the project brief live in [`tests/`](tests/), one file per scenario. Install the test tools once, from the repo root. This also downloads Playwright's Chromium:

```bash
npm install
```

By default a browser window opens and each step is slowed down, so you can watch the scenario run. If the app isn't running yet, the tests start it with `./start.sh` and stop it afterwards.

| Command | What it runs |
| --- | --- |
| `npm test` | All 8 scenarios, one browser window at a time |
| `npm run s1` … `npm run s8` | One scenario |
| `npm run scenario:all` | All 8 scenarios, then the failure summary (same as `npm test`) |
| `npm run scenario -- 1 3 5` | The scenarios you pick |
| `npm run test:fast` | All 8 scenarios, no browser window, in parallel |
| `npm run test:ui` | Playwright's UI mode: tick the scenarios to run and replay each step |
| `npm run report` | Open the HTML report of the last run (screenshot of every test, "Actual output" for rejected inputs) |

- **One test case:** `npm run s5 -- -g TC05_009`
- **Slower or faster:** `SLOWMO=1000 npm run s5` (milliseconds per step; the default is 400)
- **Another browser:** `TEST_BROWSER=dia npm test`. To keep your choice, copy [`.env.example`](.env.example) to `.env` and set it there; `.env` isn't committed, so each teammate can pick their own.

| `TEST_BROWSER` | Browser |
| --- | --- |
| `chromium` (default) | Playwright's Chromium, downloaded by `npm install` |
| `chrome`, `edge` | Google Chrome or Microsoft Edge installed on your computer |
| `dia` | Dia in `/Applications` (macOS). Always runs without a window, because Dia doesn't show pages opened by test tools; use `chromium` or `chrome` to watch |
| `brave` | Brave in `/Applications` (macOS) |
| `firefox`, `webkit` | Playwright's Firefox, or WebKit (Safari's engine). Download it first with `npx playwright install firefox` (or `webkit`) |
| a full path | Any other Chromium-based browser, e.g. `TEST_BROWSER="/Applications/Arc.app/Contents/MacOS/Arc"` |

The tests always run in a fresh, empty profile, so your own tabs, logins and extensions aren't touched.

Expected messages come from the requirements in the project brief, so a failing test means the app doesn't match them. Each failure shows what the user expected and what they saw. Every run ends with a **failure summary** that groups the failed tests by cause: message typos (only the final "." differs, or different wording), the browser blocking the form before the app could check it, a transaction that went through when it should have been refused, and anything else. Every test registers fresh random account numbers, so you can rerun the tests without resetting the database.

## Configuration

The backend reads its settings from [`backend/config/config.env`](backend/config/config.env):

```ini
PORT = 4000
NODE_ENV = development
MONGO_URI = mongodb://127.0.0.1:27017/cubank
JWT_SECRET = system_testing
JWT_EXPIRE = 30d
JWT_COOKIE_EXPIRE = 30
```

To use a remote database such as MongoDB Atlas, change `MONGO_URI` and run `./setup.sh` again. Keep ports `3000` and `4000` as they are: the frontend calls `http://localhost:4000` directly, and the backend only accepts requests (CORS) from `http://localhost:3000`.

## API endpoints

Every path starts with `http://localhost:4000/api/v1`. Routes marked 🔒 need the JWT you get back from `login`.

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/auth/register` | Create an account |
| `POST` | `/auth/login` | Log in and get a JWT |
| `GET` | `/auth/me` 🔒 | Get the logged-in user |
| `GET` | `/auth/logout` | Log out |
| `GET` | `/transactions` 🔒 | Get the logged-in user's account |
| `GET` | `/transactions/:id` 🔒 | Get one account by ID |
| `PUT` | `/transactions` 🔒 | Make a transaction (deposit, withdraw, transfer, bill payment) |

## Repo tree

```text
cu-bank-testing/
├── README.md
├── CU_Bank_instruction-*.pdf     # project brief and requirements
├── setup.sh                      # one-time setup: Node, config, MongoDB, npm install
├── start.sh                      # starts or restarts MongoDB, backend and frontend
├── docker-compose.yml            # MongoDB 8.0 container (cubank-mongo)
├── package.json                  # Playwright test commands (npm test, npm run s1 …)
├── playwright.config.ts          # browser choice, slow motion, screenshots, auto-start
├── .env.example                  # copy to .env to set TEST_BROWSER / SLOWMO for yourself
├── tsconfig.json                 # editor type checking for the tests
├── tests/
│   ├── scenario-1-register-fail.spec.ts … scenario-8-full-journey.spec.ts
│   └── support/
│       ├── cubank.ts             # page helpers, API set-up, expected messages
│       └── failure-summary-reporter.ts  # groups failed tests by cause at the end of a run
├── scripts/
│   ├── common.sh                 # helpers shared by setup.sh and start.sh
│   └── scenario.mjs              # npm run scenario -- 1 3 5 / npm run scenario:all
├── backend/                      # Express API (:4000)
│   ├── server.js                 # app entry: middleware, routes, CORS
│   ├── config/
│   │   ├── config.env            # PORT, MONGO_URI, JWT settings
│   │   └── db.js                 # Mongoose connection
│   ├── controllers/
│   │   ├── auth.js               # register, login, me, logout
│   │   └── transactions.js       # account lookup and transactions
│   ├── middleware/
│   │   ├── auth.js               # JWT check (protect)
│   │   └── validateBalance.js    # checks the balance before a transaction
│   ├── models/
│   │   └── User.js               # user and account schema
│   └── routes/
│       ├── auth.js
│       └── transactions.js
├── frontend/                     # React app (:3000)
│   ├── public/                   # index.html, icons, manifest
│   └── src/
│       ├── App.js                # router and navbar
│       ├── index.js
│       ├── layout/
│       │   ├── Login.js
│       │   ├── Register.js
│       │   └── Account.js        # balance, deposit, withdraw, transfer, bill payment
│       ├── services/
│       │   ├── auth.service.js     # calls to /api/v1/auth
│       │   ├── account.service.js  # calls to /api/v1/transactions
│       │   └── auth-header.js
│       ├── ui/                   # Card component and its styles
│       ├── NotFound.js
│       └── useFetch.js
└── .tools/                       # created by setup.sh, gitignored (Node, MongoDB, mongo-data)
```

## Troubleshooting

| Error message | What to do |
| --- | --- |
| `Run ./setup.sh first.` | Run `./setup.sh`, then `./start.sh`. |
| `Port 3000/4000 is used by another program` | Close the program shown in the message, then run `./start.sh` again. |
| `Docker is not running` | Open OrbStack or Docker Desktop, then run `./start.sh` again. |
| `MongoDB failed to start` | Read `.tools/mongod.log` (portable MongoDB only). |
| Frontend stays stuck at "Starting the development server" | The first build can take a minute or two. Wait for `✓ CU Bank is running`. |

**Reset the database:**

- Docker: run `docker compose down -v`.
- Portable MongoDB: stop the app, then delete `.tools/mongo-data`.

**Start over completely:** delete `.tools/`, `backend/node_modules` and `frontend/node_modules`, then run `./setup.sh` again.

## Running without the scripts

If you'd rather run each part yourself, use three terminals:

```bash
docker compose up -d mongo              # or any MongoDB on 127.0.0.1:27017
cd backend  && npm install && npm start
cd frontend && npm install && npm start
```

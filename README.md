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
├── scripts/
│   └── common.sh                 # helpers shared by setup.sh and start.sh
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

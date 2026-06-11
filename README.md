# Signal Paint

Signal Paint is a local-network collaborative visualizer. Open the stage on one browser, open controllers from phones or laptops on the same Wi-Fi, and draw animated color ripples through WebSocket messages.

## Requirements

- Node.js 20 or newer
- npm

## Install

```sh
npm install
```

## Start In Development

```sh
npm run dev
```

The server listens on port `3000`.

Open the stage on the host machine:

```txt
http://localhost:3000/stage
```

Open the controller on the host machine:

```txt
http://localhost:3000/controller
```

## Use From Another Device

Make sure the other device is on the same Wi-Fi network. Find the host machine's LAN IP address, then open:

```txt
http://LAN_IP_ADDRESS:3000/controller
```

For example, if the host machine is `192.168.88.3`:

```txt
http://192.168.88.3:3000/controller
```

If the page does not load from another device, check that the host firewall allows inbound TCP traffic on port `3000`.

## Stop The Server

Press `Ctrl+C` in the terminal running `npm run dev`.

If the process was started in the background, find and stop it:

```sh
ps -eo pid,comm,args | grep "node server.mjs"
kill PID
```

## Production Build

Build the app:

```sh
npm run build
```

Start the production server:

```sh
npm run start
```

## Checks

Run TypeScript validation:

```sh
npm run typecheck
```

Run a production build check:

```sh
npm run build
```

## Routes

```txt
/            app entry links
/stage       fullscreen Three.js visual stage
/controller  phone/laptop controller
/ws          WebSocket relay
```

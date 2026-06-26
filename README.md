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

Open WLED sync controls:

```txt
http://localhost:3000/wled
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

## Live Audio Input

The stage can use any browser audio input as its live visual source. A USB mixer
or line-in interface appears in the stage input selector the same way a
microphone does. Browser audio input access works on `localhost` or on HTTPS
pages; plain HTTP pages on another host are usually blocked by the browser.

For mixer audio, use an output labeled `Main Out`, `Control Room Out`,
`Monitor Out`, `Aux Send`, `Tape Out`, `Rec Out`, or `Line Out`. Do not connect
a speaker output to a USB audio input. Start the mixer output low and raise it
until the visualizer responds without staying pinned at maximum.

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
/wled        WLED audio-sync output controls
/ws          WebSocket relay
```

## WLED Audio Sync

On the WLED device, open `Config → Usermods → AudioReactive`, enable
AudioReactive, set Audio Sync to `Receive`, and use port `11988`. Select an
audio-reactive effect such as Gravimeter or GEQ.

The `/wled` page defaults to multicast `239.0.0.1:11988` and can instead send
directly to one WLED IPv4 address. Settings are stored under
`data/wled/config.json`, but output must be enabled again after each server
restart. UDP has no receiver acknowledgement, so the page can confirm local
packet output but cannot confirm delivery to the strip.

# SoulSisters

No woman travels alone. SoulSisters walks her up three steps:

1. **Together**: find verified women going the same way, and travel together or meet at a public stop.
2. **Watched**: her trusted circle sees her live on a map. If she stops moving, the app asks "Are you okay?" and alerts her circle if she doesn't answer in 30 seconds.
3. **On a call**: a fake call from "Mummy" in Hindi or English, powered by AI, that sounds like someone is waiting for her.

The **SOS** button is on every screen. Saying the code word during the call, or tapping Keypad, sends an SOS quietly.

## Run it

Needs Node.js 18 or newer. There is nothing to install.

```bash
cp .env.example .env      # then paste your RouterPlus API key into .env
node server.js
```

Open http://localhost:3000 in Chrome or Edge. Without an API key, the call uses pre-written lines so the app still works.

The voice is the browser's built-in voice. **Microsoft Edge sounds most natural** because it has free "Natural" Hindi and Indian English voices.

## Demo script (3 minutes)

1. Airport to Indiranagar at 11:30 PM. Tap **Find travel companions**: Ananya and Sneha match. Tap **Travel together** with Ananya.
2. On the map screen, tap **Copy link** and open it in another tab, adding `&v=Mummy` to the end. The app now shows "Mummy can see you live".
3. Wait about a minute: the simulated trip pauses and the app asks **"Are you okay?"** Tap **Get a call**.
4. Answer Mummy's call. Switch between **Hindi** and **English**. Say "I forgot my charger" (or tap **Keypad**): the tracker tab turns red while Mummy keeps talking.
5. End the call to see the **SOS active** screen. Tap **I am safe now** and enter PIN **1234**.

## Settings

Tap **Edit** next to "Your trusted circle" to add people with their WhatsApp numbers, change the code word or the safe PIN, and turn the simulated journey on or off. Settings are saved on the phone.

## Who owns what

| Person | Area | Files |
|---|---|---|
| 1 | App shell, plan-trip screen, design | `server.js`, `public/index.html`, `public/css/styles.css`, `public/js/app.js`, `public/js/core.js` |
| 2 | Travel together | `server/matching.js`, `server/areas.js`, `data/companions.json`, `public/js/companions.js` |
| 3 | Live location, circle, check-in, SOS, tracker page | `server/trips.js`, `public/js/sharing.js`, `public/js/watch.js`, `public/js/sos.js`, `public/track.html`, `public/js/track.js` |
| 4 | Fake family call | `server/ai.js`, `public/js/call.js` |

`core.js` and `index.html` are shared. Tell the team before changing them.

## What's real and what's mocked

Real: trips, live location (GPS or simulated), per-contact tracking links that show who is watching, the stopped-moving check-in, SOS and "seen by", audio recording during SOS, the safe PIN, the AI call with Hindi/English, voice input in Chrome/Edge, the code word and the Keypad SOS.

Mocked for the hackathon (marked "Demo" in the app): companion profiles and their replies, nearby women joining, and the police station call. There are no accounts or ID checks, and data resets when the server restarts.

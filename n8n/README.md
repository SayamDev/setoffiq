# Optional local automation

**SetoffIQ does not need this.** The published application works entirely on its
own. This folder exists to show how the monitoring loop could run outside the
browser, using self-hosted [n8n](https://n8n.io/) on your own machine.

It is included because the browser has one honest limitation: it cannot check a
flight while it is closed. A local scheduler can.

## Why it is optional and not built in

- The public site must not depend on anyone's machine, and a workflow running on
  a laptop is exactly that kind of dependency.
- Hosted automation platforms charge at volume, which would break the £0 rule.
- n8n self-hosted is free and open-source, so running it yourself costs nothing —
  but it is your choice, not a requirement.

## What the workflow does

```
Schedule trigger (every 15 minutes)
        ↓
Fetch the flight position snapshot
        ↓
Find the aircraft for the monitored callsign
        ↓
Estimate arrival from position and ground speed
        ↓
Compare with the last estimate
        ↓
If it moved by more than the threshold → emit a change event
```

It deliberately stops at emitting an event. Delivering that event — a desktop
notification, a webhook, a message — is left to you, because every option that
would deliver it *for* you costs money.

## Running it

```bash
docker run -it --rm -p 5678:5678 -v n8n_data:/home/node/.n8n docker.n8n.io/n8nio/n8n
```

Open http://localhost:5678, import `journey-monitor.json`, and set the
`CALLSIGN` and `SNAPSHOT_URL` values in the Configuration node.

The snapshot URL can point at the published site
(`https://sayamdev.github.io/setoffiq/data/flights/EGCC-arrivals.json`), so the
workflow costs nothing and adds no load to OpenSky — it reads the same static
file the app does.

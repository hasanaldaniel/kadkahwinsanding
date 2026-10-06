# Kad Kahwin

A customisable digital wedding invitation card for a Malay Muslim wedding, with an admin panel.

## Run it

Needs Node.js 18 or newer. There is nothing to install.

```
node server.js
```

- Card: http://localhost:3000
- Admin panel: http://localhost:3000/admin (first password: `admin123`)

Change the password under **Admin > Settings** before sharing the card.

## What guests get

- Opening cover with an animated reveal, then the invitation, event details, countdown and programme
- Google Maps and Waze buttons for the venue
- Attire theme with colour swatches and an optional reference image
- RSVP form; afterwards a "save to calendar" step (Google Calendar or an .ics file for Apple/Outlook) with directions
- Wishes written in the RSVP form, scrolling continuously
- Salam kaut: bank details, copy-account-number button and an uploaded QR image
- Gift list where a guest reserves a gift so nobody buys the same thing twice
- Thank-you section with a button that lists family contacts (WhatsApp and call)

## What the admin panel does

| Tab | Use |
| --- | --- |
| Content | Every text, date, venue, programme item, contact and label, with section on/off switches |
| Design | Colour theme or your own colours (picker or hex code), fonts, background pattern, opening card design, welcome section shape and decorative frame, floating effect, scroll animation |
| Gifts | Add gifts with photo, price and shop link; see who reserved what; release a reservation |
| RSVPs | Totals, search, hide a wish from the card, delete, **Export to Excel** |
| Settings | Card link to share, change password |

Edits show immediately in the phone preview and go live when you press **Save changes**.

## Putting it online

Deploy to any host that runs Node and keeps files on disk (a VPS, Railway or Render with a persistent disk/volume, Fly.io with a volume). Start command: `node server.js`.

| Variable | Purpose | Default |
| --- | --- | --- |
| `PORT` | Port to listen on | `3000` |
| `DATA_DIR` | Folder for `db.json` and uploaded images. Point this at the persistent disk. | `./data` |
| `ADMIN_PASSWORD` | Admin password used the first time the server starts | `admin123` |

Serverless or static hosts (Vercel, Netlify, GitHub Pages) will not work as-is, because RSVPs are stored in a file.

All data lives in `DATA_DIR`. Back up that folder to back up the card. If you forget the password, delete the `"auth"` block from `db.json` and restart; the password resets to `ADMIN_PASSWORD`.

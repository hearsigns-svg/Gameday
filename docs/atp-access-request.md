# ATP / TDI authorised-access request — draft for the owner to send

**To:** contact@tennisdata.com (Tennis Data Innovations)
**Cc / fallback:** info@atpmedia.tv (ATP Media)
**Subject:** Schedule data — licence or permission enquiry (KickOffCal, calendar app)

---

Hello,

I build KickOffCal, a consumer app that puts sports fixtures into the
user's own phone calendar and keeps them correct when schedules move.
Tennis is one of eleven sports we carry.

Women's matches come from the WTA's API. For the ATP we currently show
tournament-level entries only, taken once a day from the Tennis TV
subscription calendar. I'd like to cover the men's tour properly, and
I'd rather ask for the authorised route than improvise one.

What we need: draws, order of play, player identities and opponents,
rounds, scheduled times, and subsequent schedule changes. No scores, no
odds, no streaming.

How we'd use it: one server-side fetcher, identified by name and
contact address, rate-limited, caching centrally so that user numbers
don't multiply requests. Scheduling fields become calendar events on the
user's device. Nothing is used to train models.

Could you point me to whichever fits:

- an ATP or TDI schedule feed appropriate to this use;
- written permission and technical access for a low-frequency,
  identified fetcher; or
- the right contact for data licensing, if that isn't you.

Happy to work to your terms, volume limits and attribution.

Best regards,

[name]
KickOffCal — hearsigns@gmail.com

---

## Where the contacts came from

- **contact@tennisdata.com** — printed in the GlobeNewswire release
  *"Sportradar Wins Major Bid for ATP Rights"*, 13 March 2023, which
  also describes TDI as overseeing *"the central management and
  exploitation of tennis data in a variety of markets, both betting and
  non-betting"*. TDI is the ATP / ATP Media joint venture that holds the
  tour's data rights, so it is the licensing route rather than a press
  desk. tennisdata.com itself is Cloudflare-challenged, so the address
  could not be confirmed on their own site.
- **info@atpmedia.tv** — published on ATP Media's own contact page
  (atpmedia.tv/contact), with a London address and phone number. ATP
  Media operates Tennis TV, whose calendar we already consume once a
  day, so they are the natural second door and the one with an existing
  relationship, however slight.
- **Deliberately not used:** atptour.com's general contact form (a fan
  support channel), and any address obtained from a contact-data broker.

## Deliberately not said

The email does not argue that robots.txt permits us. It invites the
answer *"it permits crawling, not republication"* and starts the
conversation adversarially. The ask is for permission, not a ruling on
whether permission was needed.

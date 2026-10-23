# D5. Platform and storage: Decided (web app first)

**Decision.** Build a free web app that can be installed on the iPhone home
screen, with data in a hosted online database. Keep the door open to a native
iPhone/Mac app later, reusing the same database.

**Why.**
- It costs nothing to run. A native app needs Apple's $99/year Developer
  Program for iCloud sync and for installs that don't expire after 7 days.
- Sharing between household members is simpler: everyone signs in to the same
  household.
- It builds on existing React experience.

**Workarounds considered and rejected.**
- A free Apple account with Xcode installs: the app expires every 7 days and
  can't use iCloud sync. Each family member would have to plug in to the Mac
  weekly.
- AltStore/SideStore: these automate weekly re-signing, but there's no iCloud
  sync, a 3-app limit, a Mac must stay running, and they're hobbyist tools.
- The App Store: still requires the $99/year program, adds app review and a
  privacy policy, and the app is removed if the membership lapses. It's a later
  distribution step, not a way to avoid cost.
- TestFlight: private household installs, but still requires the $99 program,
  and builds expire every 90 days.

**What we give up.** A less polished feel on iPhone, weaker offline support,
and less reliable reminders than native notifications. If these start to
matter, pivot to native (see the comparison below).

**Comparison considered.**

| | Native iPhone/Mac app | Web app (installable on the home screen) |
|---|---|---|
| Where data lives | On the device, synced through the user's own iCloud | In a hosted online database |
| Persistence | Survives closing the app; iCloud keeps phone and Mac in sync | Reliable only with an online database. Browser-only storage can be wiped by iOS after weeks of not opening the site. |
| Works offline | Yes, fully | Mostly not, without extra work |
| One person, several devices | Free and automatic through iCloud | Needs a sign-in |
| Several people sharing one list | Possible through iCloud sharing, but more work to build | Straightforward: everyone signs in to the same household |
| Cost | $99/year Apple Developer Program (needed for iCloud sync and installs that don't expire) | Free tiers cover one household |
| Reminders | Native notifications, very reliable | Work on iPhone only after adding to the home screen; less reliable |
| Prior experience | New (Swift) | Some (React) |

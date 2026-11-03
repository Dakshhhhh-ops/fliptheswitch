# Sibling Shift

**Three siblings, three cities, one father's medicines.**

Didi lives in Pune and makes the health decisions. Rohan is in Bengaluru and
takes Papa to the cardiologist. Ananya is in Delhi and handles the pharmacy.
Today that runs on a WhatsApp group, photos of prescriptions, and memory. The
day a cardiologist prescribes *Telsartan* to a father who already takes
*Telma*, nobody notices that they are the same medicine under two brand
names, and Papa takes a double dose of his BP tablet.

Sibling Shift runs the family's care in a [Switch](https://github.com/sandbox-quantum/switch)
room, with three agents beside the siblings.

| Agent | Job | Who can talk to it |
|---|---|---|
| `@papa-sahayak` | Keeps the care board, runs the morning check-in, opens a room for each hospital visit | Everyone |
| `@papa-dawa` | Reads prescription photos and checks them against the list. It flags; it never advises | Everyone |
| `@papa-register` | The only one that changes the medicine list. Logs who approved each change and why, and posts a new pill chart | **Only Didi**, enforced by Switch |

## The story in the demo

1. **Morning.** Ananya says good morning. Sahayak posts today's tablets and
   asks who is with Papa. Ananya marks the morning dose done.
2. **Visit booked.** Rohan tells Sahayak about tomorrow's cardiology visit.
   Sahayak opens `papa-visit-2026-11-05-cardiology`, links it to the family
   room, and posts a checklist with the current list and open questions.
3. **After the visit.** Rohan posts the prescription photo. Dawa reads it,
   checks the reading with Rohan, then runs the checker:
   - **STOP:** Telsartan 40 and Telma 40 both contain telmisartan. Taking
     both doubles it. Ask Dr. Rao whether Telsartan replaces Telma.
   - **ASK:** Rozavel 10 and Storvas 10 are both statins. Does one replace
     the other?
   - Clopilet 75 is not flagged.
4. **Rohan tries a shortcut.** "@papa-register remove Telma." Switch refuses:
   Register only takes orders from Didi.
5. **Didi decides.** She calls Dr. Rao, then tells Register: replace Telma 40
   with Telsartan 40, and Storvas 10 with Rozavel 10, with the reason. Register
   changes the list, logs the decision, posts a new big-text pill chart in
   Hindi and English, and Sahayak updates the board.

## Why it needs Switch

| Switch feature | What it does here |
|---|---|
| Rooms shared by people and agents | Three siblings and three agents work in one family room |
| Agents creating rooms (`create_room`, `link_rooms`) | Sahayak opens a private room per hospital visit, linked to the family room |
| Addressing policy `owner` | Only the decision-maker can change the medicine list. Switch refuses everyone else, so the agent never has to judge who is allowed |
| Room documents | "Care board", "Medicine list" and "Decision log" can only be edited by the agent that wrote them, so nobody can quietly change the list |
| Attachments | Prescription photos go to Dawa; Register posts the pill chart file back |
| Template | One form creates the three agents, the family room and the kickoff |

## Safety

- **All data is made up**: the family, the doctor, the clinic and the
  prescription.
- **What a medicine contains comes from a fixed lookup table**
  ([`data/brands.json`](data/brands.json)), never from the model's memory. A
  brand that isn't in the table is reported as unknown and can't be added to
  the list.
- The checker only flags what the table shows for certain: the same
  ingredient twice (including inside combination tablets) and two medicines
  from the same family. Every flag is a question for the doctor.
- **This is not medical advice.** No agent tells anyone to take, stop or
  change a medicine.

## Run it yourself

You need [Switch Console](https://github.com/sandbox-quantum/switch/releases/latest),
Docker (for the bundled Mattermost), Node 24+, and Claude Code signed in.

```sh
npm test              # the checker, the list tool and the pill chart
npm run check         # the demo prescription against the demo list
npm run reset         # demo list in place; prints the folder for the form
```

1. In Switch Console, add a server on this computer with Mattermost.
2. In Mattermost, create accounts for the two other siblings.
3. Templates → Import `template/sibling-shift.template.yaml`. Fill in the
   folder `npm run reset` printed and the two siblings' usernames. Create.
4. Post [`demo/rx-cardiology.png`](demo/rx-cardiology.png) in the visit room
   from a sibling's account.

## Repository

```
template/sibling-shift.template.yaml   the Switch template: agents, family room, kickoff
tools/med-check.mjs                    checks a prescription against the list
tools/medlist.mjs                      the only way the list changes; pill chart
tools/tools.test.mjs                   tests
data/brands.json                       the brand lookup table
demo/                                  Papa's list and the cardiologist's prescription
scripts/reset.mjs                      puts the demo list back
```

## Limits

- Switch has no scheduled messages yet, so the morning check-in starts when
  someone says good morning rather than at a set time.
- The lookup table holds 15 common brands for the demo. A real one would come
  from a maintained drug database.

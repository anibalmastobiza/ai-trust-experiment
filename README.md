# Trust in AI assistants: an online experiment

Principal investigator: Aníbal Astobiza, University of Granada (UGR). Contact: amastobiza@ugr.es

Static web experiment (HTML, CSS, JavaScript) for GitHub Pages. Responses are sent to a Google Sheet through a Google Apps Script web app. Participants are recruited on Prolific. Estimated duration: 4 to 5 minutes.

## Design

The stimuli imitate an online store product listing (brand, model, star rating, a crossed-out reference value, a discount-style tag and small print), applied to AI assistants instead of consumer goods.

**Block 1. Which attribute depletes trust the most (within subjects).** Full 2 x 2 x 2 factorial: consistency, transparency and explainability, each present or missing. Every participant rates the 8 profiles in random order. Stated accuracy (92%), star rating (4.6, 214 reviews) and evaluation details are identical across listings, so differences in trust can only come from the three attributes. The display order of the three attributes is randomised per participant and held constant across that participant's listings. Each listing is assigned a fictional brand and one of four domains (health, personal finance, career guidance, legal questions), two listings per domain.

Measures per listing: trust (slider 0 to 100, with no visible default position until the participant moves it) and intention to follow the recommendation (yes / no).

**Behavioural pricing tactics transferred to trust (between subjects).**

| Factor | Levels | Pricing analogue |
|---|---|---|
| Anchor | With reference ("previous version 85.0%", crossed out, "+7.0 points", tag "7 POINTS MORE ACCURATE") / without | Crossed-out list price and "$200 OFF" |
| Frame | Accuracy (92.0%) / error rate (8.0%) | Attribute framing |
| Decoy (Block 2) | None / decoy of the target / decoy of the competitor | Decoy effect (The Economist subscriptions) |

**Block 2. Decoy effect.** Choice of an assistant for a medical treatment decision. Target: 90% accuracy, explains, discloses. Competitor: 95% accuracy, does not explain, does not disclose. Decoy of the target: 87%, explains, does not disclose (dominated only by the target). Decoy of the competitor: 92%, does not explain, does not disclose (dominated only by the competitor). Option positions are randomised.

**Demographics.** Age, gender, education, country of residence, frequency of AI assistant use, self-rated AI knowledge (1 to 5), general trust in new technologies (1 to 7), and one attention check (select 2).

**Consent.** Information is shown on the first screen; consent is given by clicking "Start the study". The end screen only thanks the participant. No completion code is shown and no debriefing is given.

## Files

| File | Purpose |
|---|---|
| `index.html`, `style.css`, `app.js` | The experiment |
| `config.js` | Apps Script URL. Empty means test mode (nothing is sent; data are printed to the console) |
| `apps-script/Code.gs` | Receives the data and writes two tabs: `participants` (one row per person) and `cards` (one row per rated listing) |
| `analysis/analysis.R` | Mixed models, attribute comparisons, decoy analysis, figure |

## Setup

### 1. Google Sheet and Apps Script

The response spreadsheet already exists: [AI trust experiment - responses](https://docs.google.com/spreadsheets/d/1GAQ4YaDsvSRpLqDaO9803m2qjf4FMIaWBKBbhNEb76Y/edit). `Code.gs` writes to it by ID.

1. Open the spreadsheet and go to Extensions > Apps Script.
2. Replace the content of `Code.gs` with `apps-script/Code.gs` and save.
3. The `participants` (53 columns) and `cards` (17 columns) tabs and their headers are already in the spreadsheet. `setupSheet` recreates them only if a tab is missing or empty.
4. Deploy > New deployment > type "Web app". Execute as: Me. Who has access: Anyone. Authorise when asked.
5. Copy the web app URL (it ends in `/exec`) into `config.js`, field `endpoint`.

If you edit `Code.gs` later, use Deploy > Manage deployments > Edit > New version, so the URL stays the same.

### 2. GitHub Pages

```bash
git init
```

```bash
git add . && git commit -m "Trust in AI experiment"
```

Create a public repository on GitHub, push, and enable Settings > Pages > Deploy from branch `main`, folder `/ (root)`. The study will be at `https://<user>.github.io/<repository>/`.

The repository contains no participant data: responses live only in the Google Sheet, and `data/` and `results/` are listed in `.gitignore`.

### 3. Prolific

Use the GitHub Pages URL as the study link and choose the option that records Prolific IDs through URL parameters. The study then receives the link as:

```
https://<user>.github.io/<repository>/?PROLIFIC_PID={{%PROLIFIC_PID%}}&STUDY_ID={{%STUDY_ID%}}&SESSION_ID={{%SESSION_ID%}}
```

These three values are saved in the Sheet (`prolific_pid`, `prolific_study_id`, `prolific_session_id`). Because the study shows no completion code, submissions must be approved in Prolific by matching `prolific_pid` against the `participants` tab. Check Prolific's current completion options before launch; this was not verified here.

### 4. Pilot

Open the study link with fake Prolific parameters, complete it, and confirm that one row appears in `participants` and eight in `cards`.

## Analysis

Download each tab as CSV into `data/participants.csv` and `data/cards.csv`, then:

```bash
Rscript analysis/analysis.R
```

Main model: `trust ~ no_consistency + no_transparency + no_explainability + anchor * frame + (1 | pid)`. The coefficient for each `no_*` term is the trust loss (0 to 100 scale) when that attribute is missing; the largest negative coefficient answers the main question. Pairwise Wald tests (Holm-corrected) compare the three losses. A second model includes the attribute interactions; a mixed logistic model analyses intention to follow; a logistic model tests the decoy effect on the share choosing the target.

Pre-set exclusions: failed attention check, duration under 90 seconds, duplicate `pid`. These thresholds should be fixed in a preregistration before data collection.

Run with `--simulate` to test the code on fake data. No power analysis has been run.

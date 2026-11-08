# Game profiles: yaw, vertical multiplier, defaults, FOV

> Research note: the yaw, vertical multiplier, default sensitivity and FOV behind `src/core/game-profiles.ts`. Researched 2026-11-08. Confidence: high for Valorant and CS2 (the values are the same in every table found); each other value carries its own H/M/L tag below, and only Valve's `m_yaw` is developer-documented.

Researched 2026-11-08. Confidence tags: H = several independent sources agree, or developer-documented; M = community consensus, no developer doc; L = single/weak source or sources conflict.

## 1. Answer

**The spec's reference tests are CONSISTENT with the research. No contradiction.**
- Valorant 0.4 @ 800 DPI: `914.4 / (0.07 * 0.4 * 800)` = **40.821 cm/360** (with KovaaK's 0.06996: 40.845). Both round to 40.8. Use `toBeCloseTo(40.8, 1)` (tolerance 0.05) or looser.
- Valorant <-> CS2 Game Sensitivity ratio: `0.07 / 0.022` = **3.1818** (0.06996/0.022 = 3.18). Use `toBeCloseTo(3.18, 2)` (tolerance 0.005) or looser; an exact `3.18` equality would fail.

Yaw = degrees per mouse count at Game Sensitivity 1. **No developer publishes these except Valve's `m_yaw` cvar (Source). Every other value is community-measured**, though the values below are the same in every independent table I could reach.

| Game | yaw (deg/count) | Conf | How the in-game setting scales | Vertical multiplier | Factory default Game Sens | FOV default | FOV axis | FOV basis | Vertical FOV (deg) |
|---|---|---|---|---|---|---|---|---|---|
| Valorant | **0.07** | M-H | linear in "Sensitivity" (0.001 steps) | none, 1:1 | not verified (0.4 widely used) | 103, fixed (no slider) | horizontal | 16:9 | 70.53 |
| CS2 | **0.022** | H (`m_yaw` default 0.022) | linear in `sensitivity` | `m_pitch` 0.022 = 1:1, no UI setting | not verified (1.0 recalled) | 90, fixed | horizontal | **4:3** | 73.74 (=106.26 h @16:9) |
| Apex Legends | **0.022** | M-H (Source family) | linear in "Mouse Sensitivity" | none in UI, 1:1 | not verified | slider 70-110, default **70** (L-M) | horizontal | **4:3**, but slider is not degrees: slider 110 = 108.5 deg (cl_fovScale 1.55) (M-L) | 70 -> 55.41; 110 -> 92.35 |
| Overwatch 2 | **0.0066** | M | linear in "Sensitivity" (2 decimals) | none, 1:1 | not verified (5.00 recalled) | slider 80-103, default **103** (L: one site says 90) | horizontal | 16:9 | 103 -> 70.53 |
| Fortnite | **0.005555 per 1 %** of X sensitivity (type the % shown in menu, e.g. 6.4) | M | linear in X/Y % (5 % = 0.027775 deg/count). eDPI is NOT comparable across games with raw % (use cm/360) | separate Y slider, same scale per % (M-L); 1:1 when Y = X | not verified (sources conflict: 5 %, 75 %) | 80 (M-L) | horizontal | 16:9 | 50.53 |
| Rainbow Six Siege | **0.00572957795** per slider point (= `0.018/pi`) at default `MouseSensitivityMultiplierUnit` 0.02 | M-H | deg/count = 0.00572957795 * slider * (multiplier / 0.02); slider is integer 1-100 | separate Vertical slider, same per-count scale per Ubisoft formulas (M-H); 1:1 at equal sliders | **50** for H, V and ADS (Ubisoft, H) | slider 60-90 (Ubisoft), default **60** (ini, H-M) | **vertical** | n/a | 60 (=91.49 h @16:9) |
| Call of Duty, current title **Modern Warfare 4** (released 2026-10-23, Wikipedia; IW 9.0) | **0.0066** | M (MW4 value community-measured in beta, not read from game files; same family as OW, MW19/MW2/MW3, Warzone, BO6) | linear in "Mouse Sensitivity" | "Vertical Sensitivity Multiplier" setting, default 1.00 (L-M, from Warzone guides) so vertical = horizontal * multiplier | not verified | 80 (MW19/Warzone lore) or 90 (BO6/BO7 sources) conflict; slider reaches 120 | horizontal | 16:9 (L-M) | 80 -> 50.53 |

**The "Factory default Game Sens" column is informational only. Do NOT wire it into the profile's `defaultGameSensitivity`.** Example trap: R6's factory default is slider 50, which at 800 DPI is about 4 cm/360 (50 x 0.00573 x 800 = 229 deg per inch of mouse travel), so a Finder centred there would sweep roughly 2-8 cm/360. The profile default (the Finder centre when the player has no settings, spec story 4) must be the **starter row below**. Beyond the yaw column the defaults are mostly "not verified" anyway: no developer page states them. Starter = one reference feel, Valorant 0.4 @ 800 DPI (40.82 cm/360), converted to each game:

| Valorant | CS2 | Apex | OW2 | CoD | Fortnite X % | R6 slider |
|---|---|---|---|---|---|---|
| 0.4 | 1.273 | 1.273 | 4.242 | 4.242 | 5.04 | 4.89 (integer slider: use 5 -> 39.9 cm at 800 DPI) |

Clicking/Tracking weights come from the spec, not research.

## 2. FOV conversion recipe (verified numerically)

`aspect = width / height` (4:3 = 1.3333, 16:9 = 1.7778).
- vertical from horizontal: `v = 2*atan( tan(h/2) / aspect )`
- horizontal from vertical: `h = 2*atan( tan(v/2) * aspect )`
- Representation: profile = `{ value, axis: 'h'|'v', basisAspect: 4/3|16/9|null }`. `vFov = axis==='v' ? value : 2*atan(tan(value/2)/basisAspect)`. **Three.js `PerspectiveCamera.fov` is vertical**, so set `camera.fov = vFov`, `camera.aspect = canvasW/canvasH`. That gives "Hor+" behaviour (vertical FOV constant, horizontal grows with window aspect), which is what Source, Valorant, Apex, OW and R6 do. Fortnite (and probably CoD) hold horizontal FOV nearly fixed instead (L); ignore, document, and let Options "FOV override" cover it.
- Checks: CS2 90 h @4:3 -> v 73.7398, h @16:9 106.2602. Valorant 103 h @16:9 -> v 70.5328, h @4:3 86.6320. Fortnite 80 h @16:9 -> v 50.534, h @4:3 64.37. R6 60 v -> 91.49 h @16:9. Apex slider 70 -> 55.41 v; 110 -> 92.35 v (123.27 h @16:9). OW 103 v = Valorant 70.5328.
- Sensitivity is angular (deg/count), so FOV never enters the cm/360 math. It only changes on-screen speed and projected target size.

## 3. Sources

- KovaaK's "Sens Scale" constants as mirrored in https://github.com/ARm8-2/refleks (`internal/constants/defaults.go`, read via GitHub API): Source family 0.022 (CS, Apex), Overwatch family 0.0066 (OW, CoD, Destiny 2), Valorant 0.06996, "UE4" 0.07, Fortnite 0.005555, Siege `0.018 / math.Pi`.
- https://github.com/pzxe/Aimless `src/data/games/games.ts` (contributor rule: only documented or independently-consistent yaw; FOV table), https://github.com/zxpeng2007/omnisens `web/js/games.js`, https://github.com/tedgey/find-your-sens `src/math/games.ts`, https://github.com/Kalmarv/SensitivityUtils: same values (Valorant 0.07, CS2/Apex 0.022, OW/CoD 0.0066, Fortnite 0.005555, R6 0.00572957795). Fortnite flagged "approximate" by Aimless.
- Ubisoft, "FOV and Input Sensitivity": https://www.ubisoft.com/en-au/game/rainbow-six/siege/news-updates/6kY6b5JByBY3P6vQWWinla/fov-and-input-sensitivity . FOV slider "between 60 and 90"; sliders 1-100, default 50 for horizontal/vertical/ADS; `MouseSensitivityMultiplierUnit` default 0.02; formulas "Hipfire Input Yaw = Input Yaw x (MouseSensitivityMultiplierUnit x Mouse Sensitivity Horizontal)", pitch likewise with the vertical slider. It does NOT publish the 0.00572957795 constant.
- R6 `GameSettings.ini` sample https://github.com/cjLGH/game-settings/blob/master/r6siege/GameSettings.ini : comment ";DefaultFOV => Default vertical field of view (degrees)", `DefaultFOV=60.000000`, `MouseSensitivityMultiplierUnit=0.020000`.
- Steam post by a self-described former R6 dev on the multiplier (default 0.02, slider 50 * 0.02 = 1): https://steamcommunity.com/app/359550/discussions/0/1640919103693902145
- Apex FOV: https://github.com/ThelzenGroup/apex-aim-trainer `src/core/apex_sensitivity.gd` ("FOV is a horizontal FOV measured on a 4:3 screen, stored as cl_fovScale (true 4:3 FOV = cl_fovScale * 70)"; slider 110 -> 108.5 deg); https://keymap.io/fov-converter/ repeats "the menu's 110 is 108.5 deg on 4:3"; cvar dump in https://github.com/240hz/ApexConfigs `cvar.txt` shows `cl_fovScale` default "1.0" (supports default slider 70). EA lists 90-110 as recommended range (https://help.ea.com/en/articles/apex-legends/best-settings-pc).
- Valorant FOV: https://fovcalculatorpro.com/games/valorant-fov/ (103 h @16:9 = 70.53 v, 86.63 h @4:3; attributes it to Riot staff but quotes nothing), https://dcprosens.com/blog/best-fov-settings-valorant-cs2-apex-2026 .
- CS2 FOV: "like every Source game, 90 is horizontal on 4:3, ~106 on 16:9" (community statement surfaced via csdb.gg / Steam threads); Valve's own wiki (developer.valvesoftware.com/wiki/Field_of_View) returned HTTP 403 to me.
- CoD title: https://en.wikipedia.org/wiki/Call_of_Duty:_Modern_Warfare_4 (released 2026-10-23, IW 9.0, article edited 2026-11-06); https://www.callofduty.com/blog/2026/05/call-of-duty-modern-warfare-4-announcement (seen only as a search hit; fetch failed with ECONNRESET). MW4 yaw 0.0066 per converter sites (mouse-sensitivity.com /n/call-of-duty-modern-warfare-4/ lists it; 403 to me).
- Fortnite FOV 80: ProSettings (80 "default FOV as currently in the game"), fovcalculatorpro (VFOV 16:9 50.5, 4:3 64.4); Epic has no FOV doc I could find.
- OW2 FOV 80-103 / 103 h @16:9: https://fovcalculatorpro.com/games/overwatch-2-fov/ , keymap.io; conflicting default (90 vs 103).

## 4. Open doubts

- **mouse-sensitivity.com (the field's reference) is behind a bot wall (HTTP 403 via WebFetch); I did not bypass it.** Its numbers appear only secondhand through the converters above.
- Valorant 0.07 vs 0.06996: 0.057 % apart, irrelevant for tests. Pick 0.07 (every table) and cite KovaaK's 0.06996 as the measured value.
- Fortnite: sources agree on 0.005555 per % but Epic documents nothing. FOV 80 axis/basis, Y-slider scale and defaults are L-M. The in-game slider shows percent while the config stores a decimal (0.05 = 5 %), so never read the config value as the displayed one.
- R6: slider is an integer, so a converted value must be rounded (error up to 10 % at slider 5). Users can change the multiplier unit in `GameSettings.ini` (0.01 halves every step), so offer a "multiplier unit" field or note it. The vertical per-count constant is inferred from Ubisoft's symmetric formulas, not published.
- Apex: slider-to-degrees mapping comes from one hobby repo plus one converter; 123 deg h @16:9 for slider 110 is plausible but not developer-confirmed. Default slider 70 is inferred from `cl_fovScale` default 1.0.
- CoD MW4: nothing about MW4 settings is documented; yaw/FOV/vertical-multiplier are carried over from the family. Verify by a 360 test in the real game if it ever matters. Keep the label generic ("Call of Duty (MW4 / Warzone)").
- ADS / scoped sensitivities differ per game and are out of scope (hipfire only).

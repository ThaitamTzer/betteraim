# BetterAim

A free aim trainer that finds the mouse sensitivity a player performs best with and breaks down their aiming mistakes.

## Language

### Sensitivity

**Sensitivity**:
How far the view rotates for a given physical mouse movement. Inside BetterAim it is always expressed in cm/360.
_Avoid_: sens, mouse speed, eDPI

**cm/360**:
The physical distance, in centimetres, the mouse must travel to rotate the view a full 360°.
_Avoid_: inches/360

**Game Sensitivity**:
The sensitivity value as entered in one specific game's settings; meaningless without naming that game and the player's DPI.
_Avoid_: in-game sens, sens value

**eDPI**:
DPI multiplied by Game Sensitivity; only comparable within one game, so never used as a Sensitivity.

**DPI**:
The number of counts a mouse reports per inch of physical movement.
_Avoid_: CPI

**Game Profile**:
What a supported game imposes on training: its FOV, how its Game Sensitivity maps to cm/360, and the weighted mix of Scenarios that reflects how it is played.
_Avoid_: game preset, game config

### Features

**Sensitivity Finder**:
The mode that plays Scenarios at deliberately varied, hidden Sensitivities and estimates the Sensitivity the player performs best with in one Game Profile.
_Avoid_: sens test, AI sens

**Performance Curve**:
The estimated relationship between Sensitivity and normalised Score for one Game Profile, built from all of its Sensitivity Finder Runs.
_Avoid_: sens chart, sens graph

**Curve Peak**:
The Sensitivity at the top of the Performance Curve, always stated with its confidence interval.
_Avoid_: statistical sens, model sens

**Recommended Sensitivity**:
The Sensitivity BetterAim recommends for one Game Profile: chosen by the AI Coach within the Curve Peak's confidence interval, or the Curve Peak itself when no AI Coach is connected.
_Avoid_: optimal sens, best sens, perfect sens

**Player Context**:
What the player tells BetterAim about how they play (role, mousepad size, wrist or arm aiming), used by the AI Coach when choosing the Recommended Sensitivity.
_Avoid_: player profile (clashes with Game Profile)

**Practice**:
The mode where the player picks a Scenario and plays it at their own Sensitivity.
_Avoid_: free play, training mode

**Converter**:
The tool that translates a Sensitivity to and from the Game Sensitivity of any supported game.

**Analysis**:
The post-run breakdown of a player's performance and aiming mistakes.
_Avoid_: stats, report

**AI Coach**:
An optional language model, powered by the player's own API key or a local model, that chooses the Recommended Sensitivity within the Curve Peak's confidence interval and turns Analysis results into written advice.
_Avoid_: "AI" on its own (ambiguous with the statistical model behind the Performance Curve)

### Training

**Scenario**:
A single aim-training exercise with defined targets, rules and duration.
_Avoid_: map, level, drill, task

**Clicking Scenario**:
A Scenario scored on discrete shots at targets.
_Avoid_: flicking scenario

**Tracking Scenario**:
A Scenario scored on keeping the crosshair on targets over time.

**Flick**:
A Clicking Scenario with one target at a time, appearing at a wide angle from the crosshair.

**Micro**:
A Clicking Scenario with small targets appearing close to the crosshair.

**Strafe**:
A Tracking Scenario with one target that moves and changes direction smoothly.
_Avoid_: Tracking (that is the category, not this Scenario)

**Switch**:
A Tracking Scenario with several targets alive at once, each falling after a short stretch of tracking.
_Avoid_: Switching

**Run**:
One play-through of a Scenario at a single Sensitivity.
_Avoid_: round, attempt, game, play

**Session**:
A continuous stretch of Runs played in one sitting, in the Sensitivity Finder or in Practice.
_Avoid_: playthrough, workout

**Session summary**:
The screen that compares the Scenarios of one Session on Score and Analysis metrics.

**History**:
The screen that charts Score and Analysis metrics over the days the player has played.

**Warm-up Run**:
One of the first Runs of a Session, played but excluded from the Sensitivity Finder's estimate and from every Session summary and History metric.

**Score**:
The single number a Run produces, defined per Scenario so that it already balances speed and accuracy.
_Avoid_: points, result

### Aiming mechanics

**Aim Movement**:
One mouse movement from the moment a target appears until it is hit.
_Avoid_: flick (a flick is one kind of Aim Movement), shot

**Ideal Path**:
The straight angular line from where the crosshair is when an Aim Movement starts to the target's centre.
_Avoid_: optimal path, perfect line

**Path Deviation**:
How far, on average, an Aim Movement strays from its Ideal Path.

**Primary Submovement**:
The first ballistic push of an Aim Movement, before any corrections.
_Avoid_: initial flick, first move

**Overshoot**:
An Aim Movement whose Primary Submovement ends beyond the target's far edge.
_Avoid_: overflick

**Undershoot**:
An Aim Movement whose Primary Submovement ends short of the target's near edge.
_Avoid_: underflick

**Ahead / Behind**:
In tracking, the crosshair leading or trailing a moving target along its direction of travel. Never called Overshoot or Undershoot.

**Smoothness**:
How few corrections an Aim Movement needs; measured by its number of velocity peaks, fewer meaning smoother.
_Avoid_: stability, control

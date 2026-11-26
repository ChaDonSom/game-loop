# Research: faster large turns on the touch wheel

Status: **study, for the owner to choose an experiment.** No code yet.

## The problem, at its root

A big turn is slow because the thumb path is long and hard to draw.

- At 1:1 (`WHEEL_GAIN = 1`), full lock from center is 450° of wheel, so 450° of finger arc. On a phone the arc is near the rim (R ≈ 82 px). That is a path of about 2π · 82 · 1.25 ≈ 640 px, all of it curved.
- Curved paths are slow for a thumb. A straight stroke is one motion. A circle needs a steady change of direction, and the eye must follow the rim.
- A real driver does not circle either. Each hand strokes about a third of a turn in a nearly straight line, lets go, and grabs again (hand-over-hand). Or the driver spins the wheel and lets it run (palm spin).

So there are three ways to make a big turn fast:

1. **Less path per wheel degree** (more gain, or smaller circles).
2. **Easier path** (straight strokes instead of curves).
3. **No path** (the wheel keeps moving after the thumb stops).

## Options

| # | Option | Lever | For | Against |
| --- | --- | --- | --- | --- |
| 1 | **Flick with momentum** (wheel inertia) | No path | One flick spins toward lock. Real wheels do this, and it joins up with the caster centering: one model, with inertia, damping, and the pull toward the target. A grab stops it, as today. No loss of precision while held. | Can overshoot. Needs a feel for flick strength. Must stop at lock. |
| 2 | **Speed-dependent gain** (pointer acceleration) | Less path | Slow thumb = 1:1 precision, fast thumb = 2–3×. Every desktop OS does this for the mouse. Rotary controllers scale by turn speed too. | The same arc gives different turns at different speeds. Back to the touch-down point no longer gives the start angle back (drift), which breaks a property of tangent drag. Muscle memory suffers. |
| 3 | **Ratchet strokes** (hand-over-hand) | Easier path | Matches the real motion. | Already possible: lift and grab again (grab is relative). Reading "return" strokes without a lift is ambiguous with a real counter-steer, which is the worst moment to guess wrong (a slide). Not recommended. |
| 4 | **Local circles** (steer by how much the thumb's *direction of motion* turns) | Less path | Small fast circles anywhere count as full turns: one small circle = 360°. Research on circular scrolling (the "virtual scroll ring", radial scroll) found ring scrolling can be faster than a wheel. | A straight drag gives nothing (it could pair with tangent drag). Noisy at low speed: needs smoothing. New idea to learn. |
| 5 | **Fixed higher gain, or less lock** (`WHEEL_GAIN` 2, or `VISUAL_LOCK` 540°) | Less path | One constant. A baseline to compare the others against. | Less fine control near center, unless `applyCurve` gives it back. |

## Recommendation

1. **Try 1 first (flick with momentum).** It comes from how a real wheel works, it uses the same model as the caster centering you liked, and it costs nothing while you hold the wheel. Catching a slide already means letting go: momentum makes the letting go useful.
2. **Try 5 next to it**, as a baseline. If a higher gain alone feels fine, the other options are not needed.
3. **Keep 4 as an experiment** if neither is enough. It is the most promising idea for "circling but faster".
4. **Skip 3.** Use 2 only if 1 is not enough, because of the drift.

Each one as a pill toggle, like the drag mode, so you can A/B them on the device.

## How to compare them

- Time from center to full lock and back to center.
- A slalom at a fixed speed: count missed gates or wall hits.
- Catch a slide: let go, then grab at the countersteer point (the haptic tap tells you when).

## Sources

- Circular scrolling: [Navigating Documents with the Virtual Scroll Ring](https://typeset.io/pdf/navigating-documents-with-the-virtual-scroll-ring-37xmhukgeb.pdf); Smith and schraefel, [radial scroll, UIST 2004](https://eprints.soton.ac.uk/259247/2/smith_scrhraefelUIST04radialScroll.pdf).
- Pointer acceleration (transfer functions): [AutoGain, Lee et al.](https://arxiv.org/pdf/1611.08154.pdf); [thesis on transfer functions](https://core.ac.uk/download/153208352.pdf).
- Rotary controllers scaled by turn speed: [US patent 8587517](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/8587517).
- A flick-driven wheel with friction (hobbyist, not a study): [Godot Q&A](https://godotengine.org/qa/101264/how-make-rotating-wheel-control-system-which-responds-flicks).

Confidence: the root cause (path length and path shape) is arithmetic and well-known motor behaviour. Which option feels best on this game is not known until it is tried. I found no study of touch steering wheels in racing games; the sources above are about scrolling and pointing.

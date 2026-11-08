# The LLM picks the Recommended Sensitivity, but only inside the statistical model's confidence interval

An on-device statistical model fits the Performance Curve over every Sensitivity Finder Run (a log-sensitivity parabola with run-order and Session terms) and reports the Curve Peak with a bootstrap confidence interval. Inside that interval the Sensitivities are statistically tied on Score, so the AI Coach settles the tie: it chooses the Recommended Sensitivity from per-Sensitivity aiming metrics (Overshoot/Undershoot balance, Path Deviation, Smoothness, Clicking vs Tracking divergence) and Player Context (role, mousepad size, wrist or arm aiming). Its answer must fall inside the interval. Game Sensitivity and eDPI are always computed by formula from it, never by the LLM.

## Considered Options

- **Curve Peak only, LLM just explains**: rejected. The player wants the language model to make the call, and a formula cannot weigh all of those signals together.
- **LLM chooses freely**: rejected. It would not be reproducible, it drifts towards "typical pro" sensitivities from its training data, it can be fooled by one lucky Run, and it cannot give an honest confidence interval.

## Consequences

- The LLM receives per-Sensitivity aggregates and the fitted curve, never raw mouse data.
- Its answer is cached per data snapshot, so the same data always shows the same number. Reproducibility cannot come from sampling settings: current Claude models reject `temperature`, so it is only sent (as 0) to OpenAI-compatible endpoints that accept it.
- An answer outside the interval is retried once, then replaced by the Curve Peak with a visible notice.
- Without an API key, the Recommended Sensitivity is the Curve Peak.

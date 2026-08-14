# Lesson 77: Innovation Accounting and Portfolio Management

## Why This Lesson Matters

Lesson 71 introduced the Strategy Cascade and the Three Horizons framework, establishing that a healthy bet portfolio deliberately spans core, adjacent, and transformational risk levels, and specifically warned against judging Horizon 3 bets by the same near-term metrics appropriate for Horizon 1. This lesson makes that warning concrete and actionable: what, exactly, should a company measure for a bet that is genuinely too early to show revenue, and how should a portfolio of many such bets, at different stages of maturity, actually be managed and reported on over time?

The natural organizational instinct is to measure every initiative using the same familiar metrics — revenue, user growth, profit margin — regardless of how early-stage or exploratory that initiative genuinely is. This instinct is understandable, since these are the metrics an organization already knows how to read and compare, but applying them uniformly to bets at fundamentally different stages of maturity produces a specific and damaging failure: promising early-stage bets get killed prematurely for failing to show revenue they were never realistically going to show yet, while genuinely failing bets can survive far too long if they happen to generate superficially impressive but ultimately meaningless activity metrics.

This lesson introduces the Portfolio Health Grid, this lesson's core mental model, to give you a structured way to track and evaluate a portfolio of bets at genuinely different stages of maturity, using stage-appropriate evidence rather than forcing every bet through the same evaluative lens regardless of how ready it actually is to produce that kind of evidence.

---

## Learning Path

| Field | Detail |
|---|---|
| **Module** | 8 — Advanced Strategy, Innovation & Enterprise/B2B Product Management |
| **Current Lesson** | 77 of 90 |
| **Difficulty** | 7 / 10 |
| **Estimated Study Time** | 40 minutes (reading) + 15 minutes (reflection + quiz) |
| **Prerequisites** | Lesson 71 (Strategy Cascade, Three Horizons, falsifiable bets), Lesson 64 (Metric Provenance Chain) |
| **Next Lesson** | Lesson 78 — Build, Buy, or Partner: Platform vs. Point Solution Decisions |
| **Future Topics Unlocked** | Lesson 78 (Build, Buy, or Partner), Lesson 80 (Module Synthesis) — both depend on the Portfolio Health Grid introduced here |

---

## Learning Objectives

By the end of this lesson, you will be able to:

1. Explain why applying uniform, revenue-based metrics across bets at different maturity stages produces systematically bad portfolio decisions.
2. Apply the Portfolio Health Grid to evaluate a bet using evidence appropriate to its actual stage of maturity.
3. Distinguish validated learning metrics from vanity metrics in the context of an early-stage bet.
4. Identify the specific risk of both premature bet cancellation and prolonged bet survival caused by metric mismatch.
5. Evaluate a portfolio of bets for whether each is being measured using stage-appropriate evidence.

---

## Prerequisites

This lesson assumes the Strategy Cascade, Three Horizons framework, and falsifiable-bet discipline from Lesson 71, since this lesson provides the measurement system that makes ongoing bet evaluation genuinely possible, and the Metric Provenance Chain from Lesson 64, since evaluating any bet's progress depends on the same underlying data trustworthiness that lesson established.

---

## Theory

### Why Uniform Metrics Fail Across Maturity Stages

A Horizon 1 bet — extending an established core business — can reasonably be judged against revenue, profit margin, and market share, because the underlying business model is proven and the relevant question is one of execution and optimization. A Horizon 3 bet — a genuinely new, exploratory initiative — cannot reasonably be judged against these same metrics in its earliest stages, not because the team is executing poorly, but because the entire premise of an early-stage exploratory bet is that the business model itself has not yet been validated, and demanding revenue-scale proof before that validation has occurred is asking the bet to demonstrate something it is structurally too early to demonstrate. Applying Horizon 1 metrics to a Horizon 3 bet doesn't produce a more rigorous evaluation; it produces a category error that reliably kills promising early bets before they've had a chance to answer the actual questions they were designed to test.

### The Portfolio Health Grid

This lesson introduces the **Portfolio Health Grid**, plotting each bet in a portfolio along two axes: its Three Horizons classification from Lesson 71, and its actual stage of validated progress.

```mermaid
graph TD
    subgraph Validation Stages
    S1[Concept: hypothesis articulated, not yet tested]
    S2[Prototype: minimal version tested with real users]
    S3[Pilot: validated with a limited but real customer segment]
    S4[Scale: validated model being deliberately scaled]
    end
    H1["Horizon 1<br/>(Core)"] --- S4
    H2["Horizon 2<br/>(Adjacent)"] --- S3
    H3["Horizon 3<br/>(Transformational)"] --- S1
```

The Grid's core discipline is that the *appropriate* metric for any given bet depends on its position on both axes simultaneously — a Horizon 3 bet at the Concept stage should be evaluated on whether its core hypothesis has been clearly articulated and an initial test designed, not on revenue; a Horizon 3 bet that has progressed to Pilot stage should be evaluated on whether a real, if limited, customer segment shows the validated behavior the hypothesis predicted, a meaningfully different and more demanding bar than the Concept stage, but still not the same bar as a mature Horizon 1 business. Placing every bet somewhere on this Grid, rather than evaluating all bets against a single organizational-standard metric, is what makes stage-appropriate evaluation possible at all.

### Validated Learning vs. Vanity Metrics

**Validated learning**, a concept from lean startup methodology, refers to evidence that a specific, falsifiable hypothesis about customer behavior or business viability has actually been tested and either confirmed or disconfirmed — directly connecting to the falsifiable Strategic Bet discipline from Lesson 71. **Vanity metrics**, by contrast, are numbers that look impressive and tend to always increase over time (total signups, cumulative downloads, total page views) without actually testing whether the bet's underlying hypothesis is correct. A Horizon 3 bet can generate an impressive-looking vanity metric — a large number of free trial signups, for instance — while providing no validated learning at all about whether those users would actually pay, retain, or behave in the way the bet's underlying hypothesis predicted. Innovation accounting, done well, insists on validated learning metrics specific to the bet's stated hypothesis, rather than accepting vanity metrics as a substitute simply because they are easier to produce and more comfortable to report.

### The Two Failure Modes of Metric Mismatch

Metric mismatch produces two distinct, opposite failure modes. **Premature cancellation** occurs when a genuinely promising early-stage bet is killed because it hasn't yet produced Horizon 1-scale results it was never structurally positioned to produce this early — the specific risk Lesson 71 flagged for Horizon 3 bets judged by near-term metrics. **Prolonged survival** occurs when a genuinely failing bet continues to receive resources because it generates comfortable-looking vanity metrics that mask the absence of any real validated learning supporting its underlying hypothesis — a bet can look active and growing by activity metrics while its actual, falsifiable hypothesis has already been quietly disconfirmed by the available evidence, with no one having checked because the vanity metrics provided a comfortable alternative narrative.

---

## Common Beginner Mistakes

**Mistake 1: Applying the same revenue and profit metrics to every bet in a portfolio, regardless of Horizon or validation stage**

This produces the category error described in the Theory section, killing promising early bets and providing false comfort for others.

**Mistake 2: Accepting vanity metrics as evidence of progress simply because they are readily available and always trending upward**

Vanity metrics can create a comfortable illusion of progress while providing no actual validated learning about the bet's underlying hypothesis.

**Mistake 3: Failing to explicitly place each bet on the Portfolio Health Grid, leaving its appropriate evaluation criteria ambiguous**

Without an explicit stage classification, there is no principled basis for deciding what evidence should or shouldn't count as meaningful progress.

**Mistake 4: Treating a bet's progression from one validation stage to the next as automatic rather than something that must be genuinely earned by evidence**

A bet should not advance from Prototype to Pilot status, for instance, simply because time has passed, but because specific validated learning milestones have actually been met.

**Mistake 5: Allowing organizational politics or sunk cost to substitute for validated learning evidence when deciding whether to continue or cancel a bet**

A bet's continuation should be justified by genuine evidence at the appropriate stage, not by how much has already been invested or who championed it internally.

---


## Mental Model: The Portfolio Health Grid

The Portfolio Health Grid introduced above is this lesson's core takeaway tool. For any bet in a portfolio, ask:

1. **Which Horizon does this bet belong to**, per the Three Horizons framework from Lesson 71?
2. **Which validation stage — Concept, Prototype, Pilot, or Scale — has this bet actually, genuinely reached**, based on specific evidence rather than elapsed time or organizational momentum?
3. **Is the evidence being used to evaluate this bet appropriate to its actual stage** — a clearly articulated, testable hypothesis for Concept-stage bets, versus real, validated customer behavior for Pilot-stage bets — rather than a uniform standard applied regardless of stage?
4. **Is this evidence genuine validated learning specific to the bet's falsifiable hypothesis, or is it a vanity metric that merely looks encouraging without actually testing that hypothesis?**

A portfolio evaluated through this Grid consistently is far less likely to fall into either of the two metric-mismatch failure modes: prematurely killing promising early bets, or allowing genuinely failing bets to survive on the strength of comfortable but ultimately meaningless activity numbers.

---

## Real Company Example

**3M's "15% Culture,"** confirmed directly on the company's own site, has let employees spend 15 percent of their working time pursuing self-directed projects since approximately 1948, under then-president William McKnight. The policy's own best-known output is a direct, well-documented illustration of this lesson's core argument: 3M scientist Art Fry used his 15% time in 1974 to solve a problem — bookmarks that kept falling out of his hymnal — building on a "failed" low-tack adhesive a colleague, Spencer Silver, had developed years earlier and initially considered a failure precisely because it wasn't strong enough to be useful as a normal adhesive. That project became the Post-it Note, one of 3M's most commercially successful products in company history.

The instructive point for this lesson's Portfolio Balance discipline: Silver's low-tack adhesive would have failed any evaluation standard built for 3M's mature, revenue-generating product lines — it wasn't a better adhesive by any conventional metric. It only became viable because 3M's structure tolerated an idea sitting in an unproven, pre-revenue state for years without forcing it to justify itself against the same bar as an established product line. A portfolio management approach that evaluates every bet — a brand-new exploratory idea and a decade-old cash-generating product line alike — against the same revenue-readiness standard would have killed the Post-it Note before Fry ever found a use for it.

*(Source: 3M's own official site describing the 15% Culture's history and origin, corroborated by the company's own Post-it brand history page.)*

---

## Real World Perspective: Innovation Accounting and Portfolio Management at Different Company Stages

**Startup:** Early-stage companies typically operate with a portfolio of one or a small number of bets, all effectively Horizon 1 or 2 by necessity, since the company's survival depends on near-term validation — making the Portfolio Health Grid's full range less immediately relevant than it becomes once a company has the resources to sustain genuinely exploratory Horizon 3 work alongside its core business.

**Mid-size company:** This is typically where a genuine, deliberately-structured multi-horizon portfolio first becomes both possible and organizationally contentious, as resources previously devoted entirely to the core business begin being allocated to exploratory bets that, by design, won't show Horizon 1-style results for some time, creating internal pressure to apply familiar metrics prematurely.

**Big Tech:** Large organizations typically maintain formal innovation accounting practices and dedicated portfolio management functions specifically responsible for tracking many simultaneous bets across the full Portfolio Health Grid, often reporting portfolio health to leadership using stage-appropriate validated learning metrics rather than a single blended organizational metric.

---

## Detailed Case Study: The Prematurely Killed Experiment

A mid-size e-commerce company launched a Horizon 3 exploratory bet: a subscription-based curated product discovery service, built on the hypothesis that a meaningful segment of the company's existing customers would pay a recurring fee for algorithmically and editorially curated product recommendations delivered on a regular schedule. The initiative was staffed by a small team and explicitly framed internally, at launch, as an early-stage experiment rather than an established revenue line.

Three months into the pilot, the initiative's small but genuine base of paying subscribers showed strong early retention and highly positive qualitative feedback — precisely the validated learning signal the bet's underlying hypothesis had predicted, at exactly the Pilot stage on the Portfolio Health Grid the initiative had reasonably reached. However, at the company's quarterly business review, the initiative was evaluated using the same revenue-contribution-to-overall-company-growth metric applied to every other business line, and its absolute revenue contribution, still small in the context of the company's overall size after only three months, appeared negligible next to established Horizon 1 product categories. Leadership, applying this uniform standard, canceled the initiative, redirecting its small team to a Horizon 1 project instead.

**What went wrong?** Using the Portfolio Health Grid, the failure is precise: the initiative had genuinely earned Pilot-stage validated learning status — real customers, real recurring payment, strong retention, a confirmed hypothesis — but was evaluated using a Horizon 1-appropriate metric (absolute revenue contribution to overall company growth) that no Horizon 3 Pilot-stage bet could reasonably be expected to satisfy this early, regardless of how genuinely promising its underlying validated learning actually was. The company had, in effect, demanded Scale-stage evidence from a Pilot-stage bet, producing exactly the premature cancellation failure mode this lesson's Theory section describes.

The company's recovery involved instituting a formal Portfolio Health Grid review process for all future exploratory bets, explicitly requiring quarterly business reviews to evaluate each bet using metrics appropriate to its documented Horizon and validation stage rather than a single company-wide revenue standard, and revisiting several previously-cancelled initiatives to assess whether similar premature cancellations had occurred — a review process this curriculum will connect directly to the build-versus-buy-versus-partner evaluation formalized in Lesson 78.

---

## Framework Explanation: The Innovation Accounting Metrics Table

For each validation stage on the Portfolio Health Grid, a PM can use the following table to identify stage-appropriate evidence:

| Stage | Appropriate Evidence | Inappropriate Evidence (Category Error) |
|---|---|---|
| Concept | A clearly articulated, falsifiable hypothesis and a designed initial test | Revenue or user growth targets, which cannot yet exist meaningfully |
| Prototype | Genuine engagement from real users with a minimal version, testing the core hypothesis | Absolute scale metrics (total users, total revenue) at company-wide comparison levels |
| Pilot | Validated behavior from a limited but real customer segment (retention, willingness to pay, repeat usage) confirming or disconfirming the hypothesis | Comparison to Horizon 1 business lines' absolute revenue contribution |
| Scale | Revenue, margin, and growth metrics appropriate to a maturing, validated business model | Continued reliance on qualitative or small-sample pilot-stage evidence alone |

Using evidence one column to the right of a bet's actual stage — for instance, judging a Pilot-stage bet against Scale-stage revenue expectations — is precisely the category error responsible for the Prematurely Killed Experiment case study.

---

## Interview Perspective: How Interviewers Think About This

**"How would you evaluate whether an early-stage, exploratory product initiative is succeeding?"** The interviewer is evaluating whether you propose stage-appropriate validated learning metrics — per the Portfolio Health Grid — rather than defaulting to revenue or scale metrics inappropriate to an early-stage bet.

**"What's the difference between a vanity metric and a validated learning metric?"** The interviewer is testing whether you can clearly distinguish evidence that genuinely tests a bet's falsifiable hypothesis from evidence that merely looks encouraging without actually confirming or disconfirming anything.

**"Tell me about a time a promising initiative was evaluated unfairly, or a failing initiative survived longer than it should have."** The interviewer is listening for a diagnosis resembling this lesson's metric-mismatch failure modes — either premature cancellation from an inappropriately demanding metric, or prolonged survival from an inappropriately comfortable one.

---

## Summary

Applying uniform, revenue-based metrics across a portfolio of bets at genuinely different maturity stages produces a category error, since an early-stage Horizon 3 bet is structurally too early to demonstrate the kind of scale evidence a mature Horizon 1 business reasonably should. The Portfolio Health Grid plots each bet along its Three Horizons classification and its actual validation stage — Concept, Prototype, Pilot, or Scale — establishing that the appropriate evidence for evaluating any given bet depends on both dimensions simultaneously, rather than a single organizational-standard metric applied uniformly. Validated learning, evidence that a bet's specific, falsifiable hypothesis has actually been tested and confirmed or disconfirmed, must be distinguished from vanity metrics, numbers that look encouraging and trend upward without actually testing anything meaningful about the underlying hypothesis. Metric mismatch produces two distinct failure modes — premature cancellation of promising early bets judged against inappropriately mature standards, and prolonged survival of genuinely failing bets propped up by comfortable but meaningless vanity metrics — and a disciplined innovation accounting practice, evaluating each bet against stage-appropriate evidence, is the specific defense against both.

---

## Key Takeaways

- Applying uniform, revenue-based metrics across bets at different maturity stages produces a category error that systematically distorts portfolio decisions.
- The Portfolio Health Grid plots each bet by Three Horizons classification and validation stage — Concept, Prototype, Pilot, Scale — to determine appropriate evaluation criteria.
- Validated learning metrics test a bet's specific falsifiable hypothesis; vanity metrics merely look encouraging without testing anything meaningful.
- Premature cancellation occurs when promising early bets are judged against inappropriately mature (Horizon 1-style) metrics.
- Prolonged survival occurs when genuinely failing bets are propped up by comfortable vanity metrics that mask the absence of real validated learning.
- A bet's progression from one validation stage to the next should be earned by specific evidence, not assumed based on elapsed time or organizational momentum.
- Formal innovation accounting practices should require stage-appropriate evaluation for every bet, rather than a single company-wide metric applied regardless of context.

---

## Cheat Sheet

*A two-minute review of everything in this lesson.*

- Don't judge every bet by the same yardstick. Match the metric to the bet's actual stage.
- Portfolio Health Grid: Horizon (H1/H2/H3) × Validation Stage (Concept/Prototype/Pilot/Scale).
- Validated learning tests a real hypothesis. Vanity metrics just look good and trend up.
- Premature cancellation kills good bets too early; prolonged survival keeps bad bets too long. Both come from metric mismatch.
- Progression between stages must be earned by evidence, not assumed by time passing.

---

## Glossary

| Term | Definition | Related Concepts | Difficulty |
|---|---|---|---|
| Portfolio Health Grid | A model plotting bets by Three Horizons classification and validation stage | Three Horizons (Lesson 71) | 2 |
| Validated Learning | Evidence that a bet's specific, falsifiable hypothesis has been tested and confirmed or disconfirmed | Strategic Bet (Lesson 71) | 2 |
| Vanity Metric | A metric that looks encouraging and trends upward over time (such as cumulative signups) without indicating actionable product feedback or testing a clear hypothesis. | Portfolio Health Grid | 2 |
| Premature Cancellation | Killing a promising early-stage bet by judging it against inappropriately mature metrics | Portfolio Health Grid | 2 |
| Prolonged Survival | Allowing a genuinely failing bet to continue based on comfortable but meaningless vanity metrics | Portfolio Health Grid | 2 |
| Validation Stage | A bet's position in a four-stage progression: Concept, Prototype, Pilot, Scale | Portfolio Health Grid | 2 |

---

## Further Reading / Resources

- Eric Ries, *The Lean Startup*
- Tendayi Viki, Dan Toma, and Esther Gons, *The Corporate Startup*
- Mehrdad Baghai, Stephen Coley, and David White, *The Alchemy of Growth*

---

## Flashcards

**Card 1**
- Front: Why does applying uniform revenue metrics across a portfolio produce a category error?
- Back: An early-stage Horizon 3 bet is structurally too early to demonstrate the scale evidence a mature Horizon 1 business reasonably should, making revenue comparison inappropriate at that stage.
- Difficulty: 2
- Tags: innovation-accounting, core-concept

**Card 2**
- Front: Name the four validation stages on the Portfolio Health Grid.
- Back: Concept, Prototype, Pilot, Scale.
- Difficulty: 2
- Tags: portfolio-health-grid

**Card 3**
- Front: What is the difference between validated learning and a vanity metric?
- Back: Validated learning tests a specific, falsifiable hypothesis and confirms or disconfirms it; a vanity metric merely looks encouraging without testing anything meaningful.
- Difficulty: 2
- Tags: validated-learning

**Card 4**
- Front: What are the two failure modes caused by metric mismatch?
- Back: Premature cancellation of promising early bets, and prolonged survival of genuinely failing bets.
- Difficulty: 2
- Tags: metric-mismatch

**Card 5**
- Front: Why was the Pilot-stage subscription initiative killed in the Prematurely Killed Experiment case study?
- Back: It was evaluated using a Horizon 1-appropriate absolute revenue contribution metric, a Scale-stage standard the Pilot-stage bet could not reasonably meet yet, despite genuinely earning validated learning at its actual stage.
- Difficulty: 2
- Tags: case-study, portfolio-health-grid

**Card 6**
- Front: What appropriate evidence should a Concept-stage bet be evaluated against?
- Back: A clearly articulated, falsifiable hypothesis and a designed initial test — not revenue or user growth targets.
- Difficulty: 2
- Tags: innovation-accounting-metrics

**Card 7**
- Front: Why should progression between validation stages be earned by evidence rather than assumed by elapsed time?
- Back: A bet should advance to the next stage only because specific validated learning milestones have actually been met, not simply because time has passed.
- Difficulty: 2
- Tags: validation-stage-progression


## Reflection Exercise

You are the PM overseeing a portfolio of three initiatives: a mature core product (Horizon 1), a moderately successful adjacent feature line launched a year ago (Horizon 2), and a brand-new exploratory concept your team just began testing last month (Horizon 3). Leadership has asked for a single quarterly report showing "how each initiative is performing."

There is no single correct answer to the prompts below — the goal is to practice applying the Portfolio Health Grid and the Innovation Accounting Metrics Table to design a genuinely stage-appropriate reporting structure.

1. Using the Portfolio Health Grid, what validation stage would you assign to each of the three initiatives, and why?
2. What specific metrics would you propose reporting for the Horizon 3 concept, given it is only one month old?
3. How would you explain to leadership why the Horizon 3 concept shouldn't be evaluated using the same metrics as the Horizon 1 core product, without sounding like you're avoiding accountability?
4. What risk would you want to guard against if the Horizon 2 feature line's metrics look consistently positive but you suspect they may be more vanity than validated learning?
5. How would you design the quarterly report itself so that all three initiatives are presented fairly, without either inflating the Horizon 3 concept's readiness or unfairly penalizing it for its early stage?

---

## Quiz

**1. Why does applying uniform revenue-based metrics across a portfolio of bets at different maturity stages produce a category error?**
A) Revenue metrics are never useful for any type of bet
B) An early-stage bet is structurally too early to demonstrate scale evidence a mature business reasonably should, making the comparison inappropriate
C) All bets should always show identical revenue regardless of maturity
D) Category errors are impossible in portfolio management

*Correct answer: B*
*Explanation: The lesson's central argument is that maturity-appropriate evidence, not uniform metrics, is required for sound portfolio evaluation.*
*Learning objective tested: #1*
*Difficulty: Easy*

---

**2. What are the four validation stages of the Portfolio Health Grid?**
A) Idea, Funding, Launch, Retirement
B) Concept, Prototype, Pilot, Scale
C) Research, Development, Testing, Marketing
D) Draft, Review, Approval, Release

*Correct answer: B*
*Explanation: These four stages are explicitly introduced in the Theory section as the Grid's validation axis.*
*Learning objective tested: #2*
*Difficulty: Easy*

---

**3. What is validated learning?**
A) Any metric that trends upward over time
B) Evidence that a bet's specific, falsifiable hypothesis has been tested and confirmed or disconfirmed
C) A synonym for total revenue generated by a bet
D) A measure of how many employees are assigned to a project

*Correct answer: B*
*Explanation: Validated learning specifically refers to genuine hypothesis testing, distinct from any metric that simply looks positive.*
*Learning objective tested: #3*
*Difficulty: Easy*

---

**4. What is a vanity metric?**
A) A metric that always accurately reflects a bet's underlying business viability
B) A number that looks encouraging and trends upward without testing the bet's underlying hypothesis
C) A metric only relevant to Horizon 1 bets
D) A metric that is always fraudulent or deliberately manipulated

*Correct answer: B*
*Explanation: Vanity metrics are defined by their superficial appeal rather than any genuine deceptive intent or inherent inaccuracy.*
*Learning objective tested: #3*
*Difficulty: Easy*

---

**5. What is "premature cancellation," as described in this lesson?**
A) Ending a bet that has genuinely failed to show any validated learning
B) Killing a promising early-stage bet by judging it against inappropriately mature metrics it was never structurally positioned to satisfy yet
C) A standard best practice recommended for all Horizon 3 bets
D) Canceling a bet due to a legal or regulatory requirement

*Correct answer: B*
*Explanation: This term specifically describes the mismatch-driven failure mode of applying overly mature standards too early.*
*Learning objective tested: #4*
*Difficulty: Easy*

---

**6. What is "prolonged survival," as described in this lesson?**
A) A bet that continues appropriately because it has earned genuine validated learning
B) A genuinely failing bet that continues receiving resources because it generates comfortable-looking vanity metrics masking the absence of real validated learning
C) A bet that has successfully reached Scale stage
D) A standard, recommended approach to managing Horizon 1 bets

*Correct answer: B*
*Explanation: This is the opposite failure mode from premature cancellation, driven by vanity metrics providing false comfort.*
*Learning objective tested: #4*
*Difficulty: Easy*

---

**7. In the Prematurely Killed Experiment case study, what evidence had the subscription initiative genuinely earned at the time of its cancellation?**
A) Scale-stage revenue comparable to established Horizon 1 product lines
B) Pilot-stage validated learning: real customers, recurring payment, strong retention, confirming the underlying hypothesis
C) No meaningful evidence of any kind
D) Only Concept-stage evidence, with no real customer testing yet conducted

*Correct answer: B*
*Explanation: The case study specifically describes genuine Pilot-stage validated learning being present at the time of the mismatched, premature cancellation.*
*Learning objective tested: #2, #5*
*Difficulty: Medium*

---

**8. Why was the subscription initiative canceled despite this genuine Pilot-stage evidence?**
A) The initiative had actually failed to attract any paying customers at all
B) It was evaluated using a Horizon 1-appropriate absolute revenue contribution metric, a Scale-stage standard inappropriate for its actual stage
C) Leadership had no interest in exploratory initiatives of any kind
D) The initiative's team requested that it be canceled

*Correct answer: B*
*Explanation: The failure was a metric mismatch — Scale-stage evidence demanded of a genuinely earned Pilot-stage bet.*
*Learning objective tested: #4, #5*
*Difficulty: Medium*

---

**9. According to the Innovation Accounting Metrics Table, what is appropriate evidence for a Concept-stage bet?**
A) Revenue and user growth targets comparable to established business lines
B) A clearly articulated, falsifiable hypothesis and a designed initial test
C) Company-wide market share figures
D) Long-term profit margin projections

*Correct answer: B*
*Explanation: Concept-stage evidence is explicitly limited to hypothesis articulation and test design, not revenue or scale metrics.*
*Learning objective tested: #2, #3*
*Difficulty: Medium*

---

**10. What does the Innovation Accounting Metrics Table identify as an inappropriate evidence category error for a Pilot-stage bet?**
A) Validated behavior from a limited but real customer segment
B) Comparison to Horizon 1 business lines' absolute revenue contribution
C) A designed initial test of the bet's hypothesis
D) Genuine engagement from real users with a minimal version

*Correct answer: B*
*Explanation: This specific comparison is identified in the table as the category error responsible for the case study's premature cancellation.*
*Learning objective tested: #2, #5*
*Difficulty: Medium*

---

**11. Why might early-stage startups find the full Portfolio Health Grid less immediately relevant, per the Real World Perspective section?**
A) Startups never have any bets worth evaluating
B) Their portfolio typically consists of one or a small number of bets, all effectively Horizon 1 or 2 by necessity given survival pressures
C) The Portfolio Health Grid only applies to companies with over ten thousand employees
D) Startups are legally prohibited from pursuing Horizon 3 bets

*Correct answer: B*
*Explanation: The Real World Perspective section connects this to the practical resource constraints and survival pressures typical of early-stage companies.*
*Learning objective tested: #1*
*Difficulty: Medium*

---

**12. (Scenario) A Horizon 2 feature line has shown steadily increasing total signups for six months, but no one has checked whether those signups translate into the retention behavior the initiative's original hypothesis predicted. What risk does this scenario illustrate?**
A) Premature cancellation
B) Prolonged survival, since increasing signups could be a vanity metric masking the absence of genuine validated learning
C) No risk; increasing signups are always sufficient evidence of success
D) A Concept-stage evaluation error, since this bet has clearly progressed past Concept stage

*Correct answer: B*
*Explanation: Unchecked, steadily increasing vanity metrics without confirmed validated learning is the classic setup for prolonged survival of a bet that may actually be failing.*
*Learning objective tested: #3, #4, #5*
*Difficulty: Medium-Hard*

---

**13. (Product Thinking) A PM is asked to report on a one-month-old Horizon 3 concept using the same revenue dashboard used for the mature core business. What is the most defensible response, using this lesson's frameworks?**
A) Comply with the request and report the concept's negligible revenue as evidence of underperformance
B) Propose stage-appropriate metrics (hypothesis clarity and initial test design, per the Concept stage) instead, explaining why revenue comparison at this stage would be a category error
C) Refuse to report on the initiative at all until it reaches Scale stage
D) Report inflated projections to make the concept appear more mature than it actually is

*Correct answer: B*
*Explanation: The correct response neither complies with an inappropriate metric nor avoids reporting altogether, but proposes genuinely stage-appropriate evidence instead.*
*Learning objective tested: #2, #3, #5*
*Difficulty: Hard*

---

**14. (Interview Reasoning) A candidate, asked how they'd evaluate an early-stage exploratory initiative, proposes using the same revenue growth targets applied to the company's mature core product. What does this most likely signal, per the Interview Perspective section?**
A) A strong and complete understanding of innovation accounting
B) A gap in recognizing that stage-appropriate validated learning metrics, not uniform revenue targets, are necessary for early-stage bet evaluation
C) That the candidate is ready for a senior portfolio management role immediately
D) Nothing meaningful; revenue targets are always the correct evaluation standard regardless of stage

*Correct answer: B*
*Explanation: The Interview Perspective section specifically listens for recognition of stage-appropriate evidence, which this answer omits.*
*Learning objective tested: #1, #2, #5*
*Difficulty: Hard*

---

**15. (Product Thinking, Highest Difficulty) A portfolio contains a Horizon 1 core business, a Horizon 2 feature line with ambiguous vanity-metric growth, and a one-month-old Horizon 3 concept, all being evaluated using the same quarterly revenue dashboard. Using only the frameworks in this lesson, what is the most defensible reporting redesign?**
A) Continue using the single revenue dashboard for all three, since consistency in reporting is more important than accuracy
B) Place each initiative on the Portfolio Health Grid according to its actual Horizon and validation stage, and report stage-appropriate evidence for each — including investigating whether the Horizon 2 line's metrics reflect genuine validated learning rather than vanity growth
C) Eliminate reporting on the Horizon 3 concept entirely until it reaches Scale stage
D) Apply the Horizon 3 concept's early-stage evaluation standards retroactively to the mature Horizon 1 business for fairness

*Correct answer: B*
*Explanation: This mirrors the Reflection Exercise: the correct response places each initiative on the Grid according to its actual stage, uses appropriately differentiated evidence for each, and specifically investigates the ambiguous Horizon 2 case for a possible vanity-metric mismatch, rather than forcing uniform treatment in either direction.*
*Learning objective tested: #2, #3, #4, #5*
*Difficulty: Hard*

---

## Connections

| | Lesson | Core Idea Carried Forward |
|---|---|---|
| **Previous Lesson** | Lesson 76 — M&A and Product Integration | Extends rationale-matched evaluation from integration decisions into ongoing portfolio-level bet management |
| **Current Lesson** | Lesson 77 — Innovation Accounting and Portfolio Management | Portfolio Health Grid; validated learning vs. vanity metrics; premature cancellation and prolonged survival; Innovation Accounting Metrics Table |
| **Next Lesson** | Lesson 78 — Build, Buy, or Partner: Platform vs. Point Solution Decisions | Uses stage-appropriate portfolio evaluation as an input into whether to build, acquire, or partner for a given capability |
| **Future Concepts Unlocked** | Lesson 80 (Module Synthesis) | Treats the Portfolio Health Grid as established canon alongside Module 8's other strategic frameworks |

This curriculum continues to build as one continuous argument. From this lesson forward, any reference to evaluating a strategic bet's progress assumes you can locate it on the Portfolio Health Grid without re-explanation.

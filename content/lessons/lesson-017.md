# Lesson 17: Problem Statements

## Why This Lesson Matters

Across the last several lessons, you've built a genuine research pipeline: interviews and surveys (Lessons 12–13) feeding personas and journey maps (Lessons 14–15), which surface multiple pain points that you now know how to prioritize using severity and frequency (Lesson 16). What you don't yet have is a single, disciplined artifact that captures the *specific, validated, prioritized* problem you've decided to solve — in a form precise enough that a team can actually be held to it, and specific enough that success or failure can later be judged against it rather than argued about.

A **problem statement** is a concise, structured articulation of a validated, specific problem — who experiences it, in what context, what job it interferes with, and what evidence supports its importance — written deliberately *without* a proposed solution attached. This last point is the crux of the entire lesson: a problem statement's job is to hold a team's attention on the problem long enough to consider multiple possible solutions, rather than letting the first plausible solution smuggle itself into the framing before alternatives have even been considered.

---

## Learning Path

| Field | Detail |
|---|---|
| **Module** | 2 — Users & Research |
| **Current Lesson** | 17 of 90 |
| **Difficulty** | 4 / 10 |
| **Estimated Study Time** | 25 minutes (reading) + 15 minutes (reflection + quiz) |
| **Prerequisites** | Lesson 6 (Jobs To Be Done), Lesson 16 (Pain Points) |
| **Next Lesson** | Lesson 18 — Customer Segmentation |
| **Future Topics Unlocked** | Lesson 21 (MVP — solutions are scoped against a problem statement), Lesson 22 (PRD — typically opens with a problem statement), Module 3 (Product Design) |

---

## Learning Objectives

By the end of this lesson, you will be able to:

1. Define a problem statement and construct one using a structured, solution-free template.
2. Explain why a problem statement must exclude any proposed solution, and identify the specific risks of solution-contaminated framing.
3. Distinguish a well-scoped problem statement from one that is too broad (unactionable) or too narrow (already a disguised solution).
4. Apply evidence citation within a problem statement, connecting it directly to laddered pain points (Lesson 16) and research findings (Lessons 12–13).
5. Use a problem statement as a shared reference point for evaluating whether a proposed solution actually addresses the stated problem.

---

## Prerequisites

Lesson 6 (Jobs To Be Done) and Lesson 16 (Pain Points). This lesson assumes you can ladder a stated request to its underlying job and can characterize a pain point's severity and frequency with real evidence — a problem statement is the formal artifact that packages this prior work into a single, reusable, solution-free reference point.

---

## Theory

### The Core Definition and Template

A problem statement articulates a specific, validated problem without proposing how to solve it. A widely used structural template:

> **[Specific persona/segment]** experiences **[specific pain point, laddered to its root cause]** when trying to **[specific job to be done]**, particularly in **[specific context/circumstance]**. This matters because **[evidence: severity, frequency, and business or user impact]**.

Every clause here is deliberate. Naming a specific persona or segment (Lesson 14) prevents the vague, undifferentiated "users" that plagues so much product communication. Naming the specific, laddered pain point (Lesson 16) — not the surface-level version — ensures the team is working from a validated root cause rather than a first-pass symptom. Naming the specific job (Lesson 6) anchors the problem in what the person is actually trying to accomplish, not in the product's own internal feature vocabulary. Naming the specific context prevents an overly generalized claim that doesn't actually hold across every circumstance. And explicitly citing evidence keeps the statement honest and falsifiable, rather than a plausible-sounding but ultimately unverified assertion.

### Why Solutions Must Be Excluded

The single most important discipline in writing a problem statement is the deliberate, total exclusion of any proposed solution. This might seem like an arbitrary stylistic rule, but it addresses a specific, well-documented cognitive trap: once a solution is named, even in passing, it becomes extraordinarily difficult for a team to genuinely consider alternatives — the named solution anchors all subsequent thinking, discussion, and even the framing of "success," precisely the anchoring effect Lesson 12 warned about in the interview context, now operating at the level of an entire team's problem-framing process.

Consider the difference between:

- **Solution-contaminated (weak)**: "Enterprise customers need a dark mode option because their eyes get strained during long working sessions."
- **Solution-free (strong)**: "Enterprise power users, who report working in the product for multiple continuous hours, experience visual fatigue during long working sessions, particularly on their evening or late-shift usage; this affects roughly 30% of daily active enterprise seats per session-length analytics, and several report reducing time-in-product as a workaround."

The second version leaves entirely open which solution best addresses the fatigue problem — dark mode is one candidate, but so are adjustable brightness controls, scheduled break reminders, session-length-based UI simplification, or something else the team hasn't yet considered. The first version has already, silently, foreclosed all of these alternatives before a single discovery conversation (Lesson 8) has taken place.

```mermaid
%%{init: {
  "theme": "dark",
  "themeVariables": {
    "background": "#0b0b0c",
    "primaryColor": "#1f1f23",
    "primaryTextColor": "#ffffff",
    "primaryBorderColor": "#8b5cf6",
    "lineColor": "#d1d5db",
    "secondaryColor": "#18181b",
    "tertiaryColor": "#111111",
    "mainBkg": "#1f1f23",
    "nodeBorder": "#8b5cf6",
    "clusterBkg": "#000000",
    "clusterBorder": "#27272a",
    "titleColor": "#ffffff",
    "edgeLabelBackground": "#0b0b0c",
    "nodeTextColor": "#ffffff",
    "edgeLabelColor": "#ffffff",
    "actorBorder": "#8b5cf6",
    "actorBkg": "#1f1f23",
    "actorTextColor": "#ffffff",
    "sequenceNumberColor": "#ffffff",
    "signalColor": "#8b5cf6",
    "signalTextColor": "#ffffff",
    "textColor": "#ffffff",
    "classText": "#ffffff",
    "classBorder": "#8b5cf6",
    "classBkg": "#1f1f23"
  }
}}%%
graph TD
    A[Problem Statement Draft] --> B{Does It Name or<br/>Imply a Specific Solution?}
    B -->|Yes| C[Solution-contaminated: Forecloses<br/>Alternatives Before Discovery Begins]
    B -->|No| D[Solution-free: Keeps the Full<br/>Solution Space Open for Discovery]
```

### Scoping: Too Broad vs. Too Narrow

A well-constructed problem statement must be scoped correctly, avoiding two opposite failure modes:

- **Too broad**: "Users find the product hard to use" is so general it provides no meaningful direction for discovery or design — it fails to name a specific persona, a specific pain point, or a specific context, and could describe almost any product issue at all. This mirrors Lesson 7's "for everyone" value proposition failure and Lesson 9's generic-vision failure, applied at the level of problem framing.
- **Too narrow (a disguised solution)**: "Users need a one-click export-to-PDF button" is not actually a problem statement at all — it is a solution wearing a problem statement's grammatical structure, having smuggled in exactly the kind of premature commitment this lesson warns against, without even the courtesy of stating it as an explicit proposal that could be debated as such.

```mermaid
%%{init: {
  "theme": "dark",
  "themeVariables": {
    "background": "#0b0b0c",
    "primaryColor": "#1f1f23",
    "primaryTextColor": "#ffffff",
    "primaryBorderColor": "#8b5cf6",
    "lineColor": "#d1d5db",
    "secondaryColor": "#18181b",
    "tertiaryColor": "#111111",
    "mainBkg": "#1f1f23",
    "nodeBorder": "#8b5cf6",
    "clusterBkg": "#000000",
    "clusterBorder": "#27272a",
    "titleColor": "#ffffff",
    "edgeLabelBackground": "#0b0b0c",
    "nodeTextColor": "#ffffff",
    "edgeLabelColor": "#ffffff",
    "actorBorder": "#8b5cf6",
    "actorBkg": "#1f1f23",
    "actorTextColor": "#ffffff",
    "sequenceNumberColor": "#ffffff",
    "signalColor": "#8b5cf6",
    "signalTextColor": "#ffffff",
    "textColor": "#ffffff",
    "classText": "#ffffff",
    "classBorder": "#8b5cf6",
    "classBkg": "#1f1f23"
  }
}}%%
graph LR
    A[Too Broad Users Find It Hard to Use] --> B[No Meaningful Direction;<br/>Could Describe Almost Any Issue]
    C[Correctly Scoped Specific Persona,<br/>Laddered Pain Point, Specific Context,<br/>Cited Evidence] --> D[Actionable and Falsifiable;<br/>Solution Space Remains Open]
    E[Too Narrow Users<br/>Need a PDF Export Button] --> F[Disguised Solution, Not<br/>a Problem Statement at All]
```

The correctly scoped middle ground is specific enough to be actionable and falsifiable (a team could, in principle, determine whether it has actually been resolved) while remaining entirely agnostic about which solution will resolve it.

### Evidence Citation Within a Problem Statement

A problem statement should cite the specific evidence supporting its claims — directly connecting back to the research techniques covered throughout Module 2. This might include:

- A specific, laddered pain point (Lesson 16), with its established severity and frequency.
- A specific finding from past-behavior interviews (Lesson 12), ideally including a real (never fabricated, per Lesson 14's quote-sourcing rule) representative account.
- A specific, validated prevalence figure from survey or behavioral data (Lesson 13).
- A specific business or strategic consequence tied to the problem (e.g., churn risk in a segment where users and customers are the same person, echoing Lesson 5's Detailed Case Study).

A problem statement without cited evidence is, in effect, an unvalidated assumption wearing a formal-looking structure — precisely the same risk Lesson 14 warned about regarding personas built without research grounding, and Lesson 11's general warning that polished presentation does not confer trustworthiness.

### Using a Problem Statement as a Shared Reference Point

Once written, a problem statement's most important ongoing function is as a **shared reference point** for evaluating proposed solutions later in the process. Given any proposed solution, a team can ask: does this solution actually address the specific persona, pain point, job, and context named in the problem statement — or does it address something adjacent, or something the team has drifted toward without checking? This is directly analogous to Lesson 7's Value Proposition Filter and Lesson 9's Vision Filter, but operating at the level of an individual initiative's problem framing rather than the product's overall strategic direction.

A team that skips writing an explicit problem statement, and instead moves directly from a vague sense of an issue to a specific proposed solution, loses this checking mechanism entirely — there is no stable, solution-free reference point against which to later ask "wait, does this actually solve what we set out to solve?"

---

## Common Beginner Mistakes

**Mistake 1: Including a proposed solution within the problem statement itself**

Even a brief, seemingly harmless mention of a candidate solution anchors the team's thinking and forecloses genuine consideration of alternatives before discovery has even started.

**Mistake 2: Writing a problem statement so broad it provides no real direction**

"Users find this hard to use" fails to name a specific persona, pain point, or context, and could describe almost any product issue — it hasn't actually done the work of specifying a real problem.

**Mistake 3: Writing what is actually a solution, disguised in problem-statement grammar**

"Users need a PDF export button" smuggles in a specific solution without acknowledging it as a proposal, skipping the deliberate solution-agnostic framing this lesson requires.

**Mistake 4: Writing a problem statement with no cited evidence**

A statement built on assumption rather than laddered pain points (Lesson 16) and research findings (Lessons 12–13) is an unvalidated guess dressed up in a formal structure.

**Mistake 5: Never returning to the problem statement once a solution has been proposed**

Without actively using the problem statement as a filter for evaluating the eventual proposed solution, the artifact loses its most important practical function and risks becoming another instance of Lesson 14's "decoration" failure pattern — well-written but never actually used.

---


## Mental Model: The Problem Statement Purity Test

This lesson's mental model is the **Problem Statement Purity Test** — a quick check for whether a draft problem statement has smuggled in a solution.

```mermaid
%%{init: {
  "theme": "dark",
  "themeVariables": {
    "background": "#0b0b0c",
    "primaryColor": "#1f1f23",
    "primaryTextColor": "#ffffff",
    "primaryBorderColor": "#8b5cf6",
    "lineColor": "#d1d5db",
    "secondaryColor": "#18181b",
    "tertiaryColor": "#111111",
    "mainBkg": "#1f1f23",
    "nodeBorder": "#8b5cf6",
    "clusterBkg": "#000000",
    "clusterBorder": "#27272a",
    "titleColor": "#ffffff",
    "edgeLabelBackground": "#0b0b0c",
    "nodeTextColor": "#ffffff",
    "edgeLabelColor": "#ffffff",
    "actorBorder": "#8b5cf6",
    "actorBkg": "#1f1f23",
    "actorTextColor": "#ffffff",
    "sequenceNumberColor": "#ffffff",
    "signalColor": "#8b5cf6",
    "signalTextColor": "#ffffff",
    "textColor": "#ffffff",
    "classText": "#ffffff",
    "classBorder": "#8b5cf6",
    "classBkg": "#1f1f23"
  }
}}%%
graph TD
    A[Draft Problem Statement] --> B{Could This Statement Remain True Under<br/>Five or More Genuinely Different<br/>Possible Solutions?}
    B -->|Yes — the Solution Space Remains Open| C[Passes the Purity Test: a<br/>Genuine Problem Statement]
    B -->|No — Only One Obvious Solution Fits| D[Fails the Purity<br/>Test: a Disguised Solution]
```

Apply this test to any draft problem statement before finalizing it: can you name at least five meaningfully different candidate solutions that would all be consistent with the statement as written? If you can only think of one, the statement has very likely already smuggled that one solution in, whether or not it was named explicitly.

---

## Real Company Example

**Airbnb**'s early internal problem framing, according to widely reported accounts of the company's history, is a useful illustration of solution-free problem articulation. Rather than framing their initial challenge narrowly as "we need better listing photos" (a specific, premature solution), the company's early problem understanding is often described in terms closer to "hosts and guests both lack sufficient trust and information to confidently transact with a stranger's home" — a framing broad enough to encompass photography quality, but also host verification, guest reviews, cancellation policies, and other trust-building mechanisms that were developed as the company matured, none of which would have been considered if the original problem framing had prematurely narrowed to photography alone.

*(Assumption flagged: this reflects a widely reported general characterization of Airbnb's early problem understanding rather than a claim about a specific, verbatim internal problem statement document, which this curriculum does not claim certainty about.)*

---

## Real World Perspective: Problem Statements at Different Company Stages

**At a startup:**
Problem statements are often the central artifact anchoring a founding team's entire early strategy (echoing Lesson 10's strategic diagnosis), and getting the scope right — neither so broad it fails to differentiate the company's focus, nor so narrow it's already a specific solution — is disproportionately consequential, since limited resources leave little room to recover from having solved the wrong, or a prematurely narrowed, problem.

**At a mid-size company:**
Problem statements often become a standard, required input at the start of any significant initiative, frequently reviewed and refined collaboratively across product, design, and engineering before any solution discussion begins, precisely to protect against the anchoring effect this lesson describes, especially in organizations where engineering leaders or executives may otherwise arrive at a kickoff meeting with a specific solution already informally decided.

**At Big Tech:**
Problem statements at scale are often paired with rigorous, quantified evidence citation (given the availability of extensive behavioral and survey data), and a significant part of senior product leadership's review process for major initiatives involves specifically checking whether a proposed problem statement has been kept genuinely solution-free, since large organizations with strong existing technical capabilities are especially prone to reflexively reaching for a familiar solution pattern before the underlying problem has been properly scoped.

---

## Detailed Case Study: The Statement That Was Already a Solution

Consider a simplified, illustrative scenario common across B2B collaboration software.

A team building a document collaboration tool is asked to address user complaints about "not knowing who's currently editing a document." An engineering leader, eager to move quickly, drafts what he calls a "problem statement": "Users need real-time cursor indicators showing who else is currently in a document." The team proceeds directly into a significant engineering effort building live, real-time presence indicators and cursor tracking.

Post-launch usage data shows the real-time presence feature is used by only a small fraction of the target user base, and the original underlying complaint — confusion and occasional accidental overwriting of a colleague's recent edits — persists at nearly the same rate. A subsequent, more disciplined investigation reveals that most complaining users work asynchronously, rarely editing a document at the exact same moment as a colleague; their actual problem was not knowing whether someone *had recently* edited the document (in the last hour or day), not whether someone was editing it at that literal instant — a distinct problem that real-time presence indicators, built for simultaneous editing, do not address at all.

**What went wrong?**

Applying this lesson's frameworks:

1. **The "problem statement" was already a solution.** "Users need real-time cursor indicators" names a specific solution outright, failing the Purity Test immediately — no alternative candidate solutions were ever genuinely considered, because the statement had already foreclosed them.
2. **No persona, laddered pain point, or specific context was named.** A genuine problem statement would have specified which users, doing what job, in what context — and this specificity would likely have surfaced the asynchronous-versus-simultaneous distinction before any engineering investment was made.
3. **No evidence was cited.** The statement was based on an assumption about the nature of the underlying confusion (simultaneous editing) rather than laddered interview findings (Lesson 12) that would have revealed the actual, asynchronous nature of most complaining users' workflows.

A team applying the solution-free template from the outset would likely have written something closer to: "Asynchronous collaborators, who report editing shared documents at different times rather than simultaneously, experience uncertainty about whether a document reflects a colleague's most recent changes, particularly when returning to a document after time away; this has led to several reported instances of accidentally overwriting recent edits." This framing would have left open several possible solutions — a "last edited by, and when" indicator, a change-summary notification, or version history (echoing Lesson 8's own case study) — rather than prematurely committing to real-time presence tracking, a solution aimed at a genuinely different underlying scenario.

This case connects directly back to **Lesson 8's Discovery Theater** concept and **Lesson 6's Job Ladder**: a "problem statement" that is actually a solution has skipped the laddering and discovery work this curriculum has built up across multiple lessons, and the cost — a significant engineering investment addressing the wrong scenario — is a direct, predictable consequence of that skipped step.

---

## Framework Explanation: The Problem Statement Review Checklist

A practical checklist for reviewing any draft problem statement before it is finalized and used to anchor a team's discovery process:

| Question | Purpose |
|---|---|
| Does it name a specific persona or segment (Lesson 14), not an undifferentiated "users"? | Prevents vague, unfocused framing |
| Does it name a laddered, root-cause pain point (Lesson 16), not a surface-level symptom? | Ensures the team is solving the actual underlying issue |
| Does it name a specific job to be done (Lesson 6) and context? | Anchors the problem in a real, specific circumstance |
| Does it cite real evidence (interview findings, survey/behavioral data)? | Prevents an unvalidated assumption dressed as a formal statement |
| Does it pass the Purity Test (at least five genuinely different candidate solutions remain consistent with it)? | Confirms no solution has been prematurely smuggled in |

A problem statement that fails any of these checks should be revised before a team commits meaningful discovery or delivery resources to addressing it.

---

## Interview Perspective: How Interviewers Think About This

**Typical question 1: "Walk me through how you'd write a problem statement for an issue you've identified."**
*What the interviewer is actually evaluating:* Whether the candidate's process explicitly excludes solutions and cites real evidence, versus jumping directly to a specific fix framed as if it were a problem description. A strong answer names the specific template elements (persona, laddered pain point, job, context, evidence) rather than describing an unstructured, intuitive process.

**Typical question 2: "Tell me about a time a project solved the wrong problem, in hindsight."**
*What the interviewer is actually evaluating:* Whether the candidate can identify a real instance of the solution-contaminated problem statement failure — a "problem statement" that was actually a disguised solution from the start — and describe what a more disciplined framing would have looked like, echoing this lesson's Detailed Case Study.

**Typical question 3: "How do you keep a team from jumping straight to a solution before the problem is fully understood?"**
*What the interviewer is actually evaluating:* Fluency with the anchoring risk this lesson describes, and whether the candidate has concrete practices (a solution-free template, the Purity Test, explicit review before discovery begins) rather than a vague intention to "slow things down" without a specific mechanism for doing so.

---

## Summary

A problem statement is a concise, structured articulation of a specific, validated problem — naming a specific persona, a laddered root-cause pain point, a specific job and context, and citing real supporting evidence — deliberately written without any proposed solution. Excluding solutions is the lesson's central discipline, since naming even a passing candidate solution anchors a team's subsequent thinking and forecloses genuine consideration of alternatives before discovery has even begun. A well-scoped problem statement avoids being too broad (providing no real direction, echoing Lesson 7's "for everyone" failure) or too narrow (a disguised solution wearing problem-statement grammar), and should cite real evidence connecting it directly to laddered pain points (Lesson 16) and research findings (Lessons 12–13), rather than resting on unvalidated assumption. The Purity Test — checking whether at least five genuinely different candidate solutions remain consistent with the statement — is a practical, quick diagnostic for catching a prematurely smuggled-in solution, and a finalized problem statement's most important ongoing function is as a shared reference point for evaluating whether an eventually proposed solution actually addresses what the team set out to solve.

---

## Key Takeaways

- A problem statement names a specific persona, a laddered pain point, a specific job and context, and cites real evidence — deliberately excluding any proposed solution.
- Naming a solution, even in passing, anchors a team's subsequent thinking and forecloses genuine consideration of alternatives before discovery begins.
- A well-scoped problem statement is neither too broad (no real direction) nor too narrow (a disguised solution) — it should pass the Purity Test of remaining consistent with at least five genuinely different candidate solutions.
- Evidence citation (laddered pain points, interview findings, survey/behavioral data) distinguishes a genuine problem statement from an unvalidated assumption dressed in formal structure.
- A finalized problem statement's most important ongoing use is as a shared reference point for checking whether an eventually proposed solution actually addresses the stated problem.
- Skipping laddering and writing a "problem statement" that is actually a specific solution is a direct, predictable path to solving the wrong version of a problem, as shown in this lesson's Detailed Case Study.
- Never returning to a problem statement once a solution is proposed risks the same "decoration" failure pattern Lesson 14 warned about for personas — a well-written artifact that's never actually used.

---

## Cheat Sheet

*A two-minute review of everything in this lesson.*

- **Template:** [Specific persona] experiences [laddered pain point] when trying to [specific job], particularly in [specific context]. This matters because [cited evidence].
- **No solutions, ever** — naming one anchors the team and forecloses alternatives before discovery starts.
- **Scope check:** not too broad ("users find it hard"), not too narrow (a disguised solution, e.g., "users need a PDF button").
- **Cite real evidence** — laddered pain points, interview findings, survey/behavioral data — not assumption.
- **Purity Test:** can you name at least five genuinely different candidate solutions consistent with this statement? If not, a solution has been smuggled in.
- **Use it as a filter** — check any eventually proposed solution against the original, solution-free statement.

---

## Glossary

| Term | Definition | Related Concepts | Difficulty |
|---|---|---|---|
| Problem Statement | A concise, structured, evidence-cited articulation of a specific, validated problem, written without a proposed solution. | Job to Be Done (Lesson 6), Pain Points (Lesson 16) | 2 |
| Solution Contamination | The failure of including or implying a specific solution within a problem statement, anchoring subsequent thinking. | Anchoring Effect | 2 |
| Purity Test | A diagnostic checking whether a draft problem statement remains consistent with at least five genuinely different candidate solutions. | Problem Statement | 2 |
| Disguised Solution | A statement written in problem-statement grammar that actually names a specific solution, failing the Purity Test. | Solution Contamination | 2 |

---

## Further Reading / Resources

- Marty Cagan's public writing on the distinction between problems and solutions in product discovery, closely related to this lesson's solution-free discipline.
- Teresa Torres, *Continuous Discovery Habits* — includes practical guidance on framing "opportunities" (closely related to problem statements) in a way that keeps the solution space open.
- Design Thinking methodology resources (e.g., IDEO's public design process documentation) — widely reference solution-free problem framing as a foundational discipline, previewing Lesson 30's deeper treatment of design thinking.

---

## Flashcards

**Card 1**
- Front: What is a problem statement, and what must it deliberately exclude?
- Back: A concise, structured, evidence-cited articulation of a specific, validated problem (persona, laddered pain point, job, context); it must deliberately exclude any proposed solution.
- Difficulty: 1
- Tags: problem-statement, fundamentals

**Card 2**
- Front: Why must a problem statement exclude any proposed solution?
- Back: Naming even a passing candidate solution anchors the team's subsequent thinking, making it extraordinarily difficult to genuinely consider alternatives before discovery has taken place.
- Difficulty: 2
- Tags: solution-contamination

**Card 3**
- Front: What is the Purity Test for a problem statement?
- Back: Checking whether the statement remains consistent with at least five genuinely different candidate solutions — if you can only think of one, a solution has likely already been smuggled in.
- Difficulty: 2
- Tags: purity-test

**Card 4**
- Front: What are the two opposite scoping failures for a problem statement?
- Back: Too broad (provides no real direction, e.g., "users find it hard to use") and too narrow (a disguised solution, e.g., "users need a PDF export button").
- Difficulty: 2
- Tags: scoping-failures

**Card 5**
- Front: What five elements does the problem statement template require?
- Back: A specific persona/segment, a specific (laddered) pain point, a specific job to be done, a specific context, and cited evidence.
- Difficulty: 2
- Tags: problem-statement-template

**Card 6**
- Front: In the Detailed Case Study, why did the "real-time cursor indicator" fix fail to resolve the underlying complaint?
- Back: Most complaining users worked asynchronously rather than simultaneously; their actual problem was not knowing about recent edits, not knowing about edits happening at that literal instant — a distinct problem the "problem statement" (which was already a solution) never actually specified.
- Difficulty: 3
- Tags: case-study

**Card 7**
- Front: What is a problem statement's most important ongoing function once finalized?
- Back: Serving as a shared reference point for checking whether an eventually proposed solution actually addresses the specific persona, pain point, job, and context originally named — directly parallel to the Value Proposition and Vision Filters.
- Difficulty: 2
- Tags: problem-statement-filter


## Reflection Exercise

You are the PM for a fitness app, and your team has surfaced a laddered, validated pain point (Lesson 16): users who set a weekly workout goal report feeling discouraged and often abandon the app entirely after missing just one planned session, rather than adjusting and continuing.

Work through the following, in writing, before reading further:

1. Write a first-draft problem statement using this lesson's template, being careful to name a specific persona, the laddered pain point, the specific job, the context, and cited evidence (you may invent plausible-sounding evidence for this exercise, clearly noting it as illustrative).
2. Apply the Purity Test to your draft: name at least five genuinely different candidate solutions that would all remain consistent with your problem statement as written.
3. Rewrite a "too narrow" version of this same problem that smuggles in one specific solution (e.g., "users need a way to adjust their weekly goal after a missed session"), and explain specifically what alternative solutions this narrower framing would foreclose.
4. Rewrite a "too broad" version of this same problem (e.g., "users get discouraged using the app"), and explain what specific direction is lost compared to your original draft.
5. Using the Problem Statement Review Checklist, identify which element of your original draft (persona, pain point, job, context, or evidence) you are least confident is genuinely research-grounded, and describe what additional evidence you would need to strengthen it.

There is no single correct answer. The purpose of this exercise is to practice constructing a genuinely solution-free problem statement and stress-testing it against the Purity Test, rather than defaulting to the first plausible-sounding fix.

---

## Quiz

**1. Which of the following best completes the problem statement template described in this lesson?**
A) "[Persona] needs [specific feature] to solve [problem]."
B) "[Specific persona] experiences [specific, laddered pain point] when trying to [specific job], particularly in [specific context]. This matters because [cited evidence]."
C) "We should build [feature] because customers are asking for it."
D) "Users are unhappy with the product overall."

*Correct answer: B*
*Explanation: This is the lesson's explicit template, naming a specific persona, laddered pain point, job, context, and cited evidence, while deliberately excluding any proposed solution — unlike the other options.*
*Learning objective tested: #1*
*Difficulty: Easy*

---

**2. Why must a problem statement exclude any proposed solution, according to this lesson?**
A) Because solutions are always technically infeasible at the problem-framing stage
B) Because naming even a passing candidate solution anchors the team's subsequent thinking, making genuine consideration of alternatives extraordinarily difficult
C) Because problem statements are only used by executives, never by engineering teams
D) Because including a solution would make the statement too long

*Correct answer: B*
*Explanation: The lesson explains this exclusion is about preventing the anchoring effect, where a named solution forecloses genuine exploration of the full solution space during subsequent discovery.*
*Learning objective tested: #2*
*Difficulty: Easy*

---

**3. Which of the following is the clearest example of a problem statement that is "too broad," as described in this lesson?**
A) "Users need a PDF export button."
B) "Users find the product hard to use."
C) "Enterprise power users, who report multi-hour continuous sessions, experience visual fatigue during evening usage; this affects roughly 30% of daily active enterprise seats."
D) "Asynchronous collaborators experience uncertainty about a document's most recent changes when returning after time away."

*Correct answer: B*
*Explanation: This statement fails to name a specific persona, pain point, or context, making it too general to provide any real direction for discovery — the defining feature of the "too broad" failure.*
*Learning objective tested: #3*
*Difficulty: Easy*

---

**4. Which of the following is the clearest example of a "disguised solution" masquerading as a problem statement?**
A) "Users need real-time cursor indicators showing who else is currently in a document."
B) "Users experience uncertainty about who has recently edited a shared document."
C) "This affects roughly 40% of asynchronous collaborators per usage analytics."
D) "Asynchronous collaborators, who edit documents at different times, experience uncertainty about recent changes."

*Correct answer: A*
*Explanation: This statement names a specific solution (real-time cursor indicators) outright, rather than describing the underlying problem in solution-agnostic terms — exactly the "too narrow" / disguised-solution failure this lesson warns against.*
*Learning objective tested: #3*
*Difficulty: Easy*

---

**5. What is the Purity Test used for, according to this lesson?**
A) Checking whether a survey question is neutrally worded
B) Checking whether a draft problem statement remains consistent with at least five genuinely different candidate solutions
C) Determining how many personas a team should build
D) Measuring a pain point's severity and frequency

*Correct answer: B*
*Explanation: The Purity Test specifically checks whether multiple, genuinely different solutions remain plausible given the problem statement as written — if only one obviously fits, a solution has likely been smuggled in.*
*Learning objective tested: #2, #3*
*Difficulty: Easy*

---

**6. In the Detailed Case Study, what was the actual underlying problem that the "real-time cursor indicator" solution failed to address?**
A) Users wanted a faster document loading time
B) Most complaining users worked asynchronously and were actually concerned about not knowing whether a document reflected a colleague's most recent changes, not about simultaneous editing
C) Users wanted the ability to delete old document versions
D) Users wanted a way to prevent colleagues from editing documents at all

*Correct answer: B*
*Explanation: The case study explicitly reveals that most complaining users edited documents asynchronously, and their actual concern was about recent changes rather than the literal, simultaneous-editing scenario the built feature addressed.*
*Learning objective tested: #2*
*Difficulty: Easy*

---

**7. Why is citing evidence considered essential in a problem statement, according to this lesson?**
A) Because evidence citation is only required for problems affecting more than half of all users
B) Because a statement built on assumption rather than laddered pain points and research findings is an unvalidated guess dressed up in a formal-looking structure
C) Because evidence citation makes a problem statement legally binding
D) Because problem statements without evidence are always factually false

*Correct answer: B*
*Explanation: The lesson explicitly warns that an uncited problem statement risks being an unvalidated assumption wearing the appearance of rigor, echoing Lesson 11's general warning about polished presentation not conferring trustworthiness.*
*Learning objective tested: #4*
*Difficulty: Medium*

---

**8. What is the most important ongoing function of a problem statement once it has been finalized, according to this lesson?**
A) Serving as a permanent, unchangeable historical record
B) Serving as a shared reference point for checking whether an eventually proposed solution actually addresses the specific persona, pain point, job, and context originally named
C) Replacing the need for any further discovery or research
D) Determining the exact engineering timeline for a project

*Correct answer: B*
*Explanation: The lesson explicitly frames this ongoing filtering function — checking proposed solutions against the original statement — as the problem statement's most important continued use.*
*Learning objective tested: #5*
*Difficulty: Medium*

---

**9. (Scenario) A team writes a problem statement that reads: "Mid-market customers, who manage teams of 10–30 employees, struggle to get timely approval on expense reports, particularly when a manager is traveling; this affects 45% of mid-market accounts per support ticket analysis and interview findings." Does this problem statement pass the Purity Test?**
A) No, because it names a specific solution
B) Yes, since multiple genuinely different solutions (delegate-approval settings, automated approval thresholds, mobile-optimized approval flows, or manager-substitute rules) would all remain consistent with this framing
C) No, because it is too broad and vague
D) It is impossible to determine without knowing the exact engineering team assigned to the project

*Correct answer: B*
*Explanation: This statement names a specific persona, pain point, job, context, and evidence without committing to any single solution, leaving multiple genuinely different candidate solutions open — passing the Purity Test.*
*Learning objective tested: #3*
*Difficulty: Medium-Hard*

---

**10. (Product Thinking) A team proposes a solution and, upon reviewing their original problem statement, realizes the solution actually addresses a different persona and context than the one specified. According to this lesson, what should the team do?**
A) Proceed with the solution anyway, since problem statements are not meant to be checked against later
B) Recognize that the mismatch is a genuine warning sign, and either adjust the solution to better address the originally validated problem, or explicitly revisit and reconsider whether the problem statement itself needs updating based on new evidence
C) Ignore the problem statement entirely and rely solely on the proposed solution's technical merits
D) Discard the proposed solution automatically, without further discussion, whenever any mismatch is found

*Correct answer: B*
*Explanation: This reflects the lesson's guidance on using the problem statement as an active filter — a mismatch should prompt deliberate reconsideration, not automatic rejection or being ignored outright.*
*Learning objective tested: #5*
*Difficulty: Medium-Hard*

---

**11. (Interview Reasoning) A candidate is asked to describe a problem statement they've written, and their description includes a specific named feature as part of the "problem." What might this signal, based on this lesson's Interview Perspective section?**
A) Strong, efficient problem-framing skills
B) A possible instance of solution contamination, since a genuine problem statement should remain agnostic about which specific solution will resolve the underlying issue
C) That the candidate has advanced technical skills
D) Nothing meaningful, since including a solution in a problem statement is standard best practice

*Correct answer: B*
*Explanation: The lesson's Interview Perspective explicitly treats a solution embedded within a described "problem statement" as a weak signal, reflecting the exact anchoring risk this lesson warns against.*
*Learning objective tested: #2*
*Difficulty: Hard*

---

**12. (Product Thinking, Higher Difficulty) A team's problem statement names a specific persona and job, but provides no cited evidence for the claimed pain point's severity or frequency. According to the Problem Statement Review Checklist, what should happen next?**
A) The problem statement should be finalized as-is, since persona and job specification are sufficient on their own
B) The team should gather and cite specific evidence (laddered interview findings, survey or behavioral data) before treating the statement as validated and ready to anchor discovery work
C) The problem statement should be discarded entirely, since it is fundamentally unusable without evidence
D) The team should proceed directly to building a solution, since evidence citation is optional for internal documents

*Correct answer: B*
*Explanation: The Review Checklist explicitly requires cited evidence as one of its criteria; a statement missing this element needs further validation before being treated as a trustworthy, ready-to-use problem statement.*
*Learning objective tested: #4*
*Difficulty: Medium-Hard*

---

**13. (Interview Reasoning, Higher Difficulty) An interviewer describes two draft problem statements and asks a candidate which is better: Draft A specifies a persona, pain point, job, and context but cites no evidence; Draft B specifies a persona and cites strong evidence but is written as "users need feature X to solve their frustration." Which draft has the more fundamental flaw, and why?**
A) Draft A, since missing evidence is always a more severe flaw than solution contamination
B) Draft B, since naming a specific solution ("feature X") forecloses genuine consideration of the full solution space — a more fundamental violation of the problem statement's core purpose than a missing evidence citation, which can still be added later without changing the statement's essential framing
C) Neither draft has any meaningful flaw
D) Draft A, because it is longer than Draft B

*Correct answer: B*
*Explanation: While both drafts have real flaws, this lesson treats solution contamination as the single most important discipline to protect — a solution-contaminated statement undermines the entire purpose of the artifact in a way that a missing (but addable) evidence citation does not.*
*Learning objective tested: #2, #4*
*Difficulty: Hard*

---

**14. (Product Thinking, Higher Difficulty) A team applies the Purity Test to a draft problem statement and can only identify one plausible candidate solution, despite genuine effort to brainstorm alternatives. What does this most likely indicate?**
A) The problem statement is excellent and ready to use, since a single clear solution demonstrates strong problem-framing
B) The problem statement has likely been scoped too narrowly, and may already be a disguised solution requiring broader reframing before discovery begins
C) The team should proceed immediately with the one identified solution, since Purity Test results are not meant to be acted upon
D) The Purity Test is not applicable in cases where only one solution is identified

*Correct answer: B*
*Explanation: The Purity Test's core function is precisely this — an inability to generate multiple genuinely different candidate solutions signals that a solution has very likely already been prematurely smuggled into the framing.*
*Learning objective tested: #3*
*Difficulty: Hard*

---

**15. (Highest Difficulty) A team writes a correctly scoped, evidence-cited, solution-free problem statement, uses it to generate five genuinely different candidate solutions, and ultimately builds one of them. Six months later, usage data shows the built solution has not resolved the original pain point. Using this lesson's framework, what should the team do?**
A) Conclude that problem statements are not useful tools, since the chosen solution failed
B) Return to the original problem statement as the stable reference point, and use it to evaluate the remaining candidate solutions (or generate new ones), rather than assuming the underlying problem itself was invalid
C) Assume the persona and pain point named in the original statement were incorrect, and abandon the entire initiative
D) Build all five originally identified candidate solutions simultaneously, without further evaluation

*Correct answer: B*
*Explanation: This reflects the problem statement's core value as a stable reference point — a failed solution attempt does not invalidate a well-validated problem statement; it simply means the wrong candidate solution (out of several genuinely considered) was chosen, and the team should return to the same evidence-based framing to evaluate alternatives rather than either discarding the discipline or the entire initiative.*
*Learning objective tested: #5*
*Difficulty: Hard*

---

## Connections

| | Lesson | Core Idea Carried Forward |
|---|---|---|
| **Previous Lesson** | Lesson 16 — Pain Points | Provides the laddered, prioritized pain point that becomes the substantive core of a problem statement |
| **Current Lesson** | Lesson 17 — Problem Statements | The solution-free template; the Purity Test; too-broad vs. too-narrow scoping; evidence citation |
| **Next Lesson** | Lesson 18 — Customer Segmentation | Extends persona-level thinking into a more rigorous, quantitatively validated segmentation practice, often used to refine which persona a problem statement should name |
| **Future Concepts Unlocked** | Lesson 21 (MVP) | Uses a finalized, solution-free problem statement as the basis for scoping the smallest viable solution to test |
| | Lesson 22 (Product Requirements Document) | Typically opens by restating the validated problem statement before any solution specification begins |

This curriculum is designed to be read as one continuous argument. From this lesson forward, any reference to "the problem we're solving" assumes the solution-free discipline and Purity Test covered here — this will not be re-explained, only re-applied. Module 2 continues into more advanced segmentation and opportunity-identification territory in the lessons ahead.

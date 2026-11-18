# Editorial and Technical Review — Chapter 01: Understanding Artificial Intelligence

**Handbook:** The AI Foundations Handbook, Level 01 (Beginner Programme)
**Draft reviewed:** Chapter 01, First Edition draft (2026)
**Review type:** Evaluation, corrections, gap analysis and supplementary material
**Review date:** 18 November 2026
**Status:** For founder review. Nothing here is approved for publication until the founder signs it off.

---

## How to read this review

The draft has **not** been rewritten. This document sits beside it. Every item is labelled so the founder can accept, change or reject it on its own.

| Label | Meaning |
|---|---|
| **[ORIGINAL]** | Text quoted from the current draft |
| **[CORRECTION]** | A factual error, or wording likely to mislead, with a suggested fix |
| **[NEW]** | Original supplementary material written for this review, ready to edit and insert |
| **[RECOMMEND]** | An editorial, design or teaching suggestion |

Each factual claim in new material also carries an **evidence status**:

- **Established:** widely accepted and well documented.
- **Debated:** experts genuinely disagree.
- **Emerging:** recent, still developing or likely to change.

**Source verification.** References marked ✔ were checked online during this review. References marked ◐ come from the reviewer's knowledge of the literature and are believed correct, but the bibliographic details should be checked against the original before printing. No statistic, quotation or source has been invented. Where I was unsure, I say so.

---

## Part 1 — Overall Evaluation

### Summary verdict

This is a sound, responsible opening chapter. Its tone is careful and it avoids hype. It keeps returning to human judgement, which is the right message for a beginner programme. Its biggest weaknesses are **depth** and **alignment**. Several learning objectives are stated but barely taught. The history section contains one significant misclassification and leaves out the "AI winters", which are the most useful lesson that history offers. The chapter also uses technical terms such as *tokens*, *parameters* and *model* without explaining them. The assessment checks recall more than understanding.

With the corrections and additions below, it could become a strong, distinctive chapter. Without them, it reads like a well-mannered survey that learners could find anywhere.

### Strengths

1. **Responsible framing.** The chapter keeps separating capability from consciousness, and recommendations from decisions. Few introductory texts do this well.
2. **A good opening example.** The braking-car scenario in Lesson 1.1 makes "intelligence" concrete and works well as a recurring example.
3. **Practical, local orientation.** The South African small-business email scenario is relevant, realistic and carries through to the assessment.
4. **No hype and no doom.** The claims are measured and the limitations are taken seriously.
5. **The history is broadly accurate.** Dates for Turing (1950), Dartmouth (1956), Deep Blue (1997), AlexNet (2012), AlphaGo (2016) and ChatGPT (November 2022) are correct.
6. **A clear structure.** Overview, objectives, lessons, takeaways, assessment and references form a solid textbook skeleton.

### Weaknesses

| # | Weakness | Effect on the learner |
|---|---|---|
| W1 | Learning Objective 3 (traditional programming vs AI) gets one paragraph in Lesson 1.2 | This is the most important idea in the chapter, and it is under-taught |
| W2 | There is no map of how AI, machine learning, deep learning and generative AI relate | Learners will mix up these terms for the rest of the programme |
| W3 | The history omits the AI winters and places Deep Blue under "machine learning" | Learners get a smooth success story that hides the most useful lesson: hype is followed by disappointment |
| W4 | *Tokens*, *parameters*, *model*, *training data* and *neural network* are used but not defined | This breaks the brief's rule to explain unfamiliar terminology |
| W5 | Lesson 1.3's "original motivation" lists modern business goals | It is anachronistic. The 1956 motivation was mainly scientific |
| W6 | There are no real, documented case studies, only hypothetical ones | The chapter loses credibility and memorability |
| W7 | The limitations section misses hallucination (as a named concept), automation bias, misinformation and deepfakes, environmental cost, intellectual property and workforce effects | The coverage of risk is incomplete for a 2026 audience |
| W8 | There are no in-chapter activities, reflection prompts or "check your understanding" points | The chapter is passive. Understanding is assumed, not built |
| W9 | The assessment does not cover Objectives 2 and 3, the multiple-choice distractors are implausible, and there is no marking guide | The assessment cannot show whether the objectives were met |
| W10 | The reference list has no editions, years for some items, or DOIs, and it mixes "cited" with "recommended" | It falls short of academic standard and is hard to verify |
| W11 | The prose overuses short single-sentence paragraphs and hedging ("may", "certain", "some") | The text reads padded and occasionally vague |

---

## Part 2 — Priority Corrections (accuracy and potential to mislead)

These should be fixed before any other work.

### C1. Deep Blue is misclassified as a machine-learning milestone — Lesson 1.4

**[ORIGINAL]** Deep Blue appears under the heading *"1990s–2000s: Machine learning develops."*

**[CORRECTION]** Deep Blue was mainly a **search** system. It used custom chess hardware to evaluate on the order of 200 million positions per second, guided by an evaluation function that was built and tuned with input from chess experts. It did not learn to play chess from data in the way modern systems do. Under this heading, learners will reasonably conclude that Deep Blue "learned" chess. That conclusion is wrong, and it confuses the key distinction in Objective 3.

**Suggested fix:** Keep Deep Blue in the timeline, but describe it as *"a landmark for specialised search and hardware, not machine learning."* Then contrast it with AlphaGo (2016), which combined deep neural networks trained on data and self-play with tree search. This contrast is a powerful teaching device: *two famous game victories, two very different kinds of AI.* (Established)

**Additional detail:** Kasparov won the first match against Deep Blue in 1996. The upgraded machine won the 1997 rematch 3½–2½. (Established)

Source: Campbell, Hoane & Hsu (2002) ◐; Silver et al. (2016) ◐.

### C2. "Google's AlphaGo" and "professional Go player Lee Sedol" — Lesson 1.4

**[CORRECTION]** AlphaGo was developed by **DeepMind**, a London-based research company acquired by Google in 2014. Write: *"AlphaGo, developed by DeepMind (owned by Google)…"*

Lee Sedol was not just "a professional". He was one of the strongest players in the world at the time. AlphaGo had already beaten professional player Fan Hui 5–0 in October 2015. The March 2016 match against Lee Sedol in Seoul ended 4–1. (Established)

Source: Silver et al. (2016) ◐.

### C3. AlexNet: "a significant breakthrough" is vague — Lesson 1.4

**[CORRECTION / ENRICHMENT]** Give the learner the number that made it significant. In the 2012 ImageNet challenge, AlexNet achieved a top-5 error rate of about **15.3%**, against about **26.2%** for the next-best entry. It was trained on **graphics processing units (GPUs)**, which helped establish GPUs as standard hardware for deep learning. Explain "top-5 error" in a margin note: *the percentage of images where the correct label was not among the model's five best guesses.* (Established)

Source: Krizhevsky, Sutskever & Hinton (2012) ◐.

### C4. The "original motivation" is anachronistic — Lesson 1.3

**[ORIGINAL]** *"The original motivation — 1. Automating complex tasks; 2. Improving decision support; 3. Processing information at scale…"*

**[CORRECTION]** These are mostly **modern, practical** motivations. The founding motivation stated in the 1955 Dartmouth proposal was a **scientific conjecture**: that every aspect of learning or any other feature of intelligence could, in principle, be described precisely enough for a machine to simulate it.

**Suggested fix:** Split the lesson into two strands.
- **Scientific motivation:** to understand intelligence by trying to build it.
- **Practical motivation:** to build useful tools (the draft's current list belongs here).

This also sets up Lesson 1.6. If you build a system that *behaves* intelligently, have you learned anything about how *humans* think? (Established)

Source: McCarthy, Minsky, Rochester & Shannon (1955/2006) ✔.

### C5. The comparison table implies that AI keeps learning from experience — Lesson 1.6

**[ORIGINAL]** *"Current AI systems: Learn through training processes and data."*

**[CORRECTION]** This line is true, but beginners commonly assume that a chatbot learns from each conversation. In most deployed systems, the model's parameters are **fixed after training**. The model does not change because you corrected it in a chat. Two nuances belong in the text:
1. Some products keep "memory" features. These store notes about the user *outside* the model and feed them back in later.
2. Depending on the provider and the user's settings, conversations may be collected and used to train *future* versions.

This matters for both accuracy and privacy (see Lesson 1.7). (Established. Product behaviour varies and changes, so treat it as Emerging and date-stamp it.)

### C6. Unexplained technical terms — Lesson 1.6

**[ORIGINAL]** *"A large language model… generates text by estimating likely sequences of tokens based on the input and its learned parameters."*

**[CORRECTION]** Beginners will not know *token*, *parameter* or *large language model*. Either define them inline or move the technical sentence into a "Look closer" box (see N8 below). Also consider that "estimating likely sequences" undersells modern systems, which are also refined after initial training using human feedback. The text should state the established mechanism and flag the open question honestly (see N8).

### C7. Expert systems: dating and example — Lesson 1.4

**[CORRECTION / ENRICHMENT]** The best-known medical expert system, **MYCIN** (Stanford University), was developed in the **1970s**. It recommended antibiotic treatments for certain bacterial infections and was never put into routine clinical use. The **commercial** boom in expert systems came in the 1980s, for example DEC's **XCON (R1)**, which configured computer system orders. Replace the generic "a medical expert system could…" with these named, real examples. Also name the core weakness: the **knowledge-acquisition bottleneck**. Extracting rules from human experts, and keeping them up to date, was slow and expensive. (Established)

Source: Nilsson (2010) ◐; Russell & Norvig (2020) ◐.

### C8. "Programme" vs "program"

**[CORRECTION]** In British and South African English, *programme* is used for a course, plan or broadcast. *Program* is used for computer software. The draft uses "programmes" for software in Lesson 1.4 ("developed programmes capable of…", "computer programmes designed to imitate…") and in Assessment Q4. Change these to **program/programs**, and keep "Beginner Programme" as it is.

### C9. The 1940s are named but not covered — Lesson 1.4

**[CORRECTION / ENRICHMENT]** The heading says "1940s–1950s", but the earliest event mentioned is from 1950. Add **McCulloch and Pitts (1943)**, the first mathematical model of an artificial neuron. It is the root of today's neural networks, and it gives learners a direct line from 1943 to ChatGPT. (Established)

Source: McCulloch & Pitts (1943) ◐.

### C10. Minor copy corrections

- "The industrial revolution" → "the **Industrial Revolution**".
- Lesson 1.2 defines intelligence as "the ability to acquire and apply knowledge…", although Lesson 1.1 says there is no agreed definition. Label it: *"A working definition for this handbook:"*.
- The table heading "Different forms of human intelligence" may be confused with Howard Gardner's theory of multiple intelligences. The table actually lists **components of intelligent behaviour**. Rename it.
- Supermarket example: if anyone suggests adding the well-known "beer and nappies" retail story, **don't**. It is widely considered an unverified anecdote. The underlying technique, *association rule mining*, is real and documented (Agrawal, Imieliński & Swami, 1993 ◐).

---

## Part 3 — Missing Educational Content (gap analysis)

| Gap | Why it matters | Where it belongs | Supplied below |
|---|---|---|---|
| G1. How AI, ML, deep learning and generative AI relate | This is the foundational vocabulary for the whole programme | Lesson 1.2 | N3 |
| G2. Authoritative definitions of AI | Shows learners that definitions are contested and connects to policy and law | Lesson 1.2 | N2 |
| G3. Traditional programming vs machine learning, taught properly | It is Objective 3 | Lesson 1.2 (or a new Lesson 1.3) | N4 |
| G4. Narrow AI vs general AI | Learners hear "AGI" in the media and need it placed as debated, not established | Lesson 1.2 or 1.6 | N5 |
| G5. Symbolic (rule-based) vs learning-based AI | This is the organising idea behind the whole history | Lesson 1.4 | N6 |
| G6. AI winters and hype cycles | The most transferable lesson from history | Lesson 1.4 | N7 |
| G7. Neural networks, backpropagation, transformers | The draft jumps from 2016 to ChatGPT with no mechanism in between | Lesson 1.4 | N7 |
| G8. Moravec's paradox | Explains why AI beat chess champions before it could fold laundry | Lesson 1.1 | N1 |
| G9. ELIZA and the "ELIZA effect" | Explains why fluent output feels like understanding | Lesson 1.6 | N8 |
| G10. The model vs the product | A chatbot is a model plus a wrapper (search, tools, memory, safety filters) | Lesson 1.6 | N8 |
| G11. Real, documented case studies | Credibility and memorability | Lessons 1.5 and 1.7 | N9, N10 |
| G12. Hallucination, automation bias, deepfakes, environmental cost, intellectual property, jobs | A complete risk picture | Lesson 1.7 | N10 |
| G13. South African context: POPIA, languages, courts, national policy | Relevance for the primary audience | Lessons 1.5 and 1.7 | N9, N11 |
| G14. Glossary | The brief requires terms to be explained | End of chapter | N12 |

---

## Part 4 — Original Supplementary Material

All material in this part is **[NEW]**. It is written to be edited, shortened or rejected.

---

### N1. [NEW] For Lesson 1.1 — "Easy for us, hard for machines"

> **Look closer: Moravec's paradox**
>
> In the 1980s, the robotics researcher Hans Moravec noticed something surprising. Tasks that humans find hard, such as advanced mathematics or chess, turned out to be relatively easy for computers. Tasks that humans find effortless, such as recognising a friend across a busy room, walking over uneven ground or picking up an egg without breaking it, turned out to be extremely hard.
>
> Why? Skills like perception and movement were refined over hundreds of millions of years of evolution. We do them without noticing, so we underestimate how complex they are. Abstract reasoning is evolutionarily recent, and we do it slowly and consciously, so it *feels* hard.
>
> **Why this matters for you:** you cannot judge how "intelligent" an AI system is by how impressive the task looks to a human. A system that writes a convincing essay may still fail at something a child finds simple.
>
> *(Established observation. Moravec, 1988.)*

**Optional addition: the intelligence loop.** The braking-car example already contains a model that AI researchers use. An **agent** perceives its environment, decides, and acts, in a continuous loop. Name the loop and reuse it all chapter:

```
   ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
   │   PERCEIVE   │ ──► │    DECIDE    │ ──► │     ACT      │
   │ (see the car │     │ (brake, how  │     │ (press the   │
   │  braking)    │     │  hard?)      │     │  pedal)      │
   └──────────────┘     └──────────────┘     └──────┬───────┘
          ▲                                         │
          └──────────── environment changes ◄───────┘
```

A driver, a spam filter and a self-driving car can all be described with this loop. *(Established framing. Russell & Norvig, 2020, centre their textbook on intelligent agents.)*

**Supporting fact for "no universal definition":** Legg and Hutter (2007) collected and compared more than 70 definitions of intelligence from psychology and AI research. They proposed that intelligence measures *"an agent's ability to achieve goals in a wide range of environments."* This would be a good optional quotation, because it bridges human and machine intelligence. ◐

---

### N2. [NEW] For Lesson 1.2 — "How experts define AI"

> **Definitions in practice**
>
> There is no single official definition of artificial intelligence, but some definitions carry special weight.
>
> **A founder's definition.** John McCarthy, who coined the term "artificial intelligence" in the 1955 Dartmouth proposal, later described AI as *"the science and engineering of making intelligent machines, especially intelligent computer programs."* ◐
>
> **A policy definition.** In November 2023, the Organisation for Economic Co-operation and Development (OECD) updated its definition of an *AI system*, which many governments use as a reference point:
>
> *"An AI system is a machine-based system that, for explicit or implicit objectives, infers, from the input it receives, how to generate outputs such as predictions, content, recommendations, or decisions that can influence physical or virtual environments. Different AI systems vary in their levels of autonomy and adaptiveness after deployment."* ✔
>
> **Unpacking the policy definition:**
> - *machine-based*: it runs on computers.
> - *objectives*: it is built to achieve something, even if that goal is never written down.
> - *infers*: it works out an output from its input, rather than only looking up a fixed answer.
> - *outputs*: predictions, content, recommendations or decisions.
> - *autonomy and adaptiveness*: some systems act with little human involvement, and some keep changing after release.
>
> **Notice the difference.** McCarthy's definition is about a *field of study*. The OECD's is about a *type of system*, written so that laws and regulations can identify what they apply to. The European Union's AI Act uses a closely aligned definition. ✔

**[RECOMMEND]** Ask learners to apply the OECD definition to three things (a thermostat, a spam filter, a chatbot) and decide whether each is an "AI system". The thermostat is a good debate starter. A simple thermostat follows a fixed rule and does not *infer*, so it is generally not considered AI.

---

### N3. [NEW] For Lesson 1.2 — "The AI family map"

**[RECOMMEND] Diagram D1 (essential):** a set of nested regions.

```
┌─────────────────────────────────────────────────────────┐
│  ARTIFICIAL INTELLIGENCE                                │
│  Any technique that lets machines perform tasks         │
│  associated with intelligence (includes rule-based      │
│  systems, search, planning…)                            │
│   ┌─────────────────────────────────────────────────┐   │
│   │  MACHINE LEARNING                               │   │
│   │  Systems that learn patterns from data          │   │
│   │   ┌─────────────────────────────────────────┐   │   │
│   │   │  DEEP LEARNING                          │   │   │
│   │   │  ML using many-layered neural networks  │   │   │
│   │   │   ┌─────────────────────────────────┐   │   │   │
│   │   │   │  GENERATIVE AI / LLMs           │   │   │   │
│   │   │   │  Deep learning models that      │   │   │   │
│   │   │   │  produce new text, images, etc. │   │   │   │
│   │   │   └─────────────────────────────────┘   │   │   │
│   │   └─────────────────────────────────────────┘   │   │
│   └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

**Accompanying text:**

> Every large language model is an example of deep learning. All deep learning is machine learning, and all machine learning is AI. The reverse is not true. A chess program that searches through moves using hand-written rules is AI but not machine learning, and a spam filter can use machine learning without deep learning.
>
> **A note for accuracy:** "Generative AI" describes *what a system does* (it generates content), not a single technique. Today's leading generative systems are built with deep learning, which is why the diagram places them there.

**Evidence status:** Established as a teaching simplification. Advanced learners will later meet hybrid systems that sit across these boundaries.

---

### N4. [NEW] For Lesson 1.2 (or a new standalone lesson) — "Two ways to make a computer do something"

This section is designed to fully teach **Learning Objective 3**.

> **Traditional programming: you write the rules.**
> A programmer studies the problem, writes explicit instructions, and the computer follows them exactly.
>
> **Machine learning: you supply examples, and the system finds the rules.**
> The programmer gathers many examples where the correct answer is already known. A learning algorithm adjusts a mathematical **model** until it reproduces those answers as closely as it can. The model can then be applied to new cases it has never seen.

**[RECOMMEND] Diagram D2 (essential):**

```
TRADITIONAL PROGRAMMING
    Rules (written by people)  ─┐
                                ├──►  [ Computer ]  ──►  Answers
    Data                       ─┘

MACHINE LEARNING (training)
    Data (examples)            ─┐
                                ├──►  [ Learning algorithm ]  ──►  Model (learned "rules")
    Answers (labels)           ─┘

MACHINE LEARNING (use)
    New data  ──►  [ Model ]  ──►  Predicted answers
```

**Worked example: filtering spam email**

| | Rule-based approach | Machine-learning approach |
|---|---|---|
| How it is built | Staff write rules: "If the subject contains 'FREE MONEY', mark as spam" | The system is shown many emails already labelled "spam" or "not spam" and learns which features tend to signal spam |
| Strength | Transparent. You can read exactly why an email was blocked | Can detect patterns nobody wrote down, and can be retrained as spam changes |
| Weakness | Spammers change wording ("FR3E M0NEY") and every new trick needs a new rule | Needs a lot of good labelled data, can make mistakes nobody predicted, and can be harder to explain |
| Who decides what counts as spam? | The rule-writer | The people who labelled the training examples, which makes their judgement part of the system |

The last row prepares learners for the discussion of bias in Lesson 1.7: **in machine learning, human judgement does not disappear. It moves into the data.**

**[RECOMMEND] Key sentence to bold in the text:** *Traditional programs follow rules people wrote. Machine-learning systems follow patterns they found in examples people chose.*

---

### N5. [NEW] For Lesson 1.2 or 1.6 — "Narrow AI and general AI"

> **Narrow AI** (sometimes called *weak AI*) refers to systems designed for specific tasks: recognising faces, translating text, recommending films. **Every AI system in use today is generally considered narrow**, although modern language models are notably broader than earlier systems. *(Established that today's systems are task-bounded. How "general" current models are is Debated.)*
>
> **Artificial general intelligence (AGI)** refers to a hypothetical system that could learn and perform the full range of intellectual tasks a human can, at or above human level. There is **no agreed definition** of AGI, no agreed test for it, and serious disagreement among researchers about whether, when and how it might be achieved. *(Debated.)*
>
> **How to read headlines:** when a company or commentator says AGI is "near" or "impossible", treat it as a prediction or opinion, not an established fact. Ask: *How are they defining AGI? What evidence are they offering? Do they have a financial or reputational interest in the answer?*

---

### N6. [NEW] For Lesson 1.4 — "Two traditions in AI"

> Throughout AI's history, two broad approaches have competed and, more recently, combined.
>
> | | Symbolic AI ("rules and logic") | Learning-based AI ("patterns from data") |
> |---|---|---|
> | Core idea | Represent knowledge as symbols and rules, then reason with them | Let a system learn from examples |
> | Typical examples | Expert systems, logic programs, classic chess engines | Neural networks, modern image recognition, large language models |
> | Strength | Explainable and precise | Handles messy, real-world data such as images, speech and everyday language |
> | Weakness | Brittle when the world doesn't fit the rules, and rules are expensive to write | Needs large amounts of data and computing power, and its reasoning is hard to inspect |
> | Era of dominance | Roughly 1950s–1980s | Roughly 2010s–today |
>
> Many researchers now explore **hybrid** systems that combine both. *(Established history. Which approach leads in future is Debated.)*

This table also lets learners place every milestone on the timeline into one of two columns, which makes a good exercise (see E4).

---

### N7. [NEW] For Lesson 1.4 — revised and expanded timeline

**[RECOMMEND]** Replace the prose decades with a **visual timeline (Diagram D3)** and keep the prose for the "why it mattered" commentary. New entries are marked ★.

| Year | Milestone | Why it matters | Tradition |
|---|---|---|---|
| ★ 1943 | McCulloch & Pitts publish a mathematical model of a neuron | The root idea of neural networks | Learning (early) |
| 1950 | Turing publishes *Computing Machinery and Intelligence* and proposes the "imitation game" | Reframes "Can machines think?" as a question about behaviour | — |
| 1955–56 | Dartmouth proposal and summer workshop; the term "artificial intelligence" is coined | AI becomes a named research field | — |
| ★ 1958 | Rosenblatt's **perceptron**, an early machine that learns from examples | The first widely publicised learning machine | Learning |
| ★ 1966 | Weizenbaum's **ELIZA**, a simple pattern-matching chatbot | People attributed understanding to it (the "ELIZA effect") | Symbolic |
| ★ 1973–mid-1980s | **First AI winter.** In the UK, the Lighthill Report (1973) criticised AI's progress and contributed to funding cuts. Funding also fell in the US | Promises outran results | — |
| ★ 1970s | **MYCIN** expert system (Stanford) for antibiotic recommendations | Showed that expert-level rules could work in a narrow domain | Symbolic |
| 1980s | Commercial expert systems boom (e.g., DEC's XCON) | AI enters business | Symbolic |
| ★ 1986 | Rumelhart, Hinton & Williams popularise **backpropagation** for training multi-layer neural networks (the idea had earlier origins) | The core training method behind modern deep learning | Learning |
| ★ Late 1980s–early 1990s | **Second AI winter.** The specialised AI-hardware market collapsed and expert systems proved costly to maintain | Hype is followed by disappointment, again | — |
| 1997 | **Deep Blue** defeats Kasparov | A landmark for **search and specialised hardware**, not machine learning (see C1) | Symbolic / search |
| 2012 | **AlexNet** wins ImageNet by a wide margin using GPUs (see C3) | The start of the deep-learning boom | Learning |
| 2016 | **AlphaGo** (DeepMind) defeats Lee Sedol 4–1 | Learning combined with search conquers a game too vast for brute force | Hybrid |
| ★ 2017 | Google researchers publish *"Attention Is All You Need"*, introducing the **transformer** architecture | The design underlying today's large language models. The "T" in GPT stands for *transformer* | Learning |
| ★ 2020 | DeepMind's **AlphaFold 2** achieves a major advance in predicting protein structures | AI as a tool for scientific discovery, not only for consumer products | Learning |
| 2022 | OpenAI releases **ChatGPT** (30 November) | Generative AI reaches the general public | Learning |
| ★ 2024 | The Nobel Prize in Physics goes to John Hopfield and Geoffrey Hinton for foundational work on neural networks. Part of the Chemistry prize goes to Demis Hassabis and John Jumper for AlphaFold | Formal scientific recognition of the field's foundations | — |

**[NEW] Replacement for "Why this history matters":**

> **Three lessons from AI's history**
>
> 1. **Progress comes in waves.** Twice, high expectations were followed by "AI winters", periods of reduced funding and interest when the technology failed to deliver what had been promised. Whether today's boom will continue, level off or correct is a genuine open question. *(The winters are Established. Predictions about the future are Opinion.)*
> 2. **Ideas often wait for the hardware and data to catch up.** Neural networks were proposed in the 1940s and 1950s, but they only became dominant after 2012, once large datasets and GPU computing became available.
> 3. **The definition of "AI" keeps moving.** Once a technique works reliably, such as route planning, spell-checking or spam filtering, people often stop calling it AI. Researchers call this the **"AI effect."** Much of the AI around you no longer carries that label. *(The phenomenon is widely discussed, for example by McCorduck, 2004 ◐.)*

---

### N8. [NEW] For Lesson 1.6 — "What's actually happening inside a chatbot?"

> **Look closer: how a large language model produces text**
>
> - A **large language model (LLM)** is a deep-learning model trained on very large amounts of text.
> - Text is broken into **tokens**: small chunks that may be whole words, parts of words or punctuation. "Unbelievable" might become "un", "believ" and "able".
> - The model contains billions of adjustable numbers called **parameters**. During training, these are gradually adjusted so the model becomes better at predicting the next token in a passage of text.
> - When you send a message, the model calculates the likelihood of every possible next token, one token is selected, and the process repeats, building the response one token at a time.
> - Most modern chat assistants are then **further trained using human feedback**. People rate or compare responses, and the model is adjusted to be more helpful and to follow instructions better.
>
> *(Established: Vaswani et al., 2017; Ouyang et al., 2022 ◐.)*

> **The model is not the whole product.** The chat assistant you use is usually a model *plus* other software: safety filters, web search, document upload, calculators, "memory" features and more. When an assistant gives a correct, up-to-date answer, that may be because it searched the web, not because the model "knew" it. When reasoning about what AI can do, ask: *Is this the model, or a tool the product connected to it?*

> **The ELIZA effect.** In 1966, Joseph Weizenbaum built ELIZA, a simple program that imitated a therapist by rephrasing users' sentences as questions. It had no understanding of meaning. Weizenbaum was nevertheless disturbed to find that some users became emotionally attached to it and treated it as if it understood them. The tendency to attribute understanding to fluent machine output is now called the **ELIZA effect**. Modern systems are vastly more capable than ELIZA, which makes the effect stronger, not weaker. *(Established. Weizenbaum, 1966; 1976 ◐.)*

> **Does a language model "understand"? What is known and what is debated.**
>
> | Statement | Status |
> |---|---|
> | LLMs are trained mainly to predict the next token | Established |
> | LLMs can produce fluent, useful and often correct text across many subjects | Established |
> | LLMs can produce confident, fluent text that is false | Established |
> | LLMs have no subjective experience (consciousness) | No established evidence that they do. The question is Debated in philosophy and science |
> | "LLMs are *only* autocomplete and understand nothing" | Debated. Research into what these models represent internally (called *interpretability*) is active and unresolved |
> | LLMs understand the world the way humans do | Not supported by current evidence |

> **A classic thought experiment: the Chinese Room (Searle, 1980).** Imagine a person who speaks no Chinese, locked in a room with a rulebook for manipulating Chinese symbols. People pass in questions written in Chinese. By following the rules, the person passes back fluent answers. To those outside, the room "understands" Chinese, yet the person inside understands nothing. Searle argued that running a program is never, by itself, enough for understanding. Many philosophers reject his argument. Some respond that the *whole system* (person plus rulebook) might understand. The debate remains unresolved, which makes it an excellent class discussion. *(Debated. Searle, 1980 ◐.)*

**[RECOMMEND]** Connect this back to Turing (Lesson 1.4). Turing deliberately avoided the question of inner understanding and proposed judging behaviour instead. Searle argued that behaviour is not enough. Together they frame the debate in Lesson 1.6.

---

### N9. [NEW] For Lesson 1.5 — documented case studies

The draft's everyday examples are accurate, but they are all hypothetical. Each case below is real and documented. I suggest including two or three as boxed "Case Study" panels.

> **Case study: AI that screens for diabetic eye disease (healthcare)**
> In April 2018, the US Food and Drug Administration (FDA) authorised **IDx-DR**, the first AI-based medical device permitted to give a screening result for diabetic retinopathy (diabetes-related eye damage) *without* a specialist needing to interpret the image. It is designed for use in primary-care settings, where eye specialists may not be available. A positive or unclear result refers the patient to an eye-care professional.
> **Discussion:** How is this different from "AI replacing doctors"? What safeguards does the referral step provide? *(Established. FDA, 2018 ◐.)*

> **Case study: an airline is held responsible for its chatbot (customer service)**
> In 2022, a customer asked Air Canada's website chatbot about bereavement fares. The chatbot incorrectly said the discount could be claimed after travel, although the airline's own policy page said otherwise. When the airline refused the refund, the customer took the case to British Columbia's Civil Resolution Tribunal. In February 2024, the tribunal rejected Air Canada's argument that the chatbot was responsible for its own statements. It found the airline liable for negligent misrepresentation.
> **Why it matters for the chapter scenario:** a business is responsible for what its AI tells customers. This links directly to the Section C assessment. *(Established. Moffatt v. Air Canada, 2024 BCCRT 149 ✔. Note: this is a tribunal decision, not a binding court precedent.)*

> **Case study: AI-generated fake legal citations in South African courts**
> - In **Parker v Forsyth NO and Others** (Johannesburg Regional Court, June 2023), the plaintiff's legal team relied on case authorities that turned out not to exist. The cases had been found using ChatGPT. The court made a punitive costs order. ✔
> - In **Mavundla v MEC: Department of Co-operative Government and Traditional Affairs, KwaZulu-Natal** (KwaZulu-Natal High Court, Pietermaritzburg, 8 January 2025), most of the authorities cited in a filing were found to be fictitious, and the court referred the matter to the Legal Practice Council. The judgment itself did not definitively conclude that AI generated the citations. Commentators have noted that the pattern is consistent with AI fabrication. ✔
> **Lesson:** AI tools can produce references that look real but are fabricated. Professionals remain accountable for anything they submit. *(Established. See references; the courts' own wording should be checked before quoting.)*

> **Case study: confidential code shared with a chatbot (privacy and security)**
> In 2023, it was widely reported that Samsung employees had pasted confidential material, including source code, into a public generative-AI service. The company then restricted employee use of such tools on company devices.
> **Discussion:** What should a company policy on AI tools say? *(Established. Widely reported May 2023, e.g., Bloomberg ◐; confirm the primary report before print.)*

**[RECOMMEND] South African language example (Lesson 1.5 or 1.7).**
> South Africa has 12 official languages, with South African Sign Language added in 2023. AI translation and voice tools generally perform best in languages with large amounts of digital text, such as English. Performance is often weaker for languages with less online text, including many African languages. Research communities such as **Masakhane**, a grassroots network focused on natural language processing for African languages, are working to address this gap.
> *(Established in general terms. Nekoto et al., 2020 ◐. Avoid quoting performance figures for specific products, because these change quickly.)*

---

### N10. [NEW] For Lesson 1.7 — completing the picture of risks and limitations

**Add these named concepts:**

> **Hallucination.** The common term for when an AI system produces information that sounds plausible but is false or unsupported, such as a non-existent court case, an invented statistic or a fake quotation. Hallucinations are not "lies", because the system has no intention to deceive. They follow from how generative models produce likely-sounding text. *(Established phenomenon. Some researchers dislike the term "hallucination" and prefer "fabrication" or "confabulation". The terminology is Debated.)*

> **Automation bias.** The human tendency to over-trust automated systems: accepting their outputs without enough checking, or failing to notice when they are wrong. It is well documented in aviation and healthcare, long before generative AI. The more polished an AI's output looks, the more important this becomes. *(Established. Parasuraman & Manzey, 2010 ◐.)*

> **Bias, made concrete.**
> - The **Gender Shades** study (Buolamwini & Gebru, 2018) tested three commercial systems that classified the gender of faces in photos. Error rates were as low as 0.8% for lighter-skinned men but as high as 34.7% for darker-skinned women. The study also found that widely used benchmark datasets were made up overwhelmingly of lighter-skinned faces. ✔
> - In 2018, Reuters reported that Amazon had abandoned an experimental recruitment tool after finding that it downgraded CVs associated with women. The system had learned from historical hiring data from a male-dominated industry. ◐
> **Link back to N4:** in both cases, the bias came from the *data the system learned from*.

> **Other risks to name briefly** (each can be developed in later chapters):
> - **Misinformation and deepfakes.** Realistic synthetic images, audio and video can be used to deceive. *(Established.)*
> - **Intellectual property.** Questions about training on copyrighted material, and about who owns AI-generated output, are the subject of active litigation and legislation in several countries. *(Emerging. Avoid stating outcomes as settled.)*
> - **Environmental cost.** Training and running large AI models uses significant electricity and, in some data centres, water for cooling. The International Energy Agency has published analysis of AI's energy demand. *(Established in general. Specific figures are Emerging and should be sourced to a named, dated report: IEA, 2025 ◐.)*
> - **Work and jobs.** AI is changing tasks within many jobs. Its overall effect on employment is **Debated**, and forecasts vary widely. Present projections as projections, with their source and date.

**[NEW] A practical verification routine.** This is original, and it reinforces the chapter's closing line:

> **The CHECK routine for AI output**
>
> - **C — Claims:** What factual claims does the output make? Highlight names, numbers, dates, quotations and references.
> - **H — Head to a source:** Verify each important claim against an original, reliable source, not another AI answer.
> - **E — Errors and omissions:** What might be missing, outdated or one-sided?
> - **C — Context:** Is this right for *your* situation, audience, country and law?
> - **K — Keep responsibility:** You are accountable for what you use, send or submit.

---

### N11. [NEW] South African regulatory context (Lesson 1.7 sidebar)

> **AI and personal information in South Africa**
>
> The **Protection of Personal Information Act 4 of 2013 (POPIA)** governs how organisations collect, use, store and share personal information about people. Its main provisions became enforceable on 1 July 2021. When a business pastes customer emails into an AI tool, it may be processing personal information, and if the service is hosted abroad, it may be transferring that information outside South Africa (POPIA section 72 deals with such transfers).
>
> Practical guidance for the chapter scenario: check your organisation's policy, use approved business tools, remove personal details where possible, and seek proper advice where unsure. *This is general information, not legal advice.* ◐
>
> **National AI policy.** The Department of Communications and Digital Technologies (DCDT) released a *National AI Policy Framework* for consultation in 2024. A *Draft National AI Policy* was published for public comment in April 2026 and then **withdrawn later that month**. Check the DCDT's website for the current position before publication. *(Emerging ✔. This sidebar must be date-stamped and reviewed at every reprint.)*

---

### N12. [NEW] Chapter glossary (draft)

| Term | Plain-language definition |
|---|---|
| Algorithm | A step-by-step procedure for solving a problem or completing a task |
| Artificial intelligence (AI) | The field concerned with building systems that perform tasks associated with intelligence. Also used for such systems themselves |
| AI system | A machine-based system that infers from its input how to produce outputs such as predictions, content, recommendations or decisions (OECD, 2023) |
| Machine learning (ML) | A branch of AI in which systems learn patterns from data instead of following only hand-written rules |
| Model | The learned mathematical structure that a machine-learning system uses to turn inputs into outputs |
| Training data | The examples a model learns from |
| Parameter | An adjustable number inside a model, set during training |
| Neural network | A model loosely inspired by networks of brain cells, made of layers of simple connected units |
| Deep learning | Machine learning using neural networks with many layers |
| Generative AI | AI systems that produce new content such as text, images, audio or code |
| Large language model (LLM) | A deep-learning model trained on large amounts of text to predict and generate language |
| Token | A chunk of text (a word, part of a word or punctuation) that a language model processes |
| Expert system | A rule-based program that encodes specialist knowledge to support decisions |
| Hallucination | AI-generated content that is plausible-sounding but false or unsupported |
| Bias (in AI) | Systematic errors or unfair outcomes, often reflecting patterns in training data or design choices |
| Automation bias | The human tendency to over-trust automated outputs |
| Narrow AI | AI designed for specific tasks. This describes all current systems |
| Artificial general intelligence (AGI) | A hypothetical AI with broad, human-level ability across tasks. Not agreed or achieved |
| Turing Test | Turing's proposal to judge machine intelligence by whether its conversation can be told apart from a human's |
| AI winter | A period of reduced funding and interest in AI after unmet expectations |

---

## Part 5 — Recommended Diagrams and Illustrations

| ID | Diagram | Placement | Priority | Notes for the designer |
|---|---|---|---|---|
| D1 | AI family map (nested regions) | Lesson 1.2 | Essential | Use consistent colours that recur in later chapters |
| D2 | Traditional programming vs machine learning flow | Lesson 1.2 | Essential | Three rows: rules, training, use |
| D3 | Illustrated timeline, 1943–2024 | Lesson 1.4 | Essential | Mark the two AI winters as shaded "cold" bands, and colour-code symbolic vs learning milestones |
| D4 | The perceive–decide–act loop | Lesson 1.1 | High | Reuse later for agents and robotics |
| D5 | "How a chatbot writes a sentence": tokens appearing one at a time with probability bars | Lesson 1.6 | High | Use invented, clearly illustrative probabilities, and label them as such |
| D6 | "Model vs product": a model at the centre surrounded by tools (search, memory, filters) | Lesson 1.6 | Medium | |
| D7 | The hype cycle: expectations over time, with the two winters | Lesson 1.4 | Medium | Draw it as an original illustration of the "waves" idea. Avoid reproducing proprietary charts such as Gartner's |
| D8 | The CHECK routine as a one-page poster | Lesson 1.7 / takeaways | Medium | A good learner handout |

**Accessibility:** every diagram needs alt text and must not rely on colour alone. Tables should have header rows so screen readers can read them.

---

## Part 6 — Practical Exercises (original)

**E1. "Is it AI?" sorting activity (Lesson 1.2, 10 minutes)**
Learners sort 12 items into *AI*, *Not AI* or *It depends*, and justify each choice using the OECD definition (N2). Suggested items: a pocket calculator, a thermostat, email spam filtering, a spreadsheet SUM formula, face unlock on a phone, a traffic-light timer, a navigation app suggesting a faster route, autocorrect, a vending machine, a streaming recommendation, a chess app, a translation app.
*Teaching point:* the "It depends" column (for example, a chess app may use search, learning or both) is where the real learning happens.

**E2. Train a model in five minutes (Lesson 1.2, hands-on, free, no coding)**
Use Google's **Teachable Machine** (a free browser tool) to train a simple image classifier, for example "thumbs up" vs "thumbs down", using a webcam.
Then: (a) train it with examples from only one person or one background and test it on someone else; (b) discuss what happened.
*Teaching point:* learners experience Objective 3 directly, and they discover bias from unrepresentative data themselves.
*[Check the tool's current availability and privacy terms before publication. Offer a non-webcam alternative.]*

**E3. AI audit of your own day (Lesson 1.5, homework)**
Learners log every interaction with a possibly AI-powered system over 24 hours, such as phone, banking, music, maps and social media, and classify each one by type (recommendation, prediction, recognition, generation).

**E4. Timeline card sort (Lesson 1.4, group)**
Give groups milestone cards without dates. They must order them, then sort them into the "symbolic" or "learning" column (N6). Reveal the answers and discuss the surprises, for example that neural networks date back to 1943.

**E5. Catch the hallucination (Lesson 1.7, 20 minutes)**
The instructor gives learners an AI-generated paragraph, prepared in advance, that contains three deliberate errors: a wrong date, a non-existent source and an exaggerated statistic. Learners apply the CHECK routine (N10) to find and correct them.
*Do not ask learners to make an AI hallucinate on demand. Results are unpredictable, and the exercise can teach the wrong lesson.*

**E6. Reflection prompt (end of Lesson 1.6)**
*"Think of a time a piece of technology seemed to 'understand' you. What was actually happening? What would have convinced you it truly understood?"*

---

## Part 7 — Educational Progression and Structure

### 7.1 Revise the learning objectives to use measurable verbs

Verbs like "understand" and "recognise" cannot be assessed directly. Suggested revisions:

| # | [ORIGINAL] | [RECOMMEND] |
|---|---|---|
| 1 | Explain the concept of intelligence and artificial intelligence | *Define* intelligence and AI, and *explain* why neither has a single agreed definition |
| 2 | Understand why AI was developed | *Describe* the scientific and practical motivations behind AI |
| 3 | Distinguish between traditional programming and AI-based systems | *Compare* rule-based programming with machine learning using an example |
| 4 | Identify the major stages in the development of AI | *Outline* the major stages in AI's history, including periods of setback |
| 5 | Recognise common applications of AI | *Identify and classify* AI applications in everyday life and work |
| 6 | Explain the difference between AI capabilities and human intelligence | *Distinguish* between task performance, understanding and consciousness |
| 7 | Identify opportunities and limitations | *Evaluate* an AI use case for its benefits, risks and required human oversight |
| ★ new | — | *Apply* a verification routine to AI-generated content |

### 7.2 Objective-to-assessment alignment (current draft)

| Objective | Taught in | Assessed by (current) | Gap |
|---|---|---|---|
| 1 | 1.1, 1.2 | Q1, Q6 | — |
| 2 | 1.3 | **None** | Add a question |
| 3 | 1.2 (briefly) | **None** | Add a question, the most serious gap |
| 4 | 1.4 | Q3, Q4 | Recall only |
| 5 | 1.5 | Q2, Q7 | Q2 is too easy |
| 6 | 1.6 | Q8 | — |
| 7 | 1.7 | Q5, Q9, Q10, Section C | Well covered |

### 7.3 Pacing and structure

- **Add "Check your understanding" points** (two or three quick questions) at the end of Lessons 1.2, 1.4 and 1.6.
- **Consider splitting Lesson 1.2.** Once N2–N4 are added, it carries too much. Suggested structure: 1.2 *Defining AI* (definitions and the family map) and a new 1.3 *How AI differs from traditional programming*. Lessons 1.3–1.7 then shift down by one.
- **Use consistent sidebar types** across the series: *Look closer* (technical depth), *Case study* (real event), *Myth vs fact*, *Think about it* (reflection). This helps beginners skip safely and lets advanced learners go deeper.
- **Recurring example.** The braking-car example (1.1) and the small-business inbox (1.5, assessment) could appear in every lesson as running threads.
- **Product names date quickly.** Keep product and company references to the timeline and case studies, and add a dated "Correct as of [month year]" note to the 2020s section.

### 7.4 Style notes (W11)

- Merge runs of one-sentence paragraphs. Short paragraphs are effective for emphasis, but in the draft they are the default, which makes the text feel padded, particularly in Lessons 1.3 and 1.5.
- Reduce stacked hedges. For example, *"AI techniques can identify relationships in data that may be difficult for people to detect manually"* can become *"AI can find patterns in data that people would struggle to spot by hand."* Keep hedging where uncertainty is real, and remove it where it isn't.
- Limit stock openers ("Let's explore…", "This is one of the most interesting questions…") to one or two per chapter.
- Lesson 1.3's line *"AI is not necessarily designed to replace human beings"* is fair, but it should acknowledge the other side for balance: *some* AI deployments are explicitly intended to automate work previously done by people. Present **augmentation vs automation** as a design choice organisations make.

---

## Part 8 — Assessment Revisions

### 8.1 Improve Question 2 (implausible distractors)

**[ORIGINAL]** The options include a light switch and an extension cord, which no learner would choose.

**[NEW] Replacement:**
> **Question 2:** Which of the following is the *best* example of an AI-based system?
> A. A spreadsheet formula that adds a column of numbers
> B. A thermostat that switches on the heater below 18 °C
> C. An email service that learns to filter spam from labelled examples
> D. A traffic light that changes every 60 seconds
>
> *Answer: C. Distractors A, B and D all follow fixed rules written by people.*

### 8.2 Add questions for uncovered objectives

> **[NEW] Question (Objective 3), multiple choice:**
> A developer builds a spam filter by showing a system 50,000 emails already marked "spam" or "not spam". The system then identifies spam it has never seen before. This is an example of:
> A. Traditional rule-based programming
> B. Machine learning
> C. An expert system
> D. Consciousness
> *Answer: B.*

> **[NEW] Question (Objective 3), short answer, 2 marks:**
> Explain one advantage and one disadvantage of using machine learning rather than hand-written rules to detect spam.

> **[NEW] Question (Objective 2), short answer, 2 marks:**
> The founders of AI in the 1950s had a scientific motivation, while many organisations today have practical motivations. Describe one of each.

> **[NEW] Question (Objective 4), application, 2 marks:**
> What was an "AI winter", and what lesson does it offer people reading headlines about AI today?

**[RECOMMEND]** Correct Q4's wording from "computer programme" to "computer **program**".

**[RECOMMEND]** If new questions are added, rebalance the marks (for example, 30 marks in total). Keep the 70% pass mark, or state the rationale for it.

### 8.3 [NEW] Draft marking guide (instructor edition)

**Section B (2 marks each)**

| Q | 2 marks | 1 mark | 0 marks |
|---|---|---|---|
| 6 | An own-words definition that mentions *systems performing tasks associated with intelligence* AND notes it is a field, not one product | Mentions one of these | Copies the textbook or describes only chatbots |
| 7 | Three valid, distinct examples | One or two valid examples | None valid |
| 8 | Intelligence = capability (learning, problem-solving); consciousness = subjective experience; AND notes one can exist without evidence of the other | Defines one correctly | Treats them as the same |
| 9 | Names a specific risk (errors or hallucination, bias, accountability) AND explains the consequence | Generic answer ("AI can be wrong") | No reason given |
| 10 | Two specific, realistic business uses with the productivity benefit explained | One use, or two without explanation | None |

**Section C (10 marks)**

| Part | Marks | Full-mark answer includes |
|---|---|---|
| 1. Two tasks | 2 | Any two of: categorising emails, drafting replies, summarising threads, extracting details |
| 2. Productivity | 3 | A specific mechanism (time saved on routine replies, faster triage) AND the effect (staff focus on complex enquiries) AND a realistic caveat (time is still needed for review) |
| 3. One risk | 2 | A named risk (incorrect information, privacy/POPIA, tone, bias) with a concrete example from the scenario |
| 4. Before sending | 3 | Check facts, check tone and appropriateness, remove or protect personal information, follow company policy, and confirm a human takes responsibility. Award 1 mark per two valid points |

**Model-answer link:** the Air Canada case (N9) is an ideal reference point for Part 4.

---

## Part 9 — References

### 9.1 Corrections to the existing list

| # | [ORIGINAL] | [CORRECTION] |
|---|---|---|
| 1 | Turing (1950) | Correct. Add DOI: 10.1093/mind/LIX.236.433 ◐ |
| 2 | McCarthy et al. (1955) | Add where to find it: reprinted in *AI Magazine*, 27(4), 12–14 (2006) ✔ |
| 3 | Russell & Norvig, no edition | Specify: *Artificial Intelligence: A Modern Approach* (4th ed.). Pearson, 2020 (Global Edition 2021) ◐ |
| 4 | Stanford HAI, *AI Index Report*, no year | Specify the edition used, e.g., *The 2026 AI Index Report* (April 2026) ✔. The AI Index is annual, so cite a year, and update it at each reprint |
| 5 | UNESCO (2023) | Add authors: Miao, F. & Holmes, W. (2023). *Guidance for generative AI in education and research*. Paris: UNESCO ◐ |

**[RECOMMEND]** Separate the list into **References** (works cited in the chapter) and **Further reading** (recommended, with one line on why and the level).

### 9.2 New references supporting the material in this review

**History and foundations**
- Campbell, M., Hoane, A. J. & Hsu, F. (2002). Deep Blue. *Artificial Intelligence*, 134(1–2), 57–83. ◐
- Krizhevsky, A., Sutskever, I. & Hinton, G. E. (2012). ImageNet classification with deep convolutional neural networks. *Advances in Neural Information Processing Systems 25*. ◐
- Lighthill, J. (1973). Artificial Intelligence: A General Survey. In *Artificial Intelligence: A Paper Symposium*. Science Research Council (UK). ◐
- McCarthy, J., Minsky, M. L., Rochester, N. & Shannon, C. E. (2006). A Proposal for the Dartmouth Summer Research Project on Artificial Intelligence, August 31, 1955. *AI Magazine*, 27(4), 12–14. ✔
- McCulloch, W. S. & Pitts, W. (1943). A logical calculus of the ideas immanent in nervous activity. *Bulletin of Mathematical Biophysics*, 5, 115–133. ◐
- Rosenblatt, F. (1958). The perceptron: a probabilistic model for information storage and organization in the brain. *Psychological Review*, 65(6), 386–408. ◐
- Rumelhart, D. E., Hinton, G. E. & Williams, R. J. (1986). Learning representations by back-propagating errors. *Nature*, 323, 533–536. ◐
- Silver, D. et al. (2016). Mastering the game of Go with deep neural networks and tree search. *Nature*, 529, 484–489. ◐
- Vaswani, A. et al. (2017). Attention is all you need. *Advances in Neural Information Processing Systems 30*. ◐
- Weizenbaum, J. (1966). ELIZA — a computer program for the study of natural language communication between man and machine. *Communications of the ACM*, 9(1), 36–45. ◐

**Definitions and concepts**
- Legg, S. & Hutter, M. (2007). A collection of definitions of intelligence. In *Advances in Artificial General Intelligence* (Frontiers in Artificial Intelligence and Applications, Vol. 157). IOS Press. ◐
- McCarthy, J. (2007). *What is Artificial Intelligence?* Stanford University (online essay). ◐
- Moravec, H. (1988). *Mind Children: The Future of Robot and Human Intelligence*. Harvard University Press. ◐
- OECD (2024). *Explanatory memorandum on the updated OECD definition of an AI system*. OECD Artificial Intelligence Papers. ✔ (Definition adopted by the OECD Council, 8 November 2023.)
- Ouyang, L. et al. (2022). Training language models to follow instructions with human feedback. *Advances in Neural Information Processing Systems 35*. ◐
- Searle, J. R. (1980). Minds, brains, and programs. *Behavioral and Brain Sciences*, 3(3), 417–424. ◐
- Weizenbaum, J. (1976). *Computer Power and Human Reason*. W. H. Freeman. ◐

**Risks, bias and human factors**
- Buolamwini, J. & Gebru, T. (2018). Gender Shades: Intersectional accuracy disparities in commercial gender classification. *Proceedings of Machine Learning Research*, 81, 77–91. ✔
- Dastin, J. (2018, 10 October). Amazon scraps secret AI recruiting tool that showed bias against women. *Reuters*. ◐
- Parasuraman, R. & Manzey, D. H. (2010). Complacency and bias in human use of automation: An attentional integration. *Human Factors*, 52(3), 381–410. ◐
- Nekoto, W. et al. (2020). Participatory research for low-resourced machine translation: A case study in African languages. *Findings of EMNLP 2020*. ◐
- International Energy Agency (2025). *Energy and AI*. IEA. ◐ (confirm the title and date before citing)

**Cases and regulatory sources**
- *Moffatt v. Air Canada*, 2024 BCCRT 149 (British Columbia Civil Resolution Tribunal, 14 February 2024). ✔
- *Parker v Forsyth NO and Others* (1585/20) [2023] ZAGPRD 1 (Johannesburg Regional Court, 29 June 2023). ✔ (Sources differ slightly on the neutral citation. Confirm on SAFLII.)
- *Mavundla v MEC: Department of Co-operative Government and Traditional Affairs KwaZulu-Natal and Others* (7940/2024P) [2025] ZAKZPHC 2 (8 January 2025). ✔
- US Food and Drug Administration (2018, 11 April). FDA permits marketing of artificial intelligence-based device to detect certain diabetes-related eye problems [press release]. ◐
- Protection of Personal Information Act 4 of 2013 (South Africa). ◐
- Department of Communications and Digital Technologies (2024). *South Africa National Artificial Intelligence Policy Framework* (consultation document); and *Draft National AI Policy* (gazetted April 2026, subsequently withdrawn). ✔ (Confirm current status at dcdt.gov.za before publication.)

### 9.3 Recommended further reading for learners

| Resource | Level | Why |
|---|---|---|
| Mitchell, M. (2019). *Artificial Intelligence: A Guide for Thinking Humans*. Farrar, Straus and Giroux. ◐ | Beginner–Intermediate | A clear, balanced account by an AI researcher, and strong on the limits of AI |
| Nilsson, N. J. (2010). *The Quest for Artificial Intelligence*. Cambridge University Press. ◐ | Intermediate | An authoritative history of the field by one of its pioneers |
| *Elements of AI* (University of Helsinki and MinnaLearn), free online course ◐ | Beginner | Free, non-technical and widely used. Recommend it; do not adapt its content |
| Stanford HAI, *AI Index Report* (latest edition) ✔ | All | Annual data on AI's technical, economic and policy trends |
| Russell & Norvig (2020) ◐ | Advanced | The standard university textbook |

---

## Part 10 — Open Questions for the Founder

1. **Scope of Lesson 1.6.** How much philosophy (Chinese Room, consciousness) suits Level 01? The material is written as optional "Look closer" boxes so it can be cut without breaking the lesson.
2. **Lesson split.** Do you approve splitting Lesson 1.2 into two lessons (see 7.3)? This changes the numbering for the rest of the chapter.
3. **Case-study naming.** Are you comfortable naming companies (Air Canada, Amazon, Samsung) and South African court matters? All are matters of public record, but your publication policy may prefer anonymised cases or legal review.
4. **Regional focus.** Should South African context be woven through each lesson, or collected in a dedicated sidebar series (for example, "AI in South Africa")?
5. **Currency policy.** How often will the handbook be revised? This affects how much dated material, such as products, policy and statistics, belongs in the main text rather than in an updatable appendix.
6. **House style.** Confirm British/South African spelling, and adopt "program" for software (C8).

---

*Prepared for Applied AI Academy as a contributing review. All [NEW] material is original and offered for editing. Final editorial and publication decisions rest with the founder.*

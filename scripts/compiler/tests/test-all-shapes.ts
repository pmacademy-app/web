import { compileMermaidToSvg } from 'd:/PM Academy/scripts/compiler/mermaid-svg';
import assert from 'assert';

const testCases = [
  {
    name: 'TD with diamond decision node & multiline rects',
    source: `graph TD
    A[Research Question] --> B{Why or How? Understanding<br/>Depth, Mental Models, Motivation}
    A --> C{How Many or How Much? Scale,<br/>Prevalence, Statistical Confidence}
    B --> D[Qualitative Methods Interviews,<br/>Observation, Open-ended Research]
    C --> E[Quantitative Methods Surveys<br/>at Scale, Analytics, Experiments]`,
  },
  {
    name: 'BT vertical ladder with multiline text',
    source: `graph BT
    A[Weakest: Stated Preference, from an<br/>Unrepresentative, Self-selected Sample,<br/>Gathered with Leading Questions] --> B[Weak: Stated Preference, from a More<br/>Representative Sample, Gathered with<br/>Neutral Questions]
    B --> C[Moderate: Revealed Preference at Small<br/>Scale E.g. a Concierge Pilot, Lesson 8]
    C --> D[Strong: Revealed Preference at Larger<br/>Scale, E.g. a Genuine A/B Experiment or<br/>Real Usage Analytics]`,
  },
  {
    name: 'LR horizontal flowchart with branching & circles',
    source: `graph LR
    A((Start)) --> B[Ideation & Validation]
    B --> C{Validation Pass?}
    C -- Yes --> D[Build MVP]
    C -- No --> E((Pivot or Stop))`,
  },
  {
    name: 'Sequence diagram',
    source: `sequenceDiagram
    autonumber
    actor User
    participant App
    participant API
    User->>App: Click Buy
    App->>API: POST /checkout
    API-->>App: 200 OK
    App-->>User: Show Confirmation`,
  },
];

async function runTests() {
  console.log('🧪 Testing Representative Mermaid Shapes & Layouts...\n');

  for (const tc of testCases) {
    const svg = await compileMermaidToSvg(tc.source);
    assert.ok(svg.includes('<svg'), `[${tc.name}] Should output valid SVG`);
    assert.ok(svg.includes('viewBox='), `[${tc.name}] Should have viewBox`);

    // Ensure width and height are positive numbers
    const wMatch = svg.match(/width="([\d.]+)"/);
    const hMatch = svg.match(/height="([\d.]+)"/);
    assert.ok(wMatch && parseFloat(wMatch[1]) > 0, `[${tc.name}] Should have valid positive width`);
    assert.ok(hMatch && parseFloat(hMatch[1]) > 0, `[${tc.name}] Should have valid positive height`);

    console.log(`  ✓ ${tc.name}: SVG emitted (${wMatch![1]}x${hMatch![1]})`);
  }

  console.log('\n✅ All Representative Diagram Shapes Passed Cleanly!');
}

runTests().catch(err => {
  console.error(err);
  process.exit(1);
});

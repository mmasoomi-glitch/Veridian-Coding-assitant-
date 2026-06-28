// Understand trim() behavior
const tests = [
  " wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",  // leading space
  "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY ",  // trailing space
];

for (const t of tests) {
  console.log(`Input: "${t}"`);
  console.log(`After trim(): "${t.trim()}"`);
  console.log(`Trimmed length: ${t.trim().length}`);
  console.log(`Matches 32+ entropy: ${/[A-Za-z0-9+/=_-]{32,}/.test(t.trim())}`);
  console.log();
}

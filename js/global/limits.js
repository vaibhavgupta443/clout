(function (G) {
  // Project-wide rules. This public edition is a clean (PG-13) social-media simulation.
  const MIN_AGE = 18;
  const RULES = [
    { label: 'Every character is an adult (18+).' },
    { label: 'No real people.' },
  ];
  const PROMPT_ADDITIONS = []; // Add any project-wide wording here.

  const prompt = () => [].concat(PROMPT_ADDITIONS).join('\n');

  G.Limits = {
    MIN_AGE,
    RULES,
    allowedAge: (age) => Number.isInteger(Number(age)) && Number(age) >= MIN_AGE,
    prompt,
  };
})(window.G);

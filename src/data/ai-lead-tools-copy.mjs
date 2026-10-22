// Fixed interface and export strings for the two editable lead tools.
// The approved campaign words live in each block's Puck fields.
export const LEAD_TOOL_COPY = {
  contactEmail: 'dx@greatstonesoftware.co.uk',
  securityError: 'Please complete the security check.',
  sending: 'Sending…',
  privacyPolicy: 'Privacy Policy',
  honeypot: 'Website',
  survey: {
    question: 'Question', of: 'of', back: '← Back', pick: 'Pick the closest match',
    notScored: 'Not scored', yourScore: 'Your score', strongest: 'Strongest:', firstToMove: 'First to move:',
    resultDownload: 'Download your result', surveyDownload: 'Download the blank survey (CSV)', retake: 'Retake the survey',
    resultTitle: 'Greatstone AI Readiness Baseline', name: 'Name', company: 'Company', pillar: 'Pillar',
    scoreHeader: 'Your score (1-4)', levelHeader: 'Your level', overall: 'Overall', scoreOverall: 'overall',
    surveyHeaders: ['Pillar', 'Question', 'Option 1 (lowest)', 'Option 2', 'Option 3', 'Option 4 (highest)'],
  },
  calculator: {
    people: 'people', hoursSuffix: 'hrs / wk', costSuffix: '/ hr', year: 'a year',
    onTable: 'a year, on the table', manualWork: 'hours of manual work.',
    savingNote: (percent) => `Based on recovering about ${percent}% of that manual effort with AI.`,
    download: 'Download your estimate', title: 'Greatstone AI Cost Estimate',
    name: 'Name', company: 'Company', peopleAffected: 'People affected',
    hoursPerPerson: 'Hours lost per person per week', hourlyCost: 'Average hourly cost',
    workingWeeks: 'Working weeks per year', annualHours: 'Hours on manual work per year',
    annualCost: 'Cost of that work per year', recoveryRate: 'Estimated AI recovery rate',
    annualSaving: 'Estimated AI saving per year',
  },
};

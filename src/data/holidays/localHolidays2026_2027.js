// One-time local calendar. These are dated records, not a rolling news snapshot.
// Chennai dates transcribed from the Tamil Nadu Government Gazettes linked below.
// Oman 2027 remains provisional until the Ministry of Labour publishes days off.
export const HOLIDAY_CALENDAR_VERSION = 'chennai-muscat-2026-2027-v1';
export const HOLIDAY_CALENDAR_CHECKED_AT = '2026-11-16';

export const HOLIDAY_SOURCES = {
  tn2026: {
    label: 'Tamil Nadu Government Gazette · 2026',
    url: 'https://stationeryprinting.tn.gov.in/extraordinary/2025/721_Ex_II_1_2025.pdf',
    authority: 'official',
  },
  tn2027: {
    label: 'Tamil Nadu Government Gazette · 2027',
    url: 'https://stationeryprinting.tn.gov.in/extraordinary/2026/437_Ex_II_1_2026.pdf',
    authority: 'official',
  },
  oman2026: {
    label: 'Oman Government / Ministry of Labour · 2026',
    url: 'https://gov.om/en/important-dates-and-holidays',
    authority: 'official',
    supportingUrl: 'https://www.omaninfo.om/images/library/file/Book699363.pdf',
  },
  omanFitr2026: {
    label: 'Ministry of Labour announcement · Eid al-Fitr 2026',
    url: 'https://www.muscatdaily.com/2026/03/11/oman-announces-eid-al-fitr-public-holiday-dates-for-2026/',
    authority: 'reported-official-announcement',
  },
  omanAdha2026: {
    label: 'Ministry of Labour announcement · Eid al-Adha 2026',
    url: 'https://www.omanobserver.om/article/1189816/oman/community/eid-al-adha-holidays-announced-in-oman',
    authority: 'reported-official-announcement',
  },
  omanAccession2027: {
    label: 'Oman Government · accession anniversary; 2027 leave unannounced',
    url: 'https://www.omaninfo.om/en/pages/210/show/877',
    authority: 'statutory-occasion-not-confirmed-leave',
    officialRuleUrl: 'https://www.omaninfo.om/en/pages/161/show/939',
  },
  oman2027: {
    label: 'Time and Date · provisional Oman 2027 calendar',
    url: 'https://www.timeanddate.com/holidays/oman/2027',
    authority: 'provisional-calendar',
    officialRuleUrl: 'https://www.omaninfo.om/en/pages/161/show/939',
  },
};

// [stable key, title, Gregorian date, optional scope]
const tamilNadu2026 = [
  ['new-year', "New Year's Day", '2026-01-01'],
  ['pongal', 'Pongal', '2026-01-15'],
  ['thiruvalluvar', 'Thiruvalluvar Day', '2026-01-16'],
  ['uzhavar', 'Uzhavar Thirunal', '2026-01-17'],
  ['republic', 'Republic Day', '2026-01-26'],
  ['thai-poosam', 'Thai Poosam', '2026-02-01'],
  ['telugu-new-year', "Telugu New Year's Day", '2026-03-19'],
  ['ramzan', 'Ramzan (Eid al-Fitr)', '2026-03-21'],
  ['mahaveer', 'Mahaveer Jayanthi', '2026-03-31'],
  ['bank-closing', 'Annual bank accounts closing', '2026-04-01', 'banks-only'],
  ['good-friday', 'Good Friday', '2026-04-03'],
  ['tamil-new-year', "Tamil New Year's Day / Dr. B. R. Ambedkar's Birthday", '2026-04-14'],
  ['may-day', 'May Day', '2026-05-01'],
  ['bakrid', 'Bakrid (Eid al-Adha)', '2026-05-28'],
  ['muharram', 'Muharram', '2026-06-26'],
  ['independence', 'Independence Day', '2026-08-15'],
  ['milad', "Milad-un-Nabi (Prophet's Birthday)", '2026-08-26'],
  ['krishna', 'Krishna Jayanthi', '2026-09-04'],
  ['vinayakar', 'Vinayakar Chathurthi', '2026-09-14'],
  ['gandhi', 'Gandhi Jayanthi', '2026-10-02'],
  ['ayutha', 'Ayutha Pooja', '2026-10-19'],
  ['vijaya', 'Vijaya Dasami', '2026-10-20'],
  ['deepavali', 'Deepavali', '2026-11-08'],
  ['christmas', 'Christmas', '2026-12-25'],
];
const tamilNadu2027 = [
  ['new-year', "New Year's Day", '2027-01-01'],
  ['pongal', 'Pongal', '2027-01-15'],
  ['thiruvalluvar', 'Thiruvalluvar Day', '2027-01-16'],
  ['uzhavar', 'Uzhavar Thirunal', '2027-01-17'],
  ['thai-poosam', 'Thai Poosam', '2027-01-22'],
  ['republic', 'Republic Day', '2027-01-26'],
  ['ramzan', 'Ramzan (Eid al-Fitr)', '2027-03-10'],
  ['good-friday', 'Good Friday', '2027-03-26'],
  ['bank-closing', 'Annual bank accounts closing', '2027-04-01', 'banks-only'],
  ['telugu-new-year', "Telugu New Year's Day", '2027-04-07'],
  ['tamil-new-year', "Tamil New Year's Day / Dr. B. R. Ambedkar's Birthday", '2027-04-14'],
  ['mahaveer', 'Mahaveer Jayanthi', '2027-04-19'],
  ['may-day', 'May Day', '2027-05-01'],
  ['bakrid', 'Bakrid (Eid al-Adha)', '2027-05-17'],
  ['muharram', 'Muharram', '2027-06-15'],
  ['independence', 'Independence Day', '2027-08-15'],
  ['milad', "Milad-un-Nabi (Prophet's Birthday)", '2027-08-15'],
  ['krishna', 'Krishna Jayanthi', '2027-08-25'],
  ['vinayakar', 'Vinayakar Chathurthi', '2027-09-04'],
  ['gandhi', 'Gandhi Jayanthi', '2027-10-02'],
  ['ayutha', 'Ayutha Pooja', '2027-10-08'],
  ['vijaya', 'Vijaya Dasami', '2027-10-09'],
  ['deepavali', 'Deepavali', '2027-10-28'],
  ['christmas', 'Christmas', '2027-12-25'],
];
const chennaiRows = (rows, year) => rows.map(([key, title, date, scope]) => ({
  key, title, date, location: 'Chennai', status: 'announced', scope: scope || 'state-public-holiday',
  sourceKey: `tn${year}`,
}));

export const LOCAL_HOLIDAYS = [
  ...chennaiRows(tamilNadu2026, 2026),
  ...chennaiRows(tamilNadu2027, 2027),
  ...[
    ['accession', "Sultan's Accession Day holiday", '2026-01-15'],
    ['isra', "Isra and Mi'raj holiday", '2026-01-18'],
    ['eid-fitr', 'Eid al-Fitr holiday', '2026-03-19', '2026-03-23', 'omanFitr2026'],
    ['eid-adha', 'Eid al-Adha holiday', '2026-05-26', '2026-05-30', 'omanAdha2026'],
    ['hijri-new-year', 'Hijri New Year holiday', '2026-06-18'],
    ['prophet-birthday', "Prophet's Birthday holiday", '2026-08-27'],
    ['national-day', 'Oman National Day holiday', '2026-11-25', '2026-11-26'],
  ].map(([key, title, date, endDate, sourceKey]) => ({
    key, title, date, endDate, location: 'Muscat', status: 'announced',
    scope: 'public-and-private-sectors', sourceKey: sourceKey || 'oman2026',
  })),
  // Occasion estimates are deliberately single dates rather than invented leave
  // periods. Oman can move observed days off independently of the occasion.
  ...[
    ['isra-1448', "Isra and Mi'raj", '2027-01-06'],
    ['accession', "Sultan's Accession Day", '2027-01-11'],
    ['eid-fitr', 'Eid al-Fitr', '2027-03-10'],
    ['eid-adha', 'Eid al-Adha', '2027-05-17'],
    ['hijri-new-year', 'Hijri New Year', '2027-06-06'],
    ['prophet-birthday', "Prophet's Birthday", '2027-08-15'],
    ['national-day', 'Oman National Day', '2027-11-20', '2027-11-21'],
    ['isra-1449', "Isra and Mi'raj", '2027-12-26'],
  ].map(([key, title, date, endDate]) => ({
    key, title, date, endDate, location: 'Muscat', status: 'provisional',
    scope: 'occasion-estimate', sourceKey: key === 'accession' ? 'omanAccession2027' : 'oman2027',
  })),
];

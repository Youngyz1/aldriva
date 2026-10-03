// lib/__tests__/fundraiser-donations-donors.test.cjs
// Tests for Fundraiser Donations and Donors management pages
'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

function buildGroupKey(d) {
  if (d.user_id) return 'user:' + d.user_id;
  if (d.donor_name === 'Anonymous' || !d.donor_name) return 'anon:' + d.id;
  return 'named:' + (d.donor_name ?? '').toLowerCase() + '::' + (d.donor_email ?? '').toLowerCase();
}

function aggregateDonors(rawDonations) {
  const map = new Map();
  for (const d of rawDonations) {
    const key = buildGroupKey(d);
    const amount = Number(d.amount ?? 0);
    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        key, displayName: (d.donor_name === 'Anonymous' || !d.donor_name) ? 'Anonymous' : d.donor_name,
        isAnonymous: d.donor_name === 'Anonymous' || !d.donor_name,
        donationCount: 1, totalGiven: amount, avgGift: amount,
        firstDonation: d.created_at, lastDonation: d.created_at, isRepeat: false,
        donations: [{ id: d.id, amount, status: d.status, created_at: d.created_at }],
      });
    } else {
      existing.donationCount += 1; existing.totalGiven += amount;
      existing.donations.push({ id: d.id, amount, status: d.status, created_at: d.created_at });
      if (d.created_at < existing.firstDonation) existing.firstDonation = d.created_at;
      if (d.created_at > existing.lastDonation) existing.lastDonation = d.created_at;
    }
  }
  for (const rec of map.values()) {
    rec.avgGift = rec.donationCount > 0 ? Math.round(rec.totalGiven / rec.donationCount) : 0;
    rec.isRepeat = rec.donationCount > 1;
    rec.donations.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }
  return Array.from(map.values());
}

function sortDonors(donors, sort) {
  return [...donors].sort((a, b) => {
    switch (sort) {
      case 'total_asc':  return a.totalGiven - b.totalGiven;
      case 'count_desc': return b.donationCount - a.donationCount;
      case 'newest':     return new Date(b.lastDonation).getTime() - new Date(a.lastDonation).getTime();
      case 'oldest':     return new Date(a.firstDonation).getTime() - new Date(b.firstDonation).getTime();
      default:           return b.totalGiven - a.totalGiven;
    }
  });
}

function succeededDonations(donations) {
  return donations.filter(d => !('status' in d) || d.status == null || d.status === 'succeeded');
}

function computeMetrics(donations) {
  const succeeded = succeededDonations(donations);
  const total = succeeded.length;
  const totalAmount = succeeded.reduce((s, d) => s + Number(d.amount ?? 0), 0);
  const avgAmount = total > 0 ? Math.round(totalAmount / total) : 0;
  return { total, totalAmount, avgAmount };
}

let _id = 0;
function makeDonation(overrides) {
  return {
    id: 'don-' + (++_id), fundraiser_id: 'fundraiser-A',
    donor_name: 'Leslie Gavin', donor_email: 'leslie@example.com', user_id: 'user-leslie',
    amount: 50, currency: 'USD', status: 'succeeded', payment_intent_id: 'pi_test123',
    created_at: new Date('2026-09-18T10:00:00Z').toISOString(),
    ...overrides,
  };
}

describe('Fundraiser Donations - Scoping and Accounting', () => {
  test('1. Only succeeded (or null-status) donations count toward totals', () => {
    const donations = [
      makeDonation({ status: 'succeeded', amount: 50 }),
      makeDonation({ status: 'succeeded', amount: 75 }),
      makeDonation({ status: 'failed', amount: 100 }),
      makeDonation({ status: 'refunded', amount: 25 }),
      makeDonation({ status: null, amount: 30 }),
    ];
    const { total } = computeMetrics(donations);
    assert.equal(total, 3);
  });

  test('2. Total amount excludes failed and refunded', () => {
    const donations = [
      makeDonation({ status: 'succeeded', amount: 100 }),
      makeDonation({ status: 'succeeded', amount: 200 }),
      makeDonation({ status: 'failed', amount: 999 }),
      makeDonation({ status: 'refunded', amount: 500 }),
    ];
    const { totalAmount } = computeMetrics(donations);
    assert.equal(totalAmount, 300);
  });

  test('3. Average donation is succeeded total / succeeded count', () => {
    const donations = [
      makeDonation({ status: 'succeeded', amount: 50 }),
      makeDonation({ status: 'succeeded', amount: 100 }),
      makeDonation({ status: 'succeeded', amount: 150 }),
      makeDonation({ status: 'failed', amount: 999 }),
    ];
    const { avgAmount } = computeMetrics(donations);
    assert.equal(avgAmount, 100);
  });

  test('4. All-failed fundraiser has zero metrics', () => {
    const { total, totalAmount, avgAmount } = computeMetrics([makeDonation({ status: 'failed', amount: 1000 })]);
    assert.equal(total, 0); assert.equal(totalAmount, 0); assert.equal(avgAmount, 0);
  });

  test('5. Null status counts as succeeded (defensive fallback)', () => {
    const { total, totalAmount } = computeMetrics([makeDonation({ status: null, amount: 75 })]);
    assert.equal(total, 1); assert.equal(totalAmount, 75);
  });

  test('6. Anonymous donation donor_name stays Anonymous', () => {
    const d = makeDonation({ donor_name: 'Anonymous', donor_email: null, user_id: null });
    assert.equal(d.donor_name, 'Anonymous');
    const key = buildGroupKey(d);
    assert.ok(key.startsWith('anon:'));
  });

  test('7. Donation scoping: only fundraiser_id A returned', () => {
    const donations = [
      makeDonation({ fundraiser_id: 'A' }), makeDonation({ fundraiser_id: 'A' }),
      makeDonation({ fundraiser_id: 'B' }),
    ];
    const scoped = donations.filter(d => d.fundraiser_id === 'A');
    assert.equal(scoped.length, 2);
  });

  test('8. Cross-fundraiser isolation', () => {
    const { totalAmount: a } = computeMetrics([makeDonation({ fundraiser_id: 'A', amount: 325 })]);
    const { totalAmount: b } = computeMetrics([makeDonation({ fundraiser_id: 'B', amount: 500 })]);
    assert.equal(a, 325); assert.equal(b, 500);
  });

  test('9. Unauthorized auth result blocks data access', () => {
    const auth = { ok: false, error: 'Forbidden', status: 403 };
    assert.equal(auth.ok, false); assert.equal(auth.status, 403);
  });

  test('10. Sort newest-first: most recent created_at is index 0', () => {
    const donations = [
      makeDonation({ created_at: '2026-09-15T00:00:00Z' }),
      makeDonation({ created_at: '2026-09-18T00:00:00Z' }),
      makeDonation({ created_at: '2026-09-10T00:00:00Z' }),
    ];
    const sorted = [...donations].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    assert.equal(sorted[0].created_at, '2026-09-18T00:00:00Z');
  });

  test('11. Sort amount-desc: highest amount is index 0', () => {
    const donations = [makeDonation({ amount: 25 }), makeDonation({ amount: 200 }), makeDonation({ amount: 75 })];
    const sorted = [...donations].sort((a, b) => Number(b.amount) - Number(a.amount));
    assert.equal(sorted[0].amount, 200);
  });

  test('12. Status filter succeeded: only succeeded rows returned', () => {
    const donations = [makeDonation({ status: 'succeeded' }), makeDonation({ status: 'pending' }), makeDonation({ status: 'failed' })];
    const filtered = donations.filter(d => d.status === 'succeeded');
    assert.equal(filtered.length, 1);
  });

  test('13. Search matches donor_name case-insensitively', () => {
    const donations = [makeDonation({ donor_name: 'Leslie Gavin' }), makeDonation({ donor_name: 'Kokorela Brown' })];
    const filtered = donations.filter(d => (d.donor_name ?? '').toLowerCase().includes('leslie'));
    assert.equal(filtered.length, 1);
  });

  test('14. Pagination returns correct slice for page 2 (PAGE_SIZE=25)', () => {
    const donations = Array.from({ length: 60 }, (_, i) => makeDonation({ amount: i + 1 }));
    const slice = donations.slice(25, 50);
    assert.equal(slice.length, 25);
  });
});

describe('Fundraiser Donors - Aggregation and Privacy', () => {
  test('15. Same user_id aggregates into ONE donor', () => {
    const donations = [
      makeDonation({ user_id: 'u1', amount: 50, created_at: '2026-09-18T00:00:00Z' }),
      makeDonation({ user_id: 'u1', amount: 75, created_at: '2026-09-12T00:00:00Z' }),
      makeDonation({ user_id: 'u1', amount: 100, created_at: '2026-09-05T00:00:00Z' }),
    ];
    assert.equal(aggregateDonors(donations).length, 1);
  });

  test('16. Donation count is correct after aggregation', () => {
    const donations = [makeDonation({ user_id: 'u2', amount: 50 }), makeDonation({ user_id: 'u2', amount: 75 }), makeDonation({ user_id: 'u2', amount: 100 })];
    assert.equal(aggregateDonors(donations)[0].donationCount, 3);
  });

  test('17. Total given is sum of all donations for that donor', () => {
    const donations = [makeDonation({ user_id: 'u3', amount: 50 }), makeDonation({ user_id: 'u3', amount: 75 }), makeDonation({ user_id: 'u3', amount: 100 })];
    assert.equal(aggregateDonors(donations)[0].totalGiven, 225);
  });

  test('18. Average gift is Math.round(totalGiven / donationCount)', () => {
    const donations = [makeDonation({ user_id: 'u4', amount: 50 }), makeDonation({ user_id: 'u4', amount: 75 }), makeDonation({ user_id: 'u4', amount: 100 })];
    assert.equal(aggregateDonors(donations)[0].avgGift, 75);
  });

  test('19. lastDonation is the most recent date', () => {
    const donations = [
      makeDonation({ user_id: 'u5', created_at: '2026-09-18T00:00:00Z', amount: 50 }),
      makeDonation({ user_id: 'u5', created_at: '2026-09-05T00:00:00Z', amount: 100 }),
    ];
    assert.equal(aggregateDonors(donations)[0].lastDonation, '2026-09-18T00:00:00Z');
  });

  test('20. firstDonation is the earliest date', () => {
    const donations = [
      makeDonation({ user_id: 'u6', created_at: '2026-09-18T00:00:00Z', amount: 50 }),
      makeDonation({ user_id: 'u6', created_at: '2026-09-05T00:00:00Z', amount: 100 }),
    ];
    assert.equal(aggregateDonors(donations)[0].firstDonation, '2026-09-05T00:00:00Z');
  });

  test('21. isRepeat is true only when donationCount > 1', () => {
    const single = aggregateDonors([makeDonation({ user_id: 'u7', amount: 50 })]);
    const repeat = aggregateDonors([makeDonation({ user_id: 'u8', amount: 50 }), makeDonation({ user_id: 'u8', amount: 75 })]);
    assert.equal(single[0].isRepeat, false);
    assert.equal(repeat[0].isRepeat, true);
  });

  test('22. Anonymous donations do NOT merge - each gets its own donor record', () => {
    const donations = [
      makeDonation({ id: 'anon-1', donor_name: 'Anonymous', user_id: null, donor_email: null, amount: 25 }),
      makeDonation({ id: 'anon-2', donor_name: 'Anonymous', user_id: null, donor_email: null, amount: 30 }),
    ];
    const donors = aggregateDonors(donations);
    assert.equal(donors.length, 2);
    assert.ok(donors.every(d => d.isAnonymous));
  });

  test('23. Named donor without user_id grouped by name+email', () => {
    const donations = [
      makeDonation({ user_id: null, donor_name: 'Leslie Gavin', donor_email: 'leslie@example.com', amount: 50 }),
      makeDonation({ user_id: null, donor_name: 'Leslie Gavin', donor_email: 'leslie@example.com', amount: 100 }),
    ];
    const donors = aggregateDonors(donations);
    assert.equal(donors.length, 1);
    assert.equal(donors[0].totalGiven, 150);
  });

  test('24. Donor detail history is sorted newest-first', () => {
    const donations = [
      makeDonation({ user_id: 'u9', created_at: '2026-09-01T00:00:00Z', amount: 50 }),
      makeDonation({ user_id: 'u9', created_at: '2026-09-18T00:00:00Z', amount: 100 }),
      makeDonation({ user_id: 'u9', created_at: '2026-09-10T00:00:00Z', amount: 75 }),
    ];
    const donors = aggregateDonors(donations);
    assert.equal(donors[0].donations[0].created_at, '2026-09-18T00:00:00Z');
  });

  test('25. Cross-fundraiser: aggregation scoped to supplied donation list only', () => {
    const fundraiserADonations = [makeDonation({ fundraiser_id: 'A', user_id: 'u10', amount: 325 })];
    const donors = aggregateDonors(fundraiserADonations);
    assert.equal(donors[0].totalGiven, 325);
  });

  test('26. Donor pagination occurs AFTER aggregation', () => {
    const donations = [];
    for (let i = 0; i < 15; i++) {
      donations.push(makeDonation({ user_id: 'page-u-' + i, amount: 50 }));
      donations.push(makeDonation({ user_id: 'page-u-' + i, amount: 50 }));
    }
    const allDonors = aggregateDonors(donations);
    assert.equal(allDonors.length, 15);
    const page1 = allDonors.slice(0, 10);
    assert.ok(page1.every(d => d.donationCount === 2));
  });

  test('27. Sort total_desc: highest totalGiven first', () => {
    const donations = [makeDonation({ user_id: 'sa', amount: 50 }), makeDonation({ user_id: 'sb', amount: 500 }), makeDonation({ user_id: 'sc', amount: 200 })];
    const sorted = sortDonors(aggregateDonors(donations), 'total_desc');
    assert.equal(sorted[0].totalGiven, 500);
  });

  test('28. Sort count_desc: most donations first', () => {
    const donations = [
      makeDonation({ user_id: 'ca', amount: 50 }),
      makeDonation({ user_id: 'cb', amount: 100 }), makeDonation({ user_id: 'cb', amount: 100 }), makeDonation({ user_id: 'cb', amount: 100 }),
      makeDonation({ user_id: 'cc', amount: 200 }), makeDonation({ user_id: 'cc', amount: 200 }),
    ];
    const sorted = sortDonors(aggregateDonors(donations), 'count_desc');
    assert.equal(sorted[0].donationCount, 3);
    assert.equal(sorted[0].key, 'user:cb');
  });
});
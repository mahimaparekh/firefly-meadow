import test from "node:test";
import assert from "node:assert/strict";
import {
  fetchContributions,
  parseCalendar,
  CONTRIBUTION_QUERY,
  COLUMNS,
  ROWS,
} from "../src/fetch-contributions.js";
import { generateMeadowSVG } from "../src/generate-meadow.js";

const LEVEL_NAMES = [
  "NONE",
  "FIRST_QUARTILE",
  "SECOND_QUARTILE",
  "THIRD_QUARTILE",
  "FOURTH_QUARTILE",
];

// Build a fake GitHub response with `weekCount` weeks. The first week is
// partial (starts on Wednesday) and the last week ends on Tuesday, like real data.
function fakeResponse({ weekCount = 53, owner = "mahimaparekh" } = {}) {
  const weeks = Array.from({ length: weekCount }, (_, w) => {
    const first = w === 0 ? 3 : 0;
    const last = w === weekCount - 1 ? 2 : 6;
    const contributionDays = [];
    for (let d = first; d <= last; d++) {
      const level = (w + d) % 5;
      contributionDays.push({
        date: `2026-01-${String(((w * 7 + d) % 28) + 1).padStart(2, "0")}`,
        weekday: d,
        contributionCount: level * 3,
        contributionLevel: LEVEL_NAMES[level],
      });
    }
    return { contributionDays };
  });
  return {
    data: {
      viewer: { login: owner },
      user: { contributionsCollection: { contributionCalendar: { weeks } } },
    },
  };
}

const okResponse = (body, status = 200) => ({
  ok: status < 400,
  status,
  json: async () => body,
});
const noSleep = async () => {};
const OPTS = {
  token: "ghp_secret_token_value",
  login: "mahimaparekh",
  sleep: noSleep,
};

test("parseCalendar returns exactly 53 columns x 7 rows with GitHub levels", () => {
  const grid = parseCalendar(fakeResponse());
  assert.equal(grid.length, COLUMNS);
  assert.ok(grid.every((col) => col.length === ROWS));
  // First week is partial: Sunday-Tuesday are outside the window.
  assert.deepEqual(grid[0].slice(0, 3), [null, null, null]);
  assert.equal(grid[0][3].level, 3);
  // Last week ends on Tuesday.
  assert.equal(grid.at(-1)[3], null);
  assert.equal(grid.at(-1)[2].level, (52 + 2) % 5);
});

test("parseCalendar pads short calendars and trims long ones", () => {
  const short = parseCalendar(fakeResponse({ weekCount: 40 }));
  assert.equal(short.length, COLUMNS);
  assert.ok(short.slice(0, 13).every((col) => col.every((c) => c === null)));
  const long = parseCalendar(fakeResponse({ weekCount: 55 }));
  assert.equal(long.length, COLUMNS);
  assert.equal(long.at(-1)[2].level, (54 + 2) % 5);
});

test("parseCalendar rejects malformed data", () => {
  assert.throws(() => parseCalendar({}), /contribution calendar/);
  const bad = fakeResponse();
  bad.data.user.contributionsCollection.contributionCalendar.weeks[1].contributionDays[0].contributionLevel =
    "WAT";
  assert.throws(() => parseCalendar(bad), /Unknown contribution level/);
});

test("the query never asks for repository details", () => {
  assert.ok(!/repositor|nameWithOwner|url/i.test(CONTRIBUTION_QUERY));
});

test("fetchContributions returns the grid and sends the token only as a header", async () => {
  let seen;
  const fetchImpl = async (url, init) => {
    seen = { url, init };
    return okResponse(fakeResponse());
  };
  const { grid, warnings } = await fetchContributions({ ...OPTS, fetchImpl });
  assert.equal(grid.length, COLUMNS);
  assert.deepEqual(warnings, []);
  assert.equal(seen.url, "https://api.github.com/graphql");
  assert.equal(
    seen.init.headers.Authorization,
    "Bearer ghp_secret_token_value",
  );
  assert.ok(!seen.init.body.includes("ghp_secret_token_value"));
});

test("a token that belongs to someone else produces a warning", async () => {
  const fetchImpl = async () =>
    okResponse(fakeResponse({ owner: "someone-else" }));
  const { warnings } = await fetchContributions({ ...OPTS, fetchImpl });
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /Private contributions/);
});

test("missing token or username fails clearly", async () => {
  await assert.rejects(fetchContributions({ login: "x" }), /Missing token/);
  await assert.rejects(
    fetchContributions({ token: "   ", login: "x" }),
    /Missing token/,
  );
  await assert.rejects(
    fetchContributions({ token: "t" }),
    /Missing GitHub username/,
  );
});

test("401, 403, GraphQL errors and unknown users give friendly errors without the token", async () => {
  const cases = [
    [okResponse({}, 401), /rejected the token/],
    [okResponse({}, 403), /refused the request/],
    [
      okResponse({ errors: [{ message: "Bad query" }] }),
      /GraphQL error: Bad query/,
    ],
    [okResponse({ data: { user: null } }), /not found/],
  ];
  for (const [response, pattern] of cases) {
    await assert.rejects(
      fetchContributions({ ...OPTS, fetchImpl: async () => response }),
      (error) =>
        pattern.test(error.message) &&
        !error.message.includes("ghp_secret_token_value"),
    );
  }
});

test("temporary failures are retried, then succeed", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls++;
    if (calls === 1) throw new Error("socket hang up");
    if (calls === 2) return okResponse({}, 502);
    return okResponse(fakeResponse());
  };
  const { grid } = await fetchContributions({ ...OPTS, fetchImpl });
  assert.equal(calls, 3);
  assert.equal(grid.length, COLUMNS);
});

test("gives up after the retries are used", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls++;
    return okResponse({}, 503);
  };
  await assert.rejects(
    fetchContributions({ ...OPTS, fetchImpl }),
    /GitHub returned 503/,
  );
  assert.equal(calls, 3);
});

test("the meadow renders from API data: levels become flowers, empty cells nothing", () => {
  const grid = parseCalendar(fakeResponse());
  const svg = generateMeadowSVG(grid);
  assert.equal(svg, generateMeadowSVG(grid)); // deterministic
  assert.ok(svg.includes('id="h4"'));
  // Raw counts and dates never end up in the SVG, only levels.
  assert.ok(!/2026-01|contributionCount/.test(svg));
  // Partial first/last weeks have 3 + 4 missing days -> fewer drawn cells than a full grid.
  const full = generateMeadowSVG(
    grid.map((col) => col.map((c) => c ?? { level: 0 })),
  );
  assert.ok(svg.length < full.length);
});

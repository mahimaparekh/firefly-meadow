// Fetch the real GitHub contribution calendar (public + private counts).
//
// Privacy notes:
//  - The query asks only for dates, counts and GitHub's own activity level.
//    It never requests repository names, so nothing about private repos
//    can leak into the generated SVG.
//  - The token is only ever sent in the Authorization header. It is never
//    logged and never appears in error messages.
//  - Private contributions are included only if (a) the token belongs to the
//    same account and has the `read:user` scope and (b) "Include private
//    contributions on my profile" is switched on in GitHub profile settings.

export const COLUMNS = 53;
export const ROWS = 7;
const ENDPOINT = "https://api.github.com/graphql";

// GitHub's own quartile levels map straight onto our five flower levels.
export const LEVELS = {
  NONE: 0,
  FIRST_QUARTILE: 1,
  SECOND_QUARTILE: 2,
  THIRD_QUARTILE: 3,
  FOURTH_QUARTILE: 4,
};

// No arguments = the same "last year" window as the profile graph.
export const CONTRIBUTION_QUERY = `
query MeadowContributions($login: String!) {
  viewer { login }
  user(login: $login) {
    contributionsCollection {
      contributionCalendar {
        weeks {
          contributionDays {
            date
            weekday
            contributionCount
            contributionLevel
          }
        }
      }
    }
  }
}`;

// Turn the API response into a grid: grid[column][row] = {count, level, date} or null.
// Row 0 = Sunday, like the GitHub graph. Days outside the window stay null.
export function parseCalendar(response, columns = COLUMNS) {
  const weeks =
    response?.data?.user?.contributionsCollection?.contributionCalendar?.weeks;
  if (!Array.isArray(weeks)) {
    throw new Error("GitHub response did not contain a contribution calendar");
  }

  const grid = weeks.map((week) => {
    const column = Array(ROWS).fill(null);
    for (const day of week.contributionDays ?? []) {
      const level = LEVELS[day.contributionLevel];
      if (level === undefined) {
        throw new Error(
          `Unknown contribution level: ${String(day.contributionLevel)}`,
        );
      }
      if (
        !Number.isInteger(day.weekday) ||
        day.weekday < 0 ||
        day.weekday >= ROWS
      ) {
        throw new Error("Unexpected weekday value in GitHub response");
      }
      column[day.weekday] = {
        count: day.contributionCount,
        level,
        date: day.date,
      };
    }
    return column;
  });

  // Always return exactly `columns` weeks: keep the newest, pad the oldest side.
  const trimmed = grid.slice(-columns);
  while (trimmed.length < columns) trimmed.unshift(Array(ROWS).fill(null));
  return trimmed;
}

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function fetchContributions({
  token,
  login,
  fetchImpl = globalThis.fetch,
  sleep = defaultSleep,
  retryDelaysMs = [1000, 3000],
} = {}) {
  const cleanToken = typeof token === "string" ? token.trim() : "";
  if (!cleanToken) {
    throw new Error(
      "Missing token: set CONTRIBUTIONS_TOKEN (see .env.example)",
    );
  }
  if (!login) throw new Error("Missing GitHub username");

  let lastError;
  for (let attempt = 0; attempt <= retryDelaysMs.length; attempt++) {
    if (attempt > 0) await sleep(retryDelaysMs[attempt - 1]);

    let res;
    try {
      res = await fetchImpl(ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cleanToken}`,
          "Content-Type": "application/json",
          "User-Agent": "firefly-meadow",
        },
        body: JSON.stringify({
          query: CONTRIBUTION_QUERY,
          variables: { login },
        }),
        signal: AbortSignal.timeout(20000),
      });
    } catch {
      lastError = new Error("Network error while contacting GitHub");
      continue; // retry
    }

    if (res.status === 401) {
      throw new Error(
        "GitHub rejected the token (401). Check that the secret is correct and has not expired",
      );
    }
    if (res.status === 403) {
      throw new Error(
        "GitHub refused the request (403). The token may lack permission or you may be rate limited",
      );
    }
    if (res.status === 429 || res.status >= 500) {
      lastError = new Error(`GitHub returned ${res.status}`);
      continue; // retry
    }
    if (!res.ok)
      throw new Error(`GitHub returned unexpected status ${res.status}`);

    let body;
    try {
      body = await res.json();
    } catch {
      throw new Error("GitHub returned a response that was not valid JSON");
    }
    if (Array.isArray(body.errors) && body.errors.length > 0) {
      throw new Error(
        `GitHub GraphQL error: ${body.errors.map((e) => e.message).join("; ")}`,
      );
    }
    if (!body?.data?.user)
      throw new Error(`GitHub user "${login}" was not found`);

    const warnings = [];
    const owner = body.data.viewer?.login;
    if (owner && owner.toLowerCase() !== login.toLowerCase()) {
      warnings.push(
        `Token belongs to "${owner}", not "${login}". Private contributions of "${login}" will NOT be included`,
      );
    }
    return { grid: parseCalendar(body), warnings };
  }
  throw lastError ?? new Error("Failed to fetch contributions");
}

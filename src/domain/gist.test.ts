import { createSeedState } from "./seed";
import {
  assessSync,
  buildBundle,
  discoverOrCreateGist,
  gistMatches,
  nextLink,
  pickGist,
  validateBundle,
  type FetchLike,
  type GistSummary,
} from "./gist";

function gist(partial: Partial<GistSummary> & Pick<GistSummary, "id">): GistSummary {
  return {
    description: null,
    updated_at: "2026-11-23T00:00:00Z",
    files: {},
    ...partial,
  };
}

describe("gist discovery", () => {
  it("matches the data filename or a BalmBench description and prefers the filename", () => {
    const byName = gist({ id: "name", description: "BalmBench notes", updated_at: "2026-11-24T00:00:00Z" });
    const byFile = gist({
      id: "file",
      description: "something else",
      updated_at: "2026-11-20T00:00:00Z",
      files: { "balmbench-data.json": { filename: "balmbench-data.json" } },
    });
    expect(gistMatches(byName)).toBe(true);
    expect(gistMatches(byFile)).toBe(true);
    expect(gistMatches(gist({ id: "nope", description: "recipes" }))).toBe(false);
    expect(pickGist([byName, byFile])?.id).toBe("file");
  });

  it("reads a paginated Link header", () => {
    expect(nextLink('<https://api.github.com/gists?page=2>; rel="next", <https://api.github.com/gists?page=4>; rel="last"')).toBe(
      "https://api.github.com/gists?page=2",
    );
    expect(nextLink(null)).toBeNull();
  });

  it("discovers an existing private gist across pages and does not create another", async () => {
    const calls: { url: string; method: string; body?: string }[] = [];
    const fetchImpl: FetchLike = async (input, init) => {
      const url = String(input);
      calls.push({ url, method: init?.method ?? "GET", body: init?.body ? String(init.body) : undefined });
      if (url.includes("page=2")) {
        return Response.json([
          gist({
            id: "gist-found",
            description: "BalmBench",
            files: { "balmbench-data.json": { filename: "balmbench-data.json" } },
          }),
        ]);
      }
      return Response.json([], {
        headers: { Link: '<https://api.github.com/gists?page=2>; rel="next"' },
      });
    };
    const found = await discoverOrCreateGist("token", "{}", fetchImpl);
    expect(found).toMatchObject({ id: "gist-found", created: false });
    expect(calls.some((call) => call.method === "POST")).toBe(false);
  });

  it("creates a private gist when none exists", async () => {
    let body = "";
    const fetchImpl: FetchLike = async (input, init) => {
      const url = String(input);
      if (init?.method === "POST") {
        body = String(init.body);
        return Response.json(gist({ id: "new-gist", updated_at: "2026-11-24T12:00:00Z" }), {
          headers: { etag: '"rev-1"' },
        });
      }
      if (url.includes("?")) return Response.json([]);
      return Response.json(gist({ id: "unused" }));
    };
    const created = await discoverOrCreateGist("token", "{\"app\":\"BalmBench\"}", fetchImpl);
    expect(created).toMatchObject({ id: "new-gist", created: true, revision: '"rev-1"' });
    const parsed = JSON.parse(body) as { public: boolean; description: string; files: Record<string, { content: string }> };
    expect(parsed.public).toBe(false);
    expect(parsed.description).toBe("BalmBench");
    expect(parsed.files["balmbench-data.json"].content).toContain("BalmBench");
  });
});

describe("gist conflict detection", () => {
  it("never treats unsynced local edits plus a changed remote as a silent push", () => {
    expect(assessSync({ localDirty: true, lastSyncedRevision: "a", remoteRevision: "b" })).toBe("conflict");
    expect(assessSync({ localDirty: true, lastSyncedRevision: null, remoteRevision: "b" })).toBe("conflict");
    expect(assessSync({ localDirty: false, lastSyncedRevision: "a", remoteRevision: "b" })).toBe("pull");
    expect(assessSync({ localDirty: false, lastSyncedRevision: null, remoteRevision: "b" })).toBe("pull");
    expect(assessSync({ localDirty: true, lastSyncedRevision: "a", remoteRevision: "a" })).toBe("push");
    expect(assessSync({ localDirty: false, lastSyncedRevision: "a", remoteRevision: "a" })).toBe("noop");
    expect(assessSync({ localDirty: true, lastSyncedRevision: null, remoteRevision: null })).toBe("push");
  });

  it("round-trips a backup without the GitHub token", () => {
    const state = createSeedState("2026-11-24T00:00:00.000Z");
    state.settings.githubToken = "secret-token";
    const bundle = buildBundle(state, "2026-11-24T00:00:00.000Z");
    expect(JSON.stringify(bundle)).not.toContain("secret-token");
    const parsed = validateBundle(JSON.parse(JSON.stringify(bundle)));
    expect(parsed.ok).toBe(true);
    expect(validateBundle({ app: "other" }).ok).toBe(false);
  });
});

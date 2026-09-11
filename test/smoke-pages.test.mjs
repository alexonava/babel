import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileP = promisify(execFile);
const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const bash =
  process.platform === "win32"
    ? path.join(process.env.ProgramFiles || "C:\\Program Files", "Git", "bin", "bash.exe")
    : "bash";

// Run the complete smoke script without network calls or retry delays.
const mockNetwork = String.raw`
curl() {
  local headers="" body="" url="" status=200 effective="" title="$MOCK_TITLE"
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --dump-header) headers="$2"; shift 2 ;;
      --output) body="$2"; shift 2 ;;
      --write-out|--connect-timeout|--max-time) shift 2 ;;
      --silent|--show-error) shift ;;
      *) url="$1"; shift ;;
    esac
  done
  effective="$url"
  case "$url" in
    https://alexnava.me/__babel-smoke-missing__) status=404 ;;
    https://www.alexnava.me/) status=301 ;;
  esac
  if [ "$url" = "https://alexnava.me/" ] && [ "$MOCK_FAILURE" = "wrong-host" ]; then
    effective="https://example.com/"
  fi
  if [ -n "$headers" ]; then
    {
      printf 'HTTP/2 %s\r\n' "$status"
      if [ "$MOCK_FAILURE" != "missing-csp" ]; then
        printf "content-security-policy: default-src 'self'\r\n"
      fi
      printf 'strict-transport-security: max-age=31536000\r\n'
      printf 'x-content-type-options: nosniff\r\n'
      if [ "$status" = "301" ]; then
        printf 'location: https://alexnava.me/\r\n'
      fi
      printf '\r\n'
    } > "$headers"
  fi
  if [ "$status" = "404" ]; then
    printf "That page isn't here." > "$body"
  else
    local css_hash=11111111
    if [ "$url" = "https://alexnava.me/" ] && [ "$MOCK_FAILURE" = "different-assets" ]; then
      css_hash=99999999
    fi
    printf '<title>%s</title> css/styles.%s.css scripts/app.22222222.js' \
      "$title" "$css_hash" > "$body"
    if [ "$MOCK_LAYOUT" = "scene" ]; then
      printf ' scripts/scene.33333333.js' >> "$body"
    elif [ "$MOCK_LAYOUT" != "missing-navigation" ]; then
      printf ' estate-destinations' >> "$body"
    fi
  fi
  printf '%s\t%s' "$status" "$effective"
}
sleep() { :; }
source .github/scripts/smoke-pages.sh "$@"
`;

test("production smoke checks keep old branding exclusive to rollback and retain release gates", async (t) => {
  if (process.platform === "win32" && !existsSync(bash)) {
    t.skip("Git Bash is required to execute the production shell smoke checks on Windows");
    return;
  }
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "babel-smoke-test-"));
  t.after(async () => {
    assert.equal(path.dirname(tempRoot), path.resolve(os.tmpdir()));
    await rm(tempRoot, { recursive: true, force: true });
  });

  const cases = [
    { name: "new release accepts current title", title: "Alex Nava", code: 0 },
    { name: "new release rejects scene boot", title: "Alex Nava", layout: "scene", code: 1 },
    { name: "new release requires estate navigation", title: "Alex Nava", layout: "missing-navigation", code: 1 },
    { name: "rollback accepts previous scene", title: "Alex Nava", layout: "scene", rollback: true, code: 0 },
    { name: "new release rejects old title", title: "Nava Designs — Alex Nava", code: 1 },
    {
      name: "rollback accepts old title",
      title: "Nava Designs — Alex Nava",
      rollback: true,
      code: 0,
    },
    { name: "rollback accepts current title", title: "Alex Nava", rollback: true, code: 0 },
    { name: "rollback rejects unrelated title", title: "Unrelated site", rollback: true, code: 1 },
    { name: "rollback rejects a different host", failure: "wrong-host", code: 1 },
    { name: "rollback requires CSP", failure: "missing-csp", code: 1 },
    { name: "rollback requires matching asset hashes", failure: "different-assets", code: 1 },
  ];

  for (const scenario of cases) {
    await t.test(scenario.name, async () => {
      const rollback = scenario.rollback || Boolean(scenario.failure);
      let result;
      try {
        result = await execFileP(
          bash,
          [
            "--noprofile",
            "--norc",
            "-c",
            mockNetwork,
            "smoke-test",
            "https://immutable.alexnava-me.pages.dev",
            ...(rollback ? ["--rollback"] : []),
          ],
          {
            cwd: projectRoot,
            timeout: 30000,
            env: {
              ...process.env,
              RUNNER_TEMP: tempRoot.replaceAll("\\", "/"),
              MOCK_TITLE: scenario.title || "Nava Designs — Alex Nava",
              MOCK_FAILURE: scenario.failure || "",
              MOCK_LAYOUT: scenario.layout || "estate",
            },
          },
        );
        result.code = 0;
      } catch (error) {
        if (typeof error.code !== "number") throw error;
        result = error;
      }
      assert.equal(result.code, scenario.code, `${result.stdout}\n${result.stderr}`);
      if (scenario.code === 0) {
        assert.match(result.stdout, /Cloudflare Pages production smoke contract passed\./);
      }
    });
  }
});

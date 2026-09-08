import assert from "node:assert/strict";
import test from "node:test";
import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(testDir, "..");

async function readProjectFile(relativePath) {
  return readFile(path.join(projectRoot, relativePath), "utf8");
}

test("repo contract reflects the current preview workflow and test suite", async () => {
  const packageJson = JSON.parse(await readProjectFile("package.json"));
  const indexHtml = await readProjectFile("index.html");
  const buildScript = await readProjectFile("build.mjs");
  const ci = await readProjectFile(".github/workflows/ci.yml");
  const deploy = await readProjectFile(".github/workflows/deploy.yml");
  const preview = await readProjectFile(".github/workflows/preview.yml");
  const readme = await readProjectFile("README.md");
  const agents = await readProjectFile("AGENTS.md");
  const claude = await readProjectFile("CLAUDE.md");

  assert.equal(packageJson.engines.node, ">=22");
  for (const workflow of [ci, deploy, preview]) {
    assert.match(workflow, /node-version:\s*22/);
  }
  assert.match(packageJson.scripts.preview, /wrangler pages dev dist/);
  assert.match(indexHtml, /data-scene-script/);
  assert.match(indexHtml, /\/scripts\/scene\.js/);
  assert.match(buildScript, /SCENE_ENTRY/);
  assert.match(buildScript, /scenePath/);
  assert.match(readme, /npm run preview/);
  assert.match(readme, /scripts\/scene\.HASH\.js/);
  assert.match(agents, /npm run preview/);
  assert.match(agents, /deferred `scripts\/scene\.HASH\.js`/);
  assert.doesNotMatch(claude, /There is no automated test suite in this repo\./);
  assert.match(claude, /npm test/);
});

test("site source includes a committed OG image and matching social metadata", async () => {
  const indexHtml = await readProjectFile("index.html");
  const buildScript = await readProjectFile("build.mjs");
  const gitignore = await readProjectFile(".gitignore");

  await access(path.join(projectRoot, "og.png"));

  assert.match(indexHtml, /property="og:image"\s+content="https:\/\/alexnava\.me\/og\.png"/);
  assert.match(indexHtml, /name="twitter:image"\s+content="https:\/\/alexnava\.me\/og\.png"/);
  assert.match(indexHtml, /name="twitter:card"\s+content="summary_large_image"/);
  assert.match(buildScript, /"og\.png"/);
  assert.match(gitignore, /!og\.png/);
  assert.match(gitignore, /^\.lighthouseci\/$/m);
  assert.match(gitignore, /^\.tmp-lighthouse-\*\/$/m);
});

test("public agent-discovery files are built from sanitized source artifacts", async () => {
  const buildScript = await readProjectFile("build.mjs");
  const headers = await readProjectFile("_headers");
  const indexHtml = await readProjectFile("index.html");
  const llms = await readProjectFile("llms.txt");
  const sitemap = await readProjectFile("sitemap.md");
  const publicAgents = await readProjectFile("site-agents.md");
  const markdownHome = await readProjectFile("index.md");

  assert.match(buildScript, /"llms\.txt"/);
  assert.match(buildScript, /"sitemap\.md"/);
  assert.match(buildScript, /"index\.md"/);
  assert.match(buildScript, /source: "site-agents\.md", destination: "AGENTS\.md"/);
  for (const pathName of ["/llms.txt", "/AGENTS.md", "/index.md", "/sitemap.md"]) {
    assert.match(headers, new RegExp(`${pathName.replace(".", "\\.")}\\r?\\n\\s+Cache-Control`));
  }
  assert.match(
    headers,
    /\/llms\.txt\r?\n\s+Cache-Control[\s\S]*?Content-Type: text\/plain; charset=utf-8/,
  );
  assert.match(indexHtml, /rel="alternate" type="text\/markdown" href="\/index\.md"/);
  assert.match(indexHtml, /application\/ld\+json/);
  assert.match(llms, /^# Alex Nava/m);
  assert.match(sitemap, /^# alexnava\.me site map/m);
  assert.match(publicAgents, /^# alexnava\.me/m);
  assert.match(markdownHome, /^---[\s\S]*?title: Alex Nava/m);
});

test("scene posters are committed, copied into dist, and use stable-asset caching", async () => {
  const buildScript = await readProjectFile("build.mjs");
  const headers = await readProjectFile("_headers");

  await access(path.join(projectRoot, "images", "scene-poster-landscape.webp"));
  await access(path.join(projectRoot, "images", "scene-poster-portrait.webp"));

  assert.match(buildScript, /const STATIC_DIRS = \["fonts", "images"\];/);
  assert.match(
    headers,
    /\/images\/\*\r?\n\s+Cache-Control: public, max-age=604800, must-revalidate/,
  );
});

test("Cloudflare Pages headers preserve the static security contract", async () => {
  const headers = await readProjectFile("_headers");
  const indexHtml = await readProjectFile("index.html");

  assert.match(headers, /^\/\*\r?\n/m);
  assert.match(headers, /!\s*Access-Control-Allow-Origin/);
  assert.match(headers, /X-Content-Type-Options:\s*nosniff/);
  assert.match(headers, /Referrer-Policy:\s*strict-origin-when-cross-origin/);
  assert.match(headers, /X-Frame-Options:\s*DENY/);
  assert.match(headers, /Cross-Origin-Opener-Policy:\s*same-origin/);
  assert.match(headers, /Cross-Origin-Resource-Policy:\s*same-origin/);
  assert.match(
    headers,
    /Permissions-Policy:\s*camera=\(\), microphone=\(\), geolocation=\(\), payment=\(\), usb=\(\)/,
  );
  assert.match(
    headers,
    /Content-Security-Policy:\s*default-src 'self'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'; frame-src 'none'; object-src 'none'; worker-src 'none'; img-src 'self' data:; font-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'/,
  );

  const hsts = headers.match(
    /Strict-Transport-Security:\s*max-age=(\d+); includeSubDomains; preload/,
  );
  assert.ok(hsts, "HSTS must include subdomains and preload");
  assert.ok(Number(hsts[1]) >= 31_536_000, "HSTS max-age must be at least 12 months");
  assert.doesNotMatch(headers, /Access-Control-Allow-Origin:\s*\*/);
  assert.doesNotMatch(headers, /static\.cloudflareinsights\.com/);
  assert.doesNotMatch(indexHtml, /static\.cloudflareinsights\.com/);
});

test("redirect contract stays limited to known legacy paths", async () => {
  const redirects = await readProjectFile("_redirects");
  const redirectLines = redirects
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));

  assert.deepEqual(redirectLines, [
    "/explore / 301",
    "/tower-world / 301",
    "/tower-world.html / 301",
    "/babel_explorable_world.html / 301",
    "/explore/* / 301",
    "/prototype/* / 301",
  ]);
});

test("Cloudflare preview credentials run separately from pull-request build code", async () => {
  const deploy = await readProjectFile(".github/workflows/deploy.yml");
  const preview = await readProjectFile(".github/workflows/preview.yml");

  assert.doesNotMatch(deploy, /\n    env:\r?\n      CLOUDFLARE_API_TOKEN:/);
  assert.match(
    deploy,
    /- name: Deploy to Cloudflare Pages[\s\S]*?env:[\s\S]*?CLOUDFLARE_API_TOKEN:/,
  );
  assert.match(preview, /\n  build:\r?\n[\s\S]*?npm run build:dist/);
  assert.match(preview, /actions\/upload-artifact@b7c566a772e6b6bfb58ed0dc250532a479d7789f/);
  assert.match(preview, /github\.event\.pull_request\.head\.repo\.full_name == github\.repository/);
  assert.match(preview, /actions\/download-artifact@018cc2cf5baa6db3ef3c5f8a56943fffe632ef53/);
  assert.match(
    preview,
    /npm install --global --ignore-scripts --no-audit --no-fund wrangler@4\.114\.0/,
  );
  assert.match(
    preview,
    /- name: Deploy preview to Cloudflare Pages[\s\S]*?env:[\s\S]*?CLOUDFLARE_API_TOKEN:/,
  );
  assert.doesNotMatch(preview, /npx wrangler/);

  const credentialedJob = preview.slice(preview.indexOf("\n  preview:"));
  assert.doesNotMatch(credentialedJob, /actions\/checkout@/);
  assert.doesNotMatch(credentialedJob, /\brun:\s*npm ci\b/);
  assert.doesNotMatch(credentialedJob, /npm run build:dist/);
});

test("deploy workflows expose environment metadata and use explicit missing-credential policies", async () => {
  const deploy = await readProjectFile(".github/workflows/deploy.yml");
  const preview = await readProjectFile(".github/workflows/preview.yml");
  const operations = await readProjectFile("OPERATIONS.md");

  assert.match(
    deploy,
    /environment:\r?\n\s+name:\s*production\r?\n\s+url:\s*https:\/\/alexnava\.me\//,
  );
  assert.match(
    preview,
    /environment:\r?\n\s+name:\s*preview\r?\n\s+url:\s*\$\{\{\s*steps\.deploy\.outputs\.url\s*\}\}/,
  );
  assert.match(deploy, /Production deploy requires[\s\S]*?exit 1/);
  assert.doesNotMatch(deploy, /skipping deploy/i);
  assert.match(preview, /ready=false[\s\S]*?skipping preview deploy[\s\S]*?exit 0/i);
  assert.match(
    operations,
    /Remove the legacy token fallback only after preview and production each validate/,
  );
  assert.match(operations, /repository Actions variable shared by both environments/);
});

test("deploy workflows retry post-upload smoke checks", async () => {
  const deploy = await readProjectFile(".github/workflows/deploy.yml");
  const preview = await readProjectFile(".github/workflows/preview.yml");
  const smoke = await readProjectFile(".github/scripts/smoke-pages.sh");

  assert.match(deploy, /run:\s*bash \.github\/scripts\/smoke-pages\.sh "\$DEPLOYMENT_URL"/);
  assert.match(
    smoke,
    /\[\[ ! "\$deployment_url" =~ \^https:\/\/\[a-z0-9-\]\+\\\.alexnava-me\\\.pages\\\.dev\$\s*\]\]/,
  );
  assert.match(smoke, /for attempt in 1 2 3 4 5 6/);
  assert.match(smoke, /apex_max_attempts=18/);
  assert.match(smoke, /apex_sleep_seconds=10/);
  assert.match(smoke, /while \[ "\$attempt" -le "\$apex_max_attempts" \]/);
  assert.doesNotMatch(smoke, /\bseq\b/);
  assert.match(smoke, /grep -Fq "<title>Alex Nava<\/title>"/);
  assert.match(smoke, /grep -Eiq '\^content-security-policy:'/);
  assert.match(smoke, /grep -Eiq '\^strict-transport-security:'/);
  assert.match(smoke, /grep -Eiq '\^x-content-type-options:/);
  assert.match(smoke, /\[ "\$status" = "404" \]/);
  assert.match(smoke, /That page isn't here\./);
  assert.match(smoke, /\[ "\$status" = "301" \]/);
  assert.match(smoke, /cmp -s "\$deployment_assets" "\$apex_assets"/);
  assert.match(smoke, /Apex marker, security-header, and asset-hash parity checks passed/);
  assert.match(smoke, /\[ "\$status" = "200" \]/);
  assert.match(smoke, /\[ "\$effective_host" = "\$expected_host" \]/);
  assert.match(smoke, /"https:\/\/alexnava\.me\/" "alexnava\.me" "true"/);
  assert.doesNotMatch(smoke, /--location/);
  assert.match(smoke, /location:\[\[:space:\]\]\*https:\/\/alexnava\\\.me\//);
  assert.match(preview, /PREVIEW_URL:\s*\$\{\{\s*steps\.deploy\.outputs\.url\s*\}\}/);
  assert.match(preview, /short_branch="preview-\$\{branch_slug\}"/);
  assert.match(preview, /\[ "\$status" = "200" \]/);
  assert.match(preview, /\[ "\$effective_host" = "\$expected_host" \]/);
  assert.doesNotMatch(preview, /--location/);
  assert.match(preview, /c\.user\?\.login === 'github-actions\[bot\]'/);
  assert.match(
    preview,
    /comment:\r?\n\s+if:[^\r\n]*needs\.preview\.outputs\.ready[^\r\n]*\r?\n\s+needs: preview[\s\S]*?permissions:\r?\n\s+contents: read\r?\n\s+pull-requests: write/,
  );
  assert.doesNotMatch(preview, /^permissions:\r?\n\s+contents: read\r?\n\s+pull-requests: write/m);
});

test("dependency auditing gates every build and deploy workflow at high severity", async () => {
  const packageJson = JSON.parse(await readProjectFile("package.json"));
  const workflowNames = ["ci.yml", "deploy.yml", "preview.yml", "lighthouse.yml"];

  assert.equal(packageJson.scripts["audit:ci"], "npm audit --audit-level=high");
  for (const workflowName of workflowNames) {
    const workflow = await readProjectFile(path.join(".github", "workflows", workflowName));
    assert.match(workflow, /run:\s*npm run audit:ci/);
  }
});

test("Lighthouse uses repository artifacts and hard performance-quality budgets", async () => {
  const lighthouse = JSON.parse(await readProjectFile("lighthouserc.json"));
  const workflow = await readProjectFile(".github/workflows/lighthouse.yml");
  const { collect, assert: assertionConfig } = lighthouse.ci;
  const assertions = assertionConfig.assertions;

  assert.equal(collect.numberOfRuns, 3);
  assert.deepEqual(collect.url, ["http://localhost/"]);
  assert.equal(assertionConfig.aggregationMethod, "median");
  assert.deepEqual(assertions["categories:performance"], ["error", { minScore: 0.8 }]);
  assert.deepEqual(assertions["categories:accessibility"], ["error", { minScore: 1 }]);
  assert.deepEqual(assertions["categories:best-practices"], ["error", { minScore: 0.95 }]);
  assert.deepEqual(assertions["categories:seo"], ["error", { minScore: 1 }]);
  assert.deepEqual(assertions["largest-contentful-paint"], ["error", { maxNumericValue: 2500 }]);
  assert.deepEqual(assertions["cumulative-layout-shift"], ["error", { maxNumericValue: 0.1 }]);
  assert.deepEqual(assertions["total-blocking-time"], ["error", { maxNumericValue: 200 }]);
  assert.match(workflow, /uploadArtifacts:\s*true/);
  assert.match(workflow, /temporaryPublicStorage:\s*false/);
  assert.doesNotMatch(workflow, /pull-requests:\s*write/);
});

test("Cloudflare audit is scheduled, manual, least-privilege, and sanitized", async () => {
  const workflow = await readProjectFile(".github/workflows/cloudflare-audit.yml");
  const operations = await readProjectFile("OPERATIONS.md");

  assert.match(workflow, /schedule:\r?\n\s+- cron:\s*"17 15 \* \* 1"/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /audit:\r?\n\s+if:\s*github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /permissions:\r?\n\s+contents:\s*read/);
  assert.match(workflow, /CLOUDFLARE_AUDIT_API_TOKEN/);
  assert.match(workflow, /dedicated CLOUDFLARE_AUDIT_API_TOKEN with Pages Read/);
  assert.match(workflow, /index\("alexnava\.me"\)/);
  assert.match(workflow, /jq[\s\S]*?project:[\s\S]*?production_branch/);
  assert.match(workflow, /extract_final_header_block\(\)/);
  assert.match(workflow, /extract_final_header_block "\$raw_headers" "\$final_headers"/);
  assert.match(workflow, /--max-redirs 0/);
  assert.doesNotMatch(workflow, /--location\b/);
  assert.match(workflow, /apex_status[\s\S]*?\[ "\$apex_status" != "200" \]/);
  assert.match(
    workflow,
    /apex_effective_host[\s\S]*?\[ "\$apex_effective_host" != "alexnava\.me" \]/,
  );
  assert.match(workflow, /\[ "\$apex_effective_url" != "https:\/\/alexnava\.me\/" \]/);
  assert.match(
    workflow,
    /apex must return 200 directly from https:\/\/alexnava\.me\/ without redirecting/,
  );
  assert.match(workflow, /pages_status[\s\S]*?\[ "\$pages_status" = "200" \]/);
  assert.match(workflow, /\[ "\$pages_status" = "301" \]/);
  assert.match(workflow, /\[ "\$pages_status" = "308" \]/);
  assert.match(workflow, /200 with noindex or 301\/308 to the apex/);
  assert.match(
    workflow,
    /grep -Eiq '\^location:\[\[:space:\]\]\*https:\/\/alexnava\\\.me\/\[\[:space:\]\]\*\$' "\$pages_headers"/,
  );
  assert.match(workflow, /__babel-canonical-check\?source=cloudflare-audit&keep=1/);
  assert.match(workflow, /canonical redirect must preserve path and query/);
  assert.match(
    workflow,
    /extract_final_header_block "\$canonical_headers" "\$canonical_final_headers"/,
  );
  assert.match(
    workflow,
    /grep -Eiq '\^location:\[\[:space:\]\]\*https:\/\/alexnava\\\.me\/__babel-canonical-check\\\?source=cloudflare-audit&keep=1\[\[:space:\]\]\*\$' "\$canonical_final_headers"/,
  );
  assert.match(workflow, /www_status[\s\S]*?\[ "\$www_status" != "301" \]/);
  assert.match(workflow, /location:\[\[:space:\]\]\*https:\/\/alexnava\\\.me\/\[\[:space:\]\]\*\$/);
  assert.match(workflow, /sanitize_headers "www" "\$www_raw_headers"/);
  assert.match(workflow, /Public DNS\/TLS reachability/);
  assert.doesNotMatch(workflow, /cat "\$raw_project"/);
  assert.doesNotMatch(workflow, /set -x/);
  assert.match(workflow, /actions\/upload-artifact@b7c566a772e6b6bfb58ed0dc250532a479d7789f/);
  assert.match(workflow, /retention-days:\s*14/);
  assert.match(operations, /extracts only each request's final response-header block/);
  assert.match(operations, /effective host exactly `alexnava\.me`/);
  assert.match(
    operations,
    /redirect its root with `301`\/`308` to exactly `https:\/\/alexnava\.me\/`/,
  );
});

test("canonical Pages hostname workflow is exact, protected, and idempotent", async () => {
  const workflow = await readProjectFile(".github/workflows/cloudflare-canonical-hostname.yml");
  const script = await readProjectFile(
    ".github/scripts/configure-cloudflare-canonical-redirect.mjs",
  );

  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /environment:\s*\n\s+name:\s*production/);
  assert.match(workflow, /refs\/heads\/main/);
  assert.match(workflow, /CONFIRM.*alexnava-me\.pages\.dev/s);
  assert.match(workflow, /secrets\.CLOUDFLARE_REDIRECTS_API_TOKEN/);
  assert.match(workflow, /Verify apex remains direct and indexable/);

  assert.match(script, /const LIST_NAME = "alexnava_pages_hostname_redirects"/);
  assert.match(script, /const RULE_REF = "canonicalize_alexnava_pages_hostname"/);
  assert.match(script, /source_url:\s*SOURCE_URL/);
  assert.match(script, /target_url:\s*TARGET_URL/);
  assert.match(script, /status_code:\s*301/);
  assert.match(script, /include_subdomains:\s*false/);
  assert.match(script, /subpath_matching:\s*true/);
  assert.match(script, /preserve_path_suffix:\s*true/);
  assert.match(script, /preserve_query_string:\s*true/);
  assert.match(script, /Refusing to overwrite unexpected entries/);
  assert.match(script, /listRules\.length > 1/);
  assert.match(script, /matchingRules\[0\]\.id !== listRules\[0\]\.id/);
  assert.match(script, /const managedRule = matchingRules\[0\] \?\? listRules\[0\]/);
  assert.match(
    script,
    /rulesets\/\$\{ruleset\.id\}\/rules\/\$\{managedRule\.id\}/,
    "the workflow should adopt a matching dashboard-created rule instead of duplicating it",
  );
});

test("operations document CodeQL default setup without a duplicate workflow", async () => {
  const workflowDir = path.join(projectRoot, ".github", "workflows");
  const workflowFiles = await readdir(workflowDir);
  const operations = await readProjectFile("OPERATIONS.md");

  assert.match(operations, /GitHub CodeQL default setup is enabled as the low-maintenance scanner/);
  assert.equal(
    workflowFiles.some((file) => /codeql/i.test(file)),
    false,
    "CodeQL default setup should not be duplicated by an advanced-setup workflow",
  );
});

test("static headers separate immutable fingerprints from revalidated stable assets", async () => {
  const headers = await readProjectFile("_headers");

  assert.match(
    headers,
    /Strict-Transport-Security:\s*max-age=31536000; includeSubDomains; preload/,
  );
  for (const directive of ["form-action 'none'", "frame-src 'none'", "worker-src 'none'"]) {
    assert.match(headers, new RegExp(directive.replace(" ", "\\s+")));
  }
  assert.doesNotMatch(
    headers,
    /X-Robots-Tag/i,
    "static Pages headers cannot safely scope X-Robots-Tag by hostname",
  );
  assert.doesNotMatch(
    headers,
    /^https?:\/\//m,
    "absolute URL patterns are not supported in the Pages _headers file",
  );
  for (const stablePath of [
    "/favicon.svg",
    "/icon.svg",
    "/icon-maskable.svg",
    "/manifest.webmanifest",
    "/og.png",
    "/robots.txt",
    "/sitemap.xml",
    "/LICENSE",
    "/fonts/*",
  ]) {
    const escapedPath = stablePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.match(
      headers,
      new RegExp(`${escapedPath}\\r?\\n\\s+Cache-Control: public, max-age=604800, must-revalidate`),
    );
  }
  for (const fingerprintedPath of [
    "/css/styles.*.css",
    "/scripts/app.*.js",
    "/scripts/scene.*.js",
  ]) {
    const escapedPath = fingerprintedPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.match(
      headers,
      new RegExp(`${escapedPath}\\r?\\n\\s+Cache-Control: public, max-age=31536000, immutable`),
    );
  }
});

test("production deploy is workflow-owned and explicitly publishes main", async () => {
  const packageJson = JSON.parse(await readProjectFile("package.json"));
  const deploy = await readProjectFile(".github/workflows/deploy.yml");
  const operations = await readProjectFile("OPERATIONS.md");

  assert.equal(packageJson.scripts["deploy:prod"], undefined);
  assert.match(deploy, /npx wrangler pages deploy dist --project-name=alexnava-me --branch=main/);
  assert.match(deploy, /if:\s*github\.ref == 'refs\/heads\/main'/);
  assert.match(deploy, /group:\s*pages-production\r?\n\s+cancel-in-progress:\s*false/);
  assert.match(operations, /Production has no direct local npm deploy command/);
  assert.match(operations, /gh workflow run deploy\.yml --ref main/);
});

test("production deploy captures and verifies an automatic Pages rollback target", async () => {
  const deploy = await readProjectFile(".github/workflows/deploy.yml");
  const smoke = await readProjectFile(".github/scripts/smoke-pages.sh");
  const operations = await readProjectFile("OPERATIONS.md");

  await access(path.join(projectRoot, ".github", "scripts", "smoke-pages.sh"));
  assert.match(
    deploy,
    /https:\/\/api\.cloudflare\.com\/client\/v4\/accounts\/\$CLOUDFLARE_ACCOUNT_ID\/pages\/projects\/alexnava-me"/,
  );
  assert.match(deploy, /\.result\.canonical_deployment\.environment == "production"/);
  assert.match(deploy, /\.result\.canonical_deployment\.latest_stage\.status == "success"/);
  assert.match(deploy, /deployment_id=\$deployment_id/);
  assert.match(deploy, /deployment_url=\$\{deployment_url%\/\}/);
  assert.match(
    deploy,
    /if:\s*failure\(\) && steps\.deploy\.outcome == 'success'[\s\S]*?\/deployments\/\$PREVIOUS_DEPLOYMENT_ID\/rollback/,
  );
  assert.match(
    deploy,
    /if:\s*failure\(\) && steps\.deploy\.outcome == 'success' && steps\.rollback\.outcome == 'success'/,
  );
  assert.equal(
    (deploy.match(/bash \.github\/scripts\/smoke-pages\.sh/g) || []).length,
    2,
    "new deployments and rollbacks must use the same smoke script",
  );
  assert.match(
    deploy,
    /bash \.github\/scripts\/smoke-pages\.sh "\$PREVIOUS_DEPLOYMENT_URL" --rollback/,
  );
  assert.doesNotMatch(deploy, /"\$DEPLOYMENT_URL" --rollback/);
  assert.match(deploy, /previous deployment was restored and verified\.[\s\S]*?exit 1/);
  assert.doesNotMatch(smoke, /CLOUDFLARE_(API_TOKEN|ACCOUNT_ID)/);
  assert.match(operations, /official Pages rollback endpoint/);
  assert.match(operations, /keeps the workflow red/);
});

test("GitHub Actions workflows pin third-party actions to full SHAs", async () => {
  const workflowDir = path.join(projectRoot, ".github", "workflows");
  const workflowFiles = (await readdir(workflowDir))
    .filter((file) => file.endsWith(".yml") || file.endsWith(".yaml"))
    .sort();
  assert.ok(workflowFiles.includes("lighthouse.yml"), "Lighthouse workflow must be covered");

  const workflows = await Promise.all(
    workflowFiles.map((file) => readProjectFile(path.join(".github", "workflows", file))),
  );
  const usesLines = workflows.flatMap((workflow) =>
    (workflow.match(/^\s*uses:\s*[^\s]+$/gm) || []).filter((line) => !line.includes("./")),
  );

  assert.ok(usesLines.length > 0, "expected at least one GitHub Action use");
  for (const line of usesLines) {
    assert.match(line, /@[a-f0-9]{40}$/, `${line.trim()} must use a full commit SHA`);
    assert.doesNotMatch(line, /@(v\d+|main|master)$/, `${line.trim()} must not use a moving tag`);
  }
});

test("core GitHub Actions use hardened reviewed checkout and setup-node revisions", async () => {
  const workflowNames = [
    "ci.yml",
    "deploy.yml",
    "preview.yml",
    "lighthouse.yml",
    "cloudflare-audit.yml",
  ];
  const workflows = await Promise.all(
    workflowNames.map((file) => readProjectFile(path.join(".github", "workflows", file))),
  );

  for (const workflow of workflows) {
    assert.match(
      workflow,
      /actions\/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd\r?\n\s+with:\r?\n\s+persist-credentials:\s*false/,
    );
    if (workflow.includes("actions/setup-node@")) {
      assert.match(workflow, /actions\/setup-node@820762786026740c76f36085b0efc47a31fe5020/);
    }
  }
});

import assert from "node:assert/strict";
import test from "node:test";
import { createPostprocessPipeline } from "../src/scene/postprocess.js";

function createRendererMock() {
  return {
    autoClearColor: true,
    autoClearDepth: true,
    autoClearStencil: true,
    clear() {},
    getPixelRatio() {
      return 1;
    },
    getRenderTarget() {
      return null;
    },
    getSize(target) {
      target.width = 800;
      target.height = 600;
      return target;
    },
    setRenderTarget() {},
  };
}

function createMatchMedia(matches = false) {
  let changeHandler = null;
  const query = {
    matches,
    addEventListener(type, handler) {
      if (type === "change") changeHandler = handler;
    },
    removeEventListener(type, handler) {
      if (type === "change" && changeHandler === handler) changeHandler = null;
    },
  };
  const matchMedia = () => query;
  matchMedia.dispatch = (nextMatches) => {
    query.matches = nextMatches;
    changeHandler?.({ matches: nextMatches });
  };
  return matchMedia;
}

function createPipeline(
  profile,
  {
    reducedTransparency = false,
    matchMedia = createMatchMedia(reducedTransparency),
    onInvalidate,
  } = {},
) {
  return createPostprocessPipeline(createRendererMock(), {}, {}, profile, {
    matchMedia,
    onInvalidate,
  });
}

test("postprocess pipeline creates render, bloom, grading, and vignette-grain passes", () => {
  const pipeline = createPipeline({
    postprocessGrading: true,
    postprocessBloom: true,
    postprocessVignette: true,
    postprocessGrain: true,
  });

  assert.equal(pipeline.composer.passes.length, 4);
  assert.equal(pipeline.composer.passes[0], pipeline.passes.render);
  assert.equal(pipeline.composer.passes[1], pipeline.passes.bloom);
  assert.equal(pipeline.composer.passes[2], pipeline.passes.grading);
  assert.equal(pipeline.composer.passes[3], pipeline.passes.vignetteGrain);
  assert.equal(pipeline.passes.bloom.strength, 0.18);
  assert.equal(pipeline.passes.bloom.radius, 0.45);
  assert.equal(pipeline.passes.bloom.threshold, 0.9);
  assert.equal(pipeline.passes.grading.uniforms.uHighlightWarmMix.value, 0.14);
  assert.equal(pipeline.passes.grading.uniforms.uShadowCoolMix.value, 0.25);
  assert.equal(pipeline.passes.grading.uniforms.uContrast.value, 1.06);
  assert.equal(pipeline.passes.grading.uniforms.uCelMix.value, 0.24);
  assert.deepEqual(pipeline.passes.grading.uniforms.uTexelSize.value.toArray(), [1 / 800, 1 / 600]);
  assert.equal(pipeline.passes.vignetteGrain.uniforms.uVignetteStrength.value, 0.08);
  assert.equal(pipeline.passes.vignetteGrain.uniforms.uGrainStrength.value, 0.022);

  pipeline.dispose();
});

test("high tier enables bloom, grading, vignette, and grain", () => {
  const pipeline = createPipeline({
    postprocessGrading: true,
    postprocessBloom: true,
    postprocessVignette: true,
    postprocessGrain: true,
  });

  assert.equal(pipeline.passes.bloom.enabled, true);
  assert.equal(pipeline.passes.grading.enabled, true);
  assert.equal(pipeline.passes.vignetteGrain.enabled, true);
  assert.equal(pipeline.passes.vignetteGrain.uniforms.uVignetteEnabled.value, 1);
  assert.equal(pipeline.passes.vignetteGrain.uniforms.uGrainEnabled.value, 1);

  pipeline.dispose();
});

test("balanced tier disables bloom while keeping grading, vignette, and grain", () => {
  const pipeline = createPipeline({
    postprocessGrading: true,
    postprocessBloom: false,
    postprocessVignette: true,
    postprocessGrain: true,
  });

  assert.equal(pipeline.passes.bloom.enabled, false);
  assert.equal(pipeline.passes.grading.enabled, true);
  assert.equal(pipeline.passes.vignetteGrain.enabled, true);
  assert.equal(pipeline.passes.vignetteGrain.uniforms.uVignetteEnabled.value, 1);
  assert.equal(pipeline.passes.vignetteGrain.uniforms.uGrainEnabled.value, 1);

  pipeline.dispose();
});

test("low tier keeps only grading enabled", () => {
  const pipeline = createPipeline({
    postprocessGrading: true,
    postprocessBloom: false,
    postprocessVignette: false,
    postprocessGrain: false,
  });

  assert.equal(pipeline.passes.bloom.enabled, false);
  assert.equal(pipeline.passes.grading.enabled, true);
  assert.equal(pipeline.passes.vignetteGrain.enabled, false);
  assert.equal(pipeline.passes.vignetteGrain.uniforms.uVignetteEnabled.value, 0);
  assert.equal(pipeline.passes.vignetteGrain.uniforms.uGrainEnabled.value, 0);

  pipeline.dispose();
});

test("reduced transparency disables vignette but leaves static grain enabled", () => {
  const pipeline = createPipeline(
    {
      postprocessGrading: true,
      postprocessBloom: false,
      postprocessVignette: true,
      postprocessGrain: true,
    },
    { reducedTransparency: true },
  );

  assert.equal(pipeline.passes.vignetteGrain.enabled, true);
  assert.equal(pipeline.passes.vignetteGrain.uniforms.uVignetteEnabled.value, 0);
  assert.equal(pipeline.passes.vignetteGrain.uniforms.uGrainEnabled.value, 1);

  pipeline.dispose();
});

test("live reduced-transparency changes invalidate a dirty-render scene", () => {
  const matchMedia = createMatchMedia(false);
  let invalidations = 0;
  const pipeline = createPipeline(
    {
      postprocessGrading: true,
      postprocessBloom: false,
      postprocessVignette: true,
      postprocessGrain: false,
    },
    {
      matchMedia,
      onInvalidate() {
        invalidations += 1;
      },
    },
  );

  matchMedia.dispatch(true);
  assert.equal(pipeline.passes.vignetteGrain.enabled, false);
  assert.equal(invalidations, 1);

  matchMedia.dispatch(false);
  assert.equal(pipeline.passes.vignetteGrain.enabled, true);
  assert.equal(invalidations, 2);
  pipeline.dispose();
});

test("setQualityProfile updates adaptive pass enablement without rebuilding the composer", () => {
  const pipeline = createPipeline({
    postprocessGrading: true,
    postprocessBloom: true,
    postprocessVignette: true,
    postprocessGrain: true,
  });

  pipeline.setQualityProfile({
    postprocessGrading: true,
    postprocessBloom: false,
    postprocessVignette: false,
    postprocessGrain: false,
    postprocessSettings: {
      bloomStrength: 0,
      celMix: 0.2,
      contrast: 1.05,
      grainStrength: 0,
      highlightWarmMix: 0.14,
      shadowCoolMix: 0.22,
      vignetteStrength: 0,
    },
  });

  assert.equal(pipeline.passes.bloom.enabled, false);
  assert.equal(pipeline.passes.grading.enabled, true);
  assert.equal(pipeline.passes.vignetteGrain.enabled, false);
  assert.equal(pipeline.passes.bloom.strength, 0);
  assert.equal(pipeline.passes.grading.uniforms.uCelMix.value, 0.2);
  assert.equal(pipeline.passes.grading.uniforms.uContrast.value, 1.05);
  assert.equal(pipeline.passes.grading.uniforms.uHighlightWarmMix.value, 0.14);
  assert.equal(pipeline.passes.grading.uniforms.uShadowCoolMix.value, 0.22);
  assert.equal(pipeline.passes.vignetteGrain.uniforms.uVignetteStrength.value, 0);
  assert.equal(pipeline.passes.vignetteGrain.uniforms.uGrainStrength.value, 0);

  pipeline.dispose();
});

test("resize updates texel sampling for the selective ink contour", () => {
  const pipeline = createPipeline({ postprocessGrading: true });
  pipeline.resize(1600, 900);
  assert.deepEqual(pipeline.passes.grading.uniforms.uTexelSize.value.toArray(), [
    1 / 1600,
    1 / 900,
  ]);
  pipeline.dispose();
});

function createWebGL2Renderer({ isWebGL2 = true, maxSamples = 8, colorBufferFloat = true } = {}) {
  return {
    ...createRendererMock(),
    capabilities: { isWebGL2, maxSamples },
    extensions: { has: (name) => colorBufferFloat && name === "EXT_color_buffer_float" },
  };
}

test("only the scene pass multisamples on the high tier, and a change rebuilds its target", () => {
  const high = { postprocessGrading: true, postprocessSamples: 4 };
  const balanced = { postprocessGrading: true, postprocessSamples: 0 };
  let ratio = 1;
  const renderer = { ...createWebGL2Renderer(), getPixelRatio: () => ratio };
  const pipeline = createPostprocessPipeline(renderer, {}, {}, high, {
    matchMedia: createMatchMedia(),
  });
  const render = pipeline.passes.render;
  const pingPong = [pipeline.composer.renderTarget1, pipeline.composer.renderTarget2];
  const pingPongState = () => pingPong.map((target) => [target.samples, target.depthBuffer]);

  const sampled = render.sampledTarget;
  assert.equal(sampled.samples, 4);
  assert.deepEqual([sampled.width, sampled.height], [800, 600]);
  assert.equal(sampled.depthBuffer, true, "the scene keeps its depth test");
  assert.deepEqual(
    pingPongState(),
    [[0, false], [0, false]],
    "full-screen passes pay no resolve and need no depth",
  );
  ratio = 1.5;
  pipeline.composer.setPixelRatio(ratio);
  assert.deepEqual([sampled.width, sampled.height], [1200, 900], "the target follows device pixels");

  const pingPongDisposals = pingPong.map(() => 0);
  pingPong.forEach((target, index) =>
    target.addEventListener("dispose", () => (pingPongDisposals[index] += 1)),
  );
  let sampledDisposals = 0;
  sampled.addEventListener("dispose", () => (sampledDisposals += 1));
  pipeline.setQualityProfile(balanced);
  assert.equal(render.sampledTarget, null);
  assert.equal(sampledDisposals, 1);
  assert.deepEqual(pingPongState(), [[0, true], [0, true]], "the scene draws straight into them");
  assert.deepEqual(pingPongDisposals, [1, 1]);
  pipeline.setQualityProfile(balanced);
  assert.deepEqual(pingPongDisposals, [1, 1], "an unchanged count keeps the targets");
  pipeline.setQualityProfile(high);
  assert.equal(render.sampledTarget.samples, 4);
  assert.deepEqual([render.sampledTarget.width, render.sampledTarget.height], [1200, 900]);
  assert.deepEqual(pingPongState(), [[0, false], [0, false]]);
  pipeline.dispose();

  for (const [limitedRenderer, expected] of [
    [createWebGL2Renderer({ isWebGL2: false, maxSamples: 0 }), 0],
    [createWebGL2Renderer({ colorBufferFloat: false }), 0],
    [createWebGL2Renderer({ maxSamples: 2 }), 2],
    [createRendererMock(), 0],
  ]) {
    const limited = createPostprocessPipeline(limitedRenderer, {}, {}, high, {
      matchMedia: createMatchMedia(),
    });
    assert.equal(limited.passes.render.sampledTarget?.samples ?? 0, expected);
    assert.equal(limited.composer.renderTarget1.samples, 0);
    assert.equal(limited.composer.renderTarget2.samples, 0);
    limited.dispose();
  }
});

test("a multisampled scene resolves once and is copied into the read buffer", () => {
  const draws = [];
  let target = null;
  const renderer = {
    ...createWebGL2Renderer(),
    autoClear: true,
    clear() {
      draws.push(["clear", target]);
    },
    setRenderTarget(next) {
      target = next;
    },
    render(object) {
      draws.push([object.isMesh ? "copy" : "scene", target]);
    },
  };
  const scene = { isScene: true };
  const pipeline = createPostprocessPipeline(
    renderer,
    scene,
    {},
    { postprocessGrading: true, postprocessSamples: 4 },
    { matchMedia: createMatchMedia() },
  );
  const render = pipeline.passes.render;
  const { readBuffer, writeBuffer } = pipeline.composer;

  render.render(renderer, writeBuffer, readBuffer);
  assert.deepEqual(draws, [
    ["clear", render.sampledTarget],
    ["scene", render.sampledTarget],
    ["copy", readBuffer],
  ]);
  assert.equal(render.copyQuad.material.uniforms.tDiffuse.value, render.sampledTarget.texture);
  assert.equal(render.needsSwap, false, "later passes read the copy from the read buffer");

  draws.length = 0;
  render.renderToScreen = true;
  render.render(renderer, writeBuffer, readBuffer);
  assert.deepEqual(draws, [["clear", null], ["scene", null]], "a final scene pass draws directly");

  draws.length = 0;
  render.renderToScreen = false;
  pipeline.setQualityProfile({ postprocessGrading: true, postprocessSamples: 0 });
  render.render(renderer, writeBuffer, readBuffer);
  assert.deepEqual(draws, [["clear", readBuffer], ["scene", readBuffer]], "no samples, no copy");
  pipeline.dispose();
});

test("bloom keeps its CSS-pixel resolution while the composer follows device pixels", () => {
  let ratio = 1;
  const renderer = { ...createRendererMock(), getPixelRatio: () => ratio };
  const pipeline = createPostprocessPipeline(renderer, {}, {}, { postprocessBloom: true }, {
    matchMedia: createMatchMedia(),
  });
  const bloom = pipeline.passes.bloom;
  assert.equal(bloom.renderTargetBright.width, 400);

  ratio = 1.5;
  pipeline.composer.setPixelRatio(ratio);
  pipeline.resize(800, 600);
  assert.equal(pipeline.composer.renderTarget1.width, 1200);
  assert.equal(pipeline.composer.renderTarget1.height, 900);
  assert.equal(bloom.renderTargetBright.width, 400, "the glow keeps its reviewed spread");
  assert.equal(bloom.renderTargetBright.height, 300);
  assert.deepEqual(
    pipeline.passes.grading.uniforms.uTexelSize.value.toArray(),
    [1 / 800, 1 / 600],
    "the ink contour samples one CSS pixel apart",
  );
  pipeline.dispose();
});

test("dispose releases pipeline resources without throwing", () => {
  const pipeline = createPipeline({
    postprocessGrading: true,
    postprocessBloom: true,
    postprocessVignette: true,
    postprocessGrain: true,
  });

  assert.doesNotThrow(() => pipeline.dispose());
});

test("film grading survives quality changes and restores the current profile without adding passes", () => {
  const profile = {
    postprocessBloom: true,
    postprocessGrading: true,
    postprocessVignette: true,
    postprocessGrain: true,
  };
  const pipeline = createPipeline(profile),
    g = pipeline.passes.grading.uniforms,
    v = pipeline.passes.vignetteGrain.uniforms;
  pipeline.setFilmTreatment(true);
  pipeline.setTextProtection(true, 0.3);
  assert.equal(pipeline.composer.passes.length, 4);
  assert.equal(g.uCelMix.value, 0);
  assert.equal(g.uInkMix.value, 0);
  assert.equal(g.uContrast.value, 1.015);
  assert.equal(g.uHighlightWarmMix.value, 0.12);
  assert.equal(g.uShadowCoolMix.value, 0.16);
  assert.equal(pipeline.passes.bloom.strength, 0.2);
  assert.equal(v.uGrainStrength.value, 0.008);
  assert.equal(v.uVignetteStrength.value, 0.12);
  pipeline.setQualityProfile({ ...profile, postprocessBloom: false });
  assert.equal(pipeline.passes.bloom.enabled, false);
  assert.equal(g.uCelMix.value, 0);
  assert.equal(v.uTextProtection.value, 1);
  pipeline.setFilmTreatment(false);
  assert.equal(g.uCelMix.value, 0.24);
  assert.equal(g.uInkMix.value, 0.14);
  assert.equal(v.uTextProtection.value, 0);
  pipeline.dispose();
});

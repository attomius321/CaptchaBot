// ultra-stealth-captcha-automation.js
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import sharp from "sharp";

// Add stealth plugin to evade detection
puppeteer.use(StealthPlugin());

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const rand = (min, max) => min + Math.random() * (max - min);
const randInt = (min, max) => Math.floor(rand(min, max + 1));

// Easing functions for natural movement
const easing = {
  easeInOutCubic: (t) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2),
  easeOutBack: (t) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
  },
  easeInQuad: (t) => t ** 2,
  easeOutQuad: (t) => 1 - (1 - t) ** 2,
  easeInOutQuart: (t) => (t < 0.5 ? 8 * t ** 4 : 1 - 8 * --t * t ** 3),
};

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  target: {
    url: "https://captchafox.com/#demo",
    buttonSelector: ".cf-button__logo",
    sliderSelector: ".cf-slide__canvas",
    handleSelector: ".cf-slider__button",
  },
  anomaly: {
    whiteThreshold: 250, // Pixels with any channel below this are considered anomalies
    offsetPixels: 30, // Subtract this many pixels from the anomaly X position when dragging
  },
  timing: {
    initialPageLoad: [1500, 3000],
    pageExploration: [2000, 4000],
    postClickDelay: [400, 800],
    microPauseChance: 0.1,
    microPauseDuration: [20, 60],
    thinkingPause: [300, 700],
    observationPause: [500, 1000],
    readingPause: [800, 1500],
  },
  mouse: {
    moveDuration: [400, 800],
    moveSteps: [25, 45],
    baseJitter: 2.0,
    overshootChance: 0.8,
    overshootDistance: [10, 25],
    hoverJitterCount: [3, 6],
    hoverJitterRadius: [2, 6],
    hoverJitterDelay: [50, 150],
    idleDriftChance: 0.3,
    idleDriftRange: [5, 15],
    clickPressTime: [60, 120],
  },
  slider: {
    dragSteps: [70, 110],
    dragDuration: [1000, 1600],
    overshootChance: 0.75,
    overshootRange: [-12, 18],
    stutterChance: 0.15,
    stutterDuration: [30, 90],
    tremblerIntensity: 0.7,
    wavePeriods: [2, 3.5],
    waveAmplitude: [1, 3],
  },
  humanization: {
    attentionWander: 0.2,
    wanderDistance: [20, 50],
    wanderDuration: [200, 400],
    preActionDelay: [150, 400],
    explorationMoves: [3, 6],
  },
};

// ============================================================================
// ANOMALY DETECTION
// ============================================================================

class AnomalyDetector {
  constructor(whiteThreshold = 250) {
    // Threshold for what we consider "white" (pixels above this are ignored)
    this.whiteThreshold = whiteThreshold;
  }

  isAnomaly(r, g, b) {
    // Check if pixel is darker than white (an anomaly)
    // We consider a pixel an anomaly if any channel is below the threshold
    return (
      r < this.whiteThreshold ||
      g < this.whiteThreshold ||
      b < this.whiteThreshold
    );
  }

  async findFirstAnomaly(buffer) {
    const image = sharp(buffer);
    const { data, info } = await image
      .raw()
      .toBuffer({ resolveWithObject: true });

    const channels = info.channels;

    console.log(
      `→ Scanning ${info.width}x${info.height} image from right to left...`
    );

    // Scan from right to left
    for (let x = info.width - 1; x >= 0; x--) {
      for (let y = 0; y < info.height; y++) {
        const idx = (y * info.width + x) * channels;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];

        if (this.isAnomaly(r, g, b)) {
          console.log(
            `✓ First anomaly found at (${x}, ${y}) - RGB(${r}, ${g}, ${b})`
          );
          return { x, y, r, g, b, info };
        }
      }
    }

    return null;
  }
}

// ============================================================================
// PERLIN NOISE GENERATOR
// ============================================================================

class PerlinNoise {
  constructor() {
    this.permutation = this.generatePermutation();
    this.p = [...this.permutation, ...this.permutation];
  }

  generatePermutation() {
    const p = Array.from({ length: 256 }, (_, i) => i);
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [p[i], p[j]] = [p[j], p[i]];
    }
    return p;
  }

  fade(t) {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  lerp(t, a, b) {
    return a + t * (b - a);
  }

  grad(hash, x, y) {
    const h = hash & 15;
    const u = h < 8 ? x : y;
    const v = h < 4 ? y : h === 12 || h === 14 ? x : 0;
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  }

  noise(x, y) {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;

    x -= Math.floor(x);
    y -= Math.floor(y);

    const u = this.fade(x);
    const v = this.fade(y);

    const a = this.p[X] + Y;
    const aa = this.p[a];
    const ab = this.p[a + 1];
    const b = this.p[X + 1] + Y;
    const ba = this.p[b];
    const bb = this.p[b + 1];

    return this.lerp(
      v,
      this.lerp(
        u,
        this.grad(this.p[aa], x, y),
        this.grad(this.p[ba], x - 1, y)
      ),
      this.lerp(
        u,
        this.grad(this.p[ab], x, y - 1),
        this.grad(this.p[bb], x - 1, y - 1)
      )
    );
  }
}

// ============================================================================
// MOUSE CONTROLLER
// ============================================================================

class MouseController {
  constructor(page) {
    this.page = page;
    this.position = { x: rand(50, 150), y: rand(50, 150) };
    this.velocity = { x: 0, y: 0 };
    this.perlin = new PerlinNoise();
    this.noiseOffset = { x: Math.random() * 1000, y: Math.random() * 1000 };
  }

  async initialize() {
    // Start with random position, not 0,0
    await this.page.mouse.move(this.position.x, this.position.y, { steps: 1 });

    // Initial random drift to simulate natural entry
    await this.randomWander(3);
  }

  constrainToViewport(x, y) {
    const viewport = this.page.viewport();
    return {
      x: Math.max(10, Math.min(viewport.width - 10, x)),
      y: Math.max(10, Math.min(viewport.height - 10, y)),
    };
  }

  getPerlinNoise(offset) {
    return this.perlin.noise(offset * 0.1, offset * 0.15);
  }

  applyTremor(value, intensity = CONFIG.slider.tremblerIntensity) {
    const tremor = (Math.random() - 0.5) * 2 * intensity;
    return value + tremor;
  }

  bezierPoint(t, points) {
    if (points.length === 1) return points[0];

    const newPoints = [];
    for (let i = 0; i < points.length - 1; i++) {
      newPoints.push({
        x: points[i].x + (points[i + 1].x - points[i].x) * t,
        y: points[i].y + (points[i + 1].y - points[i].y) * t,
      });
    }
    return this.bezierPoint(t, newPoints);
  }

  generateCurvePoints(start, end, complexity = 3) {
    const points = [start];
    const distance = Math.hypot(end.x - start.x, end.y - start.y);
    const segments = Math.min(
      complexity,
      Math.max(2, Math.floor(distance / 80))
    );

    for (let i = 1; i < segments; i++) {
      const t = i / segments;
      const baseX = start.x + (end.x - start.x) * t;
      const baseY = start.y + (end.y - start.y) * t;

      const perpAngle =
        Math.atan2(end.y - start.y, end.x - start.x) + Math.PI / 2;
      const offset = (Math.random() - 0.5) * distance * 0.15;

      points.push({
        x: baseX + Math.cos(perpAngle) * offset,
        y: baseY + Math.sin(perpAngle) * offset,
      });
    }

    points.push(end);
    return points;
  }

  async moveTo(target, options = {}) {
    const {
      duration = rand(...CONFIG.mouse.moveDuration),
      steps = randInt(...CONFIG.mouse.moveSteps),
      overshoot = false,
      easingFunc = easing.easeInOutCubic,
    } = options;

    const start = { ...this.position };
    const distance = Math.hypot(target.x - start.x, target.y - start.y);

    const dynamicJitter = Math.min(
      CONFIG.mouse.baseJitter * (1 + distance / 600),
      4.5
    );

    let finalTarget = target;
    let shouldOvershoot =
      overshoot && Math.random() < CONFIG.mouse.overshootChance;

    if (shouldOvershoot) {
      const angle = Math.atan2(target.y - start.y, target.x - start.x);
      const overshootDist = rand(...CONFIG.mouse.overshootDistance);
      finalTarget = {
        x: target.x + Math.cos(angle) * overshootDist,
        y: target.y + Math.sin(angle) * overshootDist,
      };
    }

    const curvePoints = this.generateCurvePoints(start, finalTarget, 4);
    const interval = duration / steps;

    this.noiseOffset.x += rand(0.05, 0.15);
    this.noiseOffset.y += rand(0.05, 0.15);

    for (let i = 1; i <= steps; i++) {
      const progress = i / steps;
      const easedProgress = easingFunc(progress);

      const p = this.bezierPoint(easedProgress, curvePoints);

      const speedFactor = Math.abs(easedProgress - (i - 1) / steps) * steps;
      const perlinX = this.getPerlinNoise(this.noiseOffset.x + i * 0.2);
      const perlinY = this.getPerlinNoise(this.noiseOffset.y + i * 0.2);

      const jitterX = perlinX * dynamicJitter * (1 + speedFactor * 0.3);
      const jitterY = perlinY * dynamicJitter * (1 + speedFactor * 0.3);

      const pos = this.constrainToViewport(p.x + jitterX, p.y + jitterY);

      this.velocity.x = (pos.x - this.position.x) * 0.7;
      this.velocity.y = (pos.y - this.position.y) * 0.7;
      this.position = pos;

      await this.page.mouse.move(pos.x, pos.y, { steps: 1 });

      const speedMultiplier = 1 - Math.abs(speedFactor) * 0.2;
      const variableDelay = interval * rand(0.7, 1.4) * speedMultiplier;
      await delay(variableDelay);

      if (Math.random() < CONFIG.timing.microPauseChance) {
        await delay(rand(...CONFIG.timing.microPauseDuration));
      }
    }

    if (shouldOvershoot) {
      await this.correctOvershoot(finalTarget, target);
    } else {
      this.position = target;
      await this.page.mouse.move(target.x, target.y, { steps: randInt(1, 3) });
    }
  }

  async correctOvershoot(from, to) {
    const steps = randInt(6, 12);
    const duration = rand(120, 250);
    const curvePoints = this.generateCurvePoints(from, to, 2);

    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const easedT = easing.easeOutQuad(t);
      const p = this.bezierPoint(easedT, curvePoints);

      const pos = {
        x: this.applyTremor(p.x, 0.5),
        y: this.applyTremor(p.y, 0.5),
      };

      this.position = pos;
      await this.page.mouse.move(pos.x, pos.y, { steps: 1 });
      await delay((duration / steps) * rand(0.85, 1.15));
    }
  }

  async microDrift(range = null) {
    const driftRange = range ?? rand(...CONFIG.mouse.idleDriftRange);
    const driftSteps = randInt(3, 6);
    const totalDuration = rand(150, 300);

    for (let i = 0; i < driftSteps; i++) {
      const angle = rand(0, Math.PI * 2);
      const distance = rand(0, driftRange) / driftSteps;

      const newPos = this.constrainToViewport(
        this.position.x + Math.cos(angle) * distance,
        this.position.y + Math.sin(angle) * distance
      );

      this.position = newPos;
      await this.page.mouse.move(newPos.x, newPos.y, { steps: 1 });
      await delay(totalDuration / driftSteps);
    }
  }

  async randomWander(count = 1) {
    for (let i = 0; i < count; i++) {
      const viewport = this.page.viewport();
      const target = {
        x: rand(100, viewport.width - 100),
        y: rand(100, viewport.height - 100),
      };

      await this.moveTo(target, {
        duration: rand(500, 1000),
        easingFunc: easing.easeInOutCubic,
      });

      await delay(rand(100, 400));
    }
  }

  async hoverJitter(center, count = null) {
    const jitterCount = count ?? randInt(...CONFIG.mouse.hoverJitterCount);

    for (let i = 0; i < jitterCount; i++) {
      const radius = rand(...CONFIG.mouse.hoverJitterRadius);
      const angle = rand(0, Math.PI * 2);

      const pos = {
        x: center.x + Math.cos(angle) * radius,
        y: center.y + Math.sin(angle) * radius,
      };

      this.position = pos;
      await this.page.mouse.move(pos.x, pos.y, { steps: randInt(1, 2) });
      await delay(rand(...CONFIG.mouse.hoverJitterDelay));

      if (Math.random() < CONFIG.humanization.attentionWander) {
        const wanderDist = rand(...CONFIG.humanization.wanderDistance);
        const wanderAngle = rand(0, Math.PI * 2);
        const wanderPos = {
          x: center.x + Math.cos(wanderAngle) * wanderDist,
          y: center.y + Math.sin(wanderAngle) * wanderDist,
        };
        await this.moveTo(wanderPos, {
          duration: rand(...CONFIG.humanization.wanderDuration),
        });
        await delay(rand(100, 250));
        await this.moveTo(center, {
          duration: rand(...CONFIG.humanization.wanderDuration),
        });
      }
    }
  }

  async click(options = {}) {
    const { delay: clickDelay = randInt(...CONFIG.mouse.clickPressTime) } =
      options;

    const microAdjust = {
      x: this.position.x + rand(-0.5, 0.5),
      y: this.position.y + rand(-0.5, 0.5),
    };
    await this.page.mouse.move(microAdjust.x, microAdjust.y, { steps: 1 });

    await delay(rand(20, 60));

    await this.page.mouse.click(microAdjust.x, microAdjust.y, {
      delay: clickDelay,
    });

    // Small post-click drift
    await delay(rand(50, 120));
    const postClickDrift = {
      x: microAdjust.x + rand(-2, 2),
      y: microAdjust.y + rand(-2, 2),
    };
    await this.page.mouse.move(postClickDrift.x, postClickDrift.y, {
      steps: 1,
    });
  }

  async dragSlider(handle, targetX) {
    const handleBox = await handle.boundingBox();
    const start = {
      x: handleBox.x + handleBox.width / 2,
      y: handleBox.y + handleBox.height / 2,
    };

    await delay(rand(...CONFIG.timing.thinkingPause));

    const steps = randInt(...CONFIG.slider.dragSteps);
    const duration = rand(...CONFIG.slider.dragDuration);
    const interval = duration / steps;

    await this.moveTo(start, {
      overshoot: true,
      duration: rand(400, 700),
      easingFunc: easing.easeInOutQuart,
    });
    await delay(rand(100, 250));

    await this.page.mouse.down();
    await delay(rand(50, 120));

    const totalDistance = targetX - start.x;
    const wavePeriod = rand(...CONFIG.slider.wavePeriods);
    const waveAmplitude = rand(...CONFIG.slider.waveAmplitude);

    this.noiseOffset.x += 1;
    this.noiseOffset.y += 1;

    for (let i = 1; i <= steps; i++) {
      const progress = i / steps;

      let ease;
      if (progress < 0.15) {
        ease = easing.easeInQuad(progress / 0.15) * 0.15;
      } else if (progress > 0.88) {
        ease = 0.88 + easing.easeOutQuad((progress - 0.88) / 0.12) * 0.12;
      } else {
        const midProgress = (progress - 0.15) / 0.73;
        ease = 0.15 + midProgress * 0.73;
      }

      const x = start.x + totalDistance * ease;

      const perlinOffset = this.getPerlinNoise(this.noiseOffset.x + i * 0.12);
      const tremor = this.applyTremor(0, CONFIG.slider.tremblerIntensity);
      const sineWave =
        Math.sin(progress * Math.PI * wavePeriod) * waveAmplitude;

      const pos = {
        x: x + tremor + perlinOffset * 1.5,
        y: start.y + sineWave + this.applyTremor(0, 0.5),
      };

      this.position = pos;
      await this.page.mouse.move(pos.x, pos.y, { steps: 1 });

      if (Math.random() < CONFIG.slider.stutterChance) {
        await delay(rand(...CONFIG.slider.stutterDuration));
      }

      await delay(interval * rand(0.75, 1.25));
    }

    if (Math.random() < CONFIG.slider.overshootChance) {
      const overshootX = targetX + rand(...CONFIG.slider.overshootRange);
      const overshootY = start.y + rand(-2, 2);

      await this.page.mouse.move(overshootX, overshootY, {
        steps: randInt(3, 6),
      });
      await delay(rand(60, 140));

      const correctionSteps = randInt(4, 7);
      for (let i = 1; i <= correctionSteps; i++) {
        const t = i / correctionSteps;
        const x = overshootX + (targetX - overshootX) * easing.easeOutQuad(t);
        const y = start.y + this.applyTremor(0, 0.3);
        await this.page.mouse.move(x, y, { steps: 1 });
        await delay(rand(15, 35));
      }
    }

    await this.page.mouse.move(targetX, start.y, { steps: randInt(2, 4) });
    this.position = { x: targetX, y: start.y };

    await delay(rand(40, 100));
    await this.page.mouse.up();

    await delay(rand(100, 250));
  }
}

// ============================================================================
// CAPTCHA SOLVER
// ============================================================================

class CaptchaSolver {
  constructor() {
    this.browser = null;
    this.page = null;
    this.mouse = null;
    this.anomalyDetector = new AnomalyDetector(CONFIG.anomaly.whiteThreshold);
  }

  async initialize() {
    const browserURL = "http://127.0.0.1:9222";

    console.log("→ Attempting to connect to Chrome on", browserURL);

    try {
      const response = await fetch(`${browserURL}/json/version`);
      const data = await response.json();
      console.log("✓ Chrome debugging port is accessible");
      console.log(`  Browser: ${data.Browser}`);
      console.log(`  Protocol: ${data["Protocol-Version"]}`);

      this.browser = await puppeteer.connect({
        browserURL,
        defaultViewport: null,
      });

      console.log("✓ Connected to Chrome successfully");

      const pages = await this.browser.pages();
      console.log(`✓ Found ${pages.length} open tab(s)`);

      if (pages.length > 0) {
        this.page = pages[0];
        console.log("✓ Using first open tab");
      } else {
        this.page = await this.browser.newPage();
        console.log("✓ Created new tab");
      }
    } catch (err) {
      console.error("\n✗ Could not connect to Chrome debugging port");
      console.error("Error details:", err.message);
      console.error("\nPlease follow these steps:\n");
      console.error("1. Close ALL Chrome/Chromium windows completely");
      console.error("2. Start Chrome with remote debugging:\n");

      if (process.platform === "darwin") {
        console.error("   macOS:");
        console.error(
          "   /Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --remote-debugging-port=9222\n"
        );
      } else if (process.platform === "win32") {
        console.error("   Windows:");
        console.error(
          '   "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --remote-debugging-port=9222\n'
        );
      } else {
        console.error("   Linux:");
        console.error("   google-chrome --remote-debugging-port=9222\n");
      }

      console.error(
        "3. Verify by visiting: http://localhost:9222 in that Chrome window"
      );
      console.error("4. Run this script again\n");

      throw new Error("Chrome remote debugging not available");
    }

    await this.page.setViewport({
      width: 1440,
      height: 900,
      deviceScaleFactor: 2,
    });

    this.mouse = new MouseController(this.page);
    await this.mouse.initialize();
  }

  async explorePageNaturally() {
    console.log("→ Exploring page naturally...");

    const scrollAmount = randInt(30, 80);
    await this.page.evaluate((amount) => {
      window.scrollBy({
        top: amount,
        behavior: "smooth",
      });
    }, scrollAmount);

    const explorationMoves = randInt(2, 3);
    await this.mouse.randomWander(explorationMoves);
  }

  async navigateToTarget() {
    // await this.page.goto(CONFIG.target.url, {
    //   waitUntil: "domcontentloaded",
    //   timeout: 30000,
    // });

    console.log("→ Page loaded, acting naturally...");
    await this.explorePageNaturally();
  }

  async clickCaptchaButton() {
    const button = await this.page.waitForSelector(
      CONFIG.target.buttonSelector,
      { visible: true, timeout: 10000 }
    );

    const btnBox = await button.boundingBox();
    const btnCenter = {
      x: btnBox.x + btnBox.width / 2 + rand(-2, 2),
      y: btnBox.y + btnBox.height / 2 + rand(-2, 2),
    };

    const distance = Math.hypot(
      btnCenter.x - this.mouse.position.x,
      btnCenter.y - this.mouse.position.y
    );

    if (distance > 150) {
      const intermediateAngle = Math.atan2(
        btnCenter.y - this.mouse.position.y,
        btnCenter.x - this.mouse.position.x
      );
      const intermediateDistance = distance * rand(0.4, 0.6);
      const intermediatePoint = {
        x:
          this.mouse.position.x +
          Math.cos(intermediateAngle) * intermediateDistance +
          rand(-40, 40),
        y:
          this.mouse.position.y +
          Math.sin(intermediateAngle) * intermediateDistance +
          rand(-40, 40),
      };

      await this.mouse.moveTo(intermediatePoint, {
        duration: rand(350, 600),
        easingFunc: easing.easeInOutCubic,
      });
      await delay(rand(100, 250));
    }

    const nearButton = {
      x: btnCenter.x + rand(-30, 30),
      y: btnCenter.y + rand(-30, 30),
    };

    await this.mouse.moveTo(nearButton, {
      duration: rand(300, 500),
      easingFunc: easing.easeInOutCubic,
    });
    await delay(rand(150, 350));

    await this.mouse.moveTo(btnCenter, {
      overshoot: true,
      duration: rand(400, 700),
      easingFunc: easing.easeInOutCubic,
    });

    await this.mouse.hoverJitter(btnCenter);
    await delay(rand(...CONFIG.humanization.preActionDelay));
    await this.mouse.click();

    console.log("→ Button clicked, waiting for challenge...");
    await delay(rand(1200, 2000));
    await this.mouse.microDrift();
  }

  async solveSliderChallenge() {
    const slider = await this.page.waitForSelector(
      CONFIG.target.sliderSelector,
      { visible: true, timeout: 10000 }
    );

    await delay(rand(...CONFIG.timing.observationPause));

    const sliderBox = await slider.boundingBox();
    const examinePoint = {
      x: sliderBox.x + sliderBox.width * rand(0.3, 0.7),
      y: sliderBox.y + sliderBox.height * rand(0.2, 0.5),
    };

    await this.mouse.moveTo(examinePoint, {
      duration: rand(400, 700),
    });
    await delay(rand(300, 600));

    // Take screenshot (no trimming needed)
    const screenshotBuffer = await slider.screenshot();
    await sharp(screenshotBuffer).toFile("slider-original.png");
    console.log("✓ Screenshot saved as slider-original.png");

    // Find first anomaly from right to left
    const found = await this.anomalyDetector.findFirstAnomaly(screenshotBuffer);

    if (!found) {
      throw new Error("No anomaly found in the slider image");
    }

    // Calculate target position with offset
    const scaleX = sliderBox.width / found.info.width;
    const anomalyPageX = sliderBox.x + found.x * scaleX;
    const offsetPageX = CONFIG.anomaly.offsetPixels * scaleX;
    const targetPageX = anomalyPageX - offsetPageX;

    console.log(`→ Anomaly X position: ${anomalyPageX.toFixed(2)}px`);
    console.log(
      `→ Offset: ${offsetPageX.toFixed(2)}px (${
        CONFIG.anomaly.offsetPixels
      } pixels)`
    );
    console.log(`→ Final target X: ${targetPageX.toFixed(2)}px`);

    const handle = await this.page.waitForSelector(
      CONFIG.target.handleSelector,
      { visible: true, timeout: 10000 }
    );

    await this.mouse.dragSlider(handle, targetPageX);
    await delay(rand(...CONFIG.timing.postClickDelay));

    await slider.screenshot({ path: "slider-result.png" });
    console.log("✓ Challenge complete — slider-result.png saved");
  }

  async solve() {
    try {
      console.log("→ Initializing with stealth mode...");
      await this.initialize();

      console.log("→ Navigating to target...");
      await this.navigateToTarget();

      console.log("→ Clicking CAPTCHA button...");
      await this.clickCaptchaButton();

      console.log("→ Solving slider challenge...");
      await this.solveSliderChallenge();

      console.log("✓ All steps completed successfully");
    } catch (err) {
      console.error("✗ Error:", err.message);
      console.error(err.stack);
      throw err;
    } finally {
      await delay(100);
      if (this.page) {
        console.log("→ Script complete. Browser remains open.");
        // await this.page.reload();
      }
    }
  }
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

(async () => {
  const solver = new CaptchaSolver();
  await solver.solve();
})();
